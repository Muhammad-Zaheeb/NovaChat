from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.friends import (
    FriendOut,
    FriendRequestCreate,
    FriendRequestOut,
    FriendRequestsOut,
)
from app.services import friends
from app.services.friends import FriendError
from app.ws import events, notify
from app.ws.manager import manager

router = APIRouter(prefix="/friends", tags=["Friends"])


async def _call(coro):
    try:
        return await coro
    except FriendError as e:
        raise HTTPException(status_code=e.status, detail=e.detail)


@router.post("/requests", response_model=FriendRequestOut, status_code=201)
async def send_request(
    data: FriendRequestCreate, db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)
):
    f, auto = await _call(friends.send_request(db, me, data.user_id))
    out = FriendRequestOut.model_validate(f)
    if auto:
        await notify.publish_friend(
            events.FRIEND_ACCEPTED, data.user_id, id=f.id, user={"id": me.id, "username": me.username}
        )
    else:
        await notify.publish_friend(
            events.FRIEND_REQUEST, data.user_id, id=f.id, user={"id": me.id, "username": me.username}
        )
    return out


@router.get("/requests", response_model=FriendRequestsOut)
async def list_requests(db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)):
    incoming, outgoing = await friends.pending(db, me)
    return FriendRequestsOut(
        incoming=[FriendRequestOut.model_validate(f) for f in incoming],
        outgoing=[FriendRequestOut.model_validate(f) for f in outgoing],
    )


@router.post("/requests/{req_id}/accept", response_model=FriendRequestOut)
async def accept(req_id: int, db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)):
    f = await _call(friends.accept(db, me, req_id))
    await notify.publish_friend(
        events.FRIEND_ACCEPTED, f.requester_id, id=f.id, user={"id": me.id, "username": me.username}
    )
    return FriendRequestOut.model_validate(f)


@router.post("/requests/{req_id}/decline", response_model=FriendRequestOut)
async def decline(req_id: int, db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)):
    f = await _call(friends.decline(db, me, req_id))
    await notify.publish_friend(events.FRIEND_REMOVED, f.requester_id, user_id=me.id, request_id=f.id)
    return FriendRequestOut.model_validate(f)


@router.delete("/requests/{req_id}", status_code=204)
async def cancel(req_id: int, db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)):
    f = await _call(friends.cancel(db, me, req_id))
    await notify.publish_friend(events.FRIEND_REMOVED, f.addressee_id, user_id=me.id, request_id=req_id)


@router.get("", response_model=list[FriendOut])
async def list_friends(db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)):
    users = await friends.friends_of(db, me)
    online = await manager.filter_online({u.id for u in users})
    return [FriendOut(
            id=u.id, avatar_key=u.avatar_key, username=u.username, display_name=u.display_name, bio=u.bio,
            last_seen_at=u.last_seen_at, online=u.id in online,
        ) for u in users]


@router.delete("/{user_id}", status_code=204)
async def unfriend(user_id: int, db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)):
    await _call(friends.unfriend(db, me, user_id))
    await notify.publish_friend(events.FRIEND_REMOVED, user_id, user_id=me.id)
