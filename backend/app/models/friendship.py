import enum
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, ForeignKey, Index, Integer, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base
from app.models.user import User


class FriendshipStatus(str, enum.Enum):
    pending = "pending"
    accepted = "accepted"
    declined = "declined"


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Friendship(Base):
    __tablename__ = "friendships"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    requester_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    addressee_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    status: Mapped[FriendshipStatus] = mapped_column(
        Enum(FriendshipStatus, name="friendship_status"), default=FriendshipStatus.pending
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    requester: Mapped[User] = relationship(foreign_keys=[requester_id], lazy="joined")
    addressee: Mapped[User] = relationship(foreign_keys=[addressee_id], lazy="joined")

    __table_args__ = (
        # one row per unordered pair, whoever asked first
        Index(
            "uq_friendship_pair",
            func.least(requester_id, addressee_id),
            func.greatest(requester_id, addressee_id),
            unique=True,
        ),
    )
