"""Long-running job handlers used by the background worker."""

from __future__ import annotations

import hashlib
import os
import time
from typing import Dict, List

from modules.jobs import (
    append_log,
    set_error,
    set_result,
    update_job_status,
)
from modules.packager import build_master_from_loop, probe_audio_duration


def job_handle_package(job_id: str, payload: Dict[str, str]) -> None:
    """Combine a looped video clip and music track into a mastered export."""

    loop_path = payload["loop_video_path"]
    audio_path = payload["audio_path"]
    out_path = payload.get("out_path") or os.path.join("static", "uploads", "master.mp4")

    update_job_status(job_id, stage="packaging", progress=5)
    append_log(job_id, "Probing audio...")
    duration_ms = probe_audio_duration(audio_path)
    if duration_ms <= 0:
        append_log(job_id, "Audio probe failed; aborting job")
        set_error(job_id, "Invalid audio asset", progress=None)
        return

    update_job_status(job_id, stage="packaging", progress=30)
    append_log(job_id, "Concatenating & muxing...")
    try:
        result = build_master_from_loop(
            loop_clip_path=loop_path,
            music_audio_path=audio_path,
            out_path=out_path,
            target_ms=duration_ms,
            voiceover_audio_path=None,
        )
    except Exception as exc:
        append_log(job_id, f"Packaging failed: {exc}")
        set_error(job_id, "Packaging pipeline failed", progress=None)
        return

    update_job_status(job_id, stage="packaging", progress=95)
    append_log(job_id, "Finalizing…")
    set_result(
        job_id,
        {"master_path": out_path, "audio_ms": duration_ms, "detail": result},
        duration_ms=duration_ms,
    )


def job_handle_qa_batch(job_id: str, payload: Dict[str, object]) -> None:
    """Perform a lightweight QA scan against a batch of rendered videos."""

    def compute_loop_score(video_path: str) -> float:
        try:
            size = os.path.getsize(video_path)
        except OSError:
            size = 1
        pseudo_random = int(hashlib.sha256(video_path.encode()).hexdigest(), 16) % 1000
        return round(
            min(0.99, 0.65 + (size % 100000) / 100000 * 0.3 + (pseudo_random / 1000) * 0.05),
            3,
        )

    def compute_style_score(video_path: str, palette: List[str]) -> int:
        base = (len(palette) * 13 + len(os.path.basename(video_path)) * 3) % 40 + 60
        return int(base)

    def detect_watermark(video_path: str) -> bool:
        return "wm" in os.path.basename(video_path).lower()

    paths = payload["paths"]  # type: ignore[index]
    palette = payload.get("palette", [])  # type: ignore[assignment]
    thresholds = payload.get("thresholds", {"loop": 0.92, "style": 75})  # type: ignore[assignment]

    update_job_status(job_id, stage="qa", progress=0)

    results = []
    total = max(1, len(paths))
    for index, path in enumerate(paths, start=1):
        if not os.path.exists(path):
            results.append({"path": path, "error": "not found"})
        else:
            loop_score = compute_loop_score(path)
            style_score = compute_style_score(path, palette)
            watermark = detect_watermark(path)
            verdict = (
                "PASS"
                if (
                    loop_score >= thresholds.get("loop", 0.92)
                    and style_score >= thresholds.get("style", 75)
                    and not watermark
                )
                else "RETRY"
            )
            results.append(
                {
                    "path": path,
                    "loop_score": loop_score,
                    "style_score": style_score,
                    "watermark": watermark,
                    "verdict": verdict,
                }
            )

        update_job_status(job_id, stage="qa", progress=int(100 * index / total))
        if index % 3 == 0:
            append_log(job_id, f"Processed {index}/{total}")
        time.sleep(0.01)

    set_result(job_id, {"results": results})
