"""Typed application settings powered by ``pydantic-settings``."""

from __future__ import annotations

from functools import lru_cache

from dotenv import load_dotenv
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

load_dotenv()


class Settings(BaseSettings):
    """Runtime configuration for the Creator Toolkit API server."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="allow")

    env: str = Field(default="dev", alias="ENV")
    jwt_secret: str = Field(default="insecure-dev", alias="JWT_SECRET")
    smtp_timeout_seconds: int = Field(default=10, alias="SMTP_TIMEOUT_SECONDS")

    def validate_for_runtime(self) -> None:
        """Ensure unsafe defaults are not used outside of development."""

        if self.env != "dev" and self.jwt_secret == "insecure-dev":
            raise ValueError(
                "Refusing to start with insecure defaults; set a strong JWT_SECRET for non-dev environments."
            )


@lru_cache
def get_settings() -> Settings:
    """Return a cached :class:`Settings` instance."""

    return Settings()
