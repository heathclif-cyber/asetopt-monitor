"""Simpan session login Superman untuk dipakai otomasi Playwright."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

API_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(API_DIR))

from dotenv import load_dotenv

load_dotenv(API_DIR / ".env")

from services.superman.auth import _save_session
from services.superman.config import SupermanConfig


def main() -> int:
    parser = argparse.ArgumentParser(description="Login Superman dan simpan session Playwright")
    parser.add_argument(
        "--manual",
        action="store_true",
        help="Buka browser (non-headless) — isi captcha manual lalu Enter",
    )
    args = parser.parse_args()

    cfg = SupermanConfig.from_env()
    if not cfg.username or not cfg.password:
        print("Set SUPERMAN_USER dan SUPERMAN_PASSWORD di api/.env")
        return 1

    path = _save_session(cfg, manual=args.manual)
    print(f"Session tersimpan: {path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())