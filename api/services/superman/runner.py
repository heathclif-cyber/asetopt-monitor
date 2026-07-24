"""Jalankan otomasi Superman — dipanggil dari API."""

from __future__ import annotations

import json
import os
import re
import threading
from dataclasses import asdict
from pathlib import Path
from typing import Any

from services.superman.auth import (
    SupermanCaptchaError,
    SupermanCaptchaRequired,
    ensure_session,
    is_session_valid,
    open_authenticated_context,
)
from services.superman.captcha_challenge import (
    refresh_captcha_challenge,
    start_captcha_challenge,
    verify_captcha_challenge,
)
from services.superman.config import SupermanConfig
from services.superman.documents import resolve_support_docs_from_kompensasi
from services.superman.filler import fill_sppn_draft, submit_sppn_draft
from services.superman.payload import build_payload_from_kompensasi
from services.superman.persist import (
    assert_kompensasi_not_submitted,
    format_superman_ref,
    get_kompensasi_superman,
    save_superman_to_kompensasi,
)
from services.superman.progress import (
    ProgressCallback,
    complete_job,
    create_job,
    fail_job,
    get_job,
    make_progress_callback,
    update_job,
)


class SupermanNotConfiguredError(RuntimeError):
    pass


def is_configured() -> bool:
    has_user = bool(os.getenv("SUPERMAN_USER", "").strip())
    has_password = bool(
        os.getenv("SUPERMAN_PASSWORD", "").strip() or os.getenv("SUPERMAN_PASSWORD_B64", "").strip()
    )
    return has_user and has_password


def _api_config() -> SupermanConfig:
    if not is_configured():
        raise SupermanNotConfiguredError(
            "Superman belum dikonfigurasi. Set SUPERMAN_USER dan SUPERMAN_PASSWORD di environment."
        )
    data = asdict(SupermanConfig.from_env())
    data["headless"] = True
    data["slow_mo_ms"] = 0
    return SupermanConfig(**data)


def check_playwright_ready() -> tuple[bool, str | None]:
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            browser.close()
        return True, None
    except Exception as exc:
        return False, str(exc)


def get_status() -> dict[str, Any]:
    cfg = SupermanConfig.from_env()
    state = Path(cfg.state_path)
    session_valid = is_session_valid(cfg, state) if state.is_file() else False
    using_b64 = bool(os.getenv("SUPERMAN_PASSWORD_B64", "").strip())
    playwright_ready, playwright_error = check_playwright_ready()
    return {
        "configured": is_configured(),
        "session_exists": state.is_file(),
        "session_valid": session_valid,
        "session_path": str(state),
        "base_url": cfg.base_url.rstrip("/"),
        "headless": cfg.headless,
        "playwright_ready": playwright_ready,
        "playwright_error": playwright_error,
        "credential_hint": {
            "username": cfg.username,
            "password_length": len(cfg.password),
            "password_from_b64": using_b64,
        },
        "captcha_hint": (
            None
            if session_valid
            else "Isi captcha login Superman melalui dialog di Input Pembayaran."
        ),
    }


def preview_deklarasi(*, kompensasi_id: str) -> dict[str, Any]:
    payload = build_payload_from_kompensasi(kompensasi_id)
    supports = resolve_support_docs_from_kompensasi(kompensasi_id)
    data = payload.to_dict()
    data["support_docs"] = [{"path": str(doc.path), "source": doc.describe()} for doc in supports]
    return data


def _normalize_match_text(value: Any) -> str:
    return str(value or "").strip().lower()


def _todo_row_blob(row: dict[str, Any]) -> str:
    return json.dumps(row, ensure_ascii=False).lower()


