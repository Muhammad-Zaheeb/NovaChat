import json
import time

from fastapi import APIRouter, HTTPException, WebSocket
from pydantic import ValidationError

from app.core.config import settings
from app.database.session import SessionLocal
from app.models.user import User
from app.dependencies import COOKIE_NAME, user_from_token
from app.services import chat
from app.services.chat import ChatError
from app.ws import events, notify
from app.ws.manager import manager

router = APIRouter()


async def _authenticate(ws: WebSocket) -> int | None:
    """Validate Origin and cookie JWT before accepting; closes with 4401 on failure."""
    origin = ws.headers.get("origin")
    # browsers always send Origin; reject foreign ones (cross-site WS hijacking)
    if origin is not None and origin not in settings.CORS_ORIGINS:
        await ws.close(code=4403)
        return None
    try:
        async with SessionLocal() as db:
            user = await user_from_token(db, ws.cookies.get(COOKIE_NAME))
    except HTTPException:
        await ws.close(code=4401)
        return None
    return user.id


async def _dispatch(ws: WebSocket, user_id: int, raw: str) -> None:
    try:
        msg = json.loads(raw)
        type_, payload = msg["type"], msg.get("payload") or {}
        if not isinstance(type_, str) or not isinstance(payload, dict):
            raise ValueError
    except (ValueError, KeyError, TypeError):
        await ws.send_json(events.error("bad_request", "Expected {type, payload}"))
        return
    handler = HANDLERS.get(type_)
    if handler is None:
        await ws.send_json(events.error("unknown_event", f"Unknown event type: {type_}"))
        return
    try:
        await handler(ws, user_id, payload)
    except ValidationError:
        await ws.send_json(events.error("invalid_payload", f"Invalid payload for {type_}"))


async def _ping(ws: WebSocket, user_id: int, payload: dict) -> None:
    await ws.send_json(events.event(events.PONG))


async def _message_send(ws: WebSocket, user_id: int, payload: dict) -> None:
    data = events.MessageSend.model_validate(payload)
    async with SessionLocal() as db:  # fresh session per event
        try:
            me = await db.get(User, user_id)
            msg = await chat.send_message(db, me, data.conversation_id, data.content)
        except ChatError as e:
            await ws.send_json(events.error(_code(e), e.detail))
            return
        await notify.publish_message(db, msg, data.client_id)


def _code(e: ChatError) -> str:
    return {404: "not_found", 403: "forbidden", 400: "bad_request", 409: "conflict"}.get(
        e.status, "error"
    )


_TYPING_INTERVAL = 1.0
# (user_id, conversation_id) -> monotonic time of last accepted typing.start
_typing_last: dict[tuple[int, int], float] = {}


async def _typing(ws: WebSocket, user_id: int, payload: dict, is_typing: bool) -> None:
    data = events.TypingIn.model_validate(payload)
    key = (user_id, data.conversation_id)
    now = time.monotonic()
    if is_typing:
        # rate limit: at most one typing.start per conversation per second per user
        if now - _typing_last.get(key, -_TYPING_INTERVAL) < _TYPING_INTERVAL:
            return
        _typing_last[key] = now
    elif _typing_last.pop(key, None) is None:
        return  # stop without an active start: nothing to tell anyone
    async with SessionLocal() as db:
        try:
            await chat.require_member(db, data.conversation_id, user_id)
        except ChatError as e:
            _typing_last.pop(key, None)
            await ws.send_json(events.error(_code(e), e.detail))
            return
        await notify.publish_typing(db, data.conversation_id, user_id, is_typing)


async def _typing_start(ws: WebSocket, user_id: int, payload: dict) -> None:
    await _typing(ws, user_id, payload, True)


async def _typing_stop(ws: WebSocket, user_id: int, payload: dict) -> None:
    await _typing(ws, user_id, payload, False)


async def _message_read(ws: WebSocket, user_id: int, payload: dict) -> None:
    data = events.ReadIn.model_validate(payload)
    async with SessionLocal() as db:
        try:
            marker = await chat.mark_read(db, await db.get(User, user_id), data.conversation_id, data.message_id)
        except ChatError as e:
            await ws.send_json(events.error(_code(e), e.detail))
            return
        await notify.publish_read(db, data.conversation_id, user_id, marker)


HANDLERS = {
    events.PING: _ping,
    events.MESSAGE_SEND: _message_send,
    events.TYPING_START: _typing_start,
    events.TYPING_STOP: _typing_stop,
    events.MESSAGE_READ: _message_read,
}


async def _presence(user_id: int, online: bool) -> None:
    async with SessionLocal() as db:
        await notify.publish_presence(db, user_id, online)


@router.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    user_id = await _authenticate(ws)
    if user_id is None:
        return
    await ws.accept()
    if await manager.connect(user_id, ws):
        await _presence(user_id, True)
    try:
        while True:
            frame = await ws.receive()
            if frame["type"] == "websocket.disconnect":
                break
            if frame.get("text") is None:
                await ws.send_json(events.error("bad_request", "Text frames only"))
                continue
            await _dispatch(ws, user_id, frame["text"])
    finally:
        if await manager.disconnect(user_id, ws):
            for k in [k for k in _typing_last if k[0] == user_id]:
                del _typing_last[k]
            await _presence(user_id, False)
