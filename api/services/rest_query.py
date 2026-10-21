"""PostgREST-compatible query layer untuk migrasi dari Supabase."""
from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from typing import Any

from fastapi import HTTPException
from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session

ALLOWED_TABLES = {
    "aset", "njop", "penilaian_kjpp", "timeline_program", "prospek_mitra",
    "kerja_sama", "kerja_sama_aset", "kompensasi", "pembayaran", "pbb", "pbb_objek",
    "cash_in", "surat_peringatan", "log_notifikasi", "rkap_target", "rkap_prognosa", "rkap_prognosa_nonaktif", "rkap_prognosa_setting",
    "katalog_aset", "katalog_aksesibilitas", "katalog_lingkungan", "katalog_skema", "katalog_foto",
    "pendapatan_diterima_dimuka", "pengakuan_pendapatan", "document_upload", "aset_gis", "aset_konsesi",
    "konsesi_profil", "konsesi_sppt", "konsesi_bangunan",
}

GENERATED_COLS: dict[str, set[str]] = {
    "penilaian_kjpp": {"total_nilai"},
    "kompensasi": {"nominal_ppn", "nominal_pph", "total_tagihan"},
    "pendapatan_diterima_dimuka": {"nilai_per_bulan", "sisa_dimuka"},
}

# parent_table -> embed_name -> config
EMBEDS: dict[str, dict[str, dict[str, Any]]] = {
    "aset": {
        "aset_konsesi": {"kind": "o2m", "table": "aset_konsesi", "fk": "aset_id"},
    },
    "kerja_sama": {
        "aset": {"kind": "m2o", "table": "aset", "fk": "aset_id"},
    },
    "kompensasi": {
        "pembayaran": {"kind": "o2m", "table": "pembayaran", "fk": "kompensasi_id"},
        "kerja_sama": {"kind": "m2o", "table": "kerja_sama", "fk": "ks_id"},
    },
    "cash_in": {
        "kerja_sama": {"kind": "m2o", "table": "kerja_sama", "fk": "ks_id"},
        "kompensasi": {"kind": "m2o", "table": "kompensasi", "fk": "kompensasi_id"},
    },
    "pbb": {
        "aset": {"kind": "m2o", "table": "aset", "fk": "aset_id"},
        "pbb_objek": {"kind": "o2m", "table": "pbb_objek", "fk": "pbb_id"},
    },
    "surat_peringatan": {
        "kerja_sama": {"kind": "m2o", "table": "kerja_sama", "fk": "ks_id"},
    },
    "log_notifikasi": {
        "kerja_sama": {"kind": "m2o", "table": "kerja_sama", "fk": "ks_id"},
    },
    "pendapatan_diterima_dimuka": {
        "kerja_sama": {"kind": "m2o", "table": "kerja_sama", "fk": "ks_id"},
        "pengakuan_pendapatan": {"kind": "o2m", "table": "pengakuan_pendapatan", "fk": "pddm_id"},
    },
    "katalog_aset": {
        "aset": {"kind": "m2o", "table": "aset", "fk": "aset_id"},
        "aksesibilitas": {"kind": "o2m", "table": "katalog_aksesibilitas", "fk": "katalog_id"},
        "lingkungan": {"kind": "o2m", "table": "katalog_lingkungan", "fk": "katalog_id"},
        "skema": {"kind": "o2m", "table": "katalog_skema", "fk": "katalog_id"},
        "foto": {"kind": "o2m", "table": "katalog_foto", "fk": "katalog_id"},
        "katalog_aksesibilitas": {"kind": "o2m", "table": "katalog_aksesibilitas", "fk": "katalog_id"},
        "katalog_lingkungan": {"kind": "o2m", "table": "katalog_lingkungan", "fk": "katalog_id"},
        "katalog_skema": {"kind": "o2m", "table": "katalog_skema", "fk": "katalog_id"},
        "katalog_foto": {"kind": "o2m", "table": "katalog_foto", "fk": "katalog_id"},
    },
}

EMBED_HEAD_RE = re.compile(r"^(?:(\w+):)?(\w+)\(")


