from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import get_db
from services.auth_deps import require_integration_read


router = APIRouter(prefix="/api/integrasi/v1", tags=["Integrasi Internal"])


@router.get("/revenue")
def get_revenue(
    tanggal_mulai: Optional[date] = Query(None, description="Tanggal pengakuan minimum (YYYY-MM-DD)"),
    tanggal_sampai: Optional[date] = Query(None, description="Tanggal pengakuan maksimum (YYYY-MM-DD)"),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
    _user: dict = Depends(require_integration_read),
):
    """Pendapatan kerja sama aset yang sudah diakui menurut jadwal akrual."""
    rows = db.execute(
        text("""
            SELECT
                pp.id AS pengakuan_id,
                pp.tgl_akhir AS tanggal_pengakuan,
                pp.nominal AS pendapatan_pokok,
                pddm.id AS pddm_id,
                ks.id AS kerja_sama_id,
                ks.no_perjanjian,
                ks.no_kontrak_sap,
                ks.nama_mitra,
                aset.id AS aset_id,
                aset.kode_aset,
                aset.nama_aset
            FROM pengakuan_pendapatan pp
            JOIN pendapatan_diterima_dimuka pddm ON pddm.id = pp.pddm_id
            LEFT JOIN kerja_sama ks ON ks.id = pddm.ks_id
            LEFT JOIN aset ON aset.id = ks.aset_id
            WHERE pp.status = 'diakui'
              AND (:tanggal_mulai IS NULL OR pp.tgl_akhir >= :tanggal_mulai)
              AND (:tanggal_sampai IS NULL OR pp.tgl_akhir <= :tanggal_sampai)
            ORDER BY pp.tgl_akhir DESC, pp.id DESC
            LIMIT :limit
        """),
        {
            "tanggal_mulai": tanggal_mulai,
            "tanggal_sampai": tanggal_sampai,
            "limit": limit,
        },
    ).mappings().all()

    data = []
    for row in rows:
        nominal = float(row["pendapatan_pokok"] or 0)
        data.append(
            {
                "id": f"pengakuan:{row['pengakuan_id']}",
                "sumber": "asetopt-monitor",
                "basis_pengakuan": "akrual_psak_73",
                "tanggal_pengakuan": row["tanggal_pengakuan"],
                "pendapatan_pokok": nominal,
                "ppn": 0,
                "pendapatan_bruto": nominal,
                "pph": 0,
                "mata_uang": "IDR",
                "referensi": {
                    "id_pengakuan_pendapatan": str(row["pengakuan_id"]),
                    "id_pendapatan_dimuka": str(row["pddm_id"]),
                    "id_kerja_sama": str(row["kerja_sama_id"]) if row["kerja_sama_id"] else None,
                    "no_perjanjian": row["no_perjanjian"],
                    "no_kontrak_sap": row["no_kontrak_sap"],
                    "id_aset": str(row["aset_id"]) if row["aset_id"] else None,
                },
                "asal_transaksi": {
                    "mitra": row["nama_mitra"],
                    "kode_aset": row["kode_aset"],
                    "nama_aset": row["nama_aset"],
                },
            }
        )

    return {
        "meta": {
            "schema_version": "1.0",
            "source": "asetopt-monitor",
            "basis_pengakuan": "akrual_psak_73",
            "generated_at": datetime.now(timezone.utc).isoformat(),
            "count": len(data),
        },
        "data": data,
    }
