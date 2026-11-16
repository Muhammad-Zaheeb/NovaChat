import enum
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.base import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class ConversationType(str, enum.Enum):
    direct = "direct"
    group = "group"


class MemberRole(str, enum.Enum):
    admin = "admin"
    member = "member"


class Conversation(Base):
    __tablename__ = "conversations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    type: Mapped[ConversationType] = mapped_column(
        Enum(ConversationType, name="conversation_type")
    )
    name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now
    )

    members: Mapped[list["ConversationMember"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan"
    )


class ConversationMember(Base):
    __tablename__ = "conversation_members"
    __table_args__ = (
        UniqueConstraint("conversation_id", "user_id", name="uq_conversation_user"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    role: Mapped[MemberRole] = mapped_column(
        Enum(MemberRole, name="member_role"), default=MemberRole.member
    )
    joined_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now
    )
    muted: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    last_read_message_id: Mapped[int | None] = mapped_column(
        ForeignKey("messages.id", use_alter=True, name="fk_member_last_read"),
        nullable=True,
    )

    conversation: Mapped[Conversation] = relationship(back_populates="members")
    user = relationship("User")
