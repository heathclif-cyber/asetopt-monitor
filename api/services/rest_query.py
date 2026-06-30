"""PostgREST-compatible query layer untuk migrasi dari Supabase."""
from __future__ import annotations

import re
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

ALLOWED_TABLES = {
    "aset", "njop", "penilaian_kjpp", "timeline_program", "prospek_mitra",
    "kerja_sama", "kerja_sama_aset", "kompensasi", "pembayaran", "pbb", "pbb_objek",
    "cash_in", "surat_peringatan", "log_notifikasi", "rkap_target",
    "katalog_aset", "katalog_aksesibilitas", "katalog_lingkungan", "katalog_skema", "katalog_foto",
    "pendapatan_diterima_dimuka", "pengakuan_pendapatan", "document_upload",
}

GENERATED_COLS: dict[str, set[str]] = {
    "penilaian_kjpp": {"total_nilai"},
    "kompensasi": {"nominal_ppn", "nominal_pph", "total_tagihan"},
    "pendapatan_diterima_dimuka": {"nilai_per_bulan", "sisa_dimuka"},
}

# parent_table -> embed_name -> config
EMBEDS: dict[str, dict[str, dict[str, Any]]] = {
    "kerja_sama": {
        "aset": {"kind": "m2o", "table": "aset", "fk": "aset_id"},
    },
    "kompensasi": {
        "pembayaran": {"kind": "o2m", "table": "pembayaran", "fk": "kompensasi_id"},
        "kerja_sama": {"kind": "m2o", "table": "kerja_sama", "fk": "ks_id"},
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

EMBED_RE = re.compile(r"^(?:(\w+):)?(\w+)\(([^)]*)\)$")


def parse_select(select: str | None) -> tuple[list[str], list[tuple[str, str, str]]]:
    """Return (base_cols, embeds) where embed = (alias, table, inner_select)."""
    if not select or select.strip() == "*":
        return ["*"], []
    parts = [p.strip() for p in select.split(",") if p.strip()]
    base_cols: list[str] = []
    embeds: list[tuple[str, str, str]] = []
    for part in parts:
        m = EMBED_RE.match(part)
        if m:
            alias, table, inner = m.group(1) or m.group(2), m.group(2), m.group(3).strip() or "*"
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


def _where_clause(filters: list[tuple[str, str, Any]], params: dict[str, Any]) -> str:
    clauses: list[str] = []
    for col, op, val in filters:
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
            placeholders = ", ".join(f":{key}_{i}" for i in range(len(val)))
            clauses.append(f'"{col}" IN ({placeholders})')
            for i, v in enumerate(val):
                params[f"{key}_{i}"] = v
    return " AND ".join(clauses) if clauses else "TRUE"


def _row_to_dict(row) -> dict:
    return dict(row._mapping)


def _fetch_embed(db: Session, parent_table: str, embed_name: str, parent_row: dict, inner_select: str):
    cfg = EMBEDS.get(parent_table, {}).get(embed_name)
    if not cfg:
        return None
    table = cfg["table"]
    fk = cfg["fk"]
    kind = cfg["kind"]
    _, child_embeds = parse_select(inner_select)

    if kind == "m2o":
        fk_val = parent_row.get(fk)
        if not fk_val:
            return None
        sql = text(f'SELECT * FROM "{table}" WHERE id = :id LIMIT 1')
        row = db.execute(sql, {"id": fk_val}).fetchone()
        if not row:
            return None
        data = _row_to_dict(row)
        for alias, cname, inner in child_embeds:
            embedded = _fetch_embed(db, table, cname if cname in EMBEDS.get(table, {}) else alias, data, inner)
            if embedded is not None:
                data[alias] = embedded
        return data

    parent_id = parent_row.get("id")
    if not parent_id:
        return []
    sql = text(f'SELECT * FROM "{table}" WHERE "{fk}" = :pid')
    rows = db.execute(sql, {"pid": parent_id}).fetchall()
    result = []
    for row in rows:
        data = _row_to_dict(row)
        for alias, cname, inner in child_embeds:
            embedded = _fetch_embed(db, table, cname if cname in EMBEDS.get(table, {}) else alias, data, inner)
            if embedded is not None:
                data[alias] = embedded
        result.append(data)
    return result


def query_rows(db: Session, table: str, params: dict[str, str]) -> list[dict]:
    assert table in ALLOWED_TABLES
    _, embeds = parse_select(params.get("select"))
    filters = parse_filters(params)
    orders = parse_order(params.get("order"))
    bind: dict[str, Any] = {}
    where = _where_clause(filters, bind)
    sql = f'SELECT * FROM "{table}" WHERE {where}'
    if orders:
        order_sql = ", ".join(f'"{c}" {"ASC" if asc else "DESC"}' for c, asc in orders)
        sql += f" ORDER BY {order_sql}"
    if params.get("limit"):
        sql += " LIMIT :_limit"
        bind["_limit"] = int(params["limit"])
    rows = db.execute(text(sql), bind).fetchall()
    result = [_row_to_dict(r) for r in rows]
    for row in result:
        for alias, embed_table, inner in embeds:
            key = alias if alias != embed_table else alias
            lookup = embed_table if embed_table in EMBEDS.get(table, {}) else alias
            embedded = _fetch_embed(db, table, lookup, row, inner)
            if embedded is not None:
                row[key] = embedded
    return result


def strip_generated(table: str, data: dict) -> dict:
    skip = GENERATED_COLS.get(table, set())
    return {k: v for k, v in data.items() if k not in skip and v is not None}


def insert_rows(db: Session, table: str, payload: list[dict] | dict, on_conflict: str | None = None, ignore_dup: bool = False) -> list[dict]:
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
                sql = f'INSERT INTO "{table}" ({col_sql}) VALUES ({val_sql}) ON CONFLICT ({on_conflict}) DO NOTHING RETURNING *'
            else:
                set_sql = ", ".join(f'"{c}" = EXCLUDED."{c}"' for c in cols if c not in on_conflict.split(","))
                sql = f'INSERT INTO "{table}" ({col_sql}) VALUES ({val_sql}) ON CONFLICT ({on_conflict}) DO UPDATE SET {set_sql} RETURNING *'
        else:
            sql = f'INSERT INTO "{table}" ({col_sql}) VALUES ({val_sql}) RETURNING *'
        row = db.execute(text(sql), data).fetchone()
        if row:
            inserted.append(_row_to_dict(row))
    db.commit()
    return inserted


def update_rows(db: Session, table: str, payload: dict, params: dict[str, str]) -> list[dict]:
    data = strip_generated(table, payload)
    filters = parse_filters(params)
    bind: dict[str, Any] = dict(data)
    where = _where_clause(filters, bind)
    if where == "TRUE":
        return []
    set_sql = ", ".join(f'"{k}" = :{k}' for k in data)
    sql = f'UPDATE "{table}" SET {set_sql} WHERE {where} RETURNING *'
    rows = db.execute(text(sql), bind).fetchall()
    db.commit()
    return [_row_to_dict(r) for r in rows]


def delete_rows(db: Session, table: str, params: dict[str, str]) -> None:
    filters = parse_filters(params)
    bind: dict[str, Any] = {}
    where = _where_clause(filters, bind)
    if where == "TRUE":
        return
    db.execute(text(f'DELETE FROM "{table}" WHERE {where}'), bind)
    db.commit()