from pydantic import BaseModel, ConfigDict, EmailStr


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: EmailStr


class UserPublic(BaseModel):
    """Fields safe to show to any authenticated user."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str


class UserSearchResult(UserPublic):
    friendship_status: str = "none"  # none | pending_outgoing | pending_incoming | friends
