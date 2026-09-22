"""FastAPI dependencies untuk autentikasi & otorisasi."""
from __future__ import annotations

import os
from typing import Annotated, Any

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from services.auth_service import decode_token, get_user_by_id

_bearer = HTTPBearer(auto_error=False)

# Role khusus pengelola Master Data. Daftar ini sengaja eksplisit agar akun
# tersebut tidak dapat membaca atau mengubah tabel bisnis lain lewat REST API.
ASSET_MASTER_TABLES = frozenset({"aset", "njop", "penilaian_kjpp"})


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
    # Deliberately opt-in: this exists solely for the local Docker profile.
    # No production environment should set ASETOPT_BYPASS_AUTH.
    if os.getenv("ASETOPT_BYPASS_AUTH", "").lower() == "true" and token == "local-dev-bypass":
        local_admin = db.execute(text("""
          SELECT id, username, full_name, role FROM app_users
          WHERE role='admin' AND is_active=true ORDER BY created_at LIMIT 1
        """)).mappings().first()
        if not local_admin:
            raise HTTPException(status_code=503, detail="Akun admin lokal belum diinisialisasi")
        return {
            "id": str(local_admin["id"]),
            "username": local_admin["username"],
            "full_name": local_admin.get("full_name") or local_admin["username"],
            "role": local_admin["role"],
        }
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


def require_write(user: Annotated[dict[str, Any], Depends(get_current_user)]) -> dict[str, Any]:
    """Akses tulis data bisnis untuk admin dan staf; staf tidak dapat mengelola pengguna."""
    if user.get("role") not in {"admin", "staf"}:
        raise HTTPException(
            status_code=403,
            detail="Akses ditolak: hanya admin/staf yang dapat mengubah data",
        )
    return user


def require_app_read(user: Annotated[dict[str, Any], Depends(get_current_user)]) -> dict[str, Any]:
    """Akses baca aplikasi untuk akun UI; akun integrasi dikecualikan."""
    if user.get("role") not in {"admin", "staf", "viewer", "admin_aset"}:
        raise HTTPException(status_code=403, detail="Akses aplikasi diperlukan")
    return user


def require_rest_read(
    request: Request,
    user: Annotated[dict[str, Any], Depends(get_current_user)],
) -> dict[str, Any]:
    """Batasi pembacaan REST untuk Admin Data Aset pada tiga tabel master."""
    if user.get("role") == "admin_aset":
        table = request.path_params.get("table")
        if table not in ASSET_MASTER_TABLES:
            raise HTTPException(status_code=403, detail="Akses hanya untuk Master Data Aset")
        return user
    return require_app_read(user)


def require_rest_write(
    request: Request,
    user: Annotated[dict[str, Any], Depends(get_current_user)],
) -> dict[str, Any]:
    """Akses tulis REST: admin/staf penuh, Admin Data Aset hanya master aset."""
    if user.get("role") in {"admin", "staf"}:
        return user
    if user.get("role") == "admin_aset" and request.path_params.get("table") in ASSET_MASTER_TABLES:
        return user
    raise HTTPException(status_code=403, detail="Akses hanya untuk Master Data Aset")


def require_integration_read(user: Annotated[dict[str, Any], Depends(get_current_user)]) -> dict[str, Any]:
    """Akses baca terbatas bagi aplikasi internal melalui Layer Zero."""
    if user.get("role") not in {"admin", "integrasi"}:
        raise HTTPException(status_code=403, detail="Akses integrasi diperlukan")
    return user


CurrentUser = Annotated[dict[str, Any], Depends(get_current_user)]
AdminUser = Annotated[dict[str, Any], Depends(require_admin)]
