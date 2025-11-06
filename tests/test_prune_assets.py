import subprocess
import sys
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
