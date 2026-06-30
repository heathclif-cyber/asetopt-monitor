from __future__ import annotations

from collections.abc import Callable
from pathlib import Path

from playwright.sync_api import Page

from services.superman.config import SupermanConfig

ProgressCallback = Callable[[int, str], None]
from services.superman.payload import DeklarasiPayload, LineItem, SppbLineItem
from services.superman.select2_helpers import (
    pick_cash_flow,
    pick_cash_flow_sppb,
    pick_customer,
    pick_gl,
    pick_gl_sppb,
    pick_profit_center,
    pick_profit_center_sppb,
)

TAMBAH_URL = "/spp/tambah"


def _wait_loaded(page: Page) -> None:
    page.wait_for_function("() => !document.body.innerText.includes('LOADING')", timeout=90000)
    page.wait_for_timeout(800)


def _select_form(page: Page, cfg: SupermanConfig, jenis_form: str) -> None:
    page.select_option('select[name="flow_id"]', cfg.flow_id)
    page.wait_for_timeout(400)
    page.select_option("#jenis_spp", "vendor")
    page.wait_for_timeout(400)
    page.select_option("#jenis_form", jenis_form)
    page.wait_for_timeout(1200)
    page.select_option("#sumber_dana", "1")
    page.wait_for_timeout(800)


def _set_readonly_input(page: Page, selector: str, value: str) -> None:
    page.evaluate(
        """([sel, val]) => {
            const el = document.querySelector(sel);
            if (!el) return;
            el.removeAttribute('readonly');
            el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
        }""",
        [selector, value],
    )


def _fill_nama_alamat_diterima(page: Page, payload: DeklarasiPayload) -> None:
    nama = (payload.mitra_pembeli or "-").strip()
    alamat = nama
    if page.locator("#nama_diterima_sppn").count():
        try:
            page.select_option("#nama_diterima_sppn", "tertanggu", force=True)
        except Exception:
            pass
        page.locator("#nama_diterima_sppn").dispatch_event("change")
        page.wait_for_timeout(300)
    page.fill("#nama_diterima_sppn_input", nama)
    page.fill("#alamat_diterima_sppn_input", alamat)
    for sel in ("#nama_diterima_sppn_input", "#alamat_diterima_sppn_input"):
        page.locator(sel).dispatch_event("input")
        page.locator(sel).dispatch_event("change")


def _fill_shared_informasi(page: Page, payload: DeklarasiPayload, cfg: SupermanConfig) -> None:
    if payload.jenis_form == "sppb_sppn":
        page.fill("#kwitansi_spp", payload.mitra_pembeli)
        page.fill("#referensi_spp", payload.referensi or "-")
        page.fill("#berita_acara_sppb", payload.ba_au58 or payload.no_pembayaran or payload.no_do or "-")
        page.fill("#sp_opl_sppb", payload.no_kontrak or "-")
        page.fill("#sp_opl_sppn", payload.no_kontrak or "-")
        page.fill("#au58_sppn", payload.ba_au58 or payload.no_pembayaran or payload.no_do or "-")
        page.select_option("#bagian_sppb", cfg.bagian)
        page.select_option("#bagian_sppn", cfg.bagian)
        if payload.tanggal_transfer:
            _set_readonly_input(page, "#tanggal_sppb", payload.tanggal_transfer)
            _set_readonly_input(page, "#tanggal_sppn", payload.tanggal_transfer)
        page.evaluate(
            """([kppName]) => {
                const metode = document.querySelector('#metode_pembayaran_sppb');
                if (metode) {
                    metode.value = 'tidak_transfer';
                    metode.dispatchEvent(new Event('change', { bubbles: true }));
                    if (window.jQuery) jQuery(metode).trigger('change');
                }
                const catatan = document.querySelector('#alasan_tidak_transfer');
                if (catatan) {
                    catatan.value = `Setoran PPh ke ${kppName}`;
                    catatan.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }""",
            [payload.kpp_recipient],
        )
        page.wait_for_timeout(800)
        _fill_nama_alamat_diterima(page, payload)
        return

    page.fill("#kwitansi_sppn", payload.mitra_pembeli)
    page.fill("#referensi_sppn", payload.referensi or "-")
    page.fill("#au58_sppn", payload.ba_au58 or payload.no_pembayaran or payload.no_do or "-")
    page.fill("#sp_opl_sppn", payload.no_kontrak or "-")
    page.select_option("#bagian_sppn", cfg.bagian)
    if payload.tanggal_transfer:
        _set_readonly_input(page, "#tanggal_sppn", payload.tanggal_transfer)
        page.locator("#tanggal_sppn").dispatch_event("blur")
    _fill_nama_alamat_diterima(page, payload)