def _split_top_level(select: str) -> list[str]:
    """Split by comma, tapi abaikan koma di dalam tanda kurung nested — mis.
    'kerja_sama(*, aset(*))' harus tetap 1 bagian, bukan kepotong di koma dalamnya."""
    parts: list[str] = []
    depth = 0
    current = ""
    for ch in select:
        if ch == "(":
            depth += 1
            current += ch
        elif ch == ")":
            depth -= 1
            current += ch
        elif ch == "," and depth == 0:
            parts.append(current.strip())
            current = ""
        else:
            current += ch
    if current.strip():
        parts.append(current.strip())
    return [p for p in parts if p]


def parse_select(select: str | None) -> tuple[list[str], list[tuple[str, str, str]]]:
    """Return (base_cols, embeds) where embed = (alias, table, inner_select)."""
    if not select or select.strip() == "*":
        return ["*"], []
    parts = _split_top_level(select)
    base_cols: list[str] = []
    embeds: list[tuple[str, str, str]] = []
    for part in parts:
        m = EMBED_HEAD_RE.match(part)
        # `_split_top_level` menjaga kurung tetap seimbang per bagian, jadi karakter
        # terakhir dari `part` sudah pasti penutup kurung pembuka di `m` — aman
        # dipotong langsung tanpa regex `[^)]*` yang tidak tahan kurung nested.
        if m and part.endswith(")"):
            alias, table = m.group(1) or m.group(2), m.group(2)
            inner = part[m.end():-1].strip() or "*"
            embeds.append((alias, table, inner))
        elif part == "*":
            base_cols = ["*"]
        else:
            base_cols.append(part)
    return base_cols, embeds


def parse_order(order: str | None) -> list[tuple[str, bool]]:
    if not order:
        return []
    out: list[tuple[str, bool]] = []
    for chunk in order.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        if ".desc" in chunk:
            col = chunk.replace(".desc", "").strip()
            out.append((col, False))
        else:
            col = chunk.replace(".asc", "").strip()
            out.append((col, True))
    return out


def parse_filters(params: dict[str, str]) -> list[tuple[str, str, Any]]:
    reserved = {"select", "order", "limit", "offset", "on_conflict"}
    filters: list[tuple[str, str, Any]] = []
    for key, raw in params.items():
        if key in reserved:
            continue
        # PostgREST: id=eq.uuid  OR legacy id.eq=uuid
        if "." in key and "=" not in raw:
            col, op_val = key.split(".", 1)
            if "." in op_val:
                op, val = op_val.split(".", 1)
            else:
                op, val = op_val, raw
        elif "." in raw:
            op, val = raw.split(".", 1)
            col = key
        else:
            continue
        if op == "in":
            val = val.strip("()")
            filters.append((col, "in", [v.strip() for v in val.split(",") if v.strip()]))
        elif op in ("eq", "neq", "lte", "gte", "lt", "gt"):
            filters.append((col, op, val))
    return filters


def _identifier(value: str) -> str:
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", value):
        raise HTTPException(400, "Nama kolom tidak valid")
    return value


def _lock_domain_write(db: Session, table: str) -> None:
    if table == "kompensasi":
        from services.pendapatan_sync import lock_pendapatan
        lock_pendapatan(db)


def _guard_recognized_update(db: Session, data: dict, where: str, bind: dict) -> None:
    fields = {"nominal", "tgl_jatuh_tempo", "ks_id"}.intersection(data)
    if not fields:
        return
    rows = db.execute(text(f"""SELECT k.nominal, k.tgl_jatuh_tempo, k.ks_id FROM kompensasi k
        WHERE {where} AND EXISTS (SELECT 1 FROM pengakuan_pendapatan pp
        WHERE pp.kompensasi_id=k.id AND pp.status='diakui')"""), bind).mappings()
    for row in rows:
        for field in fields:
            before, after = row[field], data[field]
            try:
                changed = Decimal(str(before)) != Decimal(str(after)) if field == "nominal" else str(before) != str(after)
            except (InvalidOperation, ValueError):
                changed = True
            if changed:
                raise HTTPException(409, "Nilai, jatuh tempo, dan kerja sama tagihan dengan pendapatan yang sudah diakui tidak dapat diubah")


