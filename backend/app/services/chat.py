"""Chat business logic. Raises ChatError (no HTTP types) so it can be reused
from WebSocket handlers; routers translate to HTTP."""
import hashlib
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased, selectinload

from app.models.conversation import (
    Conversation,
    ConversationMember,
    ConversationType,
    MemberRole,
)
from app.models.attachment import Attachment, AttachmentKind
from app.models.message import Message, MessageReaction, MessageType
from app.schemas.chat import AttachmentOut, MessageOut, ReactionOut, ReplyPreview
from app.models.user import User
from app.core.storage import get_storage
from app.services import friends


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
        return existing  # conversations that predate friendships stay reachable
    if not await friends.are_friends(db, me.id, other_id):
        raise ChatError(403, "not_friends")
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
        if await friends.non_friends(db, me.id, others):
            raise ChatError(403, "not_friends")
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
    if not await friends.are_friends(db, me.id, user_id):
        raise ChatError(403, "not_friends")
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


async def send_message(
    db: AsyncSession, me: User, conv_id: int, content: str, reply_to_id: int | None = None,
    attachment_ids: list[int] | None = None,
) -> Message:
    mine = await require_member(db, conv_id, me.id)
    if reply_to_id is not None:
        ok = await db.scalar(
            select(Message.id).where(Message.id == reply_to_id, Message.conversation_id == conv_id)
        )
        if ok is None:
            raise ChatError(404, "Replied-to message not found")
    atts: list[Attachment] = []
    if attachment_ids:
        ids = list(dict.fromkeys(attachment_ids))
        atts = list(
            await db.scalars(
                select(Attachment).where(
                    Attachment.id.in_(ids),
                    Attachment.uploader_id == me.id,
                    Attachment.message_id.is_(None),
                )
            )
        )
        if len(atts) != len(ids):
            raise ChatError(400, "Attachment not found or already used")
        if any(a.duration is not None for a in atts) and len(atts) > 1:
            raise ChatError(400, "A voice message cannot have other attachments")
    mtype = MessageType.text
    if atts:
        voice = atts[0].kind == AttachmentKind.audio and atts[0].duration is not None
        mtype = MessageType.voice if voice else MessageType.file
    msg = Message(
        conversation_id=conv_id, sender_id=me.id, content=content.strip(), type=mtype,
        reply_to_id=reply_to_id,
    )
    db.add(msg)
    await db.flush()
    for a in sorted(atts, key=lambda a: ids.index(a.id)):
        a.message_id = msg.id
    mine.last_read_message_id = msg.id  # sender has implicitly read their own message
    await db.commit()
    await db.refresh(msg)
    return msg


async def list_messages(
    db: AsyncSession, me: User, conv_id: int, before: int | None, limit: int,
    search: str | None = None,
) -> list[Message]:
    """Deleted messages are included (as tombstones) except when searching."""
    await require_member(db, conv_id, me.id)
    q = select(Message).where(Message.conversation_id == conv_id)
    if search:
        pat = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        q = q.where(Message.deleted_at.is_(None), Message.content.ilike(f"%{pat}%", escape="\\"))
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


async def member_ids(db: AsyncSession, conv_id: int) -> list[int]:
    return list(
        await db.scalars(
            select(ConversationMember.user_id).where(ConversationMember.conversation_id == conv_id)
        )
    )


async def peer_ids(db: AsyncSession, user_id: int) -> list[int]:
    """Distinct users who share at least one conversation with user_id (excluding them)."""
    mine = select(ConversationMember.conversation_id).where(ConversationMember.user_id == user_id)
    return list(
        await db.scalars(
            select(ConversationMember.user_id)
            .where(ConversationMember.conversation_id.in_(mine), ConversationMember.user_id != user_id)
            .distinct()
        )
    )


# ---- message features: replies, edit/delete, reactions, search, mute ----

EDIT_WINDOW = timedelta(minutes=15)
REACTIONS = ("👍", "❤️", "😂", "😮", "😢", "🙏")


def attachment_out(a: Attachment) -> AttachmentOut:
    # `v` ties the URL to the stored file, so a browser cache entry can never be served
    # for a different file that later gets the same id (e.g. after a database restore).
    v = hashlib.sha256(a.storage_key.encode()).hexdigest()[:12]
    base = f"/files/attachments/{a.id}"
    return AttachmentOut(
        id=a.id, kind=a.kind.value, mime=a.mime, size=a.size, original_name=a.original_name,
        width=a.width, height=a.height, duration=a.duration, url=f"{base}?v={v}",
        thumb_url=f"{base}?thumb=1&v={v}" if a.thumb_key else None,
    )


