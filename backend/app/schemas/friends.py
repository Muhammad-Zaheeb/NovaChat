from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.user import UserPublic


class FriendRequestCreate(BaseModel):
    user_id: int


class FriendRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    status: str
    created_at: datetime
    requester: UserPublic
    addressee: UserPublic


class FriendRequestsOut(BaseModel):
    incoming: list[FriendRequestOut]
    outgoing: list[FriendRequestOut]


class FriendOut(UserPublic):
    online: bool = False
