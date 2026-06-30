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


def _score_todo_row(
    row: dict[str, Any],
    *,
    ref: str,
    no_kontrak: str,
    mitra_pembeli: str,
    total_sppn: int,
    expect_sppb: bool,
    tanggal_transfer: str = "",
) -> int:
    blob = _todo_row_blob(row)
    score = 0
    ref_n = _normalize_match_text(ref)
    no_kontrak_n = _normalize_match_text(no_kontrak)
    mitra_n = _normalize_match_text(mitra_pembeli)

    if ref_n and ref_n in blob:
        score += 1000

    for field in (
        "berita_acara",
        "au58",
        "au58_sppn",
        "au58_sppb",
        "referensi",
        "referensi_sppn",
        "referensi_sppb",
        "sp_opl",
        "sp_opl_sppn",
        "kwitansi",
        "kwitansi_sppn",
        "keterangan",
        "uraian",
        "sppn_uraian",
        "sppn_uraian2",
        "nomor",
        "nomor_spp",
        "no_spp",
    ):
        val = _normalize_match_text(row.get(field))
        if ref_n and val and (ref_n == val or ref_n in val or val in ref_n):
            score += 800

    if no_kontrak_n and no_kontrak_n in blob:
        score += 100
    if mitra_n and mitra_n in blob:
        score += 20
    if row.get("sppn_no"):
        score += 5
    if expect_sppb:
        if row.get("sppb_no"):
            score += 5
        else:
            score -= 50

    for amount_field in ("sppn_jumlah", "sppb_total", "total", "jumlah", "nominal"):
        raw = row.get(amount_field)
        if raw is None:
            continue
        try:
            amount = int(round(float(raw)))
        except (TypeError, ValueError):
            continue
        if total_sppn > 0 and abs(amount - total_sppn) <= 1:
            score += 30
            break

    def _norm_date_key(value: str) -> str:
        text = _normalize_match_text(value)
        if not text:
            return ""
        if len(text) >= 10 and text[4] == "-" and text[7] == "-":
            return text[:10]
        if len(text) >= 10 and text[2] == "-" and text[5] == "-":
            d, m, y = text.split("-", 2)
            return f"{y}-{m}-{d}"[:10]
        if "/" in text:
            parts = text.split("/")
            if len(parts) == 3 and len(parts[2]) == 4:
                return f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
        return text

    tanggal_key = _norm_date_key(tanggal_transfer)
    tanggal_matched = False
    for date_field in ("sppn_tanggal", "tanggal", "tanggal_sppn", "tanggal_sppb"):
        row_key = _norm_date_key(str(row.get(date_field) or ""))
        if tanggal_key and row_key and tanggal_key == row_key:
            score += 25
            tanggal_matched = True
            break

    if tanggal_key and not tanggal_matched and score < 800:
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
    ref = payload.ba_au58 or payload.no_invoice or payload.kompensasi_id
    scored: list[tuple[int, dict[str, Any]]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        score = _score_todo_row(
            row,
            ref=ref,
            no_kontrak=payload.no_kontrak,
            mitra_pembeli=payload.mitra_pembeli,
            total_sppn=total_sppn,
            expect_sppb=expect_sppb,
            tanggal_transfer=payload.tanggal_transfer,
        )
        if score > 0:
            scored.append((score, row))
    scored.sort(
        key=lambda item: (item[0], int(item[1].get("sppn_id") or item[1].get("spp_id") or 0)),
        reverse=True,
    )
    return scored


def _find_todo_match(page, base_url: str, payload, *, expect_sppb: bool, retries: int = 12, delay_ms: int = 2000):
    best = None
    best_score = 0
    total_sppn = int(payload.dpp_pokok or 0) + int(payload.pajak_ppn or 0)
    ref = payload.ba_au58 or payload.no_invoice or payload.kompensasi_id
    for _attempt in range(retries):
        resp = page.request.get(f"{base_url.rstrip('/')}/sppd/getTodo")
        if resp.ok:
            body = resp.json()
            rows = body.get("data") or []
            for row in rows:
                if not isinstance(row, dict):
                    continue
                score = _score_todo_row(
                    row,
                    ref=ref,
                    no_kontrak=payload.no_kontrak,
                    mitra_pembeli=payload.mitra_pembeli,
                    total_sppn=total_sppn,
                    expect_sppb=expect_sppb,
                    tanggal_transfer=payload.tanggal_transfer,
                )
                if score > best_score:
                    best_score = score
                    best = row
            if best_score >= 800:
                return best
        if _attempt < retries - 1:
            page.wait_for_timeout(delay_ms)
    if best_score >= 70:
        return best
    return None


def inspect_superman_todo(*, kompensasi_id: str, limit: int = 8) -> dict[str, Any]:
    cfg = _api_config()
    ensure_session(cfg)
    payload = build_payload_from_kompensasi(kompensasi_id)
    expect_sppb = payload.pph_nominal > 0
    ref = payload.ba_au58 or payload.no_invoice

    pw, browser, context = open_authenticated_context(cfg)
    try:
        page = context.new_page()
        resp = page.request.get(f"{cfg.base_url.rstrip('/')}/sppd/getTodo")
        rows = resp.json().get("data") or [] if resp.ok else []
        scored = _score_all_todo_rows(rows, payload, expect_sppb=expect_sppb)
        ref_n = _normalize_match_text(ref)
        hits = [row for row in rows if isinstance(row, dict) and ref_n and ref_n in _todo_row_blob(row)]
        best = scored[0][1] if scored else None
        sppb_no, sppn_no = _coalesce_spp_numbers(store_sppb=None, store_sppn=None, match=best, store_body=None)
        return {
            "kompensasi_id": kompensasi_id,
            "no_invoice": payload.no_invoice,
            "todo_rows": len(rows),
            "direct_blob_hits": len(hits),
            "top_scores": [
                {
                    "score": score,
                    "sppn_no": row.get("sppn_no"),
                    "sppb_no": row.get("sppb_no"),
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

    if best_score < 70 or not (sppb_no or sppn_no):
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
        report(95, "Memverifikasi To Do List")
        store_sppb, store_sppn = _extract_numbers_from_store(store_body)
        match = _find_todo_match(page, cfg.base_url, payload, expect_sppb=payload.pph_nominal > 0)
        if not (store_sppb or store_sppn) and not match:
            page_sppb, page_sppn = _extract_numbers_from_page(page)
            store_sppb = store_sppb or page_sppb
            store_sppn = store_sppn or page_sppn
        if not match:
            resp = page.request.get(f"{cfg.base_url.rstrip('/')}/sppd/getTodo")
            rows = resp.json().get("data") or [] if resp.ok else []
            for score, row in _score_all_todo_rows(rows, payload, expect_sppb=payload.pph_nominal > 0)[:5]:
                todo_debug.append({"score": score, "sppn_no": row.get("sppn_no"), "sppb_no": row.get("sppb_no")})
    finally:
        context.close()
        browser.close()
        pw.stop()

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
    elif sppb_no or sppn_no:
        result["message"] = (
            f"Draft SPPn/SPPb berhasil, namun nomor belum tersimpan otomatis ke kompensasi. "
            f"Salin manual: {format_superman_ref(sppb_no, sppn_no)}"
        )
    else:
        result["extract_debug"] = {
            "store_extract": {"sppb": store_sppb, "sppn": store_sppn},
            "todo_top": todo_debug,
            "match_found": match is not None,
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