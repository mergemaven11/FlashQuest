"""Email verification token creation and delivery."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import httpx
from sqlmodel import Session, select

from .config import settings
from .models import EmailVerificationToken, User
from .security import hash_token, new_token


def create_verification_token(session: Session, user: User) -> str:
    """Invalidate older verification links and return a fresh raw token."""
    now = datetime.now(timezone.utc)
    existing = session.exec(
        select(EmailVerificationToken).where(
            EmailVerificationToken.user_id == user.id,
            EmailVerificationToken.used_at.is_(None),  # type: ignore[union-attr]
        )
    ).all()
    for token in existing:
        token.used_at = now
        session.add(token)

    raw = new_token()
    session.add(
        EmailVerificationToken(
            user_id=int(user.id or 0),
            token_hash=hash_token(raw),
            expires_at=now + timedelta(minutes=settings.VERIFICATION_TOKEN_MINUTES),
        )
    )
    session.commit()
    return raw


def verification_url(raw_token: str) -> str:
    """Build the frontend URL users click from the verification email."""
    return (
        f"{settings.FRONTEND_URL.rstrip('/')}/verify-email"
        f"?token={quote(raw_token, safe='')}"
    )


def send_verification_email(user: User, raw_token: str) -> None:
    """Deliver a verification link via Resend or print it for local development."""
    url = verification_url(raw_token)
    mode = settings.EMAIL_DELIVERY_MODE.strip().lower()
    if mode == "console":
        print(f"FlashQuest verification for {user.email}: {url}")
        return
    if mode != "resend":
        raise RuntimeError(f"Unsupported EMAIL_DELIVERY_MODE: {mode}")
    if not settings.RESEND_API_KEY:
        raise RuntimeError("RESEND_API_KEY is not configured")

    response = httpx.post(
        "https://api.resend.com/emails",
        headers={
            "Authorization": f"Bearer {settings.RESEND_API_KEY}",
            "Content-Type": "application/json",
        },
        json={
            "from": settings.EMAIL_FROM,
            "to": [user.email],
            "subject": "Verify your FlashQuest email",
            "html": (
                "<div style='font-family:system-ui,sans-serif;line-height:1.6'>"
                "<h2>Unlock your FlashQuest deck builder 🎮</h2>"
                f"<p>Hey {user.display_name}, click the button below to verify your email.</p>"
                f"<p><a href='{url}' style='display:inline-block;padding:12px 18px;"
                "background:#faa307;color:#03071e;border-radius:10px;font-weight:800;"
                "text-decoration:none'>Verify my email</a></p>"
                f"<p>This link expires in {settings.VERIFICATION_TOKEN_MINUTES} minutes.</p>"
                "<p>If you did not create this account, you can ignore this email.</p>"
                "</div>"
            ),
        },
        timeout=10.0,
    )
    response.raise_for_status()
