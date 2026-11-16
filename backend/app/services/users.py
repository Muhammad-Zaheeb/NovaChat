"""User lookup logic."""
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.user import User


def _escape_like(s: str) -> str:
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def search_users(db: AsyncSession, me: User, q: str, offset: int, limit: int) -> list[User]:
    """Match username or display name (case-insensitive). Ranked: exact username, username
    prefix, display-name prefix, contains. Email only matches exactly, so emails can't be
    enumerated by prefix."""
    q = q.strip()
    pattern = _escape_like(q.lower())
    uname = func.lower(User.username)
    dname = func.lower(func.coalesce(User.display_name, ""))
    rank = case(
        (uname == q.lower(), 0),
        (uname.like(f"{pattern}%", escape="\\"), 1),
        (dname.like(f"{pattern}%", escape="\\"), 2),
        else_=3,
    )
    stmt = (
        select(User)
        .where(
            User.id != me.id,
            uname.like(f"%{pattern}%", escape="\\")
            | dname.like(f"%{pattern}%", escape="\\")
            | (func.lower(User.email) == q.lower()),
        )
        .order_by(rank, User.username, User.id)
        .offset(offset)
        .limit(min(max(limit, 1), 51))
    )
    return list(await db.scalars(stmt))
