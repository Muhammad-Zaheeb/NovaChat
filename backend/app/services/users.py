"""User lookup logic."""
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


def _escape_like(s: str) -> str:
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def search_users(db: AsyncSession, me: User, q: str, limit: int) -> list[User]:
    """Case-insensitive username match (prefix matches first, then contains).
    Email only matches exactly, so emails can't be enumerated by prefix."""
    q = q.strip()
    pattern = _escape_like(q)
    rank = User.username.ilike(f"{pattern}%", escape="\\").desc()
    stmt = (
        select(User)
        .where(
            User.id != me.id,
            User.username.ilike(f"%{pattern}%", escape="\\") | (func.lower(User.email) == q.lower()),
        )
        .order_by(rank, User.username)
        .limit(min(max(limit, 1), 50))
    )
    return list(await db.scalars(stmt))
