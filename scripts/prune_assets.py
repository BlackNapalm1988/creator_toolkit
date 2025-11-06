#!/usr/bin/env python3
import argparse
import json
import re
import shutil
import sys
import time
from datetime import datetime
from fnmatch import fnmatch
from pathlib import Path

STATIC_ROOTS = [Path("static")]
NEVER_TOUCH = {Path("user_content"), Path("releases"), Path("scenes"), Path("data")}
QUARANTINE = Path("._quarantine/static")


def load_globs(p: Path) -> set[str]:
    return set(p.read_text().splitlines()) if p.exists() else set()


def list_assets_static() -> set[Path]:
    files = set()
    for root in STATIC_ROOTS:
        if not root.exists():
            continue
        for p in root.rglob("*"):
            if p.is_file():
                files.add(p)
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


def main():
    ap = argparse.ArgumentParser(description="Safe prune for bundled static assets")
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
        try:
            rel = f.relative_to(Path("static")).as_posix()
        except ValueError:
            # Not under canonical static/ root; skip
            continue
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
            dest = QUARANTINE / ts / c.relative_to(Path("static"))
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
