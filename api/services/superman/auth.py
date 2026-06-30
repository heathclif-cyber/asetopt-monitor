from __future__ import annotations

import os
from pathlib import Path

from playwright.sync_api import BrowserContext, Page, sync_playwright

from services.superman.captcha import solve_math_captcha
from services.superman.config import SupermanConfig


class SupermanCaptchaError(RuntimeError):
    """Login gagal karena captcha OCR tidak berhasil."""


class SupermanCaptchaRequired(RuntimeError):
    """Session Superman belum ada — user harus isi captcha lewat UI."""


def _is_login_page(page: Page) -> bool:
    return page.locator("#signin-username").count() > 0


def _max_captcha_attempts() -> int:
    return int(os.getenv("SUPERMAN_CAPTCHA_MAX_ATTEMPTS", "40"))


def _session_check_url(cfg: SupermanConfig) -> str:
    return f"{cfg.base_url.rstrip('/')}/sppd"


def is_session_valid(cfg: SupermanConfig, state_path: Path) -> bool:
    if not state_path.is_file():
        return False
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(storage_state=str(state_path))
            page = context.new_page()
            page.goto(_session_check_url(cfg), wait_until="domcontentloaded", timeout=30000)
            page.wait_for_timeout(1500)
            valid = not _is_login_page(page)
            browser.close()
        return valid
    except Exception:
        return False


def login(page: Page, cfg: SupermanConfig, max_attempts: int | None = None) -> bool:
    attempts = max_attempts or _max_captcha_attempts()
    page.goto(cfg.base_url, wait_until="networkidle", timeout=60000)
    last_raw: str | None = None
    for _ in range(attempts):
        page.fill("#signin-username", cfg.username)
        page.fill("#signin-password", cfg.password)
        img_src = page.locator('img[src*="captcha"]').first.get_attribute("src") or ""
        if img_src.startswith("/"):
            img_src = cfg.base_url.rstrip("/") + img_src
        body = page.request.get(img_src).body()
        answer, raw = solve_math_captcha(body)
        last_raw = raw
        if not answer:
            page.click("#reload")
            page.wait_for_timeout(600)
            continue
        page.fill("#captcha", answer)
        page.click('button[type="submit"]')
        page.wait_for_load_state("networkidle", timeout=20000)
        page.wait_for_timeout(1200)
        if not _is_login_page(page):
            return True
        page.goto(cfg.base_url, wait_until="networkidle")
    raise SupermanCaptchaError(
        f"Login Superman gagal setelah {attempts} percobaan captcha (terakhir OCR={last_raw!r}). "
        "Jalankan `python scripts/superman_login.py --manual` di komputer lokal untuk menyimpan session, "
        "lalu pasang file session ke Railway (SUPERMAN_STATE_PATH + volume)."
    )


def login_manual(page: Page, cfg: SupermanConfig, timeout_ms: int = 300_000) -> bool:
    page.goto(cfg.base_url, wait_until="networkidle", timeout=60000)
    page.fill("#signin-username", cfg.username)
    page.fill("#signin-password", cfg.password)
    page.wait_for_function(
        "() => !document.querySelector('#signin-username')",
        timeout=timeout_ms,
    )
    return True


def _save_session(cfg: SupermanConfig, *, manual: bool = False) -> str:
    state_path = Path(cfg.state_path)
    state_path.parent.mkdir(parents=True, exist_ok=True)
    if not cfg.username or not cfg.password:
        raise RuntimeError("Set SUPERMAN_USER dan SUPERMAN_PASSWORD di .env")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not manual, slow_mo=200 if manual else 0)
        context = browser.new_context()
        page = context.new_page()
        if manual:
            login_manual(page, cfg)
        else:
            login(page, cfg)
        context.storage_state(path=str(state_path))
        browser.close()
    return str(state_path)


def _auto_login_enabled() -> bool:
    return os.getenv("SUPERMAN_AUTO_LOGIN", "").lower() in ("1", "true", "yes")


def ensure_session(cfg: SupermanConfig, *, auto_login: bool | None = None) -> str:
    state_path = Path(cfg.state_path)
    state_path.parent.mkdir(parents=True, exist_ok=True)
    force = os.getenv("SUPERMAN_FORCE_LOGIN", "").lower() in ("1", "true", "yes")
    use_auto = _auto_login_enabled() if auto_login is None else auto_login

    if state_path.exists() and not force:
        if is_session_valid(cfg, state_path):
            return str(state_path)
        state_path.unlink(missing_ok=True)

    if not use_auto:
        raise SupermanCaptchaRequired(
            "Session Superman belum aktif. Isi captcha login Superman terlebih dahulu."
        )

    return _save_session(cfg, manual=False)


def open_authenticated_context(cfg: SupermanConfig) -> tuple:
    """Return (playwright_manager, browser, context) — caller must close."""
    state = ensure_session(cfg)
    p = sync_playwright().start()
    browser = p.chromium.launch(headless=cfg.headless, slow_mo=cfg.slow_mo_ms)
    context: BrowserContext = browser.new_context(storage_state=state)
    return p, browser, context