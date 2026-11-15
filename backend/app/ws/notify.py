"""Single place that turns state changes into WebSocket events.
Used by both the REST routers and the WebSocket handlers so they behave identically."""
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.message import Message
from app.schemas.chat import MessageOut
from app.services import chat
from app.ws import events
from app.ws.manager import manager


async def publish_message(db: AsyncSession, msg: Message, client_id: str | None = None) -> None:
    payload = MessageOut.model_validate(msg).model_dump(mode="json")
    payload["client_id"] = client_id
    await manager.send_to_users(
        await chat.member_ids(db, msg.conversation_id), events.event(events.MESSAGE_NEW, payload)
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


async def publish_presence(db: AsyncSession, user_id: int, online: bool) -> None:
    await manager.send_to_users(
        await chat.peer_ids(db, user_id),
        events.event(events.PRESENCE, {"user_id": user_id, "online": online}),
    )
