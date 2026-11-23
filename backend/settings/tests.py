"""Module-level settings guards (settings.py's SECRET_KEY fail-loud check
and the production-only SECURE_* block) only run once, at import time,
driven by env vars already read by the time any fixture runs - they can't
be exercised by monkeypatching `django.conf.settings` (already configured,
and reloading it wouldn't re-run this module's top level). Instead, reload
the raw `settings.settings` module object directly (not django.conf.settings
itself, which stays untouched) with different env vars, and inspect its
freshly recomputed names.

Each test restores the module to its original (real-env) state itself,
inside the test body, before monkeypatch's own fixture teardown undoes the
env var changes - reloading afterwards, with the env vars already reverted,
would just reload the same real values again, not the ones the test set.
"""
import importlib

import pytest
from django.core.exceptions import ImproperlyConfigured

from . import settings as settings_module
from . import urls as urls_module


def test_missing_secret_key_without_debug_fails_loudly(monkeypatch):
    # Explicitly blank, not just deleted - load_dotenv() never overrides an
    # already-set env var, so deleting it would just let backend/.env's dev
    # default (DJANGO_SECRET_KEY=change-me) silently refill it on reload.
    monkeypatch.setenv('DJANGO_SECRET_KEY', '')
    monkeypatch.setenv('DJANGO_DEBUG', 'False')

    try:
        with pytest.raises(ImproperlyConfigured, match='DJANGO_SECRET_KEY'):
            importlib.reload(settings_module)
    finally:
        monkeypatch.undo()
        importlib.reload(settings_module)


def test_debug_mode_falls_back_to_insecure_hardcoded_secret_key(monkeypatch):
    monkeypatch.setenv('DJANGO_SECRET_KEY', '')
    monkeypatch.setenv('DJANGO_DEBUG', 'True')

    try:
        importlib.reload(settings_module)
        assert settings_module.SECRET_KEY.startswith('django-insecure-')
    finally:
        monkeypatch.undo()
        importlib.reload(settings_module)


def test_urlconf_appends_static_media_pattern_in_debug(settings):
    # Django's test environment (django.test.utils.setup_test_environment,
    # which pytest-django always runs) forces django.conf.settings.DEBUG to
    # False for the whole session regardless of .env/DJANGO_DEBUG - so
    # unlike the settings.py reload tests above (which only look at the raw
    # module's own locally-computed DEBUG variable), this one must flip the
    # live django.conf.settings object itself via pytest-django's `settings`
    # fixture before reloading urls.py, whose `if settings.DEBUG:` reads
    # exactly that live object.
    settings.DEBUG = False
    importlib.reload(urls_module)
    baseline = len(urls_module.urlpatterns)

    try:
        settings.DEBUG = True
        importlib.reload(urls_module)
        assert len(urls_module.urlpatterns) == baseline + 1
    finally:
        settings.DEBUG = False
        importlib.reload(urls_module)


def test_production_mode_enables_ssl_redirect_and_hsts(monkeypatch):
    monkeypatch.setenv('DJANGO_SECRET_KEY', 'a-real-production-secret')
    monkeypatch.setenv('DJANGO_DEBUG', 'False')

    try:
        importlib.reload(settings_module)
        assert settings_module.SECURE_SSL_REDIRECT is True
        assert settings_module.SECURE_HSTS_SECONDS == 31536000
        assert settings_module.SECURE_HSTS_INCLUDE_SUBDOMAINS is True
    finally:
        monkeypatch.undo()
        importlib.reload(settings_module)