def _norm_date_key(value: str) -> str:
    text = _normalize_match_text(value)
    if not text:
        return ""
    # yyyy-mm-dd
    if len(text) >= 10 and text[4] == "-" and text[7] == "-":
        return text[:10]
    # dd-mm-yyyy
    if len(text) >= 10 and text[2] == "-" and text[5] == "-":
        parts = text.split("-", 2)
        if len(parts) == 3:
            d, m, y = parts
            return f"{y}-{m.zfill(2)}-{d.zfill(2)}"[:10]
    # dd/mm/yyyy or d/m/yyyy
    if "/" in text:
        parts = text.split("/")
        if len(parts) == 3 and len(parts[2]) >= 4:
            d, m, y = parts[0], parts[1], parts[2][:4]
            return f"{y}-{m.zfill(2)}-{d.zfill(2)}"
    digits = re.sub(r"\D", "", text)
    if len(digits) == 8:
        # try ddmmyyyy
        return f"{digits[4:8]}-{digits[2:4]}-{digits[0:2]}"
    return text


def _payload_refs(payload) -> list[str]:
    """Kandidat referensi yang diisi ke form Superman (urutan prioritas)."""
    seen: set[str] = set()
    refs: list[str] = []
    for raw in (
        getattr(payload, "ba_au58", None),
        getattr(payload, "no_pembayaran", None),
        getattr(payload, "no_invoice", None),
        getattr(payload, "referensi", None),
        getattr(payload, "kompensasi_id", None),
    ):
        text = str(raw or "").strip()
        if not text or text == "-":
            continue
        key = text.lower()
        if key in seen:
            continue
        seen.add(key)
        refs.append(text)
    return refs


def _parse_todo_rows(body: Any) -> list[dict[str, Any]]:
    """Normalisasi berbagai bentuk response /sppd/getTodo."""
    if body is None:
        return []
    if isinstance(body, list):
        return [row for row in body if isinstance(row, dict)]
    if not isinstance(body, dict):
        return []
    for key in ("data", "rows", "result", "todo", "items"):
        val = body.get(key)
        if isinstance(val, list):
            return [row for row in val if isinstance(row, dict)]
        if isinstance(val, dict):
            for k2 in ("data", "rows", "items", "list"):
                nested = val.get(k2)
                if isinstance(nested, list):
                    return [row for row in nested if isinstance(row, dict)]
    return []


def _score_todo_row(
    row: dict[str, Any],
    *,
    refs: list[str],
    no_kontrak: str,
    mitra_pembeli: str,
    total_sppn: int,
    expect_sppb: bool,
    tanggal_transfer: str = "",
) -> int:
    blob = _todo_row_blob(row)
    score = 0
    refs_n = [_normalize_match_text(r) for r in refs if r]
    no_kontrak_n = _normalize_match_text(no_kontrak)
    mitra_n = _normalize_match_text(mitra_pembeli)

    for ref_n in refs_n:
        if ref_n and ref_n in blob:
            score += 1000
            break

    ref_fields = (
        "berita_acara",
        "au58",
        "au58_sppn",
        "au58_sppb",
        "referensi",
        "referensi_sppn",
        "referensi_sppb",
        "referensi_spp",
        "sp_opl",
        "sp_opl_sppn",
        "sp_opl_sppb",
        "kwitansi",
        "kwitansi_sppn",
        "kwitansi_spp",
        "keterangan",
        "uraian",
        "sppn_uraian",
        "sppn_uraian2",
        "nomor",
        "nomor_spp",
        "no_spp",
        "no_pembayaran",
        "ba_au58",
    )
    for field in ref_fields:
        val = _normalize_match_text(row.get(field))
        if not val:
            continue
        for ref_n in refs_n:
            if ref_n and (ref_n == val or ref_n in val or val in ref_n):
                score += 800
                break

    if no_kontrak_n and no_kontrak_n in blob:
        score += 100
    if mitra_n and len(mitra_n) >= 3 and mitra_n in blob:
        score += 40
    if row.get("sppn_no") or row.get("no_sppn"):
        score += 5
    # Jangan hukuman berat: SPPb sering belakangan muncul di To Do
    if expect_sppb and (row.get("sppb_no") or row.get("no_sppb")):
        score += 10

    def _parse_amount(raw: Any) -> int | None:
        if raw is None:
            return None
        if isinstance(raw, (int, float)):
            return int(round(float(raw)))
        text = str(raw).strip()
        if not text:
            return None
        # Format ID: 750.000.000 atau 750,000,000
        digits = re.sub(r"[^\d]", "", text)
        if digits and (text.count(".") >= 1 or text.count(",") >= 1 or digits == text):
            try:
                return int(digits)
            except ValueError:
                pass
        try:
            return int(round(float(text.replace(",", ""))))
        except (TypeError, ValueError):
            return None

    amount_matched = False
    for amount_field in (
        "sppn_jumlah",
        "sppb_total",
        "total",
        "jumlah",
        "nominal",
        "sppn_total",
        "total_sppn",
        "nilai",
    ):
        amount = _parse_amount(row.get(amount_field))
        if amount is None:
            continue
        if total_sppn > 0 and abs(amount - total_sppn) <= 1:
            score += 50
            amount_matched = True
            break

    tanggal_key = _norm_date_key(tanggal_transfer)
    tanggal_matched = False
    for date_field in (
        "sppn_tanggal",
        "tanggal",
        "tanggal_sppn",
        "tanggal_sppb",
        "tgl_sppn",
        "created_at",
        "tgl",
    ):
        row_key = _norm_date_key(str(row.get(date_field) or ""))
        if tanggal_key and row_key and tanggal_key == row_key:
            score += 30
            tanggal_matched = True
            break

    # Soft penalty saja — jangan nol-kan skor (ini yang bikin match gagal total)
    if tanggal_key and not tanggal_matched and score < 800:
        score = max(0, score - 15)

    # Baris baru tanpa nomor sama sekali: turunkan prioritas, jangan buang total
    if not (row.get("sppn_no") or row.get("no_sppn") or row.get("sppb_no") or row.get("no_sppb")):
        if score < 100 and not amount_matched:
            return 0
    return score


