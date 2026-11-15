"""Chat business logic. Raises ChatError (no HTTP types) so it can be reused
from WebSocket handlers; routers translate to HTTP."""
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from app.models.conversation import (
    Conversation,
    ConversationMember,
    ConversationType,
    MemberRole,
)
from app.models.message import Message, MessageType
from app.models.user import User


class ChatError(Exception):
    def __init__(self, status: int, detail: str):
        self.status = status
        self.detail = detail


async def get_membership(
    db: AsyncSession, conversation_id: int, user_id: int
) -> ConversationMember | None:
    return await db.scalar(
        select(ConversationMember).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == user_id,
        )
    )


async def require_member(
    db: AsyncSession, conversation_id: int, user_id: int
) -> ConversationMember:
    """404 (not 403) for non-members so conversation ids aren't leaked."""
    m = await get_membership(db, conversation_id, user_id)
    if m is None:
        raise ChatError(404, "Conversation not found")
    return m


async def _require_users(db: AsyncSession, ids: set[int]) -> None:
    found = await db.scalar(select(func.count(User.id)).where(User.id.in_(ids)))
    if found != len(ids):
        raise ChatError(404, "User not found")


async def get_or_create_direct(db: AsyncSession, me: User, other_id: int) -> Conversation:
    if other_id == me.id:
        raise ChatError(400, "Cannot start a conversation with yourself")
    await _require_users(db, {other_id})
    a = ConversationMember
    b = aliased(ConversationMember)
    existing = await db.scalar(
        select(Conversation)
        .join(a, a.conversation_id == Conversation.id)
        .join(b, b.conversation_id == Conversation.id)
        .where(
            Conversation.type == ConversationType.direct,
            a.user_id == me.id,
            b.user_id == other_id,
        )
    )
    if existing:
        return existing
    conv = Conversation(type=ConversationType.direct, created_by=me.id)
    conv.members = [
        ConversationMember(user_id=me.id, role=MemberRole.member),
        ConversationMember(user_id=other_id, role=MemberRole.member),
    ]
    db.add(conv)
    await db.commit()
    return conv


async def create_group(
    db: AsyncSession, me: User, name: str, member_ids: list[int]
) -> Conversation:
    others = set(member_ids) - {me.id}
    if others:
        await _require_users(db, others)
    conv = Conversation(type=ConversationType.group, name=name, created_by=me.id)
    conv.members = [ConversationMember(user_id=me.id, role=MemberRole.admin)] + [
        ConversationMember(user_id=u, role=MemberRole.member) for u in sorted(others)
    ]
    db.add(conv)
    await db.commit()
    return conv


async def _last_messages(db: AsyncSession, conv_ids: list[int]) -> dict[int, Message]:
    if not conv_ids:
        return {}
    sub = (
        select(func.max(Message.id))
        .where(Message.conversation_id.in_(conv_ids), Message.deleted_at.is_(None))
        .group_by(Message.conversation_id)
    )
    rows = await db.scalars(select(Message).where(Message.id.in_(sub)))
    return {m.conversation_id: m for m in rows}


async def _unread_counts(db: AsyncSession, user_id: int, conv_ids: list[int]) -> dict[int, int]:
    """Unread per conversation in one grouped query."""
    if not conv_ids:
        return {}
    rows = await db.execute(
        select(Message.conversation_id, func.count(Message.id))
        .join(
            ConversationMember,
            (ConversationMember.conversation_id == Message.conversation_id)
            & (ConversationMember.user_id == user_id),
        )
        .where(
            Message.conversation_id.in_(conv_ids),
            Message.sender_id != user_id,
            Message.deleted_at.is_(None),
            Message.id > func.coalesce(ConversationMember.last_read_message_id, 0),
        )
        .group_by(Message.conversation_id)
    )
    return {cid: n for cid, n in rows}


async def list_conversations(
    db: AsyncSession, me: User
) -> list[tuple[Conversation, Message | None, int]]:
    convs = list(
        await db.scalars(
            select(Conversation)
            .join(ConversationMember, ConversationMember.conversation_id == Conversation.id)
            .where(ConversationMember.user_id == me.id)
        )
    )
    last = await _last_messages(db, [c.id for c in convs])
    unread = await _unread_counts(db, me.id, [c.id for c in convs])
    result = [(c, last.get(c.id), unread.get(c.id, 0)) for c in convs]
    result.sort(
        key=lambda t: (t[1].created_at if t[1] else t[0].created_at), reverse=True
    )
    return result


