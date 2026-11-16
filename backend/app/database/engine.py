from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.core.config import settings

_url = settings.async_database_url
_kwargs: dict = {"pool_pre_ping": True}
if not _url.startswith("sqlite"):
    _kwargs.update(
        pool_size=settings.DB_POOL_SIZE,
        max_overflow=settings.DB_MAX_OVERFLOW,
        pool_recycle=settings.DB_POOL_RECYCLE,
    )
if "-pooler" in _url:  # Neon's PgBouncer endpoint can't use asyncpg's prepared-statement cache
    _kwargs["connect_args"] = {"statement_cache_size": 0}

engine = create_async_engine(_url, **_kwargs)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)
