from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    """
    Application configuration settings.

    Attributes:
        DATABASE_URL (str): Connection string for the database.
        model_config (SettingsConfigDict): Pydantic settings configuration
            for environment file loading and case sensitivity.
    """
    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/flashcards"
    model_config = SettingsConfigDict(env_file=".env", case_sensitive=False)

# Instantiate settings object so it's accessible globally
settings = Settings()
