"""Account signup, OAuth, email verification, login, and session endpoints."""

from __future__ import annotations

from datetime import datetime, timezone
import secrets
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from ..config import settings
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
OAUTH_COOKIE_MAX_AGE = 600


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


def _safe_next(value: str | None) -> str:
    if value and value.startswith("/") and not value.startswith("//"):
        return value
    return "/welcome"


def _require_oauth(client_id: str, client_secret: str, provider: str) -> None:
    if not client_id or not client_secret:
        raise HTTPException(
            status_code=503, detail=f"{provider} sign-in is not configured"
        )


def _oauth_start_response(url: str, state: str, next_path: str) -> RedirectResponse:
    response = RedirectResponse(url, status_code=302)
    secure = settings.APP_ENV.lower() == "production"
    response.set_cookie(
        "fq_oauth_state",
        state,
        max_age=OAUTH_COOKIE_MAX_AGE,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/auth",
    )
    response.set_cookie(
        "fq_oauth_next",
        next_path,
        max_age=OAUTH_COOKIE_MAX_AGE,
        httponly=True,
        secure=secure,
        samesite="lax",
        path="/auth",
    )
    return response


def _validate_oauth_state(request: Request, state: str | None) -> None:
    expected = request.cookies.get("fq_oauth_state")
    if not state or not expected or not secrets.compare_digest(state, expected):
        raise HTTPException(status_code=400, detail="OAuth state validation failed")


def _oauth_user(session: Session, email: str, display_name: str) -> User:
    normalized = email.strip().lower()
    user = session.exec(select(User).where(User.email == normalized)).first()
    if user is None:
        user = User(
            email=normalized,
            display_name=(display_name.strip() or normalized.split("@", 1)[0])[:120],
            password_hash=hash_password(secrets.token_urlsafe(48)),
            is_verified=True,
        )
        session.add(user)
        try:
            session.commit()
            session.refresh(user)
        except IntegrityError:
            session.rollback()
            user = session.exec(select(User).where(User.email == normalized)).first()
            if user is None:
                raise HTTPException(
                    status_code=409, detail="Could not create OAuth account"
                )
    elif not user.is_verified:
        user.is_verified = True
        session.add(user)
        session.commit()
        session.refresh(user)
    return user


def _oauth_finish(request: Request, session: Session, user: User) -> RedirectResponse:
    access_token = create_auth_session(session, int(user.id or 0))
    next_path = _safe_next(request.cookies.get("fq_oauth_next"))
    fragment = urlencode({"token": access_token, "next": next_path})
    response = RedirectResponse(
        f"{settings.FRONTEND_URL.rstrip('/')}/oauth/callback#{fragment}",
        status_code=302,
    )
    response.delete_cookie("fq_oauth_state", path="/auth")
    response.delete_cookie("fq_oauth_next", path="/auth")
    return response


@router.get("/google/start")
def google_start(next: str | None = None) -> RedirectResponse:
    _require_oauth(
        settings.GOOGLE_CLIENT_ID, settings.GOOGLE_CLIENT_SECRET, "Google"
    )
    state = secrets.token_urlsafe(32)
    redirect_uri = f"{settings.API_PUBLIC_URL.rstrip('/')}/auth/google/callback"
    params = urlencode(
        {
            "client_id": settings.GOOGLE_CLIENT_ID,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "state": state,
            "prompt": "select_account",
        }
    )
    return _oauth_start_response(
        f"https://accounts.google.com/o/oauth2/v2/auth?{params}",
        state,
        _safe_next(next),
    )


@router.get("/google/callback")
def google_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    session: Session = Depends(get_session),
) -> RedirectResponse:
    _require_oauth(
        settings.GOOGLE_CLIENT_ID, settings.GOOGLE_CLIENT_SECRET, "Google"
    )
    _validate_oauth_state(request, state)
    if not code:
        raise HTTPException(
            status_code=400,
            detail="Google did not return an authorization code",
        )

    redirect_uri = f"{settings.API_PUBLIC_URL.rstrip('/')}/auth/google/callback"
    try:
        token_response = httpx.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
            timeout=10.0,
        )
        token_response.raise_for_status()
        access_token = token_response.json().get("access_token")
        if not access_token:
            raise HTTPException(
                status_code=502,
                detail="Google token exchange returned no access token",
            )

        profile_response = httpx.get(
            "https://openidconnect.googleapis.com/v1/userinfo",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10.0,
        )
        profile_response.raise_for_status()
        profile = profile_response.json()
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502, detail="Google sign-in could not be completed"
        ) from exc

    email = str(profile.get("email", "")).strip().lower()
    if not email or profile.get("email_verified") is not True:
        raise HTTPException(
            status_code=403,
            detail="Google account must provide a verified email",
        )

    user = _oauth_user(
        session,
        email,
        str(profile.get("name", "FlashQuest learner")),
    )
    return _oauth_finish(request, session, user)


@router.get("/github/start")
def github_start(next: str | None = None) -> RedirectResponse:
    _require_oauth(
        settings.GITHUB_CLIENT_ID, settings.GITHUB_CLIENT_SECRET, "GitHub"
    )
    state = secrets.token_urlsafe(32)
    redirect_uri = f"{settings.API_PUBLIC_URL.rstrip('/')}/auth/github/callback"
    params = urlencode(
        {
            "client_id": settings.GITHUB_CLIENT_ID,
            "redirect_uri": redirect_uri,
            "scope": "read:user user:email",
            "state": state,
        }
    )
    return _oauth_start_response(
        f"https://github.com/login/oauth/authorize?{params}",
        state,
        _safe_next(next),
    )


