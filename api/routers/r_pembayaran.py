import re
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

import models
import schemas
from database import get_db
from services.superman.documents import superman_doc_requirements_for_kompensasi
from services.superman.runner import start_deklarasi_job

router = APIRouter(prefix="/api/pembayaran", tags=["Pembayaran"])


def _kompensasi_has_superman(kompensasi: models.Kompensasi | None) -> bool:
    return bool(kompensasi and (kompensasi.superman or "").strip())


def _efektif_tagihan(kompensasi: models.Kompensasi) -> float:
    total = float(kompensasi.total_tagihan or 0)
    pengurang = float(kompensasi.pengurang or 0)
    return max(0.0, total - pengurang)


def _sanitize_kompensasi_key(kompensasi_id: str) -> str:
    short = kompensasi_id.replace("-", "")[:8]
    return re.sub(r"[^A-Za-z0-9._-]+", "-", short)


def _generate_pembayaran_no(db: Session, kompensasi_id: UUID) -> str:
    safe = _sanitize_kompensasi_key(str(kompensasi_id))
    existing = (
        db.query(models.Pembayaran.no_pembayaran)
        .filter(models.Pembayaran.kompensasi_id == kompensasi_id)
        .all()
    )
    max_seq = 0
    prefix = f"PAY-{safe}-"
    for (no_pay,) in existing:
        if no_pay and no_pay.startswith(prefix):
            tail = no_pay[len(prefix) :]
            if tail.isdigit():
                max_seq = max(max_seq, int(tail))
    return f"{prefix}{max_seq + 1}"


def _paid_total(db: Session, kompensasi_id: UUID, exclude_id: Optional[UUID] = None) -> float:
    q = db.query(models.Pembayaran).filter(models.Pembayaran.kompensasi_id == kompensasi_id)
    if exclude_id:
        q = q.filter(models.Pembayaran.id != exclude_id)
    return sum(float(p.nominal_bayar or 0) for p in q.all())


def _validate_aggregate(
    db: Session,
    kompensasi: models.Kompensasi,
    nominal: float,
    exclude_id: Optional[UUID] = None,
) -> None:
    if nominal <= 0:
        raise HTTPException(status_code=400, detail="Nominal bayar harus lebih dari 0")

    efektif = _efektif_tagihan(kompensasi)
    existing = _paid_total(db, kompensasi.id, exclude_id=exclude_id)
    if existing + nominal > efektif + 0.5:
        sisa = max(0, round(efektif - existing))
        raise HTTPException(
            status_code=400,
            detail=f"Nominal melebihi sisa tagihan efektif. Sisa tersedia: Rp {sisa:,.0f}",
        )


def _pembayaran_out(p: models.Pembayaran) -> schemas.PembayaranOut:
    data = schemas.PembayaranOut.model_validate(p)
    if p.kompensasi and (p.kompensasi.superman or "").strip():
        data.superman = p.kompensasi.superman
    return data


def _maybe_trigger_superman(db: Session, kompensasi: models.Kompensasi) -> dict | None:
    """Auto-deklarasi hanya jika lunas DAN dokumen Superman sudah lengkap.

    Simpan cash in sendiri tidak mewajibkan dokumen — gate dokumen hanya
    untuk alur deklarasi Superman (manual tombol atau auto di sini).
    """
    if _kompensasi_has_superman(kompensasi):
        return None
    efektif = _efektif_tagihan(kompensasi)
    paid = _paid_total(db, kompensasi.id)
    if paid + 0.5 < efektif:
        return None
    _, docs_ready = superman_doc_requirements_for_kompensasi(db, str(kompensasi.id))
    if not docs_ready:
        return None
    try:
        return start_deklarasi_job(kompensasi_id=str(kompensasi.id))
    except Exception as exc:
        return {"error": str(exc), "kompensasi_id": str(kompensasi.id)}