def _set_ckeditor(page: Page, editor_id: str, text: str) -> None:
    for _ in range(3):
        page.evaluate(
            """([editorId, value]) => {
                if (window.CKEDITOR && CKEDITOR.instances[editorId]) {
                    CKEDITOR.instances[editorId].setData(value);
                    return;
                }
                const el = document.getElementById(editorId);
                if (el) {
                    el.value = value;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                    el.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }""",
            [editor_id, text],
        )
        page.wait_for_timeout(400)
        filled = page.evaluate(
            """(editorId) => {
                if (window.CKEDITOR && CKEDITOR.instances[editorId]) {
                    const data = CKEDITOR.instances[editorId].getData() || '';
                    return data.replace(/<[^>]+>/g, '').trim().length > 0;
                }
                const el = document.getElementById(editorId);
                return !!(el && String(el.value || '').trim());
            }""",
            editor_id,
        )
        if filled:
            return


def _fill_isi_sppn_block(page: Page, isi_index: int, item: LineItem) -> None:
    if item.gl_code.startswith("411"):
        page.select_option(f"#jenis_sap_sppn_{isi_index}", "customer", force=True)
        page.wait_for_timeout(500)
        pick_customer(page, isi_index, item.sap_customer)
    else:
        pick_gl(page, isi_index, item.gl_code)
        pick_customer(page, isi_index, item.sap_customer)
    pick_profit_center(page, isi_index, item.profit_center_search)
    pick_cash_flow(page, isi_index, item.cash_flow)

    editor_id = f"ckeditors_{isi_index}_1"
    _set_ckeditor(page, editor_id, item.uraian)
    page.select_option(
        f"#pilih_pajak_sppn_{isi_index}_1",
        f"tanpa_pajak_sppn_{isi_index}_1",
        force=True,
    )
    page.fill(f"#nominal_sppn_{isi_index}_1", str(item.nominal))
    page.locator(f"#nominal_sppn_{isi_index}_1").dispatch_event("keyup")
    page.locator(f"#nominal_sppn_{isi_index}_1").dispatch_event("change")


def _fill_isi_sppb_block(page: Page, isi_index: int, item: SppbLineItem) -> None:
    pick_gl_sppb(page, isi_index, item.gl_code)
    pick_profit_center_sppb(page, isi_index, item.profit_center_search)
    pick_cash_flow_sppb(page, isi_index, item.cash_flow)

    editor_id = f"ckeditor_{isi_index}_1"
    _set_ckeditor(page, editor_id, item.uraian)
    page.select_option(
        f"#pilih_pajak_sppb_{isi_index}_1",
        f"tanpa_pajak_sppb_{isi_index}_1",
        force=True,
    )
    page.fill(f"#nominal_sppb_{isi_index}_1", str(item.nominal))
    page.locator(f"#nominal_sppb_{isi_index}_1").dispatch_event("keyup")


def _is_upload_response(resp) -> bool:
    url = resp.url.lower()
    return resp.request.method in ("POST", "PUT") and any(
        token in url for token in ("upload", "dokumen", "file", "lampiran", "attach")
    )


def _upload_files_to_input(page: Page, selector: str, paths: list[str]) -> None:
    for path in paths:
        try:
            with page.expect_response(_is_upload_response, timeout=45000):
                page.set_input_files(selector, path)
                page.locator(selector).dispatch_event("change")
        except Exception:
            page.set_input_files(selector, path)
            page.locator(selector).dispatch_event("change")
            page.wait_for_timeout(2500)
        page.wait_for_timeout(1200)


