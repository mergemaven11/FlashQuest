from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    """
    Application configuration settings.

    Attributes:
        DATABASE_URL (str): Connection string for the database.
        model_config (SettingsConfigDict): Pydantic settings configuration:
            - env_file: load from .env when present
            - case_sensitive: allow case-insensitive env keys
            - extra="ignore": ignore unrelated env vars (e.g., VITE_API_URL)
    """
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/flashcards"
    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
        extra="ignore",
    )

# Instantiate once for global access
settings = Settings()
