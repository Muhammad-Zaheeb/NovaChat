from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.user import UserSearchResult
from app.services import chat, friends, users
from app.ws.manager import manager

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/search", response_model=list[UserSearchResult])
async def search_users(
    q: str = Query(min_length=2, max_length=50),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    found = await users.search_users(db, me, q, limit)
    st = await friends.statuses(db, me.id, [u.id for u in found])
    return [
        UserSearchResult(id=u.id, username=u.username, friendship_status=st.get(u.id, "none"))
        for u in found
    ]


@router.get("/online")
async def online_users(
    ids: str = Query(max_length=1000, description="Comma-separated user ids"),
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    """Which of `ids` are online. Only users sharing a conversation with the caller are reported."""
    try:
        wanted = {int(i) for i in ids.split(",") if i.strip()}
    except ValueError:
        raise HTTPException(status_code=422, detail="ids must be comma-separated integers")
    wanted &= set(await chat.peer_ids(db, me.id)) | {me.id}
    return {"online": sorted(await manager.filter_online(wanted))}
