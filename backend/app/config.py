"""Environment-driven application configuration."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings shared by local, container, CI, and hosted environments."""

    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/flashcards"
    APP_ENV: str = "development"
    APP_VERSION: str = "1.1.0"
    LOG_LEVEL: str = "INFO"
    ALLOWED_ORIGINS: str = ""

    ACCESS_TOKEN_MINUTES: int = 60 * 24 * 7

    EMAIL_DELIVERY_MODE: str = "console"
    RESEND_API_KEY: str = ""
    EMAIL_FROM: str = "FlashQuest <onboarding@resend.dev>"
    VERIFICATION_TOKEN_MINUTES: int = 60
    FRONTEND_URL: str = "http://localhost:5173"
    API_PUBLIC_URL: str = "http://localhost:8080"

    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GITHUB_CLIENT_ID: str = ""
    GITHUB_CLIENT_SECRET: str = ""

    MODERATOR_EMAILS: str = ""
    DEMO_DELETE_PASSWORD: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
