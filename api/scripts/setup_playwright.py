"""Install browser Chromium untuk otomasi Superman (Playwright)."""

from __future__ import annotations

import subprocess
import sys


def main() -> int:
    print("Menginstall Chromium untuk Playwright...")
    result = subprocess.run(
        [sys.executable, "-m", "playwright", "install", "chromium"],
        check=False,
    )
    if result.returncode != 0:
        print("Gagal install Chromium. Coba: pip install playwright && playwright install chromium")
        return result.returncode
    print("Chromium siap. Jalankan API lalu uji /api/superman/status")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())