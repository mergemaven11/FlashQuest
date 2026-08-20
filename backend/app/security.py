"""Authentication primitives for passwords and opaque bearer sessions."""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select

from .config import settings
from .db import get_session
from .models import AuthSession, User

PBKDF2_ITERATIONS = 600_000
DEMO_USER_ID = 0
DEMO_LOGIN_EMAIL = "demo@flashquest.app"
DEMO_LOGIN_PASSWORD = "QuestRoomDemo!"
DEMO_DISPLAY_NAME = "Demo Explorer"
DEMO_GUIDE_EMAIL = "guide@flashquest.internal"
DEMO_GUIDE_NAME = "FlashQuest Guide"
DEMO_ROOM_NAME = "FlashQuest Demo Room"
bearer_scheme = HTTPBearer(auto_error=False)


def _aware_utc(value: datetime) -> datetime:
    """Normalize DB datetimes that may be returned without timezone info."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def hash_password(password: str) -> str:
    """Hash a password with PBKDF2-HMAC-SHA256 and a random salt."""
    salt = secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS
    )
    return "$".join(
        [
            "pbkdf2_sha256",
            str(PBKDF2_ITERATIONS),
            base64.urlsafe_b64encode(salt).decode("ascii"),
            base64.urlsafe_b64encode(digest).decode("ascii"),
        ]
    )


def verify_password(password: str, encoded: str) -> bool:
    """Verify a password without leaking comparison timing."""
    try:
        algorithm, rounds, salt_b64, digest_b64 = encoded.split("$", 3)
        if algorithm != "pbkdf2_sha256":
            return False
        salt = base64.urlsafe_b64decode(salt_b64.encode("ascii"))
        expected = base64.urlsafe_b64decode(digest_b64.encode("ascii"))
        actual = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), salt, int(rounds)
        )
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def new_token() -> str:
    """Return a high-entropy URL-safe opaque token."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Hash an opaque token before database lookup/storage."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_auth_session(session: Session, user_id: int) -> str:
    """Create a bearer session and return the raw token exactly once."""
    raw = new_token()
    session.add(
        AuthSession(
            user_id=user_id,
            token_hash=hash_token(raw),
            expires_at=datetime.now(timezone.utc)
            + timedelta(minutes=settings.ACCESS_TOKEN_MINUTES),
        )
    )
    session.commit()
    return raw


def user_for_token(session: Session, raw_token: str) -> Optional[User]:
    """Resolve an active bearer token to a user."""
    auth_session = session.exec(
        select(AuthSession).where(AuthSession.token_hash == hash_token(raw_token))
    ).first()
    if auth_session is None or auth_session.revoked_at is not None:
        return None
    if _aware_utc(auth_session.expires_at) <= datetime.now(timezone.utc):
        return None
    return session.get(User, auth_session.user_id)


def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: Session = Depends(get_session),
) -> Optional[User]:
    """Return the signed-in user when a valid bearer token is present."""
    if credentials is None:
        return None
    return user_for_token(session, credentials.credentials)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: Session = Depends(get_session),
) -> User:
    """Require a valid signed-in user."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Sign in required")
    user = user_for_token(session, credentials.credentials)
    if user is None:
        raise HTTPException(status_code=401, detail="Session expired or invalid")
    return user


def is_demo_account(user: User) -> bool:
    """Return whether this is the intentionally public sandbox account."""
    return user.email.strip().lower() == DEMO_LOGIN_EMAIL


def require_verified_user(user: User = Depends(get_current_user)) -> User:
    """Require a verified creator account; the public demo stays sandboxed."""
    if not user.is_verified:
        raise HTTPException(status_code=403, detail="Verify your email first")
    if is_demo_account(user):
        raise HTTPException(
            status_code=403,
            detail="The public demo account is read-only outside its demo room",
        )
    return user
