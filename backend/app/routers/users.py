from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.user import UserPublic
from app.services import users

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/search", response_model=list[UserPublic])
async def search_users(
    q: str = Query(min_length=2, max_length=50),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    return await users.search_users(db, me, q, limit)