async def get_conversation(
    db: AsyncSession, me: User, conv_id: int
) -> tuple[Conversation, Message | None, int]:
    await require_member(db, conv_id, me.id)
    conv = await db.scalar(
        select(Conversation)
        .where(Conversation.id == conv_id)
        .options(selectinload(Conversation.members).selectinload(ConversationMember.user))
    )
    last = (await _last_messages(db, [conv_id])).get(conv_id)
    unread = (await _unread_counts(db, me.id, [conv_id])).get(conv_id, 0)
    return conv, last, unread


async def add_member(db: AsyncSession, me: User, conv_id: int, user_id: int) -> None:
    mine = await require_member(db, conv_id, me.id)
    conv = await db.get(Conversation, conv_id)
    if conv.type != ConversationType.group:
        raise ChatError(400, "Members can only be changed in group conversations")
    if mine.role != MemberRole.admin:
        raise ChatError(403, "Only admins can add members")
    await _require_users(db, {user_id})
    if await get_membership(db, conv_id, user_id):
        raise ChatError(409, "User is already a member")
    db.add(ConversationMember(conversation_id=conv_id, user_id=user_id, role=MemberRole.member))
    await db.commit()


async def remove_member(db: AsyncSession, me: User, conv_id: int, user_id: int) -> None:
    mine = await require_member(db, conv_id, me.id)
    conv = await db.get(Conversation, conv_id)
    if conv.type != ConversationType.group:
        raise ChatError(400, "Members can only be changed in group conversations")
    if user_id != me.id and mine.role != MemberRole.admin:
        raise ChatError(403, "Only admins can remove other members")
    target = mine if user_id == me.id else await get_membership(db, conv_id, user_id)
    if target is None:
        raise ChatError(404, "Member not found")
    await db.delete(target)
    await db.flush()
    # keep the group administered: promote the oldest member if no admin remains
    if target.role == MemberRole.admin:
        admins = await db.scalar(
            select(func.count()).select_from(ConversationMember).where(
                ConversationMember.conversation_id == conv_id,
                ConversationMember.role == MemberRole.admin,
            )
        )
        if not admins:
            nxt = await db.scalar(
                select(ConversationMember)
                .where(ConversationMember.conversation_id == conv_id)
                .order_by(ConversationMember.joined_at, ConversationMember.id)
                .limit(1)
            )
            if nxt:
                nxt.role = MemberRole.admin
    await db.commit()


async def send_message(db: AsyncSession, me: User, conv_id: int, content: str) -> Message:
    mine = await require_member(db, conv_id, me.id)
    msg = Message(
        conversation_id=conv_id, sender_id=me.id, content=content, type=MessageType.text
    )
    db.add(msg)
    await db.flush()
    mine.last_read_message_id = msg.id  # sender has implicitly read their own message
    await db.commit()
    await db.refresh(msg)
    return msg


async def list_messages(
    db: AsyncSession, me: User, conv_id: int, before: int | None, limit: int
) -> list[Message]:
    await require_member(db, conv_id, me.id)
    q = select(Message).where(
        Message.conversation_id == conv_id, Message.deleted_at.is_(None)
    )
    if before is not None:
        q = q.where(Message.id < before)
    return list(await db.scalars(q.order_by(Message.id.desc()).limit(min(max(limit, 1), 100))))


async def mark_read(db: AsyncSession, me: User, conv_id: int, message_id: int) -> int | None:
    """Move the caller's read marker forward (never back). Returns the marker."""
    mine = await require_member(db, conv_id, me.id)
    in_conv = await db.scalar(
        select(Message.id).where(Message.id == message_id, Message.conversation_id == conv_id)
    )
    if in_conv is None:
        raise ChatError(404, "Message not found")
    if mine.last_read_message_id is None or message_id > mine.last_read_message_id:
        mine.last_read_message_id = message_id
        await db.commit()
    return mine.last_read_message_id
