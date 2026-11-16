from app.models.conversation import Conversation, ConversationMember  # noqa: F401
from app.models.friendship import Friendship  # noqa: F401
from app.models.message import Message, MessageReaction  # noqa: F401
from app.models.user import EmailVerificationCode, User  # noqa: F401  (register models on Base.metadata)
