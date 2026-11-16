from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.user import ProfileUpdate, UserOut, UserSearchPage, UserSearchResult
from app.services import chat, friends, users
from app.ws import notify
from app.ws.manager import manager

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/search", response_model=UserSearchPage)
async def search_users(
    q: str = Query(min_length=2, max_length=50),
    offset: int = Query(0, ge=0, le=10000),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    found = await users.search_users(db, me, q, offset, limit + 1)
    has_more = len(found) > limit
    found = found[:limit]
    ids = [u.id for u in found]
    st = await friends.statuses(db, me.id, ids)
    mutual = await friends.mutual_counts(db, me.id, ids)
    return UserSearchPage(
        items=[
            UserSearchResult(
                id=u.id, avatar_key=u.avatar_key, username=u.username, display_name=u.display_name, bio=u.bio,
                friendship_status=st.get(u.id, "none"), mutual_friends_count=mutual.get(u.id, 0),
            )
            for u in found
        ],
        has_more=has_more,
    )


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


@router.patch("/me", response_model=UserOut)
async def update_profile(
    data: ProfileUpdate, db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)
):
    """Display name and bio. Blank strings clear the field."""
    me.display_name = (data.display_name or "").strip() or None
    me.bio = (data.bio or "").strip() or None
    await db.commit()
    await db.refresh(me)
    await notify.publish_user_updated(db, me)
    return me
