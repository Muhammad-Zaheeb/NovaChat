from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: EmailStr
    display_name: str | None = None
    bio: str | None = None
    last_seen_at: datetime | None = None


class UserPublic(BaseModel):
    """Fields safe to show to any authenticated user."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    display_name: str | None = None
    bio: str | None = None
    last_seen_at: datetime | None = None


class UserSearchResult(BaseModel):
    """No last_seen_at: strangers must not see activity."""

    id: int
    username: str
    display_name: str | None = None
    bio: str | None = None
    friendship_status: str = "none"  # none | pending_outgoing | pending_incoming | friends
    mutual_friends_count: int = 0


class UserSearchPage(BaseModel):
    items: list[UserSearchResult]
    has_more: bool = False


class ProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=50)
    bio: str | None = Field(default=None, max_length=200)
