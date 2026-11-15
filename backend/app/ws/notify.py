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