def _upload_support_docs(page: Page, support_docs: list[Path], *, combined: bool) -> None:
    paths = [str(path) for path in support_docs if path.exists()]
    if not paths:
        return

    if combined:
        page.locator('a[href="#tab-informasi-sppb"]').click(force=True)
        page.wait_for_timeout(500)
        _upload_files_to_input(page, "#dokumen_pendukung_sppb", paths)
        page.locator('a[href="#tab-informasi-sppn"]').click(force=True)
        page.wait_for_timeout(500)
        _upload_files_to_input(page, "#dokumen_pendukung_sppn", paths)
    else:
        page.locator('a[href="#tab-informasi-sppn"]').click(force=True)
        page.wait_for_timeout(600)
        _upload_files_to_input(page, "#dokumen_pendukung_sppn", paths)

    page.wait_for_function(
        """(expected) => {
            const tab = document.querySelector('#tab-informasi-sppn') || document.body;
            const markers = tab.querySelectorAll(
                'table tbody tr, .file-row, .dz-preview, .uploaded-file, [data-filename], .list-dokumen li'
            ).length;
            return markers >= expected;
        }""",
        len(paths),
        timeout=90000,
    )

    page.evaluate(
        """() => {
            if (typeof bandingkan_dpp_sisa === 'function') {
                bandingkan_dpp_sisa();
            }
        }"""
    )
    page.wait_for_timeout(1500)


def fill_sppn_draft(
    page: Page,
    cfg: SupermanConfig,
    payload: DeklarasiPayload,
    *,
    support_docs: list[Path] | None = None,
    on_progress: ProgressCallback | None = None,
) -> None:
    def report(percent: int, stage: str) -> None:
        if on_progress:
            on_progress(percent, stage)

    report(25, "Membuka form SPPn di Superman")
    page.goto(cfg.base_url.rstrip("/") + TAMBAH_URL, wait_until="networkidle", timeout=90000)
    _wait_loaded(page)
    combined = payload.jenis_form == "sppb_sppn"

    report(35, "Mengisi informasi umum")
    _select_form(page, cfg, payload.jenis_form)
    _fill_shared_informasi(page, payload, cfg)

    if support_docs:
        existing = [doc for doc in support_docs if doc.exists()]
        if existing:
            report(45, "Mengunggah dokumen pendukung")
            _upload_support_docs(page, existing, combined=combined)

    if combined and payload.sppb_item:
        report(55, "Mengisi baris SPPb (PPh)")
        page.locator('a[href="#tab-isi-sppb"]').click(force=True)
        page.wait_for_timeout(1000)
        _fill_isi_sppb_block(page, 1, payload.sppb_item)

    page.locator('a[href="#tab-isi-sppn"]').click(force=True)
    page.wait_for_timeout(1000)

    total_lines = max(len(payload.line_items), 1)
    for idx, item in enumerate(payload.line_items, start=1):
        line_pct = 60 + int((idx / total_lines) * 20)
        report(line_pct, f"Mengisi baris SPPn ({idx}/{total_lines})")
        if idx > 1:
            page.locator('button[onclick="tambah_isi_sppn()"]').click()
            page.wait_for_timeout(1200)
        _fill_isi_sppn_block(page, idx, item)

    report(82, "Memvalidasi isian form")
    page.evaluate("() => { if (typeof bandingkan_dpp_sisa === 'function') bandingkan_dpp_sisa(); }")
    page.wait_for_timeout(500)
    missing = _audit_empty_fields(page, combined=combined)
    if missing:
        raise RuntimeError(
            "Validasi lokal gagal sebelum simpan — kolom Superman belum terisi: "
            + ", ".join(missing)
            + f" Debug: {_dump_form_diagnostic(page)}"
        )


