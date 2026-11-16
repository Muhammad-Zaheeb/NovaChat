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
    MessageEdit,
    MuteSet,
    ReactionToggle,
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


async def _out(db, me, rows) -> list[ConversationOut]:
    """rows: (conversation, last message, unread) tuples, enriched with the viewer's state."""
    state = await chat.member_state(db, me.id, [c.id for c, _, _ in rows])
    lasts = {m.id: o for m, o in zip(
        [r[1] for r in rows if r[1]], await chat.serialize(db, [r[1] for r in rows if r[1]])
    )}
    outs = []
    for conv, last, unread in rows:
        out = ConversationOut.model_validate(conv)
        out.last_message = lasts.get(last.id) if last else None
        out.unread_count = unread
        out.muted, out.last_read_message_id = state.get(conv.id, (False, None))
        outs.append(out)
    return outs


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
    return await _out(db, me, await chat.list_conversations(db, me))


@router.get("/{conv_id}", response_model=ConversationDetail)
async def get_conversation(
    conv_id: int, db: AsyncSession = Depends(get_db), me: User = Depends(get_current_user)
):
    conv, last, unread = await _call(chat.get_conversation(db, me, conv_id))
    out = ConversationDetail.model_validate(conv)
    base = (await _out(db, me, [(conv, last, unread)]))[0]
    out.last_message, out.unread_count = base.last_message, base.unread_count
    out.muted, out.last_read_message_id = base.muted, base.last_read_message_id
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
    msg = await _call(chat.send_message(db, me, conv_id, data.content, data.reply_to_id))
    await notify.publish_message(db, msg)
    return (await chat.serialize(db, [msg]))[0]


@router.get("/{conv_id}/messages", response_model=list[MessageOut])
async def list_messages(
    conv_id: int,
    before: int | None = None,
    limit: int = Query(50, ge=1, le=100),
    q: str | None = Query(None, min_length=1, max_length=100, description="Search text (ILIKE)"),
    db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    msgs = await _call(chat.list_messages(db, me, conv_id, before, limit, q))
    return await chat.serialize(db, msgs)


@router.post("/{conv_id}/read", response_model=ReadState)
async def mark_read(
    conv_id: int, data: ReadMark, db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    marker = await _call(chat.mark_read(db, me, conv_id, data.message_id))
    await notify.publish_read(db, conv_id, me.id, marker)
    return ReadState(last_read_message_id=marker)


@router.patch("/{conv_id}/messages/{msg_id}", response_model=MessageOut)
async def edit_message(
    conv_id: int, msg_id: int, data: MessageEdit, db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    msg = await _call(chat.edit_message(db, me, conv_id, msg_id, data.content))
    await notify.publish_updated(db, msg)
    return (await chat.serialize(db, [msg]))[0]


@router.delete("/{conv_id}/messages/{msg_id}", response_model=MessageOut)
async def delete_message(
    conv_id: int, msg_id: int, db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    msg = await _call(chat.delete_message(db, me, conv_id, msg_id))
    await notify.publish_updated(db, msg)
    return (await chat.serialize(db, [msg]))[0]


@router.post("/{conv_id}/messages/{msg_id}/reactions", response_model=MessageOut)
async def toggle_reaction(
    conv_id: int, msg_id: int, data: ReactionToggle, db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    """Toggle: adds the reaction if you have not reacted with it, removes it otherwise."""
    msg = await _call(chat.toggle_reaction(db, me, conv_id, msg_id, data.emoji))
    await notify.publish_updated(db, msg)
    return (await chat.serialize(db, [msg]))[0]


@router.put("/{conv_id}/mute", response_model=MuteSet)
async def set_mute(
    conv_id: int, data: MuteSet, db: AsyncSession = Depends(get_db),
    me: User = Depends(get_current_user),
):
    await _call(chat.set_muted(db, me, conv_id, data.muted))
    await notify.publish_muted(conv_id, me.id, data.muted)
    return data
