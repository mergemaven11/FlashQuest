"""Environment-driven application configuration."""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime settings shared by local, container, CI, and hosted environments."""

    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/flashcards"
    APP_ENV: str = "development"
    APP_VERSION: str = "1.0.0"
    LOG_LEVEL: str = "INFO"
    # Accept JSON-looking or comma-separated text; main.py normalizes it.
    ALLOWED_ORIGINS: str = ""
    # Server-side only. Built-in demo cards cannot be deleted when this is blank.
    DEMO_DELETE_PASSWORD: str = ""

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore",
    )


settings = Settings()
