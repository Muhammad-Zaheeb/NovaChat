from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, computed_field

from app.core.config import settings


def avatar_url_for(user_id: int, key: str | None) -> str | None:
    if not key:
        return None
    if settings.STORAGE_BACKEND == "s3" and settings.S3_PUBLIC_BASE_URL:
        return f"{settings.S3_PUBLIC_BASE_URL.rstrip('/')}/{key}"
    return f"/files/avatars/{user_id}?v={key[-10:-4]}"  # v busts caches when the picture changes


class WithAvatar(BaseModel):
    id: int
    avatar_key: str | None = Field(default=None, exclude=True)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def avatar_url(self) -> str | None:
        return avatar_url_for(self.id, self.avatar_key)


class UserOut(WithAvatar):
    model_config = ConfigDict(from_attributes=True)

    username: str
    email: EmailStr
    display_name: str | None = None
    bio: str | None = None
    last_seen_at: datetime | None = None


class UserPublic(WithAvatar):
    """Fields safe to show to any authenticated user."""

    model_config = ConfigDict(from_attributes=True)

    username: str
    display_name: str | None = None
    bio: str | None = None
    last_seen_at: datetime | None = None


class UserSearchResult(WithAvatar):
    """No last_seen_at: strangers must not see activity."""

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
