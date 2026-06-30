"""Import data dari Supabase REST API ke Railway PostgreSQL."""
from __future__ import annotations

import os
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv
from sqlalchemy import text

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
load_dotenv()
from database import engine

SUPABASE_URL = os.getenv("VITE_SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("VITE_SUPABASE_ANON_KEY", "")

TABLE_ORDER = [
    "aset",
    "njop",
    "penilaian_kjpp",
    "timeline_program",
    "prospek_mitra",
    "rkap_target",
    "kerja_sama",
    "kerja_sama_aset",
    "kompensasi",
    "pembayaran",
    "pbb",
    "pbb_objek",
    "cash_in",
    "surat_peringatan",
    "log_notifikasi",
    "katalog_aset",
    "katalog_aksesibilitas",
    "katalog_lingkungan",
    "katalog_skema",
    "katalog_foto",
    "pendapatan_diterima_dimuka",
    "pengakuan_pendapatan",
    "document_upload",
]

GENERATED_COLS: dict[str, set[str]] = {
    "penilaian_kjpp": {"total_nilai"},
    "kompensasi": {"nominal_ppn", "nominal_pph", "total_tagihan"},
    "pendapatan_diterima_dimuka": {"nilai_per_bulan", "sisa_dimuka"},
}


def fetch_table(client: httpx.Client, table: str) -> list[dict]:
    rows: list[dict] = []
    page_size = 1000
    offset = 0
    while True:
        headers = {
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Range": f"{offset}-{offset + page_size - 1}",
        }
        r = client.get(f"{SUPABASE_URL}/rest/v1/{table}", params={"select": "*"}, headers=headers)
        if r.status_code == 404:
            print(f"  SKIP {table} (not on Supabase)")
            return []
        r.raise_for_status()
        batch = r.json()
        if not batch:
            break
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size
    return rows


def strip_generated(table: str, row: dict) -> dict:
    skip = GENERATED_COLS.get(table, set())
    return {k: v for k, v in row.items() if k not in skip}


def insert_rows(conn, table: str, rows: list[dict]) -> int:
    if not rows:
        return 0
    cleaned = [strip_generated(table, r) for r in rows]
    cols = list(cleaned[0].keys())
    col_sql = ", ".join(f'"{c}"' for c in cols)
    placeholders = ", ".join(f":{c}" for c in cols)
    sql = text(f'INSERT INTO "{table}" ({col_sql}) VALUES ({placeholders}) ON CONFLICT (id) DO NOTHING')
    for row in cleaned:
        conn.execute(sql, row)
    return len(cleaned)


def truncate_all(conn) -> None:
    tables = ", ".join(f'"{t}"' for t in reversed(TABLE_ORDER))
    conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY tidak ada di .env")
        sys.exit(1)

    total = 0
    with httpx.Client(timeout=120.0) as client:
        with engine.begin() as conn:
            print("TRUNCATE existing data ...", flush=True)
            truncate_all(conn)

        for table in TABLE_ORDER:
            print(f"IMPORT {table} ...", end=" ", flush=True)
            rows = fetch_table(client, table)
            if not rows:
                print("0 rows")
                continue
            with engine.begin() as conn:
                n = insert_rows(conn, table, rows)
            total += n
            print(f"{n} rows")

    print(f"Done. Total rows imported: {total}")


if __name__ == "__main__":
    main()