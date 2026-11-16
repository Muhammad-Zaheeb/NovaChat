from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.conversation import ConversationType, MemberRole
from app.models.message import MessageType
from app.schemas.user import UserPublic


class DirectCreate(BaseModel):
    user_id: int


class GroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    member_ids: list[int] = Field(default_factory=list)


class MemberAdd(BaseModel):
    user_id: int


class MessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=4000)
    reply_to_id: int | None = None


class MessageEdit(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


class ReactionToggle(BaseModel):
    emoji: str = Field(min_length=1, max_length=16)


class MuteSet(BaseModel):
    muted: bool


class ReadMark(BaseModel):
    message_id: int


class ReadState(BaseModel):
    last_read_message_id: int | None


class MemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user: UserPublic
    role: MemberRole
    joined_at: datetime


class ReplyPreview(BaseModel):
    id: int
    sender_id: int
    content: str
    deleted: bool = False


class ReactionOut(BaseModel):
    emoji: str
    user_ids: list[int]


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    conversation_id: int
    sender_id: int
    content: str
    type: MessageType
    created_at: datetime
    edited_at: datetime | None = None
    deleted: bool = False
    reply_to: ReplyPreview | None = None
    reactions: list[ReactionOut] = Field(default_factory=list)


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: ConversationType
    name: str | None
    created_by: int
    created_at: datetime
    last_message: MessageOut | None = None
    unread_count: int = 0
    muted: bool = False
    last_read_message_id: int | None = None


class ConversationDetail(ConversationOut):
    members: list[MemberOut]
