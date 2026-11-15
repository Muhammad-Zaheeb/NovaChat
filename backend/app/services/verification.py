"""Email verification codes: 6 digits, hashed, 10 min expiry, 5 attempts, resend limits."""
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.user import EmailVerificationCode, User

CODE_TTL = timedelta(minutes=10)
MAX_ATTEMPTS = 5
RESEND_COOLDOWN = timedelta(seconds=60)
MAX_PER_HOUR = 5


class VerifyError(Exception):
    def __init__(self, status: int, detail: str):
        self.status = status
        self.detail = detail


def _hash(user_id: int, code: str) -> str:
    return hmac.new(
        settings.SECRET_KEY.encode(), f"{user_id}:{code}".encode(), hashlib.sha256
    ).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def issue_code(db: AsyncSession, user: User) -> str:
    """Rate-limited. Raises VerifyError(429). Returns the plaintext code (to email)."""
    now = _now()
    latest = await db.scalar(
        select(func.max(EmailVerificationCode.created_at)).where(
            EmailVerificationCode.user_id == user.id
        )
    )
    if latest and now - latest < RESEND_COOLDOWN:
        raise VerifyError(429, "wait_before_resend")
    sent = await db.scalar(
        select(func.count(EmailVerificationCode.id)).where(
            EmailVerificationCode.user_id == user.id,
            EmailVerificationCode.created_at > now - timedelta(hours=1),
        )
    )
    if sent >= MAX_PER_HOUR:
        raise VerifyError(429, "too_many_codes")
    code = f"{secrets.randbelow(1_000_000):06d}"
    db.add(
        EmailVerificationCode(
            user_id=user.id, code_hash=_hash(user.id, code), expires_at=now + CODE_TTL
        )
    )
    await db.commit()
    return code


async def check_code(db: AsyncSession, user: User | None, code: str) -> None:
    """Marks the user verified or raises VerifyError(400, 'invalid_or_expired_code')."""
    bad = VerifyError(400, "invalid_or_expired_code")
    if user is None:
        raise bad
    row = await db.scalar(
        select(EmailVerificationCode)
        .where(EmailVerificationCode.user_id == user.id)
        .order_by(EmailVerificationCode.id.desc())
        .limit(1)
    )
    if row is None or row.expires_at < _now() or row.attempts >= MAX_ATTEMPTS:
        raise bad
    if not hmac.compare_digest(row.code_hash, _hash(user.id, code)):
        row.attempts += 1
        await db.commit()
        raise bad
    user.email_verified = True
    user.email_verified_at = _now()
    row.attempts = MAX_ATTEMPTS  # single use
    await db.commit()
