"""Abandoned-upload cleanup: attachments never attached to a message (24 h) and storage
objects that no database row points to. Runs at startup, hourly, and via `python -m app.cleanup`."""
import asyncio
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.storage import Storage, get_storage
from app.database.session import SessionLocal
from app.models.attachment import Attachment
from app.models.user import User

log = logging.getLogger("novachat.cleanup")

MAX_AGE = timedelta(hours=24)
INTERVAL = 3600
# Only these prefixes are ever swept; anything else in the bucket (e.g. backups/) is left alone.
SWEEP_PREFIXES = ("attachments/", "thumbs/", "avatars/")


async def _delete_object(storage: Storage, key: str) -> None:
    try:
        await storage.delete(key)
    except Exception:
        log.exception("Could not delete storage object %s", key)


async def cleanup_unattached(db: AsyncSession, storage: Storage, max_age: timedelta = MAX_AGE) -> int:
    cutoff = datetime.now(timezone.utc) - max_age
    rows = (
        await db.scalars(
            select(Attachment).where(Attachment.message_id.is_(None), Attachment.created_at < cutoff)
        )
    ).all()
    for a in rows:
        for key in (a.storage_key, a.thumb_key):
            if key:
                await _delete_object(storage, key)
    if rows:
        await db.execute(delete(Attachment).where(Attachment.id.in_([a.id for a in rows])))
        await db.commit()
    return len(rows)


async def cleanup_orphan_objects(db: AsyncSession, storage: Storage, max_age: timedelta = MAX_AGE) -> int:
    """Objects older than max_age that no row references (e.g. a crash between upload and insert)."""
    cutoff = datetime.now(timezone.utc) - max_age
    referenced: set[str] = set()
    for key, thumb in (await db.execute(select(Attachment.storage_key, Attachment.thumb_key))).all():
        referenced.update(k for k in (key, thumb) if k)
    referenced.update(k for (k,) in (await db.execute(select(User.avatar_key).where(User.avatar_key.is_not(None)))).all())
    removed = 0
    for prefix in SWEEP_PREFIXES:
        for key, modified in await storage.list(prefix):
            if key not in referenced and modified < cutoff:
                await _delete_object(storage, key)
                removed += 1
    return removed


async def run_cleanup() -> dict[str, int]:
    storage = get_storage()
    async with SessionLocal() as db:
        unattached = await cleanup_unattached(db, storage)
        orphans = await cleanup_orphan_objects(db, storage)
    if unattached or orphans:
        log.info("Upload cleanup: %d unattached attachments, %d orphan objects removed", unattached, orphans)
    return {"unattached": unattached, "orphans": orphans}


async def cleanup_loop(interval: float = INTERVAL) -> None:
    while True:
        try:
            await run_cleanup()
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("Upload cleanup failed")  # never kill the loop
        await asyncio.sleep(interval)
