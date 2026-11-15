from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.database.session import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.chat import (
    ConversationDetail,
    ConversationOut,
    DirectCreate,
    GroupCreate,
    MemberAdd,
    MessageCreate,
    MessageOut,
    ReadMark,
    ReadState,
)
from app.services import chat
from app.services.chat import ChatError
from app.ws import notify

router = APIRouter(prefix="/conversations", tags=["Conversations"])


async def _call(coro):
    try:
        return await coro
    except ChatError as e:
        raise HTTPException(status_code=e.status, detail=e.detail)


def _out(conv, last, unread) -> ConversationOut:
    out = ConversationOut.model_validate(conv)
    out.last_message = MessageOut.model_validate(last) if last else None
    out.unread_count = unread
    return out


@router.post("/direct", response_model=ConversationOut)
async def create_direct(
    data: DirectCreate, db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)
):
    conv = await _call(chat.get_or_create_direct(db, me, data.user_id))
    return ConversationOut.model_validate(conv)


@router.post("/group", response_model=ConversationOut, status_code=201)
async def create_group(
    data: GroupCreate, db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)
):
    conv = await _call(chat.create_group(db, me, data.name, data.member_ids))
    return ConversationOut.model_validate(conv)


@router.get("", response_model=list[ConversationOut])
async def list_conversations(
    db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)
):
    return [_out(c, m, n) for c, m, n in await chat.list_conversations(db, me)]


@router.get("/{conv_id}", response_model=ConversationDetail)
async def get_conversation(
    conv_id: int, db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)
):
    conv, last, unread = await _call(chat.get_conversation(db, me, conv_id))
    out = ConversationDetail.model_validate(conv)
    out.last_message = MessageOut.model_validate(last) if last else None
    out.unread_count = unread
    return out


@router.post("/{conv_id}/members", status_code=201)
async def add_member(
    conv_id: int, data: MemberAdd, db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    await _call(chat.add_member(db, me, conv_id, data.user_id))
    await notify.publish_membership(db, conv_id, "member_added", data.user_id)
    return {"message": "Member added"}


@router.delete("/{conv_id}/members/{user_id}", status_code=204)
async def remove_member(
    conv_id: int, user_id: int, db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    await _call(chat.remove_member(db, me, conv_id, user_id))
    await notify.publish_membership(
        db, conv_id, "member_left" if user_id == me.id else "member_removed", user_id
    )


@router.post("/{conv_id}/messages", response_model=MessageOut, status_code=201)
async def send_message(
    conv_id: int, data: MessageCreate, db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    msg = await _call(chat.send_message(db, me, conv_id, data.content))
    await notify.publish_message(db, msg)
    return msg


@router.get("/{conv_id}/messages", response_model=list[MessageOut])
async def list_messages(
    conv_id: int,
    before: int | None = None,
    limit: int = Query(50, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    return await _call(chat.list_messages(db, me, conv_id, before, limit))


@router.post("/{conv_id}/read", response_model=ReadState)
async def mark_read(
    conv_id: int, data: ReadMark, db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    marker = await _call(chat.mark_read(db, me, conv_id, data.message_id))
    await notify.publish_read(db, conv_id, me.id, marker)
    return ReadState(last_read_message_id=marker)
