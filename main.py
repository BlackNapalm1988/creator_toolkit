"""Compatibility wrapper to expose the FastAPI app via the legacy module path."""

import sys

from app import main as _impl

sys.modules[__name__] = _impl
