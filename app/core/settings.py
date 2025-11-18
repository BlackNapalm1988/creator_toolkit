"""Typed application settings powered by ``pydantic-settings``."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from dotenv import load_dotenv
from pydantic import Field, field_validator

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
    # Feature flag: enable Hybrid Dark Studio UI (theme + create hub/modules)
    USE_DARK_STUDIO_UI: bool = Field(default=True, alias="USE_DARK_STUDIO_UI")

    @field_validator("env", mode="before")
    @classmethod
    def _normalize_env(cls, value: str | None) -> str:
        """Normalize the environment value to a lowercase identifier."""

        return (value or "dev").strip().lower()

    def validate_for_runtime(self) -> None:
        """Ensure unsafe defaults are not used outside of development."""

        if getattr(self, "_runtime_validated", False):
            return

        allowed_envs = {"dev", "test", "prod"}
        env_normalized = (self.env or "").strip().lower()
        if env_normalized not in allowed_envs:
            raise ValueError(
                f"Invalid ENV '{self.env}'. Expected one of: {', '.join(sorted(allowed_envs))}."
            )

        if env_normalized == "prod":
            secret = (self.jwt_secret or "").strip()
            weak_secrets = {"insecure-dev", "changeme", "secret", "password"}
            if secret.lower() in weak_secrets or len(secret) < 16:
                raise ValueError(
                    "JWT_SECRET is too weak for production; set a strong, random value."
                )

        self._runtime_validated = True

    def ensure_dirs(self) -> None:
        """Create required directories for user content if missing."""

        Path(self.USER_CONTENT_DIR).mkdir(parents=True, exist_ok=True)


@lru_cache
def get_settings() -> Settings:
    """Return a cached :class:`Settings` instance."""

    return Settings()
