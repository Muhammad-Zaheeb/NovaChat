import os

# Must happen before the app is imported: tests never touch the real database.
os.environ["DATABASE_URL"] = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+asyncpg://apple@localhost:5432/novachat_test"
)
os.environ["EMAIL_BACKEND"] = "memory"
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-pytest-only-0123456789")

import pytest  # noqa: E402
import pytest_asyncio  # noqa: E402
from httpx import ASGITransport, AsyncClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.database.base import Base  # noqa: E402
from app.database.engine import engine  # noqa: E402
import app.models  # noqa: E402,F401
from app.main import app  # noqa: E402

assert engine.url.database == "novachat_test"


@pytest_asyncio.fixture(scope="session", autouse=True)
async def _schema():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


@pytest_asyncio.fixture(autouse=True)
async def _clean():
    yield
    async with engine.begin() as conn:
        await conn.execute(
            text("TRUNCATE users, email_verification_codes, password_reset_codes, friendships, conversations, conversation_members, messages, attachments RESTART IDENTITY CASCADE")
        )


@pytest.fixture(autouse=True)
def _storage(tmp_path):
    from pathlib import Path
    from app.core import ratelimit
    from app.core.storage import LocalStorage, set_storage

    ratelimit.reset()
    set_storage(LocalStorage(Path(tmp_path) / "uploads"))
    yield
    set_storage(None)


def make_client() -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test/api")


def last_code(email: str) -> str:
    from app.core import email as mailer
    return [m["code"] for m in mailer.outbox if m["to"] == email][-1]


async def register_login(name: str) -> AsyncClient:
    """Return a client (own cookie jar) logged in as a fresh user; .user_id is set."""
    c = make_client()
    r = await c.post(
        "/auth/register",
        json={"username": name, "email": f"{name}@example.com", "password": "password123"},
    )
    assert r.status_code == 201, r.text
    c.user_id = r.json()["id"]
    r = await c.post(
        "/auth/verify-email", json={"email": f"{name}@example.com", "code": last_code(f"{name}@example.com")}
    )
    assert r.status_code == 200, r.text
    r = await c.post("/auth/login", json={"email": f"{name}@example.com", "password": "password123"})
    assert r.status_code == 200, r.text
    return c


@pytest_asyncio.fixture
async def client():
    async with make_client() as c:
        yield c


@pytest_asyncio.fixture
async def users():
    clients = {n: await register_login(n) for n in ("alice", "bob", "carol", "mallory")}
    names = list(clients)
    for i, a in enumerate(names):  # everyone is friends with everyone by default
        for b in names[i + 1:]:
            r = await clients[a].post("/friends/requests", json={"user_id": clients[b].user_id})
            assert r.status_code == 201, r.text
            r = await clients[b].post(f"/friends/requests/{r.json()['id']}/accept")
            assert r.status_code == 200, r.text
    yield clients
    for c in clients.values():
        await c.aclose()