def _audit_empty_fields(page: Page, *, combined: bool) -> list[str]:
    return page.evaluate(
        """(combined) => {
            const missing = [];
            const val = (sel) => {
                const el = document.querySelector(sel);
                if (!el) return '';
                if (el.type === 'file') return (el.files && el.files.length) ? 'ok' : '';
                return String(el.value || '').trim();
            };
            const shared = [
                ['#kwitansi_sppn', 'Kwitansi SPPn'],
                ['#referensi_sppn', 'Referensi SPPn'],
                ['#au58_sppn', 'AU58 SPPn'],
                ['#sp_opl_sppn', 'SP/OPL SPPn'],
                ['#tanggal_sppn', 'Tanggal SPPn'],
                ['#bagian_sppn', 'Bagian SPPn'],
            ];
            for (const [sel, label] of shared) {
                if (!val(sel)) missing.push(label);
            }
            const tab = document.querySelector('#tab-informasi-sppn') || document.body;
            const uploadedMarkers = tab.querySelectorAll(
                'table tbody tr, .file-row, .dz-preview, .uploaded-file, [data-filename], .list-dokumen li'
            ).length;
            if (uploadedMarkers < 1) {
                missing.push('Dokumen Pendukung SPPn (belum ter-upload ke Superman)');
            }
            for (const [sel, label] of [
                ['#nama_diterima_sppn_input', 'Nama Diterima SPPn'],
                ['#alamat_diterima_sppn_input', 'Alamat Diterima SPPn'],
            ]) {
                if (!val(sel)) missing.push(label);
            }
            if (combined) {
                for (const [sel, label] of [
                    ['#dokumen_pendukung_sppb', 'Dokumen Pendukung SPPb'],
                    ['#tanggal_sppb', 'Tanggal SPPb'],
                ]) {
                    if (!val(sel)) missing.push(label);
                }
            }
            const blocks = document.querySelectorAll('[id^="nominal_sppn_"]');
            blocks.forEach((nominalEl, idx) => {
                const i = idx + 1;
                const glHidden = document.querySelector(`#sap_gl_sppn_id_${i}`);
                if (glHidden && !String(glHidden.value || '').trim()) {
                    missing.push(`GL baris SPPn ${i}`);
                }
                const pcSelect = document.querySelector(`#select_profit_center_sppn_${i}`);
                if (pcSelect && !String(pcSelect.value || '').trim()) {
                    missing.push(`Profit Center baris SPPn ${i}`);
                }
                const custIds = [
                    `sap_customer_id_sppn_${i}`,
                    `select_customer_id_sppn_${i}`,
                    `customer_id_sppn_${i}`,
                ];
                const custEl = custIds.map(id => document.getElementById(id)).find(Boolean);
                if (custEl && !String(custEl.value || '').trim()) {
                    missing.push(`Customer SAP baris SPPn ${i}`);
                }
                const pcHiddenIds = [
                    `profit_center_sppn_id_${i}`,
                    `select_profit_center_sppn_id_${i}`,
                    `master_profit_center_id_sppn_${i}`,
                ];
                const pcHidden = pcHiddenIds.map(id => document.getElementById(id)).find(Boolean);
                if (pcHidden && !String(pcHidden.value || '').trim()) {
                    missing.push(`Profit Center (hidden) baris SPPn ${i}`);
                }
                const cfSel = document.querySelector(i === 1 ? '#cash_flow_sppn' : `#cash_flow_sppn_${i}`);
                if (cfSel && !String(cfSel.value || '').trim()) {
                    missing.push(`Cash Flow baris SPPn ${i}`);
                }
                const uraianId = `ckeditors_${i}_1`;
                let uraianOk = false;
                if (window.CKEDITOR && CKEDITOR.instances[uraianId]) {
                    const data = CKEDITOR.instances[uraianId].getData() || '';
                    uraianOk = data.replace(/<[^>]+>/g, '').trim().length > 0;
                } else {
                    const el = document.getElementById(uraianId);
                    uraianOk = !!(el && String(el.value || '').trim());
                }
                if (!uraianOk) missing.push(`Uraian baris SPPn ${i}`);
                if (!String(nominalEl.value || '').trim()) missing.push(`Nominal baris SPPn ${i}`);
            });
            return missing;
        }""",
        combined,
    )


