"""Apply only GIS migrations with a checksum ledger.

This intentionally does not call the legacy migration runner, which replays the
application migration directory for older deployments.
"""
from __future__ import annotations

import argparse
import hashlib
import sys
from pathlib import Path

from sqlalchemy import text

# The script is run directly by the local Docker bootstrap as well as by
# operators. Add the application directory when Python only placed
# ``scripts/`` on sys.path.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from database import engine


ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "supabase" / "migrations"
GIS_FILES = (
    "029_gis_core.sql",
    "030_gis_operations.sql",
    "031_kerja_sama_skema.sql",
    "032_gis_immutability.sql",
    "033_gis_immutability_trigger_fix.sql",
    "034_gis_official_forest_cache.sql",
)


def checksum(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ensure_ledger(conn) -> None:
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS gis_schema_migrations (
          filename TEXT PRIMARY KEY,
          checksum TEXT NOT NULL,
          applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """))


def main() -> None:
    parser = argparse.ArgumentParser(description="Apply AsetOpt GIS migrations")
    parser.add_argument("--check", action="store_true", help="Only check the ledger")
    args = parser.parse_args()

    with engine.connect() as conn:
        ensure_ledger(conn)
        conn.commit()

    for filename in GIS_FILES:
        path = MIGRATIONS / filename
        digest = checksum(path)
        with engine.begin() as conn:
            ensure_ledger(conn)
            existing = conn.execute(
                text("SELECT checksum FROM gis_schema_migrations WHERE filename = :filename"),
                {"filename": filename},
            ).scalar_one_or_none()
            if existing:
                if existing != digest:
                    raise RuntimeError(f"Checksum migration berubah: {filename}")
                print(f"OK   {filename}")
                continue
            if args.check:
                print(f"PENDING {filename}")
                continue
            print(f"APPLY {filename}")
            conn.execute(text(path.read_text(encoding="utf-8")))
            conn.execute(
                text("INSERT INTO gis_schema_migrations (filename, checksum) VALUES (:filename, :checksum)"),
                {"filename": filename, "checksum": digest},
            )


if __name__ == "__main__":
    main()
