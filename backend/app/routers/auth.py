from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core import email as mailer
from app.core.config import settings
from app.core.disposable import is_disposable
from app.core.security import create_access_token, hash_password, verify_password
from app.database.session import get_db
from app.dependencies import COOKIE_NAME, get_current_user
from app.models.user import User
from app.schemas.auth import LoginRequest, RegisterRequest, ResendCodeRequest, VerifyEmailRequest
from app.schemas.user import UserOut
from app.services import verification

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/register", response_model=UserOut, status_code=201)
async def register(
    data: RegisterRequest, background: BackgroundTasks, db: AsyncSession = Depends(get_db)
):
    email = data.email.lower()
    if is_disposable(email):
        raise HTTPException(status_code=400, detail="Disposable email addresses are not allowed")
    existing = await db.scalar(
        select(User).where(or_(User.email == email, User.username == data.username))
    )
    if existing:
        field = "Email" if existing.email == email else "Username"
        raise HTTPException(status_code=409, detail=f"{field} already taken")

    user = User(
        username=data.username,
        email=email,
        hashed_password=hash_password(data.password),
    )
    db.add(user)
    try:
        await db.commit()
    except IntegrityError:  # race with a concurrent registration
        await db.rollback()
        raise HTTPException(status_code=409, detail="Username or email already taken")
    await db.refresh(user)
    code = await verification.issue_code(db, user)
    background.add_task(mailer.send_verification_code, user.email, user.username, code)
    return user


@router.post("/verify-email")
async def verify_email(data: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.email == data.email.lower()))
    try:
        await verification.check_code(db, user, data.code)
    except verification.VerifyError as e:
        raise HTTPException(status_code=e.status, detail=e.detail)
    return {"message": "Email verified"}


@router.post("/resend-code")
async def resend_code(
    data: ResendCodeRequest, background: BackgroundTasks, db: AsyncSession = Depends(get_db)
):
    """Always answers 200 for unknown or already-verified emails (no account probing);
    429 only when an unverified account hits its resend limits."""
    user = await db.scalar(select(User).where(User.email == data.email.lower()))
    if user is not None and not user.email_verified:
        try:
            code = await verification.issue_code(db, user)
        except verification.VerifyError as e:
            raise HTTPException(status_code=e.status, detail=e.detail)
        background.add_task(mailer.send_verification_code, user.email, user.username, code)
    return {"message": "If the account exists and is unverified, a new code was sent"}


@router.post("/login")
async def login(data: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    user = await db.scalar(select(User).where(User.email == data.email.lower()))
    if user is None or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.email_verified:
        raise HTTPException(status_code=403, detail="email_not_verified")

    response.set_cookie(
        key=COOKIE_NAME,
        value=create_access_token({"user_id": user.id}),
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    )
    return {"message": "Login successful"}


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(
        key=COOKIE_NAME, httponly=True, secure=settings.COOKIE_SECURE, samesite="lax"
    )
    return {"message": "Logged out"}


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return user
