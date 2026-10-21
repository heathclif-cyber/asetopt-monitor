from collections import defaultdict
from datetime import date
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import text
from services.business_clock import business_today


def _rows(db, sql, params=None):
    return [dict(row) for row in db.execute(text(sql), params or {}).mappings()]


def match_invoice_schedule(entries, invoices):
    """Only migrate a legacy schedule when every existing entry matches an invoice."""
    remaining = {str(invoice["id"]): invoice for invoice in invoices}
    matched = {}
    for entry in entries:
        linked = entry.get("kompensasi_id")
        if linked:
            invoice = remaining.get(str(linked))
        else:
            invoice = next((item for item in remaining.values()
                            if item["tgl_jatuh_tempo"] == entry["tgl_awal"]
                            and item["tgl_jatuh_tempo"] == entry["tgl_akhir"]
                            and Decimal(item["nominal"]) == Decimal(entry["nominal"])), None)
        if invoice is None:
            return None
        key = str(invoice["id"])
        matched[key] = entry
        remaining.pop(key)
    return matched


def lock_pendapatan(db):
    db.execute(text("SELECT pg_advisory_xact_lock(826040)"))


def sync_pendapatan(db, as_of: date | None = None):
    as_of = as_of or business_today()
    lock_pendapatan(db)
    invoices_by_ks = defaultdict(list)
    for invoice in _rows(db, "SELECT id, ks_id, nominal, tgl_jatuh_tempo FROM kompensasi WHERE nominal > 0 ORDER BY tgl_jatuh_tempo, created_at, id"):
        invoices_by_ks[str(invoice["ks_id"])].append(invoice)
    contracts = {str(row["id"]): row for row in _rows(db, "SELECT id, nama_mitra, tgl_mulai, tgl_selesai FROM kerja_sama")}
    parents_by_ks = defaultdict(list)
    for parent in _rows(db, "SELECT * FROM pendapatan_diterima_dimuka ORDER BY created_at, id"):
        parents_by_ks[str(parent["ks_id"])].append(parent)
    entries_by_parent = defaultdict(list)
    for entry in _rows(db, "SELECT * FROM pengakuan_pendapatan ORDER BY periode_ke, id"):
        entries_by_parent[str(entry["pddm_id"])].append(entry)

    skipped = []
    conflicts = []
    for ks_id, invoices in invoices_by_ks.items():
        ks = contracts.get(ks_id)
        if not ks:
            continue
        parents = parents_by_ks[ks_id]
        if len(parents) > 1:
            skipped.append(ks_id)
            continue
        total = sum((Decimal(item["nominal"]) for item in invoices), Decimal(0))
        if not parents:
            parent_id = str(uuid4())
            db.execute(text("""INSERT INTO pendapatan_diterima_dimuka
                (id, ks_id, nama_kontrak, total_nkm, total_bulan, tgl_mulai, tgl_selesai)
                VALUES (:id, :ks, :nama, :total, :bulan, :mulai, :selesai)"""),
                {"id": parent_id, "ks": ks_id, "nama": ks["nama_mitra"], "total": total,
                 "bulan": len(invoices), "mulai": ks["tgl_mulai"], "selesai": ks["tgl_selesai"]})
        else:
            parent_id = str(parents[0]["id"])
        entries = entries_by_parent[parent_id]
        matched = match_invoice_schedule(entries, invoices)
        if matched is None:
            # A manually authored amortisation schedule remains authoritative.
            continue
        if any(entry['status'] == 'diakui' and (
            Decimal(entry['nominal']) != Decimal(invoice['nominal'])
            or entry['tgl_awal'] != invoice['tgl_jatuh_tempo']
            or entry['tgl_akhir'] != invoice['tgl_jatuh_tempo'])
            for invoice in invoices if (entry := matched.get(str(invoice['id']))) is not None):
            conflicts.append(ks_id)
            continue
        next_period = max((item["periode_ke"] for item in entries), default=0)
        for invoice in invoices:
            entry = matched.get(str(invoice["id"]))
            status = "diakui" if invoice["tgl_jatuh_tempo"] <= as_of else "proyeksi"
            if entry:
                if entry["status"] == "diakui":
                    status = "diakui"
                db.execute(text("""UPDATE pengakuan_pendapatan SET kompensasi_id=:kompensasi,
                    tgl_awal=:tanggal, tgl_akhir=:tanggal, nominal=:nominal, status=:status WHERE id=:id"""),
                    {"id": str(entry["id"]), "kompensasi": str(invoice["id"]),
                     "tanggal": invoice["tgl_jatuh_tempo"], "nominal": invoice["nominal"], "status": status})
            else:
                next_period += 1
                db.execute(text("""INSERT INTO pengakuan_pendapatan
                    (id, pddm_id, kompensasi_id, periode_ke, tgl_awal, tgl_akhir, nominal, status)
                    VALUES (:id, :parent, :kompensasi, :periode, :tanggal, :tanggal, :nominal, :status)"""),
                    {"id": str(uuid4()), "parent": parent_id, "kompensasi": str(invoice["id"]),
                     "periode": next_period, "tanggal": invoice["tgl_jatuh_tempo"],
                     "nominal": invoice["nominal"], "status": status})
        db.execute(text("""UPDATE pendapatan_diterima_dimuka SET total_nkm=:total,
            total_bulan=:bulan WHERE id=:id"""), {"total": total, "bulan": len(invoices), "id": parent_id})

    db.execute(text("""UPDATE pengakuan_pendapatan SET status='diakui'
        WHERE status='proyeksi' AND tgl_awal <= :tanggal"""), {"tanggal": as_of})
    db.execute(text("""UPDATE pendapatan_diterima_dimuka p SET
        sudah_diakui = COALESCE((SELECT SUM(pp.nominal) FROM pengakuan_pendapatan pp
            WHERE pp.pddm_id=p.id AND pp.status='diakui'),0),
        status = CASE WHEN COALESCE((SELECT SUM(pp.nominal) FROM pengakuan_pendapatan pp
            WHERE pp.pddm_id=p.id AND pp.status='diakui'),0) >= p.total_nkm THEN 'selesai' ELSE 'aktif' END"""))
    return {"skipped_duplicate_ks": skipped, "skipped_recognized_conflict_ks": conflicts}
