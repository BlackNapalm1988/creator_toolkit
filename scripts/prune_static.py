from __future__ import annotations
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
STATIC = ROOT / "static"
TEMPLATES = ROOT / "templates"

# Collect referenced static paths from templates (very simple scan)
refs: set[str] = set()
for tpl in TEMPLATES.glob("*.html"):
    text = tpl.read_text(encoding="utf-8")
    for marker in ("href=\"/static/", "src=\"/static/"):
        start = 0
        while True:
            i = text.find(marker, start)
            if i == -1:
                break
            j = text.find("\"", i + len(marker))
            if j == -1:
                break
            # slice is relative to marker start
            rel = text[i + len(marker) : j].strip()
            if rel:
                refs.add(rel.split("?", 1)[0])
            start = j + 1

# Keep these runtime subdirs
keep_dirs = {"uploads", "reports", "masters", "music", "tts"}

# Remove any file under static not referenced by templates unless in keep_dirs
removed = []
for path in STATIC.rglob("*"):
    if path.is_dir():
        continue
    rel = path.relative_to(STATIC).as_posix()
    top = rel.split("/", 1)[0]
    if top in keep_dirs:
        # runtime content; skip removal
        continue
    if rel not in refs:
        try:
            path.unlink()
            removed.append(rel)
        except Exception:
            pass

print({"removed": removed, "kept": sorted(refs)})
