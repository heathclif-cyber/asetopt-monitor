"""Bootstrap the disposable local GIS database, then apply GIS-only migrations.

This is intentionally limited to the dedicated docker-compose.gis-dev.yml
volume. Existing/shared databases must use their normal baseline migration
process followed by ``scripts/migrate_gis.py`` only.
"""
from __future__ import annotations

import sys
from pathlib import Path

from sqlalchemy import text

# When run as ``python scripts/bootstrap_gis_dev.py``, Python only adds the
# scripts directory to sys.path. The application modules live one level up.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from _migrate import SKIP, strip_supabase_rls
from database import SessionLocal, engine
from services.auth_service import ensure_app_users_table, seed_default_users
from migrate_gis import MIGRATIONS, main as migrate_gis

LOCAL_ONLY_SKIP = {"023_revoke_anon_data_access.sql"}


def main() -> None:
    legacy_files = [
        path for path in sorted(MIGRATIONS.glob("*.sql"))
        if path.name < "029_gis_core.sql" and path.name not in SKIP and path.name not in LOCAL_ONLY_SKIP
    ]
    with engine.begin() as conn:
        # Legacy SQL predates a migration ledger and contains non-idempotent
        # triggers. A local GIS stack may be rebuilt many times against the
        # same named Docker volume, so replay it only for a fresh database.
        legacy_schema_exists = conn.execute(text("SELECT to_regclass('public.aset') IS NOT NULL")).scalar_one()
        if legacy_schema_exists:
            print("BOOTSTRAP legacy schema already present; skipping replay")
        else:
            for path in legacy_files:
                print(f"BOOTSTRAP {path.name}")
                conn.execute(text(strip_supabase_rls(path.read_text(encoding="utf-8"))))
    db = SessionLocal()
    try:
        ensure_app_users_table(db)
        seed_default_users(db)
        db.commit()
    finally:
        db.close()
    migrate_gis()


if __name__ == "__main__":
    main()
