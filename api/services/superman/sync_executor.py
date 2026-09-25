"""Jalankan Playwright sync API di thread khusus, bukan di worker thread FastAPI.

Playwright sync menolak thread yang masih memegang instance Playwright lain
("Sync API inside the asyncio loop"), dan objek browser terikat ke thread
pembuatnya. Captcha menahan browser tetap hidup antar-request, jadi semua
operasi captcha memakai SATU thread tersendiri; operasi sekali jalan
(cek session, recover, inspect) memakai pool terpisah yang selalu menutup
browsernya sendiri.
"""

from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from typing import Callable, TypeVar

_captcha_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="superman-captcha")
_oneshot_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="superman-pw")

T = TypeVar("T")


def _wait(future, timeout: float | None):
    try:
        return future.result(timeout=timeout)
    except FuturesTimeout as exc:
        future.cancel()
        raise RuntimeError("Timeout menunggu browser Superman di server. Coba lagi.") from exc


def run_playwright_sync(fn: Callable[..., T], /, *args, timeout: float | None = None, **kwargs) -> T:
    return _wait(_oneshot_executor.submit(fn, *args, **kwargs), timeout)


def run_captcha_sync(fn: Callable[..., T], /, *args, timeout: float | None = 120, **kwargs) -> T:
    return _wait(_captcha_executor.submit(fn, *args, **kwargs), timeout)
