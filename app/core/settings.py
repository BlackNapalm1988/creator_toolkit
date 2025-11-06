"""Typed application settings powered by ``pydantic-settings``."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import Field

try:  # pragma: no cover - tested indirectly via environment setup
    from pydantic_settings import BaseSettings, SettingsConfigDict
except ModuleNotFoundError as exc:  # pragma: no cover - defensive guard
    raise ModuleNotFoundError(
        "Missing optional dependency 'pydantic-settings'. Install runtime requirements via "
        "`pip install -r requirements.txt` before starting the app."
    ) from exc


load_dotenv()


class Settings(BaseSettings):
    """Runtime configuration for the Creator Toolkit API server."""

    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="allow"
    )

    env: str = Field(default="dev", alias="ENV")
    allow_seeding: bool = Field(default=False, alias="ALLOW_SEEDING")
    jwt_secret: str = Field(default="insecure-dev", alias="JWT_SECRET")
    smtp_timeout_seconds: int = Field(default=10, alias="SMTP_TIMEOUT_SECONDS")
    # User-generated content root; never touched by pruning
    USER_CONTENT_DIR: str = "user_content"

    def validate_for_runtime(self) -> None:
        """Ensure unsafe defaults are not used outside of development."""

        if self.env != "dev" and self.jwt_secret == "insecure-dev":
            raise ValueError(
                "Refusing to start with insecure defaults; set a strong JWT_SECRET for non-dev environments."
            )

    def ensure_dirs(self) -> None:
        """Create required directories for user content if missing."""

        Path(self.USER_CONTENT_DIR).mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    """Return a cached :class:`Settings` instance."""

    return Settings()
