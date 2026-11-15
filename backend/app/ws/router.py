import json

from fastapi import APIRouter, HTTPException, WebSocket
from pydantic import ValidationError

from app.core.config import settings
from app.database.session import SessionLocal
from app.dependencies import COOKIE_NAME, user_from_token
from app.ws import events
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


HANDLERS = {events.PING: _ping}


@router.websocket("/ws")
async def ws_endpoint(ws: WebSocket) -> None:
    user_id = await _authenticate(ws)
    if user_id is None:
        return
    await ws.accept()
    await manager.connect(user_id, ws)
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
        await manager.disconnect(user_id, ws)