_SPPN_NO_RE = re.compile(
    r"((?:R\d+/R\d+D/SPPn/|\d+(?:\.\d+)?/SPPn/)[^\s\"'<>]+)",
    re.I,
)
_SPPB_NO_RE = re.compile(
    r"((?:R\d+/R\d+D/SPPb/|\d+(?:\.\d+)?/SPP[BG]/)[^\s\"'<>]+)",
    re.I,
)


def _extract_numbers_from_blob(text: str) -> tuple[str | None, str | None]:
    if not text:
        return None, None
    sppb_m = _SPPB_NO_RE.search(text)
    sppn_m = _SPPN_NO_RE.search(text)
    return (
        sppb_m.group(1) if sppb_m else None,
        sppn_m.group(1) if sppn_m else None,
    )


def _extract_numbers_from_page(page) -> tuple[str | None, str | None]:
    try:
        url = page.url or ""
        body = page.content()
    except Exception:
        return None, None
    return _extract_numbers_from_blob(f"{url}\n{body}")


def _coalesce_spp_numbers(
    *,
    store_sppb: str | None,
    store_sppn: str | None,
    match: dict[str, Any] | None,
    store_body: Any,
) -> tuple[str | None, str | None]:
    sppb_no = store_sppb
    sppn_no = store_sppn
    if match:
        sppb_no = match.get("sppb_no") or match.get("no_sppb") or sppb_no
        sppn_no = match.get("sppn_no") or match.get("no_sppn") or sppn_no
        blob_sppb, blob_sppn = _extract_numbers_from_blob(_todo_row_blob(match))
        sppb_no = sppb_no or blob_sppb
        sppn_no = sppn_no or blob_sppn
    if store_body is not None and (not sppb_no or not sppn_no):
        body_sppb, body_sppn = _extract_numbers_from_store(store_body)
        sppb_no = sppb_no or body_sppb
        sppn_no = sppn_no or body_sppn
    if not sppb_no or not sppn_no:
        combined = json.dumps({"store": store_body, "match": match}, ensure_ascii=False, default=str)
        blob_sppb, blob_sppn = _extract_numbers_from_blob(combined)
        sppb_no = sppb_no or blob_sppb
        sppn_no = sppn_no or blob_sppn
    return (
        str(sppb_no).strip() if sppb_no else None,
        str(sppn_no).strip() if sppn_no else None,
    )