def _where_clause(filters: list[tuple[str, str, Any]], params: dict[str, Any]) -> str:
    clauses: list[str] = []
    for col, op, val in filters:
        _identifier(col)
        key = f"f_{col}_{op}"
        if op == "eq":
            clauses.append(f'"{col}" = :{key}')
            params[key] = val
        elif op == "neq":
            clauses.append(f'"{col}" != :{key}')
            params[key] = val
        elif op == "lte":
            clauses.append(f'"{col}" <= :{key}')
            params[key] = val
        elif op == "gte":
            clauses.append(f'"{col}" >= :{key}')
            params[key] = val
        elif op == "lt":
            clauses.append(f'"{col}" < :{key}')
            params[key] = val
        elif op == "gt":
            clauses.append(f'"{col}" > :{key}')
            params[key] = val
        elif op == "in":
            if not val:
                clauses.append("FALSE")
                continue
            placeholders = ", ".join(f":{key}_{i}" for i in range(len(val)))
            clauses.append(f'"{col}" IN ({placeholders})')
            for i, v in enumerate(val):
                params[f"{key}_{i}"] = v
    return " AND ".join(clauses) if clauses else "TRUE"


def _row_to_dict(row) -> dict:
    return dict(row._mapping)


def _attach_embeds(db: Session, table: str, rows: list[dict], embeds: list[tuple[str, str, str]]) -> None:
    for alias, embed_name, inner in embeds:
        lookup = embed_name if embed_name in EMBEDS.get(table, {}) else alias
        cfg = EMBEDS.get(table, {}).get(lookup)
        if not cfg:
            raise ValueError(f"Relasi {table}.{embed_name} tidak tersedia")
        child_table, fk = cfg["table"], cfg["fk"]
        is_parent = cfg["kind"] == "m2o"
        parent_key, child_key = (fk, "id") if is_parent else ("id", fk)
        ids = list({row[parent_key] for row in rows if row.get(parent_key) is not None})
        children: list[dict] = []
        if ids:
            stmt = text(f'SELECT * FROM "{child_table}" WHERE "{child_key}" IN :ids').bindparams(bindparam("ids", expanding=True))
            children = [_row_to_dict(row) for row in db.execute(stmt, {"ids": ids}).fetchall()]
        _, nested = parse_select(inner)
        _attach_embeds(db, child_table, children, nested)
        grouped: dict[Any, list[dict]] = {}
        for child in children:
            grouped.setdefault(child[child_key], []).append(child)
        for row in rows:
            matches = grouped.get(row.get(parent_key), [])
            row[alias] = (matches[0] if matches else None) if is_parent else matches


def query_rows(db: Session, table: str, params: dict[str, str]) -> list[dict]:
    assert table in ALLOWED_TABLES
    _, embeds = parse_select(params.get("select"))
    filters = parse_filters(params)
    orders = parse_order(params.get("order"))
    bind: dict[str, Any] = {}
    where = _where_clause(filters, bind)
    sql = f'SELECT * FROM "{table}" WHERE {where}'
    if orders:
        order_sql = ", ".join(f'"{_identifier(c)}" {"ASC" if asc else "DESC"}' for c, asc in orders)
        sql += f" ORDER BY {order_sql}"
    if params.get("limit"):
        sql += " LIMIT :_limit"
        bind["_limit"] = int(params["limit"])
    rows = db.execute(text(sql), bind).fetchall()
    result = [_row_to_dict(r) for r in rows]
    _attach_embeds(db, table, result, embeds)
    return result


def strip_generated(table: str, data: dict, *, preserve_null: bool = False) -> dict:
    skip = GENERATED_COLS.get(table, set())
    return {_identifier(k): v for k, v in data.items() if k not in skip and (preserve_null or v is not None)}


