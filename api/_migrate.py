import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy import text

load_dotenv()
from database import engine

SKIP = {
    "001_initial_schema.sql",
    "003_anon_policies.sql",
}

RLS_LINE = re.compile(
    r"^\s*(ALTER TABLE .+ ENABLE ROW LEVEL SECURITY|CREATE POLICY .+|FOR ALL TO (anon|authenticated).+)\s*;?\s*$",
    re.IGNORECASE,
)


def _migrations_dir() -> Path:
    env = os.getenv("MIGRATIONS_DIR", "").strip()
    if env:
        return Path(env)
    # Default: <repo>/supabase/migrations (saat dijalankan dari api/)
    return Path(__file__).resolve().parent.parent / "supabase" / "migrations"


def strip_supabase_rls(sql: str) -> str:
    sql = re.sub(
        r"DO\s+\$\$[\s\S]*?(pg_policies|TO anon)[\s\S]*?END\s+\$\$\s*;?",
        "",
        sql,
        flags=re.IGNORECASE,
    )
    sql = sql.replace("uuid_generate_v4()", "gen_random_uuid()")
    lines = []
    for line in sql.splitlines():
        if RLS_LINE.match(line):
            continue
        lines.append(line)
    return "\n".join(lines)


def main():
    migrations_dir = _migrations_dir()
    files = sorted(migrations_dir.glob("*.sql"))
    if not files:
        print(f"No migration files found in {migrations_dir}")
        sys.exit(1)

    print(f"Migrations dir: {migrations_dir}")
    with engine.begin() as conn:
        for path in files:
            if path.name in SKIP:
                print(f"SKIP {path.name}")
                continue
            sql = strip_supabase_rls(path.read_text(encoding="utf-8"))
            print(f"RUN  {path.name} ...", end=" ", flush=True)
            try:
                conn.execute(text(sql))
                print("OK")
            except Exception as e:
                print(f"FAIL: {e}")
                raise

    print("Done.")


if __name__ == "__main__":
    main()