def _extract_numbers_from_store(body: Any) -> tuple[str | None, str | None]:
    def walk(node: Any) -> tuple[str | None, str | None]:
        sppb_no: str | None = None
        sppn_no: str | None = None
        if isinstance(node, dict):
            for key, value in node.items():
                key_l = str(key).lower()
                if value and isinstance(value, (str, int, float)):
                    text = str(value).strip()
                    if not text:
                        continue
                    if key_l in {"sppb_no", "no_sppb", "nomor_sppb", "no_sppb_draft"}:
                        sppb_no = text
                    elif key_l in {"sppn_no", "no_sppn", "nomor_sppn", "nomor", "no_spp", "no_sppn_draft"}:
                        if "sppn" in text.lower() or key_l != "nomor" or "/sppn/" in text.lower():
                            sppn_no = text
                    elif key_l in {"message", "msg", "info"} and isinstance(text, str):
                        blob_sppb, blob_sppn = _extract_numbers_from_blob(text)
                        sppb_no = sppb_no or blob_sppb
                        sppn_no = sppn_no or blob_sppn
                child_sppb, child_sppn = walk(value)
                sppb_no = sppb_no or child_sppb
                sppn_no = sppn_no or child_sppn
        elif isinstance(node, list):
            for item in node:
                child_sppb, child_sppn = walk(item)
                sppb_no = sppb_no or child_sppb
                sppn_no = sppn_no or child_sppn
        return sppb_no, sppn_no

    if isinstance(body, str):
        text = body.strip()
        if not text:
            return None, None
        try:
            body = json.loads(text)
        except json.JSONDecodeError:
            sppn_m = _SPPN_NO_RE.search(text)
            sppb_m = _SPPB_NO_RE.search(text)
            return (sppb_m.group(1) if sppb_m else None, sppn_m.group(1) if sppn_m else None)
    return walk(body)


