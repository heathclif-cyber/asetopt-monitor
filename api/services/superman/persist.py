"""Simpan nomor SPPn/SPPb Superman ke kompensasi."""

from __future__ import annotations

from datetime import datetime, timezone

import models
from database import SessionLocal


def format_superman_ref(sppb_no: str | None, sppn_no: str | None) -> str:
    parts: list[str] = []
    if sppb_no and str(sppb_no).strip():
        parts.append(str(sppb_no).strip())
    if sppn_no and str(sppn_no).strip():
        parts.append(str(sppn_no).strip())
    return " + ".join(parts)


def get_kompensasi_superman(kompensasi_id: str) -> str | None:
    db = SessionLocal()
    try:
        row = db.query(models.Kompensasi).filter(models.Kompensasi.id == kompensasi_id.strip()).first()
        if not row:
            return None
        value = (row.superman or "").strip()
        return value or None
    finally:
        db.close()


def assert_kompensasi_not_submitted(kompensasi_id: str) -> None:
    existing = get_kompensasi_superman(kompensasi_id)
    if existing:
        raise ValueError(
            f"Kompensasi {kompensasi_id} sudah pernah dibuatkan SPPn/SPPb di Superman: {existing}. "
            "Tidak dapat membuat duplikat."
        )


def _sync_superman_to_pembayaran(db, kompensasi_id, label: str) -> None:
    pays = db.query(models.Pembayaran).filter(models.Pembayaran.kompensasi_id == kompensasi_id).all()
    for pay in pays:
        pay.superman = label


def save_superman_to_kompensasi(
    kompensasi_id: str,
    sppb_no: str | None,
    sppn_no: str | None,
) -> str | None:
    label = format_superman_ref(sppb_no, sppn_no)
    if not label:
        return None

    db = SessionLocal()
    try:
        row = db.query(models.Kompensasi).filter(models.Kompensasi.id == kompensasi_id.strip()).first()
        if not row:
            raise ValueError(f"Kompensasi tidak ditemukan: {kompensasi_id}")
        row.superman = label
        _sync_superman_to_pembayaran(db, row.id, label)
        db.commit()
    finally:
        db.close()

    return label


def get_sppn_no(kompensasi_id: str) -> str | None:
    db = SessionLocal()
    try:
        row = db.query(models.Kompensasi).filter(models.Kompensasi.id == kompensasi_id.strip()).first()
        if not row:
            return None
        value = (row.sppn_no or "").strip()
        return value or None
    finally:
        db.close()


def get_sppb_pph_no(kompensasi_id: str) -> str | None:
    db = SessionLocal()
    try:
        row = db.query(models.Kompensasi).filter(models.Kompensasi.id == kompensasi_id.strip()).first()
        if not row:
            return None
        value = (row.sppb_pph_no or "").strip()
        return value or None
    finally:
        db.close()


def assert_sppn_not_submitted(kompensasi_id: str) -> None:
    existing = get_sppn_no(kompensasi_id)
    if existing:
        raise ValueError(
            f"Kompensasi {kompensasi_id} sudah pernah dibuatkan SPPn di Superman: {existing}. "
            "Tidak dapat membuat duplikat."
        )


def assert_sppb_pph_not_submitted(kompensasi_id: str) -> None:
    existing = get_sppb_pph_no(kompensasi_id)
    if existing:
        raise ValueError(
            f"Kompensasi {kompensasi_id} sudah pernah dibuatkan SPPb PPh di Superman: {existing}. "
            "Tidak dapat membuat duplikat."
        )


def _sync_combined_label(db, row: models.Kompensasi) -> str | None:
    label = format_superman_ref(row.sppb_pph_no, row.sppn_no)
    if label:
        row.superman = label
        _sync_superman_to_pembayaran(db, row.id, label)
    return label or None


def save_sppn_ref(kompensasi_id: str, sppn_no: str | None) -> str | None:
    sppn_no = str(sppn_no).strip() if sppn_no else None
    if not sppn_no:
        return None

    db = SessionLocal()
    try:
        row = db.query(models.Kompensasi).filter(models.Kompensasi.id == kompensasi_id.strip()).first()
        if not row:
            raise ValueError(f"Kompensasi tidak ditemukan: {kompensasi_id}")
        row.sppn_no = sppn_no
        row.sppn_dibuat_at = datetime.now(timezone.utc)
        _sync_combined_label(db, row)
        db.commit()
    finally:
        db.close()

    return sppn_no


def save_sppb_pph_ref(kompensasi_id: str, sppb_no: str | None) -> str | None:
    sppb_no = str(sppb_no).strip() if sppb_no else None
    if not sppb_no:
        return None

    db = SessionLocal()
    try:
        row = db.query(models.Kompensasi).filter(models.Kompensasi.id == kompensasi_id.strip()).first()
        if not row:
            raise ValueError(f"Kompensasi tidak ditemukan: {kompensasi_id}")
        row.sppb_pph_no = sppb_no
        row.sppb_pph_dibuat_at = datetime.now(timezone.utc)
        _sync_combined_label(db, row)
        db.commit()
    finally:
        db.close()

    return sppb_no