@router.post("", response_model=schemas.PembayaranOut)
def create_pembayaran(body: schemas.PembayaranCreate, db: Session = Depends(get_db)):
    # Lock baris kompensasi agar race double-submit tidak lolos validasi sisa tagihan
    kompensasi = (
        db.query(models.Kompensasi)
        .filter(models.Kompensasi.id == body.kompensasi_id)
        .with_for_update()
        .first()
    )
    if not kompensasi:
        raise HTTPException(status_code=404, detail="Kompensasi tidak ditemukan")

    if _kompensasi_has_superman(kompensasi):
        raise HTTPException(
            status_code=400,
            detail="Kompensasi sudah punya nomor Superman — pembayaran tidak bisa ditambah",
        )

    nominal = float(body.nominal_bayar)
    _validate_aggregate(db, kompensasi, nominal)

    saved = models.Pembayaran(
        kompensasi_id=body.kompensasi_id,
        no_pembayaran=_generate_pembayaran_no(db, body.kompensasi_id),
        tgl_bayar=body.tgl_bayar,
        nominal_bayar=nominal,
        is_pph_disetor=body.is_pph_disetor,
        bukti_url=body.bukti_url,
        keterangan=body.keterangan,
    )
    db.add(saved)
    db.commit()
    db.refresh(saved)

    _maybe_trigger_superman(db, kompensasi)
    return _pembayaran_out(
        db.query(models.Pembayaran)
        .options(joinedload(models.Pembayaran.kompensasi))
        .filter(models.Pembayaran.id == saved.id)
        .first()
    )


@router.get("", response_model=List[schemas.PembayaranOut])
def list_pembayaran(
    kompensasi_id: Optional[UUID] = Query(None),
    db: Session = Depends(get_db),
):
    q = db.query(models.Pembayaran).options(joinedload(models.Pembayaran.kompensasi))
    if kompensasi_id:
        q = q.filter(models.Pembayaran.kompensasi_id == kompensasi_id)
    rows = q.order_by(models.Pembayaran.tgl_bayar.desc()).all()
    return [_pembayaran_out(p) for p in rows]


@router.patch("/{pembayaran_id}", response_model=schemas.PembayaranOut)
def update_pembayaran(
    pembayaran_id: UUID,
    body: schemas.PembayaranUpdate,
    db: Session = Depends(get_db),
):
    pay = (
        db.query(models.Pembayaran)
        .filter(models.Pembayaran.id == pembayaran_id)
        .first()
    )
    if not pay:
        raise HTTPException(status_code=404, detail="Pembayaran tidak ditemukan")

    kompensasi = (
        db.query(models.Kompensasi)
        .filter(models.Kompensasi.id == pay.kompensasi_id)
        .with_for_update()
        .first()
    )
    if not kompensasi:
        raise HTTPException(status_code=404, detail="Kompensasi tidak ditemukan")

    if _kompensasi_has_superman(kompensasi):
        raise HTTPException(
            status_code=400,
            detail="Kompensasi sudah punya nomor Superman — pembayaran tidak bisa diubah",
        )

    data = body.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=400, detail="Tidak ada data yang diubah")

    new_nominal = float(data.get("nominal_bayar", pay.nominal_bayar or 0))
    _validate_aggregate(db, kompensasi, new_nominal, exclude_id=pay.id)

    for key, value in data.items():
        setattr(pay, key, value)

    db.commit()
    db.refresh(pay)

    _maybe_trigger_superman(db, kompensasi)
    return _pembayaran_out(
        db.query(models.Pembayaran)
        .options(joinedload(models.Pembayaran.kompensasi))
        .filter(models.Pembayaran.id == pay.id)
        .first()
    )


@router.delete("/{pembayaran_id}")
def delete_pembayaran(pembayaran_id: UUID, db: Session = Depends(get_db)):
    pay = (
        db.query(models.Pembayaran)
        .options(joinedload(models.Pembayaran.kompensasi))
        .filter(models.Pembayaran.id == pembayaran_id)
        .first()
    )
    if not pay:
        raise HTTPException(status_code=404, detail="Pembayaran tidak ditemukan")

    if _kompensasi_has_superman(pay.kompensasi):
        raise HTTPException(
            status_code=400,
            detail="Kompensasi sudah punya nomor Superman — pembayaran tidak bisa dihapus",
        )

    db.delete(pay)
    db.commit()
    return {"success": True, "message": "Pembayaran berhasil dihapus"}