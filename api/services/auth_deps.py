"""FastAPI dependencies untuk autentikasi & otorisasi."""
from __future__ import annotations

from typing import Annotated, Any

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from database import get_db
from services.auth_service import decode_token, get_user_by_id

_bearer = HTTPBearer(auto_error=False)


def _extract_token(
    request: Request,
    creds: HTTPAuthorizationCredentials | None,
) -> str | None:
    if creds and creds.scheme.lower() == "bearer" and creds.credentials:
        return creds.credentials.strip()
    # Supabase client kadang mengirim apikey; token bisa di header custom
    auth = request.headers.get("authorization") or request.headers.get("Authorization")
    if auth and auth.lower().startswith("bearer "):
        return auth[7:].strip()
    # Fallback: X-Asetopt-Token (frontend)
    return (request.headers.get("x-asetopt-token") or "").strip() or None


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict[str, Any]:
    token = _extract_token(request, creds)
    if not token:
        raise HTTPException(status_code=401, detail="Login diperlukan")

    try:
        payload = decode_token(token)
    except Exception:
        raise HTTPException(status_code=401, detail="Sesi tidak valid atau kedaluwarsa") from None

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Token tidak valid")

    user = get_user_by_id(db, str(user_id))
    if not user or not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="Akun tidak aktif atau tidak ditemukan")

    return {
        "id": str(user["id"]),
        "username": user["username"],
        "full_name": user.get("full_name") or user["username"],
        "role": user["role"],
    }


def require_admin(user: Annotated[dict[str, Any], Depends(get_current_user)]) -> dict[str, Any]:
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=403,
            detail="Akses ditolak: hanya admin yang dapat mengubah data",
        )
    return user


CurrentUser = Annotated[dict[str, Any], Depends(get_current_user)]
AdminUser = Annotated[dict[str, Any], Depends(require_admin)]
