"""Quest Room moderation APIs: reports, blocks, and human review hooks."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlmodel import Session, delete, select

from ..config import settings
from ..db import get_session
from ..models import User, utc_now
from ..moderation_models import (
    REPORT_KINDS,
    REPORT_STATUSES,
    BlockRead,
    ModerationAudit,
    ModerationCapability,
    ModerationReport,
    ReportCreate,
    ReportRead,
    ReportReview,
    UserBlock,
)
from ..room_models import RoomMember, RoomMessage, StudyRoom
from ..security import get_current_user
from .rooms import _active_member, _room_or_404

router = APIRouter(prefix="/moderation", tags=["moderation"])
VALID_REVIEW_STATUSES = {"reviewed", "dismissed", "actioned"}


def _moderator_emails() -> set[str]:
    return {
        value.strip().lower()
        for value in (settings.MODERATOR_EMAILS or "").split(",")
        if value.strip()
    }


def _is_moderator(user: User) -> bool:
    return user.email.strip().lower() in _moderator_emails()


def _require_moderator(user: User = Depends(get_current_user)) -> User:
    if not _is_moderator(user):
        raise HTTPException(status_code=403, detail="Moderator access required")
    return user


def _clean_text(value: str, *, field: str, max_length: int, required: bool) -> str:
    cleaned = " ".join(value.strip().split())
    if required and not cleaned:
        raise HTTPException(status_code=422, detail=f"{field} is required")
    if len(cleaned) > max_length:
        raise HTTPException(
            status_code=422,
            detail=f"{field} must be {max_length} characters or fewer",
        )
    return cleaned


def _report_read(report: ModerationReport) -> ReportRead:
    return ReportRead(**report.model_dump())


def _shared_room_membership(session: Session, first: int, second: int) -> bool:
    first_rooms = select(RoomMember.room_id).where(
        RoomMember.user_id == first,
        RoomMember.status == "active",
    )
    return (
        session.exec(
            select(RoomMember.id).where(
                RoomMember.user_id == second,
                RoomMember.status == "active",
                RoomMember.room_id.in_(first_rooms),
            )
        ).first()
        is not None
    )


@router.get("/capabilities", response_model=ModerationCapability)
def moderation_capabilities(
    user: User = Depends(get_current_user),
) -> ModerationCapability:
    return ModerationCapability(moderator=_is_moderator(user))


@router.post("/rooms/{room_id}/reports", response_model=ReportRead, status_code=201)
def create_report(
    room_id: int,
    payload: ReportCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ReportRead:
    """Report a room, message, or user while snapshotting review context."""
    room = _room_or_404(session, room_id)
    reporter_id = int(user.id or 0)
    if _active_member(session, room_id, reporter_id) is None:
        raise HTTPException(status_code=403, detail="Active room membership required")

    kind = payload.kind.strip().lower()
    if kind not in REPORT_KINDS:
        raise HTTPException(status_code=422, detail="Report kind must be room, message, or user")
    reason = _clean_text(payload.reason, field="Reason", max_length=80, required=True)
    details = _clean_text(payload.details, field="Details", max_length=1000, required=False)

    message: RoomMessage | None = None
    target: User | None = None
    target_user_id = payload.target_user_id

    if kind == "message":
        if payload.message_id is None:
            raise HTTPException(status_code=422, detail="Message report requires message_id")
        message = session.get(RoomMessage, payload.message_id)
        if message is None or message.room_id != room_id:
            raise HTTPException(status_code=404, detail="Message not found")
        target_user_id = message.user_id
    elif kind == "user":
        if target_user_id is None:
            raise HTTPException(status_code=422, detail="User report requires target_user_id")
        if target_user_id == reporter_id:
            raise HTTPException(status_code=422, detail="You cannot report yourself")
        if _active_member(session, room_id, target_user_id) is None:
            raise HTTPException(status_code=404, detail="Room member not found")
    else:
        if payload.message_id is not None or target_user_id is not None:
            raise HTTPException(status_code=422, detail="Room reports do not take a message or user target")

    if target_user_id is not None:
        target = session.get(User, target_user_id)
        if target is None:
            raise HTTPException(status_code=404, detail="User not found")

    report = ModerationReport(
        reporter_user_id=reporter_id,
        room_id=room_id,
        kind=kind,
        message_id=int(message.id or 0) if message is not None else None,
        target_user_id=target_user_id,
        reason=reason,
        details=details,
        room_name_snapshot=room.name,
        message_body_snapshot=message.body if message is not None else None,
        message_author_user_id=message.user_id if message is not None else None,
        target_display_name_snapshot=target.display_name if target is not None else None,
        status="open",
    )
    session.add(report)
    session.commit()
    session.refresh(report)
    return _report_read(report)


@router.get("/reports/mine", response_model=list[ReportRead])
def my_reports(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[ReportRead]:
    rows = session.exec(
        select(ModerationReport)
        .where(ModerationReport.reporter_user_id == int(user.id or 0))
        .order_by(ModerationReport.created_at.desc())
    ).all()
    return [_report_read(row) for row in rows]


@router.get("/reports", response_model=list[ReportRead])
def review_queue(
    status: str = Query("open"),
    _moderator: User = Depends(_require_moderator),
    session: Session = Depends(get_session),
) -> list[ReportRead]:
    normalized = status.strip().lower()
    if normalized not in REPORT_STATUSES:
        raise HTTPException(status_code=422, detail="Invalid report status")
    rows = session.exec(
        select(ModerationReport)
        .where(ModerationReport.status == normalized)
        .order_by(ModerationReport.created_at.asc())
        .limit(200)
    ).all()
    return [_report_read(row) for row in rows]


@router.post("/reports/{report_id}/review", response_model=ReportRead)
def review_report(
    report_id: int,
    payload: ReportReview,
    moderator: User = Depends(_require_moderator),
    session: Session = Depends(get_session),
) -> ReportRead:
    report = session.get(ModerationReport, report_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    status = payload.status.strip().lower()
    if status not in VALID_REVIEW_STATUSES:
        raise HTTPException(
            status_code=422,
            detail="Review status must be reviewed, dismissed, or actioned",
        )
    note = _clean_text(payload.note, field="Review note", max_length=1000, required=False)
    now = utc_now()
    report.status = status
    report.reviewed_at = now
    report.reviewed_by_user_id = int(moderator.id or 0)
    report.review_note = note
    session.add(report)
    session.add(
        ModerationAudit(
            action=f"report_{status}",
            actor_user_id=int(moderator.id or 0),
            room_id=report.room_id,
            target_user_id=report.target_user_id,
            report_id=int(report.id or 0),
            detail=note,
        )
    )
    session.commit()
    session.refresh(report)
    return _report_read(report)


@router.post("/blocks/{target_user_id}", response_model=BlockRead, status_code=201)
def block_user(
    target_user_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> BlockRead:
    blocker_id = int(user.id or 0)
    if target_user_id == blocker_id:
        raise HTTPException(status_code=422, detail="You cannot block yourself")
    target = session.get(User, target_user_id)
    if target is None or not _shared_room_membership(session, blocker_id, target_user_id):
        raise HTTPException(status_code=404, detail="User not found")
    existing = session.exec(
        select(UserBlock).where(
            UserBlock.blocker_user_id == blocker_id,
            UserBlock.blocked_user_id == target_user_id,
        )
    ).first()
    if existing is None:
        existing = UserBlock(blocker_user_id=blocker_id, blocked_user_id=target_user_id)
        session.add(existing)
        session.commit()
        session.refresh(existing)
    return BlockRead(
        user_id=target_user_id,
        display_name=target.display_name,
        created_at=existing.created_at,
    )


@router.delete("/blocks/{target_user_id}", status_code=204)
def unblock_user(
    target_user_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> None:
    session.exec(
        delete(UserBlock).where(
            UserBlock.blocker_user_id == int(user.id or 0),
            UserBlock.blocked_user_id == target_user_id,
        )
    )
    session.commit()


@router.get("/blocks", response_model=list[BlockRead])
def my_blocks(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[BlockRead]:
    rows = session.exec(
        select(UserBlock).where(UserBlock.blocker_user_id == int(user.id or 0))
    ).all()
    result: list[BlockRead] = []
    for row in rows:
        target = session.get(User, row.blocked_user_id)
        if target is not None:
            result.append(
                BlockRead(
                    user_id=row.blocked_user_id,
                    display_name=target.display_name,
                    created_at=row.created_at,
                )
            )
    return result
