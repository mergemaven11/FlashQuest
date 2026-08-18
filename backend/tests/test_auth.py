"""Authentication and email-verification regression tests."""

from datetime import datetime, timedelta, timezone

from sqlmodel import Session, select

from app.models import EmailVerificationToken, User
from app.security import create_auth_session, hash_password, hash_token


def test_signup_creates_unverified_account(client, sqlite_session: Session):
    response = client.post(
        "/auth/signup",
        json={
            "display_name": "Tee",
            "email": "TEE@example.com",
            "password": "strong-pass-123",
        },
    )
    assert response.status_code == 201
    assert response.json()["email"] == "tee@example.com"

    user = sqlite_session.exec(select(User).where(User.email == "tee@example.com")).first()
    assert user is not None
    assert user.is_verified is False
    assert user.password_hash != "strong-pass-123"

    login = client.post(
        "/auth/login",
        json={"email": "tee@example.com", "password": "strong-pass-123"},
    )
    assert login.status_code == 403


def test_verify_login_me_and_logout(client, sqlite_session: Session):
    user = User(
        email="verified@example.com",
        display_name="Verified User",
        password_hash=hash_password("strong-pass-123"),
        is_verified=False,
    )
    sqlite_session.add(user)
    sqlite_session.commit()
    sqlite_session.refresh(user)

    raw = "verification-token-for-test"
    sqlite_session.add(
        EmailVerificationToken(
            user_id=int(user.id or 0),
            token_hash=hash_token(raw),
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
        )
    )
    sqlite_session.commit()

    verify = client.post("/auth/verify", json={"token": raw})
    assert verify.status_code == 200
    sqlite_session.refresh(user)
    assert user.is_verified is True

    login = client.post(
        "/auth/login",
        json={"email": user.email, "password": "strong-pass-123"},
    )
    assert login.status_code == 200
    token = login.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    me = client.get("/auth/me", headers=headers)
    assert me.status_code == 200
    assert me.json()["email"] == user.email

    assert client.post("/auth/logout", headers=headers).status_code == 200
    assert client.get("/auth/me", headers=headers).status_code == 401


def test_unverified_session_cannot_create_deck(client, sqlite_session: Session):
    user = User(
        email="waiting@example.com",
        display_name="Waiting",
        password_hash=hash_password("strong-pass-123"),
        is_verified=False,
    )
    sqlite_session.add(user)
    sqlite_session.commit()
    sqlite_session.refresh(user)
    token = create_auth_session(sqlite_session, int(user.id or 0))

    response = client.post(
        "/decks",
        headers={"Authorization": f"Bearer {token}"},
        json={"title": "Private deck", "description": "Should wait"},
    )
    assert response.status_code == 403