def _score_all_todo_rows(rows: list[Any], payload, *, expect_sppb: bool) -> list[tuple[int, dict[str, Any]]]:
    total_sppn = int(payload.dpp_pokok or 0) + int(payload.pajak_ppn or 0)
    refs = _payload_refs(payload)
    scored: list[tuple[int, dict[str, Any]]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        score = _score_todo_row(
            row,
            refs=refs,
            no_kontrak=payload.no_kontrak,
            mitra_pembeli=payload.mitra_pembeli,
            total_sppn=total_sppn,
            expect_sppb=expect_sppb,
            tanggal_transfer=payload.tanggal_transfer,
        )
        if score > 0:
            scored.append((score, row))
    scored.sort(
        key=lambda item: (
            item[0],
            int(item[1].get("sppn_id") or item[1].get("spp_id") or item[1].get("id") or 0),
        ),
        reverse=True,
    )
    return scored


def _fetch_todo_rows(page, base_url: str, *, timeout_ms: int = 15000) -> list[dict[str, Any]]:
    """Ambil To Do List dengan timeout ketat agar job tidak menggantung di Railway."""
    url = f"{base_url.rstrip('/')}/sppd/getTodo"
    try:
        resp = page.request.get(url, timeout=timeout_ms)
    except Exception:
        return []
    if not resp.ok:
        return []
    try:
        body = resp.json()
    except Exception:
        try:
            text = resp.text()
            body = json.loads(text) if text else None
        except Exception:
            return []
    return _parse_todo_rows(body)


def _find_todo_match(
    page,
    base_url: str,
    payload,
    *,
    expect_sppb: bool,
    retries: int = 8,
    delay_ms: int = 1500,
    on_progress: ProgressCallback | None = None,
    min_score: int = 50,
    early_score: int = 800,
):
    """Cari baris To Do yang cocok. Selalu return dalam batas waktu (tidak hang)."""
    import time

    best = None
    best_score = 0
    total_sppn = int(payload.dpp_pokok or 0) + int(payload.pajak_ppn or 0)
    refs = _payload_refs(payload)
    deadline = time.time() + max(8.0, retries * (delay_ms / 1000.0) + 5.0)

    for attempt in range(retries):
        if time.time() > deadline:
            break
        if on_progress:
            on_progress(
                min(98, 92 + attempt),
                f"Memverifikasi To Do List ({attempt + 1}/{retries})",
            )
        rows = _fetch_todo_rows(page, base_url, timeout_ms=12000)
        for row in rows:
            score = _score_todo_row(
                row,
                refs=refs,
                no_kontrak=payload.no_kontrak,
                mitra_pembeli=payload.mitra_pembeli,
                total_sppn=total_sppn,
                expect_sppb=expect_sppb,
                tanggal_transfer=payload.tanggal_transfer,
            )
            if score > best_score:
                best_score = score
                best = row
        if best_score >= early_score:
            return best
        # Sudah punya nomor + skor cukup: cukup, jangan tunggu full retry
        if best is not None and best_score >= min_score:
            has_no = bool(
                best.get("sppn_no")
                or best.get("no_sppn")
                or best.get("sppb_no")
                or best.get("no_sppb")
            )
            if has_no and best_score >= 70:
                return best
        if attempt < retries - 1 and time.time() < deadline:
            try:
                page.wait_for_timeout(delay_ms)
            except Exception:
                break
    if best_score >= min_score:
        return best
    return None


def inspect_superman_todo(*, kompensasi_id: str, limit: int = 8) -> dict[str, Any]:
    cfg = _api_config()
    ensure_session(cfg)
    payload = build_payload_from_kompensasi(kompensasi_id)
    expect_sppb = payload.pph_nominal > 0
    refs = _payload_refs(payload)

    pw, browser, context = open_authenticated_context(cfg)
    try:
        page = context.new_page()
        rows = _fetch_todo_rows(page, cfg.base_url, timeout_ms=20000)
        scored = _score_all_todo_rows(rows, payload, expect_sppb=expect_sppb)
        hits = []
        for row in rows:
            blob = _todo_row_blob(row)
            if any(_normalize_match_text(r) and _normalize_match_text(r) in blob for r in refs):
                hits.append(row)
        best = scored[0][1] if scored else None
        sppb_no, sppn_no = _coalesce_spp_numbers(store_sppb=None, store_sppn=None, match=best, store_body=None)
        return {
            "kompensasi_id": kompensasi_id,
            "no_invoice": payload.no_invoice,
            "refs": refs,
            "todo_rows": len(rows),
            "direct_blob_hits": len(hits),
            "top_scores": [
                {
                    "score": score,
                    "sppn_no": row.get("sppn_no") or row.get("no_sppn"),
                    "sppb_no": row.get("sppb_no") or row.get("no_sppb"),
                    "keys": list(row.keys()),
                    "row": row,
                }
                for score, row in scored[:limit]
            ],
            "coalesce": {"sppb_no": sppb_no, "sppn_no": sppn_no},
        }
    finally:
        context.close()
        browser.close()
        pw.stop()


def recover_superman_from_todo(*, kompensasi_id: str, force: bool = False) -> dict[str, Any]:
    existing = get_kompensasi_superman(kompensasi_id)
    if existing and not force:
        return {
            "ok": True,
            "kompensasi_id": kompensasi_id,
            "superman_saved": existing,
            "message": "Sudah tersimpan sebelumnya.",
            "recovered": False,
        }

    inspect = inspect_superman_todo(kompensasi_id=kompensasi_id, limit=3)
    coalesce = inspect.get("coalesce") or {}
    sppb_no = coalesce.get("sppb_no")
    sppn_no = coalesce.get("sppn_no")
    top = inspect.get("top_scores") or []
    best_score = top[0]["score"] if top else 0

    if best_score < 50 or not (sppb_no or sppn_no):
        return {
            "ok": False,
            "kompensasi_id": kompensasi_id,
            "message": "Tidak menemukan SPPn/SPPb yang cocok di To Do List Superman.",
            "inspect": inspect,
        }

    saved = save_superman_to_kompensasi(kompensasi_id, sppb_no, sppn_no)
    return {
        "ok": bool(saved),
        "kompensasi_id": kompensasi_id,
        "sppb_no": sppb_no,
        "sppn_no": sppn_no,
        "superman_saved": saved,
        "best_score": best_score,
        "recovered": True,
        "message": f"Nomor Superman dipulihkan dari To Do List: {saved}" if saved else "Gagal menyimpan",
    }


def request_captcha() -> dict[str, Any]:
    return start_captcha_challenge(_api_config())


def refresh_captcha(challenge_id: str) -> dict[str, Any]:
    return refresh_captcha_challenge(challenge_id.strip())


def verify_captcha(challenge_id: str, answer: str) -> dict[str, Any]:
    return verify_captcha_challenge(challenge_id.strip(), answer.strip())


def submit_deklarasi_kompensasi(
    kompensasi_id: str,
    on_progress: ProgressCallback | None = None,
) -> dict[str, Any]:
    kompensasi_id = kompensasi_id.strip()
    assert_kompensasi_not_submitted(kompensasi_id)

    report = on_progress or (lambda _percent, _stage: None)
    report(5, "Memuat data kompensasi dan dokumen")
    cfg = _api_config()
    report(10, "Memvalidasi session Superman")
    ensure_session(cfg)

    payload = build_payload_from_kompensasi(kompensasi_id)
    supports = resolve_support_docs_from_kompensasi(kompensasi_id)

    report(20, "Membuka browser Superman")
    store_sppb: str | None = None
    store_sppn: str | None = None
    store_body: Any = None
    match: dict[str, Any] | None = None
    todo_debug: list[dict[str, Any]] = []

    pw, browser, context = open_authenticated_context(cfg)
    try:
        page = context.new_page()
        fill_sppn_draft(
            page,
            cfg,
            payload,
            support_docs=[doc.path for doc in supports],
            on_progress=on_progress,
        )
        store_body = submit_sppn_draft(page, on_progress=on_progress)
        report(90, "Draft tersimpan — mengekstrak nomor SPPn/SPPb")
        store_sppb, store_sppn = _extract_numbers_from_store(store_body)
        if not (store_sppb or store_sppn):
            page_sppb, page_sppn = _extract_numbers_from_page(page)
            store_sppb = store_sppb or page_sppb
            store_sppn = store_sppn or page_sppn

        # Jika response /spp/store sudah memuat nomor, To Do cukup singkat
        has_store_numbers = bool(store_sppb or store_sppn)
        try:
            match = _find_todo_match(
                page,
                cfg.base_url,
                payload,
                expect_sppb=payload.pph_nominal > 0,
                retries=4 if has_store_numbers else 8,
                delay_ms=1200 if has_store_numbers else 1500,
                on_progress=on_progress,
                min_score=40 if has_store_numbers else 50,
            )
        except Exception as todo_exc:
            # Jangan gagalkan seluruh job hanya karena To Do List lambat/error
            result_todo_error = str(todo_exc)
            match = None
            todo_debug.append({"error": result_todo_error})
        else:
            result_todo_error = None

        if not match:
            try:
                rows = _fetch_todo_rows(page, cfg.base_url, timeout_ms=10000)
                for score, row in _score_all_todo_rows(
                    rows, payload, expect_sppb=payload.pph_nominal > 0
                )[:5]:
                    todo_debug.append(
                        {
                            "score": score,
                            "sppn_no": row.get("sppn_no") or row.get("no_sppn"),
                            "sppb_no": row.get("sppb_no") or row.get("no_sppb"),
                        }
                    )
            except Exception as exc:
                todo_debug.append({"error": str(exc)})
    finally:
        try:
            context.close()
        except Exception:
            pass
        try:
            browser.close()
        except Exception:
            pass
        try:
            pw.stop()
        except Exception:
            pass

    result: dict[str, Any] = {
        "ok": True,
        "kompensasi_id": kompensasi_id,
        "no_invoice": payload.no_invoice,
        "no_pembayaran": payload.no_pembayaran,
        "no_kontrak": payload.no_kontrak,
        "jenis_form": payload.jenis_form,
        "pph_nominal": payload.pph_nominal,
        "total_sppn": payload.dpp_pokok + payload.pajak_ppn,
        "support_docs": [doc.describe() for doc in supports],
        "superman_url": f"{cfg.base_url.rstrip('/')}/sppd#tab-to-do-list-petugas",
        "message": "Draft SPPn/SPPb berhasil masuk To Do List Superman.",
    }
    sppb_no, sppn_no = _coalesce_spp_numbers(
        store_sppb=store_sppb,
        store_sppn=store_sppn,
        match=match,
        store_body=store_body,
    )
    if match:
        result.update(
            {
                "sppb_no": sppb_no,
                "sppn_no": sppn_no,
                "todo_matched": True,
            }
        )
    elif sppb_no or sppn_no:
        result.update({"sppb_no": sppb_no, "sppn_no": sppn_no, "todo_matched": False})

    saved = save_superman_to_kompensasi(kompensasi_id, sppb_no, sppn_no)
    if saved:
        result["superman_saved"] = saved
        result["message"] = f"Berhasil. Nomor Superman tersimpan: {saved}"
    elif sppb_no or sppn_no:
        result["message"] = (
            f"Draft SPPn/SPPb berhasil, namun nomor belum tersimpan otomatis ke kompensasi. "
            f"Salin manual: {format_superman_ref(sppb_no, sppn_no)}"
        )
    else:
        # Draft sudah masuk Superman; nomor belum terbaca — UI bisa recover
        result["ok"] = True
        result["needs_recover"] = True
        result["message"] = (
            "Draft berhasil dikirim ke Superman, tetapi nomor SPPn/SPPb belum terbaca dari To Do List. "
            "Gunakan tombol Pulihkan nomor Superman, atau salin manual dari To Do List."
        )
        result["extract_debug"] = {
            "store_extract": {"sppb": store_sppb, "sppn": store_sppn},
            "todo_top": todo_debug,
            "match_found": match is not None,
            "store_body_preview": (
                str(store_body)[:500] if store_body is not None else None
            ),
        }

    report(100, "Selesai")
    return result


def _run_deklarasi_job(job_id: str, kompensasi_id: str) -> None:
    try:
        result = submit_deklarasi_kompensasi(
            kompensasi_id,
            on_progress=make_progress_callback(job_id),
        )
        complete_job(job_id, result)
    except Exception as exc:
        fail_job(job_id, str(exc))


def start_deklarasi_job(*, kompensasi_id: str) -> dict[str, Any]:
    ref = kompensasi_id.strip()
    assert_kompensasi_not_submitted(ref)
    cfg = _api_config()
    ensure_session(cfg)
    job_id = create_job(ref)
    update_job(job_id, 0, "Memulai proses...")
    thread = threading.Thread(target=_run_deklarasi_job, args=(job_id, ref), daemon=True)
    thread.start()
    return {"job_id": job_id, "kompensasi_id": ref}


def get_deklarasi_progress(job_id: str) -> dict[str, Any]:
    job = get_job(job_id.strip())
    if not job:
        raise ValueError("Job deklarasi tidak ditemukan atau sudah kedaluwarsa.")
    payload: dict[str, Any] = {
        "job_id": job.job_id,
        "kompensasi_id": job.kompensasi_id,
        "status": job.status,
        "percent": job.percent,
        "stage": job.stage,
    }
    if job.status == "completed" and job.result:
        payload["result"] = job.result
    if job.status == "failed" and job.error:
        payload["error"] = job.error
    return payload