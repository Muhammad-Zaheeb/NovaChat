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
MESSAGE_UPDATED = "message.updated"  # edit, delete or reaction change: carries the full message
USER_UPDATED = "user.updated"
CONVERSATION_MUTED = "conversation.muted"  # only to the user who muted (their other tabs)
TYPING = "typing"
PRESENCE = "presence"
FRIEND_REQUEST = "friend.request"
FRIEND_ACCEPTED = "friend.accepted"
FRIEND_REMOVED = "friend.removed"
CONVERSATION_UPDATED = "conversation.updated"
ERROR = "error"
PONG = "pong"


class MessageSend(BaseModel):
    conversation_id: int
    content: str = Field(min_length=1, max_length=4000)
    client_id: str | None = Field(default=None, max_length=64)
    reply_to_id: int | None = None


class TypingIn(BaseModel):
    conversation_id: int


class ReadIn(BaseModel):
    conversation_id: int
    message_id: int


def event(type_: str, payload: dict | None = None) -> dict:
    return {"type": type_, "payload": payload or {}}


def error(code: str, detail: str) -> dict:
    return event(ERROR, {"code": code, "detail": detail})
