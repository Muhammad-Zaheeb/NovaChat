from app.core import observability
from app.core.config import settings


def test_sentry_is_noop_without_dsn(monkeypatch):
    monkeypatch.setattr(settings, "SENTRY_DSN", "")
    assert observability.init_sentry() is False


def test_scrub_removes_cookies_auth_and_pii():
    event = {
        "request": {
            "cookies": {"access_token": "secret"},
            "data": {"password": "pw"},
            "query_string": "email=a@example.com",
            "headers": {"Cookie": "access_token=secret", "Authorization": "Bearer x", "User-Agent": "ua"},
        },
        "user": {"email": "a@example.com"},
    }
    out = observability.scrub(event)
    assert out["request"]["headers"] == {"User-Agent": "ua"}
    assert "cookies" not in out["request"] and "data" not in out["request"] and "user" not in out
    assert "secret" not in str(out)
