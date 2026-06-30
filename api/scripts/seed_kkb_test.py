"""Seed data uji: Koperasi Pemasaran KKB Karaeng Lembeng / GKP-N1 750jt."""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path
from uuid import uuid4

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv

load_dotenv()

from sqlalchemy import text

from database import SessionLocal
import models

ASSET_ID = "0418f02e-51fe-45e2-b487-a84697b0e819"
MITRA = "Koperasi Pemasaran KKB Karaeng Lembeng"
NO_KONTRAK = "024/SGN/SPJB/BO/GKP-N1/IV/2026"
NO_INVOICE = "26.035/GKP-N1/BO/KKB/V/2026"
NOMINAL = 750_000_000


def main() -> None:
    db = SessionLocal()
    try:
        aset = db.query(models.Aset).filter(models.Aset.id == ASSET_ID).first()
        if not aset:
            raise SystemExit(f"Aset {ASSET_ID} tidak ditemukan")

        ks = (
            db.query(models.KerjaSama)
            .filter(
                models.KerjaSama.nama_mitra == MITRA,
                models.KerjaSama.no_perjanjian == NO_KONTRAK,
            )
            .first()
        )
        if not ks:
            ks = models.KerjaSama(
                id=uuid4(),
                aset_id=ASSET_ID,
                nama_mitra=MITRA,
                no_perjanjian=NO_KONTRAK,
                no_kontrak_sap="SGN/SPJB/BO/GKP-N1/IV/2026",
                tgl_mulai=date(2026, 4, 1),
                tgl_selesai=date(2026, 12, 31),
            )
            db.add(ks)
            db.flush()
            print("KS created:", ks.id)

        komp = (
            db.query(models.Kompensasi)
            .filter(models.Kompensasi.no_invoice == NO_INVOICE)
            .first()
        )
        if not komp:
            kid = uuid4()
            db.execute(
                text(
                    """
                    INSERT INTO kompensasi (
                        id, ks_id, periode_label, nominal, ppn_persen, pph_persen, pph_mode,
                        tgl_jatuh_tempo, no_invoice, invoice_tgl
                    ) VALUES (
                        :id, :ks_id, :periode, :nominal, 0, 0, 'none',
                        :jatuh_tempo, :no_invoice, :invoice_tgl
                    )
                    """
                ),
                {
                    "id": kid,
                    "ks_id": ks.id,
                    "periode": "Camming Tebu Kg/06/2026",
                    "nominal": NOMINAL,
                    "jatuh_tempo": date(2026, 6, 26),
                    "no_invoice": NO_INVOICE,
                    "invoice_tgl": date(2026, 6, 26),
                },
            )
            komp = db.query(models.Kompensasi).filter(models.Kompensasi.id == kid).first()
            print("Kompensasi created:", kid)
        else:
            print("Kompensasi exists:", komp.id)

        db.commit()
        print("OK — buka Input Pembayaran dengan kompensasi_id=", komp.id)
    finally:
        db.close()


if __name__ == "__main__":
    main()