def _dump_form_diagnostic(page: Page) -> str:
    data = page.evaluate(
        """() => {
            const pick = (sel) => {
                const el = document.querySelector(sel);
                if (!el) return null;
                if (el.type === 'file') return { files: el.files ? el.files.length : 0 };
                return String(el.value || '').trim() || null;
            };
            const lines = [];
            ['#kwitansi_sppn','#referensi_sppn','#au58_sppn','#sp_opl_sppn','#tanggal_sppn','#bagian_sppn'].forEach((sel) => {
                lines.push(`${sel}=${JSON.stringify(pick(sel))}`);
            });
            const docs = document.querySelectorAll(
                '#tab-informasi-sppn table tbody tr, #tab-informasi-sppn .file-row, #tab-informasi-sppn .dz-preview'
            ).length;
            lines.push(`uploaded_doc_rows=${docs}`);
            document.querySelectorAll('[id^="nominal_sppn_"]').forEach((el, idx) => {
                const i = idx + 1;
                lines.push(`line${i}_nominal=${el.value}`);
                const gl = document.querySelector(`#sap_gl_sppn_id_${i}`);
                lines.push(`line${i}_gl=${gl ? gl.value : 'n/a'}`);
                const pc = document.querySelector(`#select_profit_center_sppn_${i}`);
                lines.push(`line${i}_pc=${pc ? pc.value : 'n/a'}`);
                const uraianId = `ckeditors_${i}_1`;
                let uraian = '';
                if (window.CKEDITOR && CKEDITOR.instances[uraianId]) {
                    uraian = (CKEDITOR.instances[uraianId].getData() || '').replace(/<[^>]+>/g, '').trim();
                }
                lines.push(`line${i}_uraian_len=${uraian.length}`);
            });
            return lines.join('; ');
        }"""
    )
    return str(data)


def _swal_visible(page: Page):
    return page.locator(".swal2-popup.swal2-show, .swal2-popup:visible").first


def _dismiss_swal_dialogs(page: Page, *, print_after: bool = False) -> None:
    for _ in range(12):
        popup = _swal_visible(page)
        try:
            popup.wait_for(state="visible", timeout=5000)
        except Exception:
            return

        text = popup.inner_text()
        lower = text.lower()
        if "belum terisi" in lower:
            combined = page.locator("#dokumen_pendukung_sppb").count() > 0
            missing = _audit_empty_fields(page, combined=combined)
            diagnostic = _dump_form_diagnostic(page)
            detail = f" Kolom kosong: {', '.join(missing)}." if missing else ""
            raise RuntimeError(
                f"Validasi Superman gagal: {text.strip()}.{detail} Debug: {diagnostic}"
            )

        if popup.locator(".swal2-loading").count():
            page.wait_for_timeout(800)
            continue

        if "anomali" in lower or "menyimpan dan mencetak" in lower or "simpan saja" in lower:
            if print_after:
                popup.locator(".swal2-confirm, button:has-text('Simpan dan Cetak')").first.click()
            else:
                deny = popup.locator(".swal2-deny, button:has-text('Simpan Saja')")
                if deny.count():
                    deny.first.click()
                else:
                    popup.locator(".swal2-confirm").first.click()
        else:
            confirm = popup.locator(".swal2-confirm")
            if confirm.count():
                confirm.first.click()
            else:
                return
        page.wait_for_timeout(1000)


def submit_sppn_draft(
    page: Page,
    *,
    print_after: bool = False,
    on_progress: ProgressCallback | None = None,
) -> dict | list | str | None:
    if on_progress:
        on_progress(88, "Menyimpan draft ke Superman")
    simpan = page.locator("#simpan, button:has-text('Simpan')").first
    simpan.wait_for(state="visible", timeout=10000)
    page.wait_for_function(
        "() => { const b = document.querySelector('#simpan'); return b && !b.disabled; }",
        timeout=30000,
    )

    store_body: dict | list | str | None = None
    with page.expect_response(
        lambda resp: "/spp/store" in resp.url and resp.request.method == "POST",
        timeout=120000,
    ) as resp_info:
        simpan.click()
        _dismiss_swal_dialogs(page, print_after=print_after)
        try:
            store_body = resp_info.value.json()
        except Exception:
            try:
                store_body = resp_info.value.text()
            except Exception:
                store_body = None

    page.wait_for_load_state("networkidle", timeout=120000)
    return store_body


def pause_for_review(page: Page, message: str) -> None:
    print(message)
    if not page.context.browser:
        return
    try:
        input("Tekan Enter setelah cek form / upload dokumen ... ")
    except EOFError:
        page.wait_for_timeout(30000)