from datetime import timedelta
from decimal import Decimal
from typing import Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from services.auth_deps import require_write
from services.business_clock import business_today

router = APIRouter(prefix="/api/notifikasi", tags=["Notifikasi"], dependencies=[Depends(require_write)])
LEVELS = ["SP1", "SP2", "SP3", "PUTUS"]


class SPIssue(BaseModel):
    ks_id: UUID
    kompensasi_id: UUID | None = None
    jenis: Literal["SP1", "SP2", "SP3", "PUTUS"]


def issue_sp(db, body, today):
    ks = db.execute(text("SELECT id FROM kerja_sama WHERE id=:id FOR UPDATE"), {"id": str(body.ks_id)}).first()
    if not ks:
        raise HTTPException(404, "Kerja sama tidak ditemukan")
    active = db.execute(text("""SELECT jenis,tgl_terbit,tgl_deadline FROM surat_peringatan
        WHERE ks_id=:ks AND status='aktif' ORDER BY tgl_terbit DESC,id DESC LIMIT 1"""), {"ks": str(body.ks_id)}).mappings().first()
    if active and active['jenis'] not in LEVELS:
        raise HTTPException(409, "Jenis SP lama tidak dikenali; periksa riwayat SP")
    expected = "SP1" if not active else (LEVELS[LEVELS.index(active["jenis"]) + 1] if active["jenis"] != "PUTUS" else None)
    if body.jenis != expected:
        raise HTTPException(409, "Tingkat SP berubah. Muat ulang sebelum menerbitkan SP berikutnya")
    if active and today < max(active["tgl_terbit"] + timedelta(days=14), active["tgl_deadline"] or active["tgl_terbit"]):
        raise HTTPException(400, "Batas waktu SP sebelumnya belum berakhir")
    invoices = db.execute(text("""SELECT k.id,k.tgl_jatuh_tempo,k.persen_denda_per_hari,
        GREATEST(0,k.total_tagihan-COALESCE(k.pengurang,0))-COALESCE(SUM(p.nominal_bayar),0) AS sisa
        FROM kompensasi k LEFT JOIN pembayaran p ON p.kompensasi_id=k.id
        WHERE k.ks_id=:ks AND (:kompensasi IS NULL OR k.id=CAST(:kompensasi AS UUID))
        GROUP BY k.id"""), {"ks": str(body.ks_id), "kompensasi": str(body.kompensasi_id) if body.kompensasi_id else None}).mappings().all()
    eligible = [row for row in invoices if row["sisa"] > Decimal("0.5") and row["tgl_jatuh_tempo"] <= today]
    if not active:
        eligible = [row for row in eligible if (today - row["tgl_jatuh_tempo"]).days * Decimal(row["persen_denda_per_hari"] or 0) >= 5]
    if not eligible:
        raise HTTPException(400, "Tidak ada piutang yang memenuhi syarat penerbitan SP")
    record_id = str(uuid4())
    db.execute(text("UPDATE surat_peringatan SET status='tidak_aktif' WHERE ks_id=:ks AND status='aktif'"), {"ks": str(body.ks_id)})
    db.execute(text("""INSERT INTO surat_peringatan(id,ks_id,kompensasi_id,jenis,tgl_terbit,tgl_deadline,status)
        VALUES (:id,:ks,:kompensasi,:jenis,:tanggal,:deadline,'aktif')"""),
        {"id": record_id, "ks": str(body.ks_id), "kompensasi": str(eligible[0]["id"]), "jenis": body.jenis,
         "tanggal": today, "deadline": today + timedelta(days=14)})
    db.execute(text("UPDATE kerja_sama SET status=:status WHERE id=:ks"), {"status": "putus" if body.jenis == "PUTUS" else body.jenis.lower(), "ks": str(body.ks_id)})
    return {"id": record_id, "jenis": body.jenis}


@router.post("/sp")
def create_sp(body: SPIssue, db: Session = Depends(get_db)):
    try:
        result = issue_sp(db, body, business_today())
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise


@router.delete("/sp/{record_id}")
def delete_sp(record_id: UUID, db: Session = Depends(get_db)):
    try:
        record = db.execute(text("SELECT ks_id FROM surat_peringatan WHERE id=:id"), {"id": str(record_id)}).mappings().first()
        if not record:
            raise HTTPException(404, "SP tidak ditemukan")
        ks = str(record["ks_id"])
        db.execute(text("SELECT id FROM kerja_sama WHERE id=:id FOR UPDATE"), {"id": ks})
        db.execute(text("DELETE FROM surat_peringatan WHERE id=:id"), {"id": str(record_id)})
        active = db.execute(text("SELECT jenis FROM surat_peringatan WHERE ks_id=:ks AND status='aktif' ORDER BY tgl_terbit DESC,id DESC LIMIT 1"), {"ks": ks}).mappings().first()
        status = ("putus" if active["jenis"] == "PUTUS" else active["jenis"].lower()) if active else "aktif"
        db.execute(text("UPDATE kerja_sama SET status=:status WHERE id=:ks AND status IN ('sp1','sp2','sp3','putus')"), {"status": status, "ks": ks})
        db.commit()
        return {"id": str(record_id)}
    except Exception:
        db.rollback()
        raise
