import jwt
from fastapi import Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.database.session import get_db
from app.models.user import User

COOKIE_NAME = "access_token"


async def user_from_token(db: AsyncSession, token: str | None) -> User:
    """Shared by REST (cookie) and WebSocket (handshake cookie) auth."""
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        user_id = int(decode_token(token).get("user_id"))
    except (jwt.PyJWTError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def get_current_user(
    request: Request, db: AsyncSession = Depends(get_db)
) -> User:
    return await user_from_token(db, request.cookies.get(COOKIE_NAME))
