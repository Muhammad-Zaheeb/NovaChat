"""WebSocket protocol: event names and payload models.

Wire format: {"type": <event name>, "payload": {...}}
"""
from pydantic import BaseModel, Field

# client -> server
MESSAGE_SEND = "message.send"
TYPING_START = "typing.start"
TYPING_STOP = "typing.stop"
MESSAGE_READ = "message.read"  # also server -> client
PING = "ping"

# server -> client
MESSAGE_NEW = "message.new"
TYPING = "typing"
PRESENCE = "presence"
ERROR = "error"
PONG = "pong"


class MessageSend(BaseModel):
    conversation_id: int
    content: str = Field(min_length=1, max_length=4000)
    client_id: str | None = Field(default=None, max_length=64)


class TypingIn(BaseModel):
    conversation_id: int


class ReadIn(BaseModel):
    conversation_id: int
    message_id: int


def event(type_: str, payload: dict | None = None) -> dict:
    return {"type": type_, "payload": payload or {}}


def error(code: str, detail: str) -> dict:
    return event(ERROR, {"code": code, "detail": detail})
