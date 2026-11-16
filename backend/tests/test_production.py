import httpx
import pytest

from app.core import email as mailer
from app.core.config import Settings, normalize_database_url, settings
from app.main import app
from httpx import ASGITransport, AsyncClient


def test_database_url_normalised_for_asyncpg():
    n = normalize_database_url
    assert n("postgres://u:p@h/db") == "postgresql+asyncpg://u:p@h/db"
    assert n("postgresql://u:p@h/db?sslmode=require") == "postgresql+asyncpg://u:p@h/db?ssl=require"
    assert n("postgresql+asyncpg://u@h/db?ssl=require&channel_binding=require") == "postgresql+asyncpg://u@h/db?ssl=require"
    assert n("postgresql+asyncpg://u@localhost:5432/novachat") == "postgresql+asyncpg://u@localhost:5432/novachat"


def test_production_check_flags_unsafe_config():
    base = dict(DATABASE_URL="postgresql://x/y", ENV="production")
    assert len(Settings(_env_file=None, SECRET_KEY="change-me", **base).check_production()) == 3
    ok = Settings(_env_file=None, SECRET_KEY="x" * 40, COOKIE_SECURE=True, STORAGE_BACKEND="s3", **base)
    assert ok.check_production() == []


async def test_health_is_liveness_only_and_db_check(client):
    r = await client.get("/health")
    assert r.status_code == 200 and r.json() == {"status": "ok"}
    assert (await client.get("/health/db")).json()["database"] == "ok"


async def test_api_is_under_prefix_and_unknown_api_paths_404():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        assert (await c.get("/api/health")).status_code == 200
        assert (await c.get("/auth/me")).status_code in (404, 200)  # not an API route (SPA/404)
        r = await c.get("/api/nope")
        assert r.status_code == 404 and r.json()["detail"] == "Not found"


async def test_security_headers(client):
    r = await client.get("/health")
    h = r.headers
    assert h["x-content-type-options"] == "nosniff" and h["x-frame-options"] == "DENY"
    assert "frame-ancestors 'none'" in h["content-security-policy"] and "script-src 'self'" in h["content-security-policy"]
    assert "microphone=(self)" in h["permissions-policy"]
    assert h["referrer-policy"]


async def test_hsts_only_in_production(client, monkeypatch):
    from app.core import security_headers
    assert b"strict-transport-security" not in dict(security_headers.headers())
    monkeypatch.setattr(settings, "ENV", "production")
    assert b"strict-transport-security" in dict(security_headers.headers())


async def test_spa_fallback_and_static(tmp_path, monkeypatch):
    import importlib

    import app.main as main

    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<html>spa</html>")
    (tmp_path / "assets" / "a.js").write_text("x=1")
    (tmp_path.parent / "secret.txt").write_text("nope")
    monkeypatch.setattr(settings, "FRONTEND_DIST", str(tmp_path))
    spa_app = importlib.reload(main).app
    try:
        async with AsyncClient(transport=ASGITransport(app=spa_app), base_url="http://test") as c:
            assert "spa" in (await c.get("/")).text
            assert "spa" in (await c.get("/c/12")).text  # client-side route
            r = await c.get("/assets/a.js")
            assert r.text == "x=1" and "immutable" in r.headers["cache-control"]
            assert "spa" in (await c.get("/%2e%2e/secret.txt")).text  # no path traversal
            assert (await c.get("/api/health")).json() == {"status": "ok"}
            assert (await c.get("/api/missing")).status_code == 404
    finally:
        monkeypatch.undo()
        importlib.reload(main)


def test_brevo_backend_posts_to_api(monkeypatch):
    sent = {}

    def fake_post(url, headers, json, timeout):
        sent.update(url=url, headers=headers, json=json)
        return httpx.Response(201, request=httpx.Request("POST", url))

    monkeypatch.setattr(settings, "EMAIL_BACKEND", "brevo")
    monkeypatch.setattr(settings, "BREVO_API_KEY", "key-123")
    monkeypatch.setattr(settings, "EMAIL_FROM", "NovaChat <hi@example.com>")
    monkeypatch.setattr(httpx, "post", fake_post)
    mailer.send_password_reset_code("bob@example.com", "bob", "123456")
    assert sent["url"] == "https://api.brevo.com/v3/smtp/email" and sent["headers"]["api-key"] == "key-123"
    assert sent["json"]["sender"] == {"email": "hi@example.com", "name": "NovaChat"}
    assert sent["json"]["to"] == [{"email": "bob@example.com"}] and "123456" in sent["json"]["textContent"]


def test_brevo_failure_never_raises(monkeypatch):
    def boom(*a, **k):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(settings, "EMAIL_BACKEND", "brevo")
    monkeypatch.setattr(httpx, "post", boom)
    mailer.send_email("a@example.com", "s", "t", "<p>t</p>")  # logged, not raised
