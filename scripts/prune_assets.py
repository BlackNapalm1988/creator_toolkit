#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
import time
from datetime import datetime
from fnmatch import fnmatch
from pathlib import Path

STATIC_ROOTS = [Path("static").resolve()]
NEVER_TOUCH = {
    Path("user_content").resolve(),
    Path("releases").resolve(),
    Path("scenes").resolve(),
    Path("data").resolve(),
}
QUARANTINE = Path("._quarantine/static").resolve()


def load_globs(p: Path) -> set[str]:
    return set(p.read_text().splitlines()) if p.exists() else set()


def list_assets_static() -> set[Path]:
    files = set()
    for root in STATIC_ROOTS:
        base = root.resolve()
        if not base.exists():
            continue
        for p in base.rglob("*"):
            if not p.is_file() or p.is_symlink():
                continue
            resolved = p.resolve()
            try:
                resolved.relative_to(base)
            except ValueError:
                # Skip anything that escapes the declared static root
                continue
            if any(
                resolved == protected or resolved.is_relative_to(protected)
                for protected in NEVER_TOUCH
            ):
                continue
            files.add(resolved)
    return files


def parse_templates() -> set[str]:
    refs = set()
    tpl_root = Path("templates")
    if not tpl_root.exists():
        return refs
    for p in tpl_root.rglob("*.html"):
        try:
            text = p.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        refs |= set(
            re.findall(
                r"url_for\(['\"]static['\"],\s*filename=['\"]([^'\"]+)['\"]\)", text
            )
        )
        refs |= set(re.findall(r"(?:href|src)=['\"]/static/([^'\"]+)['\"]", text))
    return refs


def load_manifest() -> set[str]:
    m = Path("static/asset-manifest.json")
    if m.exists():
        try:
            data = json.loads(m.read_text())
            if (
                isinstance(data, dict)
                and "files" in data
                and isinstance(data["files"], list)
            ):
                return set(data["files"])
            if isinstance(data, dict):
                return set(data.keys())
        except Exception:
            pass
    return set()


def older_than(p: Path, days: int) -> bool:
    age = time.time() - p.stat().st_mtime
    return age >= days * 86400


def _static_root_for(path: Path) -> Path | None:
    resolved = path.resolve()
    for root in STATIC_ROOTS:
        if resolved.is_relative_to(root):
            return root
    return None


def _is_protected(path: Path) -> bool:
    resolved = path.resolve()
    return any(
        resolved == protected or resolved.is_relative_to(protected)
        for protected in NEVER_TOUCH
    )


def main():
    ap = argparse.ArgumentParser(
        description="Safe prune for bundled static assets (never touches user_content)",
        epilog="User-generated content directories are always excluded.",
    )
    ap.add_argument("--report", action="store_true", help="Report candidates (default)")
    ap.add_argument(
        "--apply", action="store_true", help="Move candidates to quarantine"
    )
    ap.add_argument(
        "--purge",
        action="store_true",
        help="Delete quarantined files older than N days",
    )
    ap.add_argument("--days", type=int, default=7, help="Age threshold in days")
    args = ap.parse_args()

    # Purge mode: only operate within quarantine
    if args.purge:
        cutoff = time.time() - args.days * 86400
        if QUARANTINE.exists():
            for p in QUARANTINE.rglob("*"):
                try:
                    if p.is_file() and p.stat().st_mtime < cutoff:
                        p.unlink()
                except Exception:
                    pass
        print(f"Purged quarantine files older than {args.days} days.")
        return 0

    # Only consider files under static/ roots
    static_files = list_assets_static()
    referenced = parse_templates() | load_manifest()

    allowlist = load_globs(Path("static/.prune-allowlist"))
    blocklist = load_globs(Path("static/.prune-blocklist"))

    candidates = set()
    for f in static_files:
        base_root = _static_root_for(f)
        if not base_root or _is_protected(f):
            continue
        rel = f.relative_to(base_root).as_posix()
        is_referenced = rel in referenced or any(fnmatch(rel, g) for g in allowlist)
        prefer_remove = any(fnmatch(rel, g) for g in blocklist)
        if (not is_referenced or prefer_remove) and older_than(f, args.days):
            candidates.add(f)

    print("Unreferenced candidates:")
    for c in sorted(candidates):
        try:
            stat = c.stat()
            size = stat.st_size
            mtime = datetime.fromtimestamp(stat.st_mtime).isoformat()
            print(f"{c.as_posix()}\t{size}\t{mtime}")
        except Exception:
            print(f"{c.as_posix()}")

    if args.apply and candidates:
        ts = datetime.now().strftime("%Y%m%d")
        for c in candidates:
            base_root = _static_root_for(c)
            if not base_root or _is_protected(c):
                continue
            dest = QUARANTINE / ts / c.relative_to(base_root)
            try:
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(c), str(dest))
            except Exception:
                # Continue best-effort
                pass
        print(f"Moved {len(candidates)} files to quarantine.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
