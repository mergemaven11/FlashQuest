"""Account signup, email verification, login, and session endpoints."""

from __future__ import annotations

from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from ..db import get_session
from ..email_service import create_verification_token, send_verification_email
from ..models import (
    AuthSession,
    EmailVerificationToken,
    LoginRequest,
    SignupRequest,
    User,
    UserRead,
)
from ..security import (
    bearer_scheme,
    create_auth_session,
    get_current_user,
    hash_password,
    hash_token,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _user_read(user: User) -> UserRead:
    return UserRead(
        id=int(user.id or 0),
        email=user.email,
        display_name=user.display_name,
        is_verified=user.is_verified,
    )


def _aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


@router.post("/signup", status_code=201)
def signup(payload: SignupRequest, session: Session = Depends(get_session)) -> dict:
    """Create an unverified account and send a one-time verification email."""
    email = str(payload.email).strip().lower()
    name = payload.display_name.strip()
    if len(name) < 2:
        raise HTTPException(status_code=422, detail="Display name is too short")
    if len(payload.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")

    if session.exec(select(User).where(User.email == email)).first() is not None:
        raise HTTPException(status_code=409, detail="An account with that email already exists")

    user = User(
        email=email,
        display_name=name,
        password_hash=hash_password(payload.password),
        is_verified=False,
    )
    session.add(user)
    try:
        session.commit()
        session.refresh(user)
    except IntegrityError as exc:
        session.rollback()
        raise HTTPException(status_code=409, detail="Account already exists") from exc

    raw = create_verification_token(session, user)
    try:
        send_verification_email(user, raw)
    except (RuntimeError, httpx.HTTPError) as exc:
        raise HTTPException(
            status_code=503,
            detail="Account created, but the verification email could not be sent. Use resend verification.",
        ) from exc

    return {
        "ok": True,
        "message": "Check your inbox to verify your email and unlock deck creation.",
        "email": user.email,
    }


@router.post("/resend-verification")
def resend_verification(payload: dict, session: Session = Depends(get_session)) -> dict:
    """Send a new verification link without revealing whether an account exists."""
    email = str(payload.get("email", "")).strip().lower()
    user = session.exec(select(User).where(User.email == email)).first()
    if user is not None and not user.is_verified:
        raw = create_verification_token(session, user)
        try:
            send_verification_email(user, raw)
        except (RuntimeError, httpx.HTTPError) as exc:
            raise HTTPException(
                status_code=503, detail="Verification email service is unavailable"
            ) from exc
    return {"ok": True, "message": "If that account needs verification, a new link was sent."}


@router.post("/verify")
def verify_email(payload: dict, session: Session = Depends(get_session)) -> dict:
    """Verify an email using a one-time opaque token."""
    raw = str(payload.get("token", "")).strip()
    if not raw:
        raise HTTPException(status_code=422, detail="Verification token is required")

    token = session.exec(
        select(EmailVerificationToken).where(
            EmailVerificationToken.token_hash == hash_token(raw)
        )
    ).first()
    if token is None or token.used_at is not None:
        raise HTTPException(status_code=400, detail="Verification link is invalid or already used")
    if _aware_utc(token.expires_at) <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Verification link expired. Request a new one.")

    user = session.get(User, token.user_id)
    if user is None:
        raise HTTPException(status_code=400, detail="Verification account no longer exists")

    user.is_verified = True
    token.used_at = datetime.now(timezone.utc)
    session.add(user)
    session.add(token)
    session.commit()
    return {"ok": True, "message": "Email verified. You can now make your own decks."}


@router.post("/login")
def login(payload: LoginRequest, session: Session = Depends(get_session)) -> dict:
    """Exchange email/password for an opaque bearer session."""
    email = str(payload.email).strip().lower()
    user = session.exec(select(User).where(User.email == email)).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email or password is incorrect")
    if not user.is_verified:
        raise HTTPException(status_code=403, detail="Verify your email before signing in")

    access_token = create_auth_session(session, int(user.id or 0))
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": _user_read(user).model_dump(mode="json"),
    }


@router.get("/me", response_model=UserRead)
def me(user: User = Depends(get_current_user)) -> UserRead:
    """Return the current signed-in account."""
    return _user_read(user)


@router.post("/logout")
def logout(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: Session = Depends(get_session),
) -> dict:
    """Revoke the current bearer session."""
    if credentials is None:
        return {"ok": True}
    auth_session = session.exec(
        select(AuthSession).where(
            AuthSession.token_hash == hash_token(credentials.credentials)
        )
    ).first()
    if auth_session is not None and auth_session.revoked_at is None:
        auth_session.revoked_at = datetime.now(timezone.utc)
        session.add(auth_session)
        session.commit()
    return {"ok": True}
