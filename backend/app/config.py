"""Environment-driven application configuration."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings shared by local, container, CI, and hosted environments."""

    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/flashcards"
    APP_ENV: str = "development"
    APP_VERSION: str = "1.1.0"
    LOG_LEVEL: str = "INFO"
    # Accept JSON-looking or comma-separated text; main.py normalizes it.
    ALLOWED_ORIGINS: str = ""

    # Opaque bearer sessions are stored only as hashes in PostgreSQL.
    ACCESS_TOKEN_MINUTES: int = 60 * 24 * 7

    # Email verification. `console` prints the verification URL locally/tests.
    # Hosted environments should use `resend` with RESEND_API_KEY configured.
    EMAIL_DELIVERY_MODE: str = "console"
    RESEND_API_KEY: str = ""
    EMAIL_FROM: str = "FlashQuest <onboarding@resend.dev>"
    VERIFICATION_TOKEN_MINUTES: int = 60
    FRONTEND_URL: str = "http://localhost:5173"

    # Server-side only. Built-in demo cards cannot be deleted/reset when blank.
    DEMO_DELETE_PASSWORD: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
