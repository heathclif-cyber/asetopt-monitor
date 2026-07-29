from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from database import get_db
from services.auth_deps import CurrentUser
from services.auth_service import (
    create_token,
    get_user_by_username,
    public_user,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["Auth"])


class LoginBody(BaseModel):
    username: str = Field(min_length=1)
    password: str = Field(min_length=1)


@router.post("/login")
def login(body: LoginBody, db: Session = Depends(get_db)):
    user = get_user_by_username(db, body.username)
    if not user or not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="Username atau password salah")
    if not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Username atau password salah")

    token = create_token(user)
    return {
        "token": token,
        "token_type": "bearer",
        "user": public_user(user),
    }


@router.get("/me")
def me(user: CurrentUser):
    return {"user": user}


@router.post("/logout")
def logout(user: CurrentUser):
    # JWT stateless — client menghapus token
    return {"ok": True, "username": user["username"]}
