import asyncio
import os
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update

from app.core.storage import get_storage
from app.database.engine import SessionLocal
from app.models.attachment import Attachment
from app.services import cleanup
from tests.conftest import register_login


async def _make(storage, uid, key, message_id=None, age_h=0, thumb=None):
    await storage.put(key, b"data", "image/png")
    if thumb:
        await storage.put(thumb, b"t", "image/webp")
    async with SessionLocal() as db:
        a = Attachment(
            uploader_id=uid, message_id=message_id, kind="image", mime="image/png", size=4,
            original_name="x.png", storage_key=key, thumb_key=thumb,
            created_at=datetime.now(timezone.utc) - timedelta(hours=age_h),
        )
        db.add(a)
        await db.commit()
        return a.id


async def _exists(storage, key):
    try:
        await storage.size(key)
        return True
    except FileNotFoundError:
        return False


async def test_unattached_attachments_removed_after_24h_only():
    c = await register_login("alice")
    s = get_storage()
    old = await _make(s, c.user_id, "attachments/old.png", age_h=25, thumb="thumbs/old.webp")
    fresh = await _make(s, c.user_id, "attachments/fresh.png", age_h=1)
    async with SessionLocal() as db:
        n = await cleanup.cleanup_unattached(db, s)
        ids = set((await db.scalars(select(Attachment.id))).all())
    assert n == 1 and ids == {fresh} and old not in ids
    assert not await _exists(s, "attachments/old.png") and not await _exists(s, "thumbs/old.webp")
    assert await _exists(s, "attachments/fresh.png")
    await c.aclose()


async def test_attached_attachments_never_removed(users):
    from tests.test_uploads import dm, upload

    cid = await dm(users)
    a = (await upload(users["alice"], b"%PDF-1.4 hi", "cv.pdf")).json()
    r = await users["alice"].post(f"/conversations/{cid}/messages", json={"attachment_ids": [a["id"]]})
    assert r.status_code == 201
    async with SessionLocal() as db:  # age it far past 24 h
        await db.execute(update(Attachment).values(created_at=datetime.now(timezone.utc) - timedelta(days=30)))
        await db.commit()
        assert await cleanup.cleanup_unattached(db, get_storage()) == 0
        assert await cleanup.cleanup_orphan_objects(db, get_storage()) == 0
    assert (await users["alice"].get(a["url"])).status_code == 200


async def test_orphan_objects_removed_but_referenced_and_other_prefixes_kept():
    c = await register_login("alice")
    s = get_storage()
    await _make(s, c.user_id, "attachments/kept.png", age_h=1)  # referenced
    await s.put("attachments/orphan.png", b"x", "image/png")
    await s.put("backups/dump.sql.gz", b"x", "application/gzip")
    old = time.time() - 48 * 3600
    for k in ("attachments/orphan.png", "attachments/kept.png", "backups/dump.sql.gz"):
        os.utime(s._path(k), (old, old))
    await s.put("attachments/new-orphan.png", b"x", "image/png")  # too young to delete
    async with SessionLocal() as db:
        n = await cleanup.cleanup_orphan_objects(db, s)
    assert n == 1
    assert not await _exists(s, "attachments/orphan.png")
    assert await _exists(s, "attachments/kept.png") and await _exists(s, "backups/dump.sql.gz")
    assert await _exists(s, "attachments/new-orphan.png")
    await c.aclose()


async def test_loop_survives_errors(monkeypatch):
    calls = []

    async def boom():
        calls.append(1)
        raise RuntimeError("db down")

    monkeypatch.setattr(cleanup, "run_cleanup", boom)
    t = asyncio.create_task(cleanup.cleanup_loop(interval=0.01))
    await asyncio.sleep(0.1)
    t.cancel()
    assert len(calls) >= 2
