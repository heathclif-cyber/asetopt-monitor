"""Simpan parent dan detail dalam satu transaksi; tidak melakukan commit sendiri."""
from decimal import Decimal, InvalidOperation
from typing import Any

from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from services.rest_query import delete_rows, insert_rows, update_rows

PBB_FIELDS = set("aset_id rkap_kode tahun tgl_jatuh_tempo tgl_bayar_pbb jumlah_pbb_dibayar no_invoice status_bayar luas_tanah_sppt luas_tanah_ks njop_tanah_per_m2 luas_bangunan_sppt luas_bangunan_ks njop_bangunan_per_m2".split())
OBJEK_FIELDS = set("nama_objek no_sppt nilai_pbb_objek luas_tanah_sppt luas_tanah_ks njop_tanah_per_m2 luas_bangunan_sppt luas_bangunan_ks njop_bangunan_per_m2".split())
KATALOG_FIELDS = set("aset_id tagline coordinates_lat coordinates_lng sertifikat_detail sertifikat_pemilik zonasi topografi kondisi_bangunan rekomendasi_pengembangan rekomendasi_summary pic_nama pic_jabatan pic_phone pic_mobile pic_email pic_kantor tgl_dokumen ref_dokumen layout_preferensi".split())
KATALOG_CHILDREN = {
    "aksesibilitas": ("katalog_aksesibilitas", set("urutan label nilai keterangan".split())),
    "lingkungan": ("katalog_lingkungan", set("urutan nama jarak tipe".split())),
    "skema": ("katalog_skema", set("urutan kode nama catatan".split())),
}


def _fields(data: dict[str, Any], allowed: set[str]) -> dict[str, Any]:
    return {key: value for key, value in data.items() if key in allowed}


def _lock_parent(db: Session, table: str, record_id: str) -> None:
    row = db.execute(text(f'SELECT id FROM "{table}" WHERE id = :id FOR UPDATE'), {"id": record_id}).first()
    if not row:
        raise HTTPException(404, "Data tidak ditemukan")


def save_pbb(db: Session, data: dict, objek: list[dict] | None, record_id: str | None = None) -> dict:
    parent = _fields(data, PBB_FIELDS)
    children = [_fields(row, OBJEK_FIELDS) for row in objek] if objek is not None else None
    if children is not None:
        try:
            values = [Decimal(str(row.get("nilai_pbb_objek") or 0)) for row in children]
            if any(not value.is_finite() or value < 0 for value in values):
                raise InvalidOperation
            parent["nilai_pbb"] = sum(values, Decimal(0))
        except (InvalidOperation, ValueError):
            raise HTTPException(422, "Nilai objek PBB harus berupa angka positif atau nol") from None
    if record_id:
        _lock_parent(db, "pbb", record_id)
        saved = update_rows(db, "pbb", parent, {"id": f"eq.{record_id}"}, commit=False)
        if not saved:
            raise HTTPException(422, "Tidak ada data PBB yang diubah")
    else:
        if children is None or not parent.get("aset_id") or not parent.get("tahun"):
            raise HTTPException(422, "Aset, tahun, dan objek PBB wajib diisi")
        saved = insert_rows(db, "pbb", parent, on_conflict="aset_id,tahun", commit=False)
    result = saved[0]
    if children is not None:
        delete_rows(db, "pbb_objek", {"pbb_id": f"eq.{result['id']}"}, commit=False)
        insert_rows(db, "pbb_objek", [{**row, "pbb_id": result["id"]} for row in children], commit=False)
    return result


def save_katalog(db: Session, data: dict, children: dict[str, list[dict]], record_id: str | None = None) -> dict:
    parent = _fields(data, KATALOG_FIELDS)
    if record_id:
        _lock_parent(db, "katalog_aset", record_id)
        if parent:
            result = update_rows(db, "katalog_aset", parent, {"id": f"eq.{record_id}"}, commit=False)[0]
        else:
            result = {"id": record_id}
    else:
        if not parent.get("aset_id"):
            raise HTTPException(422, "Aset wajib diisi")
        result = insert_rows(db, "katalog_aset", parent, commit=False)[0]
    for key, rows in children.items():
        table, allowed = KATALOG_CHILDREN[key]
        prepared = [{**_fields(row, allowed), "katalog_id": result["id"], "urutan": row.get("urutan", index)} for index, row in enumerate(rows)]
        delete_rows(db, table, {"katalog_id": f"eq.{result['id']}"}, commit=False)
        insert_rows(db, table, prepared, commit=False)
    return result


def save_katalog_foto(db: Session, record_id: str, slot_id: str, url: str) -> dict:
    _lock_parent(db, "katalog_aset", record_id)
    delete_rows(db, "katalog_foto", {"katalog_id": f"eq.{record_id}", "slot_id": f"eq.{slot_id}"}, commit=False)
    return insert_rows(db, "katalog_foto", {"katalog_id": record_id, "slot_id": slot_id, "url": url, "urutan": 0}, commit=False)[0]
