"""File storage abstraction: local disk (dev) or S3-compatible object storage (R2, S3, MinIO).
Keys are always generated server-side (see new_key); nothing user-controlled reaches a path."""
import asyncio
import secrets
from pathlib import Path
from typing import AsyncIterator, Protocol

from app.core.config import settings

CHUNK = 64 * 1024
BACKEND_DIR = Path(__file__).resolve().parents[2]


def new_key(prefix: str, ext: str) -> str:
    return f"{prefix}/{secrets.token_urlsafe(24)}.{ext}"


class Storage(Protocol):
    async def put(self, key: str, data: bytes, content_type: str) -> None: ...
    async def delete(self, key: str) -> None: ...
    async def size(self, key: str) -> int: ...
    def iter_range(self, key: str, start: int, end: int) -> AsyncIterator[bytes]: ...


class LocalStorage:
    def __init__(self, root: Path):
        self.root = root.resolve()

    def _path(self, key: str) -> Path:
        p = (self.root / key).resolve()
        if self.root not in p.parents:  # defence in depth; keys are server generated
            raise ValueError("invalid storage key")
        return p

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        p = self._path(key)

        def write():
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(data)

        await asyncio.to_thread(write)

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self._path(key).unlink, True)

    async def size(self, key: str) -> int:
        return (await asyncio.to_thread(self._path(key).stat)).st_size

    async def iter_range(self, key: str, start: int, end: int) -> AsyncIterator[bytes]:
        """Bytes start..end inclusive."""
        p = self._path(key)
        f = await asyncio.to_thread(open, p, "rb")
        try:
            await asyncio.to_thread(f.seek, start)
            left = end - start + 1
            while left > 0:
                chunk = await asyncio.to_thread(f.read, min(CHUNK, left))
                if not chunk:
                    break
                left -= len(chunk)
                yield chunk
        finally:
            await asyncio.to_thread(f.close)


class S3Storage:
    def __init__(self):
        import boto3  # imported lazily: only needed when STORAGE_BACKEND=s3
        from botocore.config import Config

        self.bucket = settings.S3_BUCKET
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.S3_ENDPOINT_URL or None,
            aws_access_key_id=settings.S3_ACCESS_KEY_ID,
            aws_secret_access_key=settings.S3_SECRET_ACCESS_KEY,
            region_name=settings.S3_REGION,
            config=Config(signature_version="s3v4"),
        )

    async def put(self, key: str, data: bytes, content_type: str) -> None:
        await asyncio.to_thread(
            self.client.put_object, Bucket=self.bucket, Key=key, Body=data, ContentType=content_type
        )

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self.client.delete_object, Bucket=self.bucket, Key=key)

    async def size(self, key: str) -> int:
        head = await asyncio.to_thread(self.client.head_object, Bucket=self.bucket, Key=key)
        return head["ContentLength"]

    async def iter_range(self, key: str, start: int, end: int) -> AsyncIterator[bytes]:
        obj = await asyncio.to_thread(
            self.client.get_object, Bucket=self.bucket, Key=key, Range=f"bytes={start}-{end}"
        )
        body = obj["Body"]
        try:
            while True:
                chunk = await asyncio.to_thread(body.read, CHUNK)
                if not chunk:
                    break
                yield chunk
        finally:
            body.close()


_storage: Storage | None = None


def get_storage() -> Storage:
    global _storage
    if _storage is None:
        if settings.STORAGE_BACKEND == "s3":
            _storage = S3Storage()
        else:
            root = Path(settings.UPLOAD_DIR)
            _storage = LocalStorage(root if root.is_absolute() else BACKEND_DIR / root)
    return _storage


def set_storage(s: Storage | None) -> None:
    """Tests swap in a temp-dir storage."""
    global _storage
    _storage = s
