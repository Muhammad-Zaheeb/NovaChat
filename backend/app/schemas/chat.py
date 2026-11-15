from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.conversation import ConversationType, MemberRole
from app.models.message import MessageType
from app.schemas.user import UserOut


class DirectCreate(BaseModel):
    user_id: int


class GroupCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    member_ids: list[int] = Field(default_factory=list)


class MemberAdd(BaseModel):
    user_id: int


class MessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=4000)


class MemberOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user: UserOut
    role: MemberRole
    joined_at: datetime


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    conversation_id: int
    sender_id: int
    content: str
    type: MessageType
    created_at: datetime
    edited_at: datetime | None = None


class ConversationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    type: ConversationType
    name: str | None
    created_by: int
    created_at: datetime
    last_message: MessageOut | None = None


class ConversationDetail(ConversationOut):
    members: list[MemberOut]
