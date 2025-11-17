"""Queue worker utilities and high-level job contract."""

from __future__ import annotations

import logging
import os

from fastapi import FastAPI

from modules import jobs as jobs_store
from modules.job_handlers import (
    job_handle_package,
    job_handle_qa_batch,
    job_handle_sora_video,
)

logger = logging.getLogger(__name__)


def queue_worker_disabled() -> bool:
    return os.getenv("DISABLE_QUEUE_WORKER", "").strip().lower() in {
        "1",
        "true",
        "yes",
    }


def enqueue_job(job_type: str, payload: dict) -> str:
    """Enqueue a job via the underlying store and return its id."""

    return jobs_store.enqueue(job_type, payload)


def update_status(job_id: str, **kwargs) -> None:
    """Update job metadata (stage/progress/status/duration_ms)."""

    jobs_store.update_job_status(job_id, **kwargs)


def set_error(job_id: str, error: str, **kwargs) -> None:
    """Record an error state for the job."""

    jobs_store.set_error(job_id, error, **kwargs)


def run_worker(poll_interval: float = 0.5) -> None:
    """Blocking worker loop for CLI usage.

    Constructs a worker with the default handlers and runs it in the current
    thread until interrupted.
    """

    worker = jobs_store.QueueWorker(
        handlers={
            "package": job_handle_package,
            "qa_batch": job_handle_qa_batch,
            "sora_video": job_handle_sora_video,
        },
        poll_interval=poll_interval,
    )
    worker.run()


def start_worker(app: FastAPI, settings) -> None:
    if getattr(app.state, "worker", None):
        return

    if queue_worker_disabled():
        logger.info("Queue worker disabled via DISABLE_QUEUE_WORKER flag")
        app.state.worker = None
        return

    logger.info("Starting background queue worker")
    worker = jobs_store.QueueWorker(
        handlers={
            "package": job_handle_package,
            "qa_batch": job_handle_qa_batch,
            "sora_video": job_handle_sora_video,
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
