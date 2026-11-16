from app.core import ratelimit
from app.core.config import settings
from tests.conftest import make_client, register_login

CREDS = {"email": "alice@example.com", "password": "wrongpassword"}


async def test_login_email_lockout_after_failures_with_retry_after():
    ok = await register_login("alice")
    async with make_client() as c:
        for _ in range(5):
            assert (await c.post("/auth/login", json=CREDS)).status_code == 401
        r = await c.post("/auth/login", json={**CREDS, "password": "password123"})  # even the right one
        assert r.status_code == 429
        assert int(r.headers["retry-after"]) > 0 and "try again" in r.json()["detail"]
        # other emails are unaffected
        assert (await c.post("/auth/login", json={"email": "x@example.com", "password": "password123"})).status_code == 401
    await ok.aclose()


async def test_successful_login_resets_failure_count():
    c0 = await register_login("alice")
    async with make_client() as c:
        for _ in range(4):
            await c.post("/auth/login", json=CREDS)
        assert (await c.post("/auth/login", json={**CREDS, "password": "password123"})).status_code == 200
        for _ in range(4):
            assert (await c.post("/auth/login", json=CREDS)).status_code == 401
    await c0.aclose()


async def test_login_ip_limit(client):
    for i in range(20):
        assert (await client.post("/auth/login", json={"email": f"u{i}@example.com", "password": "x"})).status_code == 401
    r = await client.post("/auth/login", json={"email": "u99@example.com", "password": "x"})
    assert r.status_code == 429 and "retry-after" in r.headers


async def test_forgot_password_limited_per_email(client):
    codes = []
    for _ in range(5):
        codes.append((await client.post("/auth/forgot-password", json={"email": "a@example.com"})).status_code)
    assert codes == [200] * 5
    assert (await client.post("/auth/forgot-password", json={"email": "a@example.com"})).status_code == 429


async def test_register_ip_limit(client):
    for i in range(20):
        r = await client.post("/auth/register", json={"username": f"user{i}", "email": f"u{i}@example.com", "password": "password123"})
        assert r.status_code == 201
    r = await client.post("/auth/register", json={"username": "extra", "email": "e@example.com", "password": "password123"})
    assert r.status_code == 429


async def test_forwarded_for_only_trusted_with_trust_proxy(client, monkeypatch):
    def hdr(ip):
        return {"X-Forwarded-For": f"6.6.6.6, {ip}"}

    async def hammer(ip):
        for i in range(20):
            await client.post("/auth/login", json={"email": f"u{i}@example.com", "password": "x"}, headers=hdr(ip))
        return (await client.post("/auth/login", json={"email": "z@example.com", "password": "x"}, headers=hdr(ip))).status_code

    # Not trusted: header ignored, everything counts against the socket IP.
    monkeypatch.setattr(settings, "TRUST_PROXY", False)
    assert await hammer("1.1.1.1") == 429
    assert (await client.post("/auth/login", json={"email": "z@example.com", "password": "x"}, headers=hdr("2.2.2.2"))).status_code == 429
    ratelimit.reset()
    # Trusted: the proxy-appended (rightmost) address is the key, so another IP gets its own budget.
    monkeypatch.setattr(settings, "TRUST_PROXY", True)
    assert await hammer("1.1.1.1") == 429
    assert (await client.post("/auth/login", json={"email": "z@example.com", "password": "x"}, headers=hdr("2.2.2.2"))).status_code == 401
