from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app.database.session import get_db
from app.models.user import User
from app.schemas.auth import RegisterRequest, LoginRequest
from app.schemas.user import UserOut

from app.auth.password import hash_password, verify_password
from app.auth.jwt import create_access_token, decode_token

router = APIRouter(prefix="/auth", tags=["Auth"])


# ---------------- REGISTER ----------------
@router.post("/register", response_model=UserOut)
def register(user: RegisterRequest, db: Session = Depends(get_db)):

    existing_user = db.query(User).filter(User.email == user.email).first()

    if existing_user:
        raise HTTPException(status_code=400, detail="User already exists")

    new_user = User(
        username=user.username,
        email=user.email,
        hashed_password=hash_password(user.password)
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user


# ---------------- LOGIN ----------------
@router.post("/login")
def login(user: LoginRequest, response: Response, db: Session = Depends(get_db)):

    db_user = db.query(User).filter(User.email == user.email).first()

    if not db_user:
        raise HTTPException(status_code=400, detail="Invalid credentials")

    if not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid credentials")

    token = create_access_token({"user_id": db_user.id})

    # HTTP-only cookie (secure)
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        secure=False,  # set True in production (HTTPS)
        samesite="lax"
    )

    return {"message": "Login successful"}


# ---------------- GET CURRENT USER ----------------
@router.get("/me", response_model=UserOut)
def get_me(db: Session = Depends(get_db), request=Depends()):

    token = request.cookies.get("access_token")

    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        payload = decode_token(token)
        user_id = payload.get("user_id")

        user = db.query(User).filter(User.id == user_id).first()

        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        return user

    except:
        raise HTTPException(status_code=401, detail="Invalid token")