"""Email verification codes: 6 digits, hashed, 10 min expiry, 5 attempts, resend limits."""
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import hash_password
from app.models.user import EmailVerificationCode, PasswordResetCode, User

CODE_TTL = timedelta(minutes=10)
MAX_ATTEMPTS = 5
RESEND_COOLDOWN = timedelta(seconds=60)
MAX_PER_HOUR = 5


class VerifyError(Exception):
    def __init__(self, status: int, detail: str):
        self.status = status
        self.detail = detail


def _hash(user_id: int, code: str, purpose: str = "") -> str:
    return hmac.new(
        settings.SECRET_KEY.encode(), f"{purpose}{user_id}:{code}".encode(), hashlib.sha256
    ).hexdigest()


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def issue_code(
    db: AsyncSession, user: User, model=EmailVerificationCode, ttl: timedelta = CODE_TTL, purpose: str = ""
) -> str:
    """Rate-limited. Raises VerifyError(429). Returns the plaintext code (to email)."""
    now = _now()
    latest = await db.scalar(
        select(func.max(model.created_at)).where(model.user_id == user.id)
    )
    if latest and now - latest < RESEND_COOLDOWN:
        raise VerifyError(429, "wait_before_resend")
    sent = await db.scalar(
        select(func.count(model.id)).where(
            model.user_id == user.id,
            model.created_at > now - timedelta(hours=1),
        )
    )
    if sent >= MAX_PER_HOUR:
        raise VerifyError(429, "too_many_codes")
    code = f"{secrets.randbelow(1_000_000):06d}"
    db.add(
        model(
            user_id=user.id, code_hash=_hash(user.id, code, purpose), expires_at=now + ttl
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


RESET_TTL = timedelta(minutes=15)


async def issue_reset_code(db: AsyncSession, user: User) -> str:
    return await issue_code(db, user, PasswordResetCode, RESET_TTL, "reset")


async def reset_password(db: AsyncSession, user: User | None, code: str, new_password: str) -> None:
    """Checks the reset code (single use, 5 attempts), sets the password and revokes sessions."""
    bad = VerifyError(400, "invalid_or_expired_code")
    if user is None:
        raise bad
    row = await db.scalar(
        select(PasswordResetCode)
        .where(PasswordResetCode.user_id == user.id)
        .order_by(PasswordResetCode.id.desc())
        .limit(1)
    )
    if row is None or row.expires_at < _now() or row.attempts >= MAX_ATTEMPTS:
        raise bad
    if not hmac.compare_digest(row.code_hash, _hash(user.id, code, "reset")):
        row.attempts += 1
        await db.commit()
        raise bad
    row.attempts = MAX_ATTEMPTS  # single use
    user.hashed_password = hash_password(new_password)
    user.token_version = (user.token_version or 0) + 1
    if not user.email_verified:  # the code proved control of the mailbox
        user.email_verified = True
        user.email_verified_at = _now()
    await db.commit()
