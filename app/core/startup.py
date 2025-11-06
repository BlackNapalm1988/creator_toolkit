"""Startup hooks and worker controls (core wrapper).

This module bridges to app.services.startup to keep the public path
`app.core.startup` while reusing the existing implementation.
"""

from __future__ import annotations

from app.services.startup import (
    ensure_directories,
    lifespan as lifespan,
    seed_if_needed,
    start_queue_worker as start_queue_worker,
    stop_queue_worker as stop_queue_worker,
)

__all__ = [
    "ensure_directories",
    "lifespan",
    "seed_if_needed",
    "start_queue_worker",
    "stop_queue_worker",
]

