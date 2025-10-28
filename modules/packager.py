import math
import os
import subprocess
import tempfile

def _run(cmd: list[str]) -> dict:
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    return {"code": p.returncode, "out": p.stdout}

def probe_audio_duration(audio_path: str) -> int:
    """
    Returns duration in ms using ffprobe.
    """
    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        audio_path,
    ]
    p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    if p.returncode != 0:
        return -1
    try:
        sec = float(p.stdout.strip())
        ms = int(sec * 1000)
    except:
        ms = -1
    return ms

def _concat_video_loop(loop_clip_path: str, target_ms: int, workdir: str) -> str:
    """
    Repeat loop_clip_path end-to-end until we reach target_ms.
    Return path to concat result video WITH original audio still in it
    (we'll strip/replace audio later).
    """
    # probe duration of the loop video using ffprobe
    # we could probe video duration same way with ffprobe format=duration
    loop_dur_ms = probe_audio_duration(loop_clip_path)
    # if probe_audio_duration can't get it for video, we should fallback to ~8s default
    if loop_dur_ms <= 0:
        loop_dur_ms = 8000

    # how many repeats?
    repeats = math.ceil(target_ms / loop_dur_ms)
    # write ffmpeg concat list
    concat_list_path = os.path.join(workdir, "list.txt")
    with open(concat_list_path, "w", encoding="utf-8") as f:
        for _ in range(repeats):
            # ffmpeg concat requires escaped single quotes on Windows; safer to quote with full path
            f.write(f"file '{os.path.abspath(loop_clip_path)}'\n")

    concat_out = os.path.join(workdir, "concat_raw.mp4")
    cmd = [
        "ffmpeg",
        "-y",
        "-f", "concat",
        "-safe", "0",
        "-i", concat_list_path,
        "-c", "copy",
        concat_out,
    ]
    res = _run(cmd)
    if res["code"] != 0:
        raise RuntimeError(f"concat failed: {res['out']}")

    return concat_out

def _strip_video_audio(in_video: str, workdir: str) -> str:
    """
    Remove audio track, output silent mp4
    """
    silent_out = os.path.join(workdir, "video_silent.mp4")
    cmd = [
        "ffmpeg",
        "-y",
        "-i", in_video,
        "-c", "copy",
        "-an",
        silent_out,
    ]
    res = _run(cmd)
    if res["code"] != 0:
        raise RuntimeError(f"strip audio failed: {res['out']}")
    return silent_out

def _mix_audio_tracks(music_audio_path: str,
                      voiceover_audio_path: str | None,
                      workdir: str) -> str:
    """
    If voiceover_audio_path is None -> just transcode music to wav (normalized)
    Else -> blend music under VO.
    Return path to mixed wav.
    """
    mixed_out = os.path.join(workdir, "tmp_audio_mix.wav")

    if not voiceover_audio_path:
        cmd = [
            "ffmpeg",
            "-y",
            "-i", music_audio_path,
            "-ac", "2",
            "-ar", "44100",
            mixed_out,
        ]
        res = _run(cmd)
        if res["code"] != 0:
            raise RuntimeError(f"music->wav failed: {res['out']}")
        # DEBUG
        print("[packager] music-only mix ok:", res["out"])
        return mixed_out

    cmd = [
        "ffmpeg",
        "-y",
        "-i", music_audio_path,
        "-i", voiceover_audio_path,
        "-filter_complex",
        "[0:a]volume=0.6[a0];[a0][1:a]amix=inputs=2:duration=longest:dropout_transition=0[aout]",
        "-map", "[aout]",
        "-ac", "2",
        "-ar", "44100",
        mixed_out,
    ]
    res = _run(cmd)
    if res["code"] != 0:
        raise RuntimeError(f"voice+music mix failed: {res['out']}")

    print("[packager] music+vo mix ok:", res["out"])
    return mixed_out

def _mux_video_audio(silent_video_path: str, final_audio_path: str, out_path: str):
    """
    Combine silent video + final audio into out_path mp4 (H.264+AAC).
    """
    cmd = [
        "ffmpeg",
        "-y",
        "-i", silent_video_path,
        "-i", final_audio_path,
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-c:v", "copy",         # don't re-encode video, just copy from concat
        "-c:a", "aac",
        "-b:a", "192k",
        out_path,
    ]
    res = _run(cmd)
    if res["code"] != 0:
        raise RuntimeError(f"mux failed: {res['out']}")

def build_master_from_loop(
    loop_clip_path: str,
    music_audio_path: str,
    out_path: str,
    target_ms: int,
    voiceover_audio_path: str | None = None,
) -> dict:
    """
    1. concat loop video until >= target_ms
    2. strip original video audio
    3. mix music + optional voiceover
    4. mux into final out_path
    """
    workdir = tempfile.mkdtemp(prefix="packager_")

    # 1 concat loop multiple times
    concat_video = _concat_video_loop(loop_clip_path, target_ms, workdir)

    # 2 remove whatever audio Veo baked in
    silent_video = _strip_video_audio(concat_video, workdir)

    # 3 mix final audio bed
    final_audio = _mix_audio_tracks(music_audio_path, voiceover_audio_path, workdir)

    # 4 mux
    _mux_video_audio(silent_video, final_audio, out_path)

    # probe final duration maybe?
    final_len_ms = probe_audio_duration(out_path)

    return {
        "ok": True,
        "output": out_path,
        "approx_duration_ms": final_len_ms,
        "voiceover_used": bool(voiceover_audio_path),
    }