async def serialize(db: AsyncSession, msgs: list[Message]) -> list[MessageOut]:
    """MessageOut with reply preview and grouped reactions, using two batched queries."""
    if not msgs:
        return []
    ids = [m.id for m in msgs]
    reply_ids = {m.reply_to_id for m in msgs if m.reply_to_id}
    replies = {}
    if reply_ids:
        replies = {m.id: m for m in await db.scalars(select(Message).where(Message.id.in_(reply_ids)))}
    grouped: dict[int, dict[str, list[int]]] = {}
    rows = await db.execute(
        select(MessageReaction.message_id, MessageReaction.emoji, MessageReaction.user_id)
        .where(MessageReaction.message_id.in_(ids))
        .order_by(MessageReaction.id)
    )
    for mid, emoji, uid in rows:
        grouped.setdefault(mid, {}).setdefault(emoji, []).append(uid)
    att_by_msg: dict[int, list[AttachmentOut]] = {}
    for a in await db.scalars(
        select(Attachment).where(Attachment.message_id.in_(set(ids) | reply_ids)).order_by(Attachment.id)
    ):
        att_by_msg.setdefault(a.message_id, []).append(attachment_out(a))
    out = []
    for m in msgs:
        deleted = m.deleted_at is not None
        r = replies.get(m.reply_to_id) if m.reply_to_id else None
        out.append(
            MessageOut(
                id=m.id,
                conversation_id=m.conversation_id,
                sender_id=m.sender_id,
                content="" if deleted else m.content,
                type=m.type,
                created_at=m.created_at,
                edited_at=m.edited_at,
                deleted=deleted,
                reply_to=ReplyPreview(
                    id=r.id,
                    sender_id=r.sender_id,
                    content="" if r.deleted_at else r.content[:140],
                    deleted=r.deleted_at is not None,
                    attachments=[] if r.deleted_at else att_by_msg.get(r.id, [])[:1],
                )
                if r
                else None,
                reactions=[
                    ReactionOut(emoji=e, user_ids=u)
                    for e, u in ({} if deleted else grouped.get(m.id, {})).items()
                ],
                attachments=[] if deleted else att_by_msg.get(m.id, []),
            )
        )
    return out


async def _own_message(db: AsyncSession, me: User, conv_id: int, msg_id: int) -> Message:
    await require_member(db, conv_id, me.id)
    msg = await db.scalar(
        select(Message).where(Message.id == msg_id, Message.conversation_id == conv_id)
    )
    if msg is None:
        raise ChatError(404, "Message not found")
    return msg


async def edit_message(db: AsyncSession, me: User, conv_id: int, msg_id: int, content: str) -> Message:
    msg = await _own_message(db, me, conv_id, msg_id)
    if msg.sender_id != me.id:
        raise ChatError(403, "You can only edit your own messages")
    if msg.deleted_at is not None:
        raise ChatError(409, "Message was deleted")
    if datetime.now(timezone.utc) - msg.created_at > EDIT_WINDOW:
        raise ChatError(403, "Messages can only be edited within 15 minutes")
    msg.content = content
    msg.edited_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(msg)
    return msg


async def delete_message(db: AsyncSession, me: User, conv_id: int, msg_id: int) -> Message:
    msg = await _own_message(db, me, conv_id, msg_id)
    if msg.sender_id != me.id:
        raise ChatError(403, "You can only delete your own messages")
    if msg.deleted_at is None:
        msg.deleted_at = datetime.now(timezone.utc)
        await db.execute(delete(MessageReaction).where(MessageReaction.message_id == msg.id))
        atts = list(await db.scalars(select(Attachment).where(Attachment.message_id == msg.id)))
        await db.execute(delete(Attachment).where(Attachment.message_id == msg.id))
        await db.commit()
        storage = get_storage()
        for a in atts:  # files go once the row is gone; a failure only leaves an orphan blob
            for key in (a.storage_key, a.thumb_key):
                if key:
                    try:
                        await storage.delete(key)
                    except Exception:
                        pass
        await db.refresh(msg)
    return msg


async def toggle_reaction(
    db: AsyncSession, me: User, conv_id: int, msg_id: int, emoji: str
) -> Message:
    if emoji not in REACTIONS:
        raise ChatError(400, "Unsupported reaction")
    msg = await _own_message(db, me, conv_id, msg_id)
    if msg.deleted_at is not None:
        raise ChatError(409, "Message was deleted")
    existing = await db.scalar(
        select(MessageReaction).where(
            MessageReaction.message_id == msg_id,
            MessageReaction.user_id == me.id,
            MessageReaction.emoji == emoji,
        )
    )
    if existing:
        await db.delete(existing)
    else:
        db.add(MessageReaction(message_id=msg_id, user_id=me.id, emoji=emoji))
    await db.commit()
    return msg


async def set_muted(db: AsyncSession, me: User, conv_id: int, muted: bool) -> None:
    mine = await require_member(db, conv_id, me.id)
    mine.muted = muted
    await db.commit()


async def member_state(
    db: AsyncSession, user_id: int, conv_ids: list[int]
) -> dict[int, tuple[bool, int | None]]:
    """conversation -> (muted, last_read_message_id) for this viewer."""
    if not conv_ids:
        return {}
    rows = await db.execute(
        select(
            ConversationMember.conversation_id,
            ConversationMember.muted,
            ConversationMember.last_read_message_id,
        ).where(ConversationMember.user_id == user_id, ConversationMember.conversation_id.in_(conv_ids))
    )
    return {c: (m, r) for c, m, r in rows}
