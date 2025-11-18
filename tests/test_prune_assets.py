import os
import subprocess
import sys
import time
from pathlib import Path


def test_prune_never_touches_user_content(tmp_path, monkeypatch):
    (tmp_path / "static").mkdir()
    (tmp_path / "user_content").mkdir()
    (tmp_path / "static" / "old.png").write_bytes(b"x")
    (tmp_path / "user_content" / "keep.png").write_bytes(b"x")

    script = Path("scripts/prune_assets.py").resolve()
    monkeypatch.chdir(tmp_path)
    subprocess.run([sys.executable, str(script), "--report", "--days", "0"], check=True)

    assert (tmp_path / "user_content" / "keep.png").exists()
    subprocess.run([sys.executable, str(script), "--apply", "--days", "0"], check=True)
    assert (tmp_path / "user_content" / "keep.png").exists()


def test_prune_moves_stale_static_files_to_quarantine(tmp_path, monkeypatch):
    static_root = tmp_path / "static"
    static_root.mkdir()
    stale_file = static_root / "stale.js"
    stale_file.write_text("old")
    old_time = time.time() - 3 * 86400
    os.utime(stale_file, (old_time, old_time))

    script = Path("scripts/prune_assets.py").resolve()
    monkeypatch.chdir(tmp_path)
    subprocess.run(
        [sys.executable, str(script), "--apply", "--days", "1"],
        check=True,
    )

    assert not stale_file.exists()
    quarantine_root = tmp_path / "._quarantine" / "static"
    moved = list(quarantine_root.rglob("stale.js"))
    assert moved, "Expected stale.js to be quarantined"
