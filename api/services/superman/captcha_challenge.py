"""Tantangan captcha Superman — browser tetap hidup sampai user menjawab."""

from __future__ import annotations

import base64
import time
import uuid
from dataclasses import dataclass
from pathlib import Path
from threading import Lock
from typing import Any, Literal

from playwright.sync_api import Page, sync_playwright

from services.superman.auth import _is_login_page
from services.superman.config import SupermanConfig

TTL_SECONDS = 300
LoginFailureKind = Literal["captcha", "credentials", "lockout", "unknown"]


@dataclass
class PendingCaptcha:
    pw: Any
    browser: Any
    page: Page
    cfg: SupermanConfig
    created_at: float


_store: dict[str, PendingCaptcha] = {}
_lock = Lock()


def _dispose(challenge_id: str) -> None:
    entry = _store.pop(challenge_id, None)
    if not entry:
        return
    try:
        entry.browser.close()
    except Exception:
        pass
    try:
        entry.pw.stop()
    except Exception:
        pass


def _cleanup_expired() -> None:
    now = time.time()
    with _lock:
        expired = [key for key, entry in _store.items() if now - entry.created_at > TTL_SECONDS]
    for key in expired:
        _dispose(key)


def _get_entry(challenge_id: str) -> PendingCaptcha:
    _cleanup_expired()
    with _lock:
        entry = _store.get(challenge_id)
    if not entry:
        raise ValueError("Tantangan captcha kedaluwarsa. Muat ulang captcha.")
    if time.time() - entry.created_at > TTL_SECONDS:
        _dispose(challenge_id)
        raise ValueError("Tantangan captcha kedaluwarsa. Muat ulang captcha.")
    return entry


def _fill_credentials(page: Page, cfg: SupermanConfig) -> None:
    page.evaluate(
        """([user, password]) => {
            const userEl = document.querySelector('#signin-username');
            const passEl = document.querySelector('#signin-password');
            if (userEl) {
                userEl.value = user;
                userEl.dispatchEvent(new Event('input', { bubbles: true }));
            }
            if (passEl) {
                passEl.value = password;
                passEl.dispatchEvent(new Event('input', { bubbles: true }));
            }
        }""",
        [cfg.username, cfg.password],
    )


def _captcha_image(page: Page) -> bytes:
    """Screenshot elemen captcha di halaman — sama persis dengan yang divalidasi server."""
    img = page.locator(".captcha img").first
    img.wait_for(state="visible", timeout=10000)
    return img.screenshot(type="png")


def _image_payload(body: bytes, challenge_id: str) -> dict[str, Any]:
    return {
        "challenge_id": challenge_id,
        "image_base64": base64.b64encode(body).decode("ascii"),
        "mime_type": "image/png",
    }


def _page_error_text(page: Page) -> str:
    selectors = (
        ".alert-danger",
        ".text-danger strong",
        "form .text-danger",
        ".help-block",
        "#countdown",
    )
    messages: list[str] = []
    for selector in selectors:
        locator = page.locator(selector)
        for i in range(min(locator.count(), 3)):
            try:
                text = locator.nth(i).inner_text(timeout=500).strip()
            except Exception:
                continue
            if text and text not in messages:
                messages.append(text)
    return " ".join(messages)


def _classify_login_failure(page: Page) -> tuple[LoginFailureKind, str]:
    if not _is_login_page(page):
        return "unknown", ""

    body_text = page.locator("body").inner_text(timeout=2000).lower()
    page_error = _page_error_text(page)
    combined = f"{body_text} {page_error.lower()}"

    if "gagal login lebih dari" in combined or "coba lagi dalam" in combined:
        return "lockout", (
            page_error
            or "Akun Superman terkunci sementara karena terlalu banyak percobaan gagal. Tunggu beberapa menit."
        )

    if any(word in combined for word in ("password", "username", "user", "kata sandi")):
        return (
            "credentials",
            page_error
            or "Username atau password Superman salah. Periksa SUPERMAN_USER dan SUPERMAN_PASSWORD di Railway.",
        )

    if "captcha" in combined:
        return "captcha", page_error or "Captcha salah. Selesaikan hitungan pada gambar lalu coba lagi."

    if page_error:
        if "captcha" in page_error.lower():
            return "captcha", page_error
        return "unknown", page_error

    return "captcha", "Login gagal. Pastikan jawaban captcha adalah hasil hitungan (angka saja)."


def _submit_login(page: Page, cfg: SupermanConfig, answer: str) -> None:
    _fill_credentials(page, cfg)
    page.locator("#captcha").fill("")
    page.fill("#captcha", answer.strip())
    with page.expect_navigation(wait_until="networkidle", timeout=30000):
        page.locator("form.form-auth-small button[type='submit']").click()
    page.wait_for_timeout(1500)


def start_captcha_challenge(cfg: SupermanConfig) -> dict[str, Any]:
    if not cfg.username or not cfg.password:
        raise RuntimeError("Set SUPERMAN_USER dan SUPERMAN_PASSWORD di environment.")

    _cleanup_expired()
    pw = sync_playwright().start()
    browser = pw.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto(cfg.base_url, wait_until="networkidle", timeout=60000)
    _fill_credentials(page, cfg)
    body = _captcha_image(page)
    challenge_id = str(uuid.uuid4())
    with _lock:
        _store[challenge_id] = PendingCaptcha(
            pw=pw,
            browser=browser,
            page=page,
            cfg=cfg,
            created_at=time.time(),
        )
    return _image_payload(body, challenge_id)


def refresh_captcha_challenge(challenge_id: str) -> dict[str, Any]:
    entry = _get_entry(challenge_id)
    page = entry.page
    page.click("#reload")
    page.wait_for_timeout(900)
    page.locator(".captcha img").first.wait_for(state="visible", timeout=10000)
    _fill_credentials(page, entry.cfg)
    body = _captcha_image(page)
    entry.created_at = time.time()
    return _image_payload(body, challenge_id)


def verify_captcha_challenge(challenge_id: str, answer: str) -> dict[str, Any]:
    entry = _get_entry(challenge_id)
    page = entry.page
    cfg = entry.cfg

    try:
        _submit_login(page, cfg, answer)
    except Exception:
        page.wait_for_timeout(1500)

    if not _is_login_page(page):
        path = Path(cfg.state_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        page.context.storage_state(path=str(path))
        _dispose(challenge_id)
        return {"ok": True, "session_valid": True}

    kind, message = _classify_login_failure(page)
    if kind in ("credentials", "lockout"):
        return {
            "ok": False,
            "error": message,
            "failure_kind": kind,
            "challenge_id": challenge_id,
            "credential_hint": {
                "username": cfg.username,
                "password_length": len(cfg.password),
            },
            **_image_payload(_captcha_image(page), challenge_id),
        }

    body = refresh_captcha_challenge(challenge_id)
    return {
        "ok": False,
        "error": message,
        "failure_kind": kind,
        **body,
    }