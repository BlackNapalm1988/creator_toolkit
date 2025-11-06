import importlib

import pytest


def test_settings_guard_fails_on_insecure_prod(monkeypatch):
    from app.core import settings as sm

    # Simulate non-dev environment with insecure secret
    monkeypatch.setenv("ENV", "prod")
    monkeypatch.setenv("JWT_SECRET", "insecure-dev")
    sm.get_settings.cache_clear()

    with pytest.raises(ValueError):
        sm.get_settings().validate_for_runtime()


def test_seeding_guard_helper(monkeypatch):
    import app.main as main

    assert main._should_seed_defaults("dev", False) is True
    assert main._should_seed_defaults("prod", False) is False
    assert main._should_seed_defaults("prod", True) is True

