"""Administrative user management for AsetOpt.

This is an application-level administration surface. Layer Zero will later
federate identity across applications; until then, every mutation remains
restricted to a local administrator and is never exposed through generic REST.
"""
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session

from database import get_db
from services.auth_deps import require_admin
from services.auth_service import (
    active_admin_count,
    create_user,
    list_users,
    public_user,
    reset_password,
    update_user,
)

router = APIRouter(prefix="/api/users", tags=["Users"])
Role = Literal["admin", "viewer", "integrasi", "staf", "admin_aset", "viewer_aset"]


def _min_password_length(role: str) -> int:
    return 3


class UserCreateBody(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=r"^[A-Za-z0-9._-]+$")
    password: str = Field(min_length=3, max_length=128)
    full_name: str = Field(min_length=1, max_length=255)
    role: Role = "viewer"

    @model_validator(mode="after")
    def _check_password_length(self):
        minimum = _min_password_length(self.role)
        if len(self.password) < minimum:
            raise ValueError(f"Kata sandi minimal {minimum} karakter untuk role {self.role}")
        return self


class UserUpdateBody(BaseModel):
    username: str | None = Field(default=None, min_length=3, max_length=64, pattern=r"^[A-Za-z0-9._-]+$")
    full_name: str | None = Field(default=None, min_length=1, max_length=255)
    role: Role | None = None
    is_active: bool | None = None


class PasswordResetBody(BaseModel):
    password: str = Field(min_length=3, max_length=128)


def _ensure_admin_remains(
    current_user: dict,
    target_id: str,
    target: dict | None,
    update: UserUpdateBody,
    db: Session,
) -> None:
    if not target:
        raise HTTPException(status_code=404, detail="Pengguna tidak ditemukan")
    removes_active_admin = (
        target["role"] == "admin"
        and target.get("is_active", True)
        and (update.role not in (None, "admin") or update.is_active is False)
    )
    if removes_active_admin and active_admin_count(db) <= 1:
        raise HTTPException(status_code=400, detail="Minimal satu admin aktif harus dipertahankan")
    if str(current_user["id"]) == target_id and update.is_active is False:
        raise HTTPException(status_code=400, detail="Admin tidak dapat menonaktifkan akun sendiri")


@router.get("")
def get_users(
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    return {"data": [public_user(user) | {"created_at": user["created_at"], "updated_at": user["updated_at"]} for user in list_users(db)]}


@router.post("", status_code=status.HTTP_201_CREATED)
def post_user(
    body: UserCreateBody,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    try:
        return {"user": public_user(create_user(db, **body.model_dump()))}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None


@router.put("/{user_id}")
def put_user(
    user_id: str,
    body: UserUpdateBody,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    target = next((user for user in list_users(db) if str(user["id"]) == user_id), None)
    _ensure_admin_remains(current_user, user_id, target, body, db)
    try:
        user = update_user(db, user_id, **body.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from None
    return {"user": public_user(user)}


@router.post("/{user_id}/reset-password")
def post_reset_password(
    user_id: str,
    body: PasswordResetBody,
    db: Session = Depends(get_db),
    _admin: dict = Depends(require_admin),
):
    target = next((user for user in list_users(db) if str(user["id"]) == user_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Pengguna tidak ditemukan")
    minimum = _min_password_length(target["role"])
    if len(body.password) < minimum:
        raise HTTPException(
            status_code=400,
            detail=f"Kata sandi minimal {minimum} karakter untuk role {target['role']}",
        )
    user = reset_password(db, user_id, body.password)
    if not user:
        raise HTTPException(status_code=404, detail="Pengguna tidak ditemukan")
    return {"user": public_user(user)}


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_user(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_admin),
):
    target = next((user for user in list_users(db) if str(user["id"]) == user_id), None)
    _ensure_admin_remains(current_user, user_id, target, UserUpdateBody(is_active=False), db)
    update_user(db, user_id, is_active=False)
