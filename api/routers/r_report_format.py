import json
from typing import Any, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from services.auth_deps import CurrentUser

router = APIRouter(prefix="/api/report-formats", tags=["Format Laporan"])

ALLOWED_ROLES = {"admin", "staf", "viewer"}
MAX_CONFIG_BYTES = 20_000


class FormatBody(BaseModel):
    nama: str = Field(min_length=1, max_length=80)
    dataset: Literal["tagihan"]
    config: dict[str, Any]
    is_shared: bool = False


def _check_role(user: dict[str, Any]) -> None:
    if user.get("role") not in ALLOWED_ROLES:
        raise HTTPException(403, "Akses ditolak")


def _config_json(body: FormatBody) -> str:
    raw = json.dumps(body.config, ensure_ascii=False)
    if len(raw.encode()) > MAX_CONFIG_BYTES:
        raise HTTPException(413, "Format terlalu besar")
    return raw


def _row(r: Any, user_id: str) -> dict[str, Any]:
    return {
        "id": str(r["id"]),
        "nama": r["nama"],
        "dataset": r["dataset"],
        "config": r["config"],
        "is_shared": r["is_shared"],
        "owner_username": r["owner_username"],
        "mine": str(r["owner_id"]) == user_id,
        "updated_at": r["updated_at"].isoformat(),
    }


@router.get("")
def list_formats(user: CurrentUser, db: Session = Depends(get_db)):
    _check_role(user)
    rows = db.execute(text("""
        SELECT id, owner_id, owner_username, nama, dataset, config, is_shared, updated_at
        FROM report_format WHERE owner_id = :uid OR is_shared
        ORDER BY lower(nama)
    """), {"uid": user["id"]}).mappings().all()
    return [_row(r, user["id"]) for r in rows]


@router.post("")
def create_format(body: FormatBody, user: CurrentUser, db: Session = Depends(get_db)):
    _check_role(user)
    try:
        row = db.execute(text("""
            INSERT INTO report_format (owner_id, owner_username, nama, dataset, config, is_shared)
            VALUES (:uid, :uname, :nama, :dataset, CAST(:config AS jsonb), :shared)
            RETURNING id, owner_id, owner_username, nama, dataset, config, is_shared, updated_at
        """), {"uid": user["id"], "uname": user["username"], "nama": body.nama.strip(),
               "dataset": body.dataset, "config": _config_json(body), "shared": body.is_shared}).mappings().one()
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Nama format sudah dipakai; pakai nama lain atau timpa format yang ada") from None
    return _row(row, user["id"])


@router.patch("/{format_id}")
def update_format(format_id: UUID, body: FormatBody, user: CurrentUser, db: Session = Depends(get_db)):
    _check_role(user)
    owner = db.execute(text("SELECT owner_id FROM report_format WHERE id=:id"), {"id": str(format_id)}).first()
    if not owner:
        raise HTTPException(404, "Format tidak ditemukan")
    if str(owner[0]) != user["id"] and user["role"] != "admin":
        raise HTTPException(403, "Hanya pemilik format yang dapat mengubahnya")
    try:
        row = db.execute(text("""
            UPDATE report_format SET nama=:nama, dataset=:dataset, config=CAST(:config AS jsonb),
                is_shared=:shared, updated_at=now()
            WHERE id=:id
            RETURNING id, owner_id, owner_username, nama, dataset, config, is_shared, updated_at
        """), {"id": str(format_id), "nama": body.nama.strip(), "dataset": body.dataset,
               "config": _config_json(body), "shared": body.is_shared}).mappings().one()
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Nama format sudah dipakai") from None
    return _row(row, user["id"])


@router.delete("/{format_id}")
def delete_format(format_id: UUID, user: CurrentUser, db: Session = Depends(get_db)):
    _check_role(user)
    owner = db.execute(text("SELECT owner_id FROM report_format WHERE id=:id"), {"id": str(format_id)}).first()
    if not owner:
        raise HTTPException(404, "Format tidak ditemukan")
    if str(owner[0]) != user["id"] and user["role"] != "admin":
        raise HTTPException(403, "Hanya pemilik format yang dapat menghapusnya")
    db.execute(text("DELETE FROM report_format WHERE id=:id"), {"id": str(format_id)})
    db.commit()
    return {"id": str(format_id)}
