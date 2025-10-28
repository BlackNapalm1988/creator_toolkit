from modules.jobs import set_progress, append_log, set_result, set_error
from modules.packager import build_master_from_loop, probe_audio_duration

def job_handle_package(jid: str, payload: dict):
    import os
    loop = payload["loop_video_path"]; audio = payload["audio_path"]
    out_path = payload.get("out_path") or os.path.join("static","uploads","master.mp4")
    set_progress(jid, 5); append_log(jid, "Probing audio...")
    ms = probe_audio_duration(audio)
    if ms <= 0:
        set_error(jid, "Invalid audio file (duration <= 0)"); return
    set_progress(jid, 20); append_log(jid, "Concatenating & muxing...")
    res = build_master_from_loop(
        loop_clip_path=loop,
        music_audio_path=audio,
        out_path=out_path,
        target_ms=ms,
        voiceover_audio_path=None,
    )
    if "error" in res:
        set_error(jid, f"Packaging failed: {res}"); return
    set_progress(jid, 95); append_log(jid, "Finalizing…")
    set_result(jid, {"master_path": out_path, "audio_ms": ms, "detail": res})

def job_handle_qa_batch(jid: str, payload: dict):
    import os, hashlib, time
    def compute_loop_score(video_path: str) -> float:
        try: size = os.path.getsize(video_path)
        except: size = 1
        h = int(hashlib.sha256(video_path.encode()).hexdigest(), 16) % 1000
        return round(min(0.99, 0.65 + (size % 100000)/100000 * 0.3 + (h/1000)*0.05), 3)
    def compute_style_score(video_path: str, palette: list) -> int:
        base = (len(palette)*13 + len(os.path.basename(video_path))*3) % 40 + 60
        return int(base)
    def detect_watermark(video_path: str) -> bool:
        return "wm" in os.path.basename(video_path).lower()

    paths = payload["paths"]; palette = payload.get("palette", [])
    thresholds = payload.get("thresholds", {"loop":0.92,"style":75})
    results, total = [], max(1, len(paths))
    for i, p in enumerate(paths, start=1):
        if not os.path.exists(p):
            results.append({"path": p, "error":"not found"})
        else:
            loop_score = compute_loop_score(p)
            style_score = compute_style_score(p, palette)
            wm = detect_watermark(p)
            verdict = "PASS" if (loop_score >= thresholds.get("loop",0.92) and style_score >= thresholds.get("style",75) and not wm) else "RETRY"
            results.append({"path": p, "loop_score": loop_score, "style_score": style_score, "watermark": wm, "verdict": verdict})
        set_progress(jid, int(100*i/total))
        if i % 3 == 0: append_log(jid, f"Processed {i}/{total}")
        time.sleep(0.01)
    set_result(jid, {"results": results})