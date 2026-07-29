"""Auth: password hash, JWT, seed users, table bootstrap."""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt
from sqlalchemy import text
from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

ROLES = ("admin", "viewer")
JWT_ALG = "HS256"
TOKEN_TTL_HOURS = int(os.getenv("AUTH_TOKEN_TTL_HOURS", "72"))


def auth_secret() -> str:
    secret = (os.getenv("AUTH_SECRET") or "").strip()
    if not secret:
        # Dev fallback (≥32 bytes) — WAJIB set AUTH_SECRET di production
        secret = "asetopt-dev-secret-change-me-in-prod!!"
        logger.warning("AUTH_SECRET tidak diset — memakai secret development")
    return secret


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception:
        return False


def create_token(user: dict[str, Any]) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user["id"]),
        "username": user["username"],
        "role": user["role"],
        "iat": now,
        "exp": now + timedelta(hours=TOKEN_TTL_HOURS),
    }
    return jwt.encode(payload, auth_secret(), algorithm=JWT_ALG)


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, auth_secret(), algorithms=[JWT_ALG])


def ensure_app_users_table(db: Session) -> None:
    db.execute(text("""
        CREATE TABLE IF NOT EXISTS app_users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          username VARCHAR(64) NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          full_name VARCHAR(255),
          role VARCHAR(20) NOT NULL DEFAULT 'viewer'
            CHECK (role IN ('admin', 'viewer')),
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))
    db.execute(text(
        "CREATE INDEX IF NOT EXISTS idx_app_users_username ON app_users (username)"
    ))
    db.commit()


def _upsert_user(
    db: Session,
    *,
    username: str,
    password: str,
    role: str,
    full_name: str,
) -> None:
    username = username.strip().lower()
    if not username or not password:
        return
    if role not in ROLES:
        role = "viewer"

    row = db.execute(
        text("SELECT id FROM app_users WHERE lower(username) = :u LIMIT 1"),
        {"u": username},
    ).mappings().first()

    pw_hash = hash_password(password)
    if row:
        # Jangan overwrite password existing di production seed berulang —
        # hanya buat jika belum ada. Seed ulang pakai AUTH_FORCE_SEED=1.
        force = os.getenv("AUTH_FORCE_SEED", "").strip() in ("1", "true", "yes")
        if force:
            db.execute(
                text("""
                    UPDATE app_users
                    SET password_hash = :h, role = :r, full_name = :n,
                        is_active = true, updated_at = now()
                    WHERE id = :id
                """),
                {"h": pw_hash, "r": role, "n": full_name, "id": row["id"]},
            )
            logger.info("Updated seed user %s (AUTH_FORCE_SEED)", username)
        return

    db.execute(
        text("""
            INSERT INTO app_users (id, username, password_hash, full_name, role, is_active)
            VALUES (:id, :u, :h, :n, :r, true)
        """),
        {
            "id": str(uuid.uuid4()),
            "u": username,
            "h": pw_hash,
            "n": full_name,
            "r": role,
        },
    )
    logger.info("Created seed user %s role=%s", username, role)


def seed_default_users(db: Session) -> None:
    admin_user = (os.getenv("AUTH_SEED_ADMIN_USER") or "admin").strip().lower()
    admin_pass = (os.getenv("AUTH_SEED_ADMIN_PASSWORD") or "admin123").strip()
    viewer_user = (os.getenv("AUTH_SEED_VIEWER_USER") or "viewer").strip().lower()
    viewer_pass = (os.getenv("AUTH_SEED_VIEWER_PASSWORD") or "viewer123").strip()

    _upsert_user(
        db,
        username=admin_user,
        password=admin_pass,
        role="admin",
        full_name=os.getenv("AUTH_SEED_ADMIN_NAME") or "Administrator",
    )
    _upsert_user(
        db,
        username=viewer_user,
        password=viewer_pass,
        role="viewer",
        full_name=os.getenv("AUTH_SEED_VIEWER_NAME") or "Viewer Laporan",
    )
    db.commit()


def get_user_by_username(db: Session, username: str) -> dict[str, Any] | None:
    row = db.execute(
        text("""
            SELECT id, username, password_hash, full_name, role, is_active
            FROM app_users
            WHERE lower(username) = :u
            LIMIT 1
        """),
        {"u": username.strip().lower()},
    ).mappings().first()
    return dict(row) if row else None


def get_user_by_id(db: Session, user_id: str) -> dict[str, Any] | None:
    row = db.execute(
        text("""
            SELECT id, username, full_name, role, is_active
            FROM app_users
            WHERE id = :id
            LIMIT 1
        """),
        {"id": user_id},
    ).mappings().first()
    return dict(row) if row else None


def public_user(user: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": str(user["id"]),
        "username": user["username"],
        "full_name": user.get("full_name") or user["username"],
        "role": user["role"],
    }
