"""Queue worker utilities."""

from __future__ import annotations

import logging
import os

from fastapi import FastAPI

from modules.job_handlers import job_handle_package, job_handle_qa_batch
from modules.jobs import QueueWorker

logger = logging.getLogger(__name__)


def queue_worker_disabled() -> bool:
    return os.getenv("DISABLE_QUEUE_WORKER", "").strip().lower() in {
        "1",
        "true",
        "yes",
    }


def start_worker(app: FastAPI, settings) -> None:
    if getattr(app.state, "worker", None):
        return

    if queue_worker_disabled():
        logger.info("Queue worker disabled via DISABLE_QUEUE_WORKER flag")
        app.state.worker = None
        return

    logger.info("Starting background queue worker")
    worker = QueueWorker(
        handlers={
            "package": job_handle_package,
            "qa_batch": job_handle_qa_batch,
        },
        poll_interval=0.5,
    )
    worker.start()
    app.state.worker = worker

    if settings.jwt_secret == "insecure-dev":
        logger.warning(
            "JWT_SECRET is using the insecure development default. "
            "Update your environment configuration for shared deployments."
        )


def stop_worker(app: FastAPI) -> None:
    worker = getattr(app.state, "worker", None)
    if worker:
        worker.stop()
        worker.join(timeout=2)
        app.state.worker = None


__all__ = ["queue_worker_disabled", "start_worker", "stop_worker"]
