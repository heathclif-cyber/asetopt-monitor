from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session


DOMAIN_BY_KIND = {
    "konsesi": "legal",
    "tanaman": "tanaman",
    "hutan": "referensi",
    "opset": "opset",
    "okupasi": "legal",
    "administrasi": "referensi",
}


def domain_for_kind(kind: str) -> str:
    try:
        return DOMAIN_BY_KIND[kind]
    except KeyError as exc:
        raise HTTPException(status_code=422, detail="Jenis layer GIS tidak valid") from exc


def domains_for_user(db: Session, user: dict) -> set[str]:
    if user.get("role") == "admin":
        return set(DOMAIN_BY_KIND.values())
    if user.get("role") != "staf":
        return set()
    rows = db.execute(
        text("SELECT domain FROM gis_domain_grants WHERE user_id = :user_id"),
        {"user_id": user["id"]},
    ).scalars()
    return set(rows)


def require_domain(db: Session, user: dict, kind: str) -> str:
    domain = domain_for_kind(kind)
    if domain not in domains_for_user(db, user):
        raise HTTPException(status_code=403, detail=f"Akses tulis GIS bidang {domain} diperlukan")
    return domain


def require_dataset_domain(db: Session, user: dict, dataset_id: str) -> dict:
    row = db.execute(
        text("SELECT id, kind, name, scope_key, active_version_id, revision, archived_at FROM gis_datasets WHERE id = :id"),
        {"id": dataset_id},
    ).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail="Dataset GIS tidak ditemukan")
    require_domain(db, user, row["kind"])
    return dict(row)
