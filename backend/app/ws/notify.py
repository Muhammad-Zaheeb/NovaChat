"""Single place that turns state changes into WebSocket events.
Used by both the REST routers and the WebSocket handlers so they behave identically."""
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.message import Message
from app.services import chat
from app.ws import events
from app.ws.manager import manager


async def publish_message(db: AsyncSession, msg: Message, client_id: str | None = None) -> None:
    payload = (await chat.serialize(db, [msg]))[0].model_dump(mode="json")
    payload["client_id"] = client_id
    await manager.send_to_users(
        await chat.member_ids(db, msg.conversation_id), events.event(events.MESSAGE_NEW, payload)
    )


async def publish_updated(db: AsyncSession, msg: Message) -> None:
    """Edit, delete or reaction change: everyone in the conversation gets the full message."""
    payload = (await chat.serialize(db, [msg]))[0].model_dump(mode="json")
    await manager.send_to_users(
        await chat.member_ids(db, msg.conversation_id), events.event(events.MESSAGE_UPDATED, payload)
    )


async def publish_user_updated(db: AsyncSession, user) -> None:
    payload = {
        "id": user.id,
        "username": user.username,
        "display_name": user.display_name,
        "bio": user.bio,
    }
    targets = set(await chat.peer_ids(db, user.id)) | {user.id}
    from app.services import friends

    targets |= {u.id for u in await friends.friends_of(db, user)}
    await manager.send_to_users(targets, events.event(events.USER_UPDATED, payload))


async def publish_muted(conv_id: int, user_id: int, muted: bool) -> None:
    await manager.send_to_users(
        [user_id], events.event(events.CONVERSATION_MUTED, {"conversation_id": conv_id, "muted": muted})
    )


async def publish_read(db: AsyncSession, conv_id: int, user_id: int, message_id: int) -> None:
    await manager.send_to_users(
        await chat.member_ids(db, conv_id),
        events.event(
            events.MESSAGE_READ,
            {"conversation_id": conv_id, "user_id": user_id, "message_id": message_id},
        ),
    )


async def publish_typing(db: AsyncSession, conv_id: int, user_id: int, is_typing: bool) -> None:
    others = [u for u in await chat.member_ids(db, conv_id) if u != user_id]
    await manager.send_to_users(
        others,
        events.event(
            events.TYPING,
            {"conversation_id": conv_id, "user_id": user_id, "is_typing": is_typing},
        ),
    )


async def publish_presence(
    db: AsyncSession, user_id: int, online: bool, last_seen_at: str | None = None
) -> None:
    await manager.send_to_users(
        await chat.peer_ids(db, user_id),
        events.event(
            events.PRESENCE,
            {"user_id": user_id, "online": online, "last_seen_at": last_seen_at},
        ),
    )


async def publish_membership(
    db: AsyncSession, conv_id: int, change: str, user_id: int
) -> None:
    """`change` is member_added | member_removed | member_left. Goes to everyone who is
    still a member plus the affected user (who may no longer be one)."""
    targets = set(await chat.member_ids(db, conv_id)) | {user_id}
    await manager.send_to_users(
        list(targets),
        events.event(
            events.CONVERSATION_UPDATED,
            {"conversation_id": conv_id, "change": change, "user_id": user_id},
        ),
    )


async def publish_friend(kind: str, to_user: int, **payload) -> None:
    """kind: events.FRIEND_REQUEST | FRIEND_ACCEPTED | FRIEND_REMOVED, sent to the other party."""
    await manager.send_to_users([to_user], events.event(kind, payload))
