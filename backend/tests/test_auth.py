REG = {"username": "alice", "email": "alice@example.com", "password": "password123"}


async def test_register_login_me_logout(client):
    r = await client.post("/auth/register", json=REG)
    assert r.status_code == 201 and r.json()["username"] == "alice"
    assert (await client.get("/auth/me")).status_code == 401
    from tests.conftest import last_code as _lc
    await client.post("/auth/verify-email", json={"email": REG["email"], "code": _lc(REG["email"])})
    assert (await client.post("/auth/login", json={"email": REG["email"], "password": REG["password"]})).status_code == 200
    me = await client.get("/auth/me")
    assert me.status_code == 200 and me.json()["email"] == REG["email"]
    assert (await client.post("/auth/logout")).status_code == 200
    assert (await client.get("/auth/me")).status_code == 401


async def test_duplicate_email_and_username(client):
    await client.post("/auth/register", json=REG)
    r = await client.post("/auth/register", json={**REG, "username": "other"})
    assert r.status_code == 409
    r = await client.post("/auth/register", json={**REG, "email": "other@example.com"})
    assert r.status_code == 409


async def test_bad_login(client):
    await client.post("/auth/register", json=REG)
    from tests.conftest import last_code as _lc
    await client.post("/auth/verify-email", json={"email": REG["email"], "code": _lc(REG["email"])})
    r = await client.post("/auth/login", json={"email": REG["email"], "password": "wrongpassword"})
    assert r.status_code == 401
    r = await client.post("/auth/login", json={"email": "nobody@example.com", "password": "password123"})
    assert r.status_code == 401


async def test_register_does_not_log_in(client):
    r = await client.post("/auth/register", json=REG)
    assert r.status_code == 201 and "access_token" not in r.cookies
    assert (await client.get("/auth/me")).status_code == 401


async def test_search_email_exact_case_insensitive(users):
    from sqlalchemy import text
    from app.database.engine import engine
    async with engine.begin() as conn:
        await conn.execute(text("UPDATE users SET email='Bob.Mixed@Example.com' WHERE username='bob'"))
    r = await users["alice"].get("/users/search", params={"q": "BOB.mixed@example.COM"})
    assert [u["username"] for u in r.json()["items"]] == ["bob"]
    r = await users["alice"].get("/users/search", params={"q": "bob.mixed"})
    assert r.json()["items"] == []


from datetime import datetime, timedelta, timezone  # noqa: E402

from sqlalchemy import text  # noqa: E402

from app.core import email as mailer  # noqa: E402
from app.database.engine import engine  # noqa: E402
from tests.conftest import last_code  # noqa: E402


async def _sql(q, **p):
    async with engine.begin() as conn:
        await conn.execute(text(q), p)


async def test_unverified_login_blocked_then_verify(client):
    await client.post("/auth/register", json=REG)
    assert mailer.outbox[-1]["to"] == REG["email"] and mailer.outbox[-1]["subject"] == "Your NovaChat verification code"
    login = {"email": REG["email"], "password": REG["password"]}
    r = await client.post("/auth/login", json=login)
    assert r.status_code == 403 and r.json()["detail"] == "email_not_verified"
    r = await client.post("/auth/verify-email", json={"email": REG["email"], "code": last_code(REG["email"])})
    assert r.status_code == 200
    assert (await client.post("/auth/login", json=login)).status_code == 200


async def test_wrong_code_attempts_limit(client):
    await client.post("/auth/register", json=REG)
    good = last_code(REG["email"])
    bad = "000000" if good != "000000" else "111111"
    for _ in range(5):
        r = await client.post("/auth/verify-email", json={"email": REG["email"], "code": bad})
        assert r.status_code == 400 and r.json()["detail"] == "invalid_or_expired_code"
    # correct code no longer works after 5 failures
    r = await client.post("/auth/verify-email", json={"email": REG["email"], "code": good})
    assert r.status_code == 400


async def test_expired_code_and_single_use(client):
    await client.post("/auth/register", json=REG)
    code = last_code(REG["email"])
    await _sql("UPDATE email_verification_codes SET expires_at = :t", t=datetime.now(timezone.utc) - timedelta(minutes=1))
    assert (await client.post("/auth/verify-email", json={"email": REG["email"], "code": code})).status_code == 400
    await _sql("UPDATE email_verification_codes SET created_at = :t", t=datetime.now(timezone.utc) - timedelta(minutes=5))
    assert (await client.post("/auth/resend-code", json={"email": REG["email"]})).status_code == 200
    new = last_code(REG["email"])
    assert (await client.post("/auth/verify-email", json={"email": REG["email"], "code": new})).status_code == 200
    assert (await client.post("/auth/verify-email", json={"email": REG["email"], "code": new})).status_code == 400


async def test_resend_limits_and_no_enumeration(client):
    await client.post("/auth/register", json=REG)
    r = await client.post("/auth/resend-code", json={"email": REG["email"]})
    assert r.status_code == 429  # within 60 s of the registration email
    # unknown email looks the same as a fine request
    r = await client.post("/auth/resend-code", json={"email": "ghost@example.com"})
    assert r.status_code == 200
    assert (await client.post("/auth/verify-email", json={"email": "ghost@example.com", "code": "123456"})).status_code == 400
    # hourly cap: 5 codes per hour
    for _ in range(4):
        await _sql("UPDATE email_verification_codes SET created_at = created_at - interval '2 minutes'")
        assert (await client.post("/auth/resend-code", json={"email": REG["email"]})).status_code == 200
    await _sql("UPDATE email_verification_codes SET created_at = created_at - interval '2 minutes'")
    assert (await client.post("/auth/resend-code", json={"email": REG["email"]})).status_code == 429


async def test_email_normalised_and_disposable_rejected(client):
    r = await client.post("/auth/register", json={**REG, "email": "Alice@Example.COM"})
    assert r.status_code == 201 and r.json()["email"] == "alice@example.com"
    await client.post("/auth/verify-email", json={"email": "ALICE@example.com", "code": last_code("alice@example.com")})
    assert (await client.post("/auth/login", json={"email": "ALICE@EXAMPLE.com", "password": REG["password"]})).status_code == 200
    r = await client.post("/auth/register", json={**REG, "username": "xyz", "email": "x@mailinator.com"})
    assert r.status_code == 400