def insert_rows(db: Session, table: str, payload: list[dict] | dict, on_conflict: str | None = None, ignore_dup: bool = False, *, commit: bool = True) -> list[dict]:
    _lock_domain_write(db, table)
    conflict_cols = [_identifier(col.strip()) for col in on_conflict.split(",")] if on_conflict else []
    conflict_sql = ", ".join(f'"{col}"' for col in conflict_cols)
    rows = payload if isinstance(payload, list) else [payload]
    inserted: list[dict] = []
    for raw in rows:
        data = strip_generated(table, raw)
        cols = list(data.keys())
        if not cols:
            continue
        col_sql = ", ".join(f'"{c}"' for c in cols)
        val_sql = ", ".join(f":{c}" for c in cols)
        if on_conflict:
            if ignore_dup:
                sql = f'INSERT INTO "{table}" ({col_sql}) VALUES ({val_sql}) ON CONFLICT ({conflict_sql}) DO NOTHING RETURNING *'
            else:
                set_sql = ", ".join(f'"{c}" = EXCLUDED."{c}"' for c in cols if c not in conflict_cols)
                sql = f'INSERT INTO "{table}" ({col_sql}) VALUES ({val_sql}) ON CONFLICT ({conflict_sql}) DO UPDATE SET {set_sql} RETURNING *'
        else:
            sql = f'INSERT INTO "{table}" ({col_sql}) VALUES ({val_sql}) RETURNING *'
        row = db.execute(text(sql), data).fetchone()
        if row:
            inserted.append(_row_to_dict(row))
    if commit:
        if table == "kompensasi":
            from services.pendapatan_sync import sync_pendapatan
            sync_pendapatan(db)
        db.commit()
    return inserted


def update_rows(db: Session, table: str, payload: dict, params: dict[str, str], *, commit: bool = True) -> list[dict]:
    data = strip_generated(table, payload, preserve_null=True)
    if not data:
        return []
    filters = parse_filters(params)
    bind: dict[str, Any] = dict(data)
    where = _where_clause(filters, bind)
    if where == "TRUE":
        return []
    _lock_domain_write(db, table)
    if table == "kompensasi":
        from services.pendapatan_sync import sync_pendapatan
        sync_pendapatan(db)
        _guard_recognized_update(db, data, where, bind)
    set_sql = ", ".join(f'"{k}" = :{k}' for k in data)
    sql = f'UPDATE "{table}" SET {set_sql} WHERE {where} RETURNING *'
    rows = db.execute(text(sql), bind).fetchall()
    if commit:
        if table == "kompensasi":
            from services.pendapatan_sync import sync_pendapatan
            sync_pendapatan(db)
        db.commit()
    return [_row_to_dict(r) for r in rows]


def delete_rows(db: Session, table: str, params: dict[str, str], *, commit: bool = True) -> None:
    filters = parse_filters(params)
    bind: dict[str, Any] = {}
    where = _where_clause(filters, bind)
    if where == "TRUE":
        return
    _lock_domain_write(db, table)
    if table == "kompensasi":
        from services.pendapatan_sync import sync_pendapatan
        sync_pendapatan(db)
        linked = db.execute(text(f'SELECT 1 FROM pengakuan_pendapatan WHERE kompensasi_id IN (SELECT id FROM kompensasi WHERE {where}) AND status = :recognized LIMIT 1'), {**bind, "recognized": "diakui"}).first()
        if linked:
            raise HTTPException(409, "Tagihan dengan pendapatan yang sudah diakui tidak dapat dihapus")
        empty_parent_candidates = db.execute(text(f'SELECT DISTINCT pddm_id FROM pengakuan_pendapatan WHERE kompensasi_id IN (SELECT id FROM kompensasi WHERE {where}) AND status = :projected'), {**bind, "projected": "proyeksi"}).scalars().all()
        db.execute(text(f'DELETE FROM pengakuan_pendapatan WHERE kompensasi_id IN (SELECT id FROM kompensasi WHERE {where}) AND status = :projected'), {**bind, "projected": "proyeksi"})
    db.execute(text(f'DELETE FROM "{table}" WHERE {where}'), bind)
    if table == "kompensasi" and empty_parent_candidates:
        cleanup = text("""DELETE FROM pendapatan_diterima_dimuka
            WHERE id IN :ids
              AND NOT EXISTS (SELECT 1 FROM pengakuan_pendapatan pp WHERE pp.pddm_id=pendapatan_diterima_dimuka.id)
              AND NOT EXISTS (SELECT 1 FROM kompensasi k WHERE k.ks_id=pendapatan_diterima_dimuka.ks_id)""").bindparams(bindparam("ids", expanding=True))
        db.execute(cleanup, {"ids": empty_parent_candidates})

    if commit:
        if table == "kompensasi":
            from services.pendapatan_sync import sync_pendapatan
            sync_pendapatan(db)
        db.commit()
