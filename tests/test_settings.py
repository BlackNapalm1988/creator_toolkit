import pytest


def test_settings_guard_fails_on_insecure_prod(monkeypatch):
    from app.core import settings as sm

    # Simulate non-dev environment with insecure secret
    monkeypatch.setenv("ENV", "prod")
    monkeypatch.setenv("JWT_SECRET", "insecure-dev")
    sm.get_settings.cache_clear()

    with pytest.raises(ValueError):
        sm.get_settings().validate_for_runtime()


def test_settings_guard_allows_dev_defaults(monkeypatch):
    from app.core import settings as sm

    monkeypatch.setenv("ENV", "dev")
    monkeypatch.setenv("JWT_SECRET", "insecure-dev")
    sm.get_settings.cache_clear()

    settings = sm.get_settings()
    settings.validate_for_runtime()  # Should not raise for development


def test_settings_guard_rejects_invalid_env(monkeypatch):
    from app.core import settings as sm

    monkeypatch.setenv("ENV", "production")
    monkeypatch.setenv("JWT_SECRET", "some-super-secret-value")
    sm.get_settings.cache_clear()

    with pytest.raises(ValueError):
        sm.get_settings().validate_for_runtime()


def test_settings_guard_rejects_short_secret_in_prod(monkeypatch):
    from app.core import settings as sm

    monkeypatch.setenv("ENV", "prod")
    monkeypatch.setenv("JWT_SECRET", "short")
    sm.get_settings.cache_clear()

    with pytest.raises(ValueError):
        sm.get_settings().validate_for_runtime()


def test_seeding_guard_helper(monkeypatch):
    import app.main as main

    assert main._should_seed_defaults("dev", False) is True
    assert main._should_seed_defaults("prod", False) is False
    assert main._should_seed_defaults("prod", True) is True