@router.get("/github/callback")
def github_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    session: Session = Depends(get_session),
) -> RedirectResponse:
    _require_oauth(
        settings.GITHUB_CLIENT_ID, settings.GITHUB_CLIENT_SECRET, "GitHub"
    )
    _validate_oauth_state(request, state)
    if not code:
        raise HTTPException(
            status_code=400,
            detail="GitHub did not return an authorization code",
        )

    redirect_uri = f"{settings.API_PUBLIC_URL.rstrip('/')}/auth/github/callback"
    try:
        token_response = httpx.post(
            "https://github.com/login/oauth/access_token",
            headers={"Accept": "application/json"},
            data={
                "client_id": settings.GITHUB_CLIENT_ID,
                "client_secret": settings.GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": redirect_uri,
            },
            timeout=10.0,
        )
        token_response.raise_for_status()
        access_token = token_response.json().get("access_token")
        if not access_token:
            raise HTTPException(
                status_code=502,
                detail="GitHub token exchange returned no access token",
            )

        headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
        }
        profile_response = httpx.get(
            "https://api.github.com/user", headers=headers, timeout=10.0
        )
        emails_response = httpx.get(
            "https://api.github.com/user/emails", headers=headers, timeout=10.0
        )
        profile_response.raise_for_status()
        emails_response.raise_for_status()
        profile = profile_response.json()
        emails = emails_response.json()
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502, detail="GitHub sign-in could not be completed"
        ) from exc

    verified = [
        row for row in emails if row.get("verified") and row.get("email")
    ]
    primary = next(
        (row for row in verified if row.get("primary")),
        verified[0] if verified else None,
    )
    if primary is None:
        raise HTTPException(
            status_code=403,
            detail="GitHub account must provide a verified email",
        )

    email = str(primary["email"]).strip().lower()
    display_name = str(
        profile.get("name") or profile.get("login") or "FlashQuest learner"
    )
    user = _oauth_user(session, email, display_name)
    return _oauth_finish(request, session, user)


@router.post("/signup", status_code=201)
def signup(payload: SignupRequest, session: Session = Depends(get_session)) -> dict:
    email = str(payload.email).strip().lower()
    name = payload.display_name.strip()
    if len(name) < 2:
        raise HTTPException(status_code=422, detail="Display name is too short")
    if len(payload.password) < 8:
        raise HTTPException(
            status_code=422,
            detail="Password must be at least 8 characters",
        )
    if session.exec(select(User).where(User.email == email)).first() is not None:
        raise HTTPException(
            status_code=409,
            detail="An account with that email already exists",
        )

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
            detail=(
                "Account created, but the verification email could not be sent. "
                "Use resend verification."
            ),
        ) from exc

    return {
        "ok": True,
        "message": "Check your inbox to verify your email and unlock deck creation.",
        "email": user.email,
    }


@router.post("/resend-verification")
def resend_verification(
    payload: dict, session: Session = Depends(get_session)
) -> dict:
    email = str(payload.get("email", "")).strip().lower()
    user = session.exec(select(User).where(User.email == email)).first()
    if user is not None and not user.is_verified:
        raw = create_verification_token(session, user)
        try:
            send_verification_email(user, raw)
        except (RuntimeError, httpx.HTTPError) as exc:
            raise HTTPException(
                status_code=503,
                detail="Verification email service is unavailable",
            ) from exc
    return {
        "ok": True,
        "message": "If that account needs verification, a new link was sent.",
    }


@router.post("/verify")
def verify_email(payload: dict, session: Session = Depends(get_session)) -> dict:
    raw = str(payload.get("token", "")).strip()
    if not raw:
        raise HTTPException(
            status_code=422, detail="Verification token is required"
        )

    token = session.exec(
        select(EmailVerificationToken).where(
            EmailVerificationToken.token_hash == hash_token(raw)
        )
    ).first()
    if token is None or token.used_at is not None:
        raise HTTPException(
            status_code=400,
            detail="Verification link is invalid or already used",
        )
    if _aware_utc(token.expires_at) <= datetime.now(timezone.utc):
        raise HTTPException(
            status_code=400,
            detail="Verification link expired. Request a new one.",
        )

    user = session.get(User, token.user_id)
    if user is None:
        raise HTTPException(
            status_code=400,
            detail="Verification account no longer exists",
        )

    user.is_verified = True
    token.used_at = datetime.now(timezone.utc)
    session.add(user)
    session.add(token)
    session.commit()
    return {
        "ok": True,
        "message": "Email verified. You can now make your own decks.",
    }


@router.post("/login")
def login(payload: LoginRequest, session: Session = Depends(get_session)) -> dict:
    email = str(payload.email).strip().lower()
    user = session.exec(select(User).where(User.email == email)).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=401, detail="Email or password is incorrect"
        )
    if not user.is_verified:
        raise HTTPException(
            status_code=403, detail="Verify your email before signing in"
        )

    access_token = create_auth_session(session, int(user.id or 0))
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": _user_read(user).model_dump(mode="json"),
    }


@router.get("/me", response_model=UserRead)
def me(user: User = Depends(get_current_user)) -> UserRead:
    return _user_read(user)


@router.post("/logout")
def logout(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    session: Session = Depends(get_session),
) -> dict:
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
