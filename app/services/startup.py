"""Application startup and shutdown helpers."""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI

from app.core.settings import get_settings
from app.services.seeding import bootstrap_default_admin
from app.workers.queue import start_worker, stop_worker
from modules.chat import init_chat_db
from modules.jobs import init_jobs_db
from modules.storage import project_path
from modules.users import init_db

logger = logging.getLogger(__name__)


def ensure_directories() -> None:
    for rel_path in ("static", "static/uploads", "static/reports", "data", "scenes"):
        project_path(*Path(rel_path).parts).mkdir(parents=True, exist_ok=True)


def seed_if_needed(settings) -> None:
    env_normalized = (getattr(settings, "env", "") or "").strip().lower()
    should_seed = env_normalized == "dev" or bool(
        getattr(settings, "allow_seeding", False)
    )
    if should_seed:
        bootstrap_default_admin()
    else:
        logger.info(
            "Skipping default admin/test user seeding (env=%s, allow_seeding=%s)",
            settings.env,
            settings.allow_seeding,
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage startup and shutdown tasks for the FastAPI application."""

    settings = getattr(app.state, "settings", None) or get_settings()
    settings.validate_for_runtime()
    app.state.settings = settings

    ensure_directories()
    init_db()
    seed_if_needed(settings)
    init_jobs_db()
    init_chat_db()

    settings.validate_for_runtime()
    start_worker(app, settings)

    try:
        yield
    finally:
        stop_worker(app)


async def start_queue_worker(app: FastAPI | None = None) -> None:
    """Compatibility helper for tests to start the worker manually."""

    target_app = app
    if target_app is None:
        from app.main import app as main_app  # local import to avoid circular deps

        target_app = main_app
    start_worker(target_app, get_settings())


async def stop_queue_worker(app: FastAPI | None = None) -> None:
    """Compatibility helper for tests to stop the worker manually."""

    target_app = app
    if target_app is None:
        from app.main import app as main_app  # local import to avoid circular deps

        target_app = main_app
    stop_worker(target_app)


__all__ = [
    "ensure_directories",
    "lifespan",
    "seed_if_needed",
    "start_queue_worker",
    "stop_queue_worker",
]
