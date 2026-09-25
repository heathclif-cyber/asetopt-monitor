from __future__ import annotations

import logging
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
# Superman memakai id "faktur_pajak_sppn_1" juga untuk <div> pembungkusnya, jadi
# "#faktur_pajak_sppn_1" menunjuk ke div — input harus dicari lewat name.
FAKTUR_PAJAK_SPPN_1 = 'input[name="faktur_pajak_sppn[1][fp]"]'
logger = logging.getLogger(__name__)


def _open_tab(page: Page, tab_href: str) -> None:
    # Klik DOM, bukan klik koordinat: saat form memanjang, link tab bisa tertutup navbar
    # fixed-top sehingga click(force=True) mengenai logo dan membuka /dashboard.
    page.evaluate(
        "(href) => { const a = document.querySelector(`a[href=\"${href}\"]`); if (a) a.click(); }",
        tab_href,
    )


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


def _fill_input(page: Page, selector: str, value: str) -> None:
    page.evaluate(
        """([sel, val]) => {
            const el = document.querySelector(sel);
            if (!el) return;
            el.removeAttribute('readonly');
            el.value = val;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            if (window.jQuery) window.jQuery(el).trigger('input').trigger('change');
        }""",
        [selector, value],
    )


def _fill_shared_informasi(page: Page, payload: DeklarasiPayload, cfg: SupermanConfig) -> None:
    if payload.jenis_form == "sppb_sppn":
        ref = payload.referensi or payload.no_invoice or "-"
        _fill_input(page, "#kwitansi_spp", payload.mitra_pembeli)
        _fill_input(page, "#referensi_spp", ref)
        _fill_input(page, "#referensi_sppn", ref)
        _fill_input(page, "#berita_acara_sppb", payload.ba_au58 or payload.no_pembayaran or payload.no_do or "-")
        _fill_input(page, "#sp_opl_sppb", payload.no_kontrak or "-")
        _fill_input(page, "#sp_opl_sppn", payload.no_kontrak or "-")
        _fill_input(page, "#au58_sppn", payload.ba_au58 or payload.no_pembayaran or payload.no_do or "-")
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
        page.fill("#nama_diterima_sppn_input", "tertanggu")
        page.fill("#alamat_diterima_sppn_input", "tertanggu")
        _fill_input(page, "#kwitansi_sppn", payload.mitra_pembeli)
        _fill_input(page, FAKTUR_PAJAK_SPPN_1, "-")
        return

    _fill_input(page, "#kwitansi_sppn", payload.mitra_pembeli)
    _fill_input(page, "#referensi_sppn", payload.referensi or payload.no_invoice or "-")
    _fill_input(page, "#au58_sppn", payload.ba_au58 or payload.no_pembayaran or payload.no_do or "-")
    _fill_input(page, "#sp_opl_sppn", payload.no_kontrak or "-")
    page.select_option("#bagian_sppn", cfg.bagian)
    if payload.tanggal_transfer:
        _set_readonly_input(page, "#tanggal_sppn", payload.tanggal_transfer)
    _fill_input(page, "#nama_diterima_sppn_input", "tertanggu")
    _fill_input(page, "#alamat_diterima_sppn_input", "tertanggu")
    _fill_input(page, FAKTUR_PAJAK_SPPN_1, "-")


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
    if item.gl_code:
        pick_gl(page, isi_index, item.gl_code)
    else:
        pick_customer(page, isi_index, item.sap_customer, nama=item.customer_nama)
    pick_profit_center(page, isi_index, item.profit_center_search)
    pick_cash_flow(page, isi_index, item.cash_flow)

    editor_id = f"ckeditors_{isi_index}_1"
    _set_ckeditor(page, editor_id, item.uraian)
    page.locator(f"#{editor_id}").fill(item.uraian)
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
    page.locator(f"#{editor_id}").fill(item.uraian)
    page.select_option(
        f"#pilih_pajak_sppb_{isi_index}_1",
        f"tanpa_pajak_sppb_{isi_index}_1",
        force=True,
    )
    page.fill(f"#nominal_sppb_{isi_index}_1", str(item.nominal))
    page.locator(f"#nominal_sppb_{isi_index}_1").dispatch_event("keyup")


def _count_doc_markers(page: Page, *, tab_selector: str, input_selector: str) -> int:
    return int(
        page.evaluate(
            """([tabSel, inputSel]) => {
                const tab = document.querySelector(tabSel);
                const root = tab || document.body;
                const input = document.querySelector(inputSel);
                const inputCount = input && input.files ? input.files.length : 0;
                const listMarkers = root.querySelectorAll(
                    '.file-row, .dz-preview, .dz-success, .uploaded-file, [data-filename], .list-dokumen li, .list-dokumen-sppn li'
                ).length;
                const tableMarkers = root.querySelectorAll(
                    'table tbody tr, table.dokumen tbody tr, #list-dokumen-sppn tr, #list_dokumen_sppn tr'
                ).length;
                const hiddenMarkers = root.querySelectorAll(
                    'input[type="hidden"][name*="dokumen"], input[type="hidden"][id*="dokumen"]'
                ).length;
                return Math.max(inputCount, listMarkers, tableMarkers, hiddenMarkers);
            }""",
            [tab_selector, input_selector],
        )
    )


def _wait_doc_markers(page: Page, *, tab_selector: str, input_selector: str, minimum: int, timeout: int = 90000) -> None:
    page.wait_for_function(
        """([tabSel, inputSel, minimum]) => {
            const tab = document.querySelector(tabSel);
            const root = tab || document.body;
            const input = document.querySelector(inputSel);
            const inputCount = input && input.files ? input.files.length : 0;
            const listMarkers = root.querySelectorAll(
                '.file-row, .dz-preview, .dz-success, .uploaded-file, [data-filename], .list-dokumen li, .list-dokumen-sppn li'
            ).length;
            const tableMarkers = root.querySelectorAll(
                'table tbody tr, table.dokumen tbody tr, #list-dokumen-sppn tr, #list_dokumen_sppn tr'
            ).length;
            const hiddenMarkers = root.querySelectorAll(
                'input[type="hidden"][name*="dokumen"], input[type="hidden"][id*="dokumen"]'
            ).length;
            const total = Math.max(inputCount, listMarkers, tableMarkers, hiddenMarkers);
            return total >= minimum;
        }""",
        arg=[tab_selector, input_selector, minimum],
        timeout=timeout,
    )


def _count_uploaded_docs(page: Page, input_selector: str) -> int:
    """File terlampir di widget bootstrap-fileinput Superman (input asli atau preview)."""
    return int(
        page.evaluate(
            """(sel) => {
                const input = document.querySelector(sel);
                if (!input) return 0;
                const files = input.files ? input.files.length : 0;
                const root = input.closest('.file-input');
                const previews = root
                    ? root.querySelectorAll('.file-preview-thumbnails .file-preview-frame').length
                    : 0;
                return Math.max(files, previews);
            }""",
            input_selector,
        )
        or 0
    )


def _upload_files_to_input(
    page: Page,
    selector: str,
    paths: list[str],
    *,
    tab_selector: str,
) -> None:
    # Dokumen ikut terkirim bersama POST /spp/store, jadi semua file harus ada di input
    # sekaligus — set_input_files per file menimpa file sebelumnya.
    locator = page.locator(selector).first
    locator.wait_for(state="attached", timeout=15000)
    locator.set_input_files(paths)
    page.wait_for_timeout(800)
    for _ in range(15):
        if _count_uploaded_docs(page, selector) >= len(paths):
            return
        page.wait_for_timeout(1000)
    got = _count_uploaded_docs(page, selector)
    raise RuntimeError(f"Dokumen pendukung belum terlampir di {selector} ({got}/{len(paths)} file)")


def _upload_support_docs(page: Page, support_docs: list[Path], *, combined: bool) -> None:
    paths = [str(path) for path in support_docs if path.exists()]
    if not paths:
        raise RuntimeError(
            "File dokumen pendukung tidak ditemukan di server API. "
            "Upload ulang Kontrak, Invoice, dan Rekening Koran di Input Pembayaran."
        )

    if combined:
        _open_tab(page, "#tab-informasi-sppb")
        page.wait_for_timeout(500)
        _upload_files_to_input(
            page,
            "#dokumen_pendukung_sppb",
            paths,
            tab_selector="#tab-informasi-sppb",
        )
        _wait_doc_markers(
            page,
            tab_selector="#tab-informasi-sppb",
            input_selector="#dokumen_pendukung_sppb",
            minimum=1,
        )

    _open_tab(page, "#tab-informasi-sppn")
    page.wait_for_timeout(600)
    _upload_files_to_input(
        page,
        "#dokumen_pendukung_sppn",
        paths,
        tab_selector="#tab-informasi-sppn",
    )
    _wait_doc_markers(
        page,
        tab_selector="#tab-informasi-sppn",
        input_selector="#dokumen_pendukung_sppn",
        minimum=1,
        timeout=90000,
    )

    page.evaluate(
        """() => {
            if (typeof bandingkan_dpp_sisa === 'function') {
                bandingkan_dpp_sisa();
            }
        }"""
    )
    page.wait_for_timeout(1200)


def _upload_support_docs_sppb_only(page: Page, support_docs: list[Path]) -> None:
    """Mode `jenis_form=sppb` murni — tab SPPn tidak ada, upload cuma ke tab SPPb."""
    paths = [str(path) for path in support_docs if path.exists()]
    if not paths:
        raise RuntimeError(
            "File dokumen pendukung tidak ditemukan di server API. "
            "Upload ulang dokumen pendukung PPh di Input Pembayaran."
        )

    _open_tab(page, "#tab-informasi-sppb")
    page.wait_for_timeout(500)
    _upload_files_to_input(
        page,
        "#dokumen_pendukung_sppb",
        paths,
        tab_selector="#tab-informasi-sppb",
    )
    _wait_doc_markers(
        page,
        tab_selector="#tab-informasi-sppb",
        input_selector="#dokumen_pendukung_sppb",
        minimum=1,
        timeout=90000,
    )


def _fill_shared_informasi_sppb_only(page: Page, payload: DeklarasiPayload, cfg: SupermanConfig) -> None:
    """Mode `jenis_form=sppb` murni — field pakai suffix `_sppb`, bukan `_spp` generik."""
    page.fill("#kwitansi_sppb", payload.mitra_pembeli)
    page.fill("#referensi_sppb", payload.referensi or "-")
    page.fill("#berita_acara_sppb", payload.ba_au58 or payload.no_pembayaran or payload.no_do or "-")
    page.fill("#sp_opl_sppb", payload.no_kontrak or "-")
    page.select_option("#bagian_sppb", cfg.bagian)
    if payload.tanggal_transfer:
        _set_readonly_input(page, "#tanggal_sppb", payload.tanggal_transfer)
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
    page.wait_for_timeout(400)


def fill_sppb_only_draft(
    page: Page,
    cfg: SupermanConfig,
    payload: DeklarasiPayload,
    *,
    support_docs: list[Path] | None = None,
    on_progress: ProgressCallback | None = None,
) -> None:
    """Isi form Superman untuk `jenis_form=sppb` murni (tanpa SPPn)."""

    def report(percent: int, stage: str) -> None:
        if on_progress:
            on_progress(percent, stage)

    if not payload.sppb_item:
        raise RuntimeError("Payload SPPb kosong — tidak ada baris PPh untuk diisi.")

    report(25, "Membuka form SPPb di Superman")
    page.goto(cfg.base_url.rstrip("/") + TAMBAH_URL, wait_until="networkidle", timeout=90000)
    _wait_loaded(page)

    report(35, "Mengisi informasi umum SPPb")
    _select_form(page, cfg, "sppb")
    _fill_shared_informasi_sppb_only(page, payload, cfg)

    report(50, "Mengisi baris SPPb (PPh)")
    _open_tab(page, "#tab-isi-sppb")
    page.wait_for_timeout(1000)
    _fill_isi_sppb_block(page, 1, payload.sppb_item)

    if support_docs:
        existing = [doc for doc in support_docs if doc.exists()]
        if existing:
            report(78, "Mengunggah dokumen pendukung")
            _upload_support_docs_sppb_only(page, existing)

    report(82, "Memvalidasi isian form")
    _open_tab(page, "#tab-informasi-sppb")
    page.wait_for_timeout(600)
    missing = _audit_empty_fields_sppb(page)
    if missing:
        raise RuntimeError(
            "Validasi lokal gagal sebelum simpan — kolom Superman belum terisi: "
            + ", ".join(missing)
        )


def _audit_empty_fields_sppb(page: Page) -> list[str]:
    return page.evaluate(
        """() => {
            const missing = [];
            const val = (sel) => {
                const el = document.querySelector(sel);
                if (!el) return '';
                if (el.type === 'file') return (el.files && el.files.length) ? 'ok' : '';
                return String(el.value || '').trim();
            };
            const shared = [
                ['#kwitansi_sppb', 'Kwitansi/Invoice SPPb'],
                ['#berita_acara_sppb', 'BA/dokumen pendukung SPPb'],
                ['#sp_opl_sppb', 'Nomor SP/OPL/SPK SPPb'],
                ['#tanggal_sppb', 'Tanggal SPPb'],
                ['#bagian_sppb', 'Bagian SPPb'],
                ['#metode_pembayaran_sppb', 'Metode Pembayaran SPPb'],
            ];
            for (const [sel, label] of shared) {
                if (!val(sel)) missing.push(label);
            }
            const tab = document.querySelector('#tab-informasi-sppb') || document.body;
            const fileInput = document.querySelector('#dokumen_pendukung_sppb');
            const fileCount = fileInput && fileInput.files ? fileInput.files.length : 0;
            const uploadedMarkers = tab.querySelectorAll(
                '.file-row, .dz-preview, .dz-success, .uploaded-file, [data-filename], .list-dokumen li, table tbody tr'
            ).length;
            const hiddenDocs = tab.querySelectorAll(
                'input[type="hidden"][name*="dokumen"], input[type="hidden"][id*="dokumen"]'
            ).length;
            if (uploadedMarkers < 1 && fileCount < 1 && hiddenDocs < 1) {
                missing.push('Upload Dokumen Pendukung SPPb (belum ter-upload ke Superman)');
            }
            const glHidden = document.querySelector('#sap_gl_sppb_id_1');
            if (glHidden && !String(glHidden.value || '').trim()) missing.push('GL baris SPPb');
            const pcHiddenIds = [
                'profit_center_sppb_id_1',
                'select_profit_center_sppb_id_1',
                'master_profit_center_id_sppb_1',
            ];
            const pcHidden = pcHiddenIds.map(id => document.getElementById(id)).find(Boolean);
            if (pcHidden && !String(pcHidden.value || '').trim()) missing.push('Profit Center baris SPPb');
            const cfSel = document.querySelector('#cash_flow_sppb_1');
            if (cfSel && !String(cfSel.value || '').trim()) missing.push('Cash Flow baris SPPb');
            const uraianId = 'ckeditor_1_1';
            let uraianOk = false;
            if (window.CKEDITOR && CKEDITOR.instances[uraianId]) {
                const data = CKEDITOR.instances[uraianId].getData() || '';
                uraianOk = data.replace(/<[^>]+>/g, '').trim().length > 0;
            } else {
                const el = document.getElementById(uraianId);
                uraianOk = !!(el && String(el.value || '').trim());
            }
            if (!uraianOk) missing.push('Uraian baris SPPb');
            const nominalEl = document.querySelector('#nominal_sppb_1_1');
            if (!nominalEl || !String(nominalEl.value || '').trim()) missing.push('Nominal baris SPPb');
            return missing;
        }"""
    )


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

    if combined and payload.sppb_item:
        report(50, "Mengisi baris SPPb (PPh)")
        _open_tab(page, "#tab-isi-sppb")
        page.wait_for_timeout(1000)
        _fill_isi_sppb_block(page, 1, payload.sppb_item)

    _open_tab(page, "#tab-isi-sppn")
    page.wait_for_timeout(1000)

    total_lines = max(len(payload.line_items), 1)
    for idx, item in enumerate(payload.line_items, start=1):
        line_pct = 55 + int((idx / total_lines) * 20)
        report(line_pct, f"Mengisi baris SPPn ({idx}/{total_lines})")
        if idx > 1:
            page.locator('button[onclick="tambah_isi_sppn()"]').click()
            page.wait_for_timeout(1200)
        _fill_isi_sppn_block(page, idx, item)

    if support_docs:
        existing = [doc for doc in support_docs if doc.exists()]
        if existing:
            report(78, "Mengunggah dokumen pendukung")
            _upload_support_docs(page, existing, combined=combined)

    report(82, "Memvalidasi isian form")
    _open_tab(page, "#tab-informasi-sppn")
    page.wait_for_timeout(600)
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
            const fileInput = document.querySelector('#dokumen_pendukung_sppn');
            const fileCount = fileInput && fileInput.files ? fileInput.files.length : 0;
            const uploadedMarkers = tab.querySelectorAll(
                '.file-row, .dz-preview, .dz-success, .uploaded-file, [data-filename], .list-dokumen li, .list-dokumen-sppn li, table tbody tr, #list-dokumen-sppn tr, #list_dokumen_sppn tr'
            ).length;
            const hiddenDocs = tab.querySelectorAll(
                'input[type="hidden"][name*="dokumen"], input[type="hidden"][id*="dokumen"]'
            ).length;
            if (uploadedMarkers < 1 && fileCount < 1 && hiddenDocs < 1) {
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
                const custHidden = document.querySelector(`#sap_customer_sppn_id_${i}`);
                const glVal = glHidden ? String(glHidden.value || '').trim() : '';
                const custVal = custHidden ? String(custHidden.value || '').trim() : '';
                if (!glVal && !custVal) {
                    missing.push(`Kode SAP (GL/Customer) baris SPPn ${i}`);
                }
                const pcSelect = document.querySelector(`#select_profit_center_sppn_${i}`);
                if (pcSelect && !String(pcSelect.value || '').trim()) {
                    missing.push(`Profit Center baris SPPn ${i}`);
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
            const tab = document.querySelector('#tab-informasi-sppn');
            const input = document.querySelector('#dokumen_pendukung_sppn');
            const fileCount = input && input.files ? input.files.length : 0;
            const docs = tab ? tab.querySelectorAll(
                '.file-row, .dz-preview, .dz-success, table tbody tr, .list-dokumen li'
            ).length : 0;
            lines.push(`uploaded_doc_rows=${docs}; file_input_count=${fileCount}`);
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


def _flash_error_detail(page: Page) -> str:
    """Pesan flash Laravel yang dirender ulang setelah redirect gagal simpan."""
    try:
        html = page.content()
    except Exception:
        return ""
    idx = html.find("Terdapat Error")
    if idx < 0:
        return ""
    snippet = html[max(0, idx - 1500): idx + 1500]
    return " ".join(snippet.split())[:3000]


def _dismiss_swal_dialogs(page: Page, *, print_after: bool = False) -> None:
    for _ in range(12):
        popup = _swal_visible(page)
        try:
            popup.wait_for(state="visible", timeout=5000)
        except Exception:
            return

        text = popup.inner_text()
        lower = text.lower()
        logger.warning("Superman popup: %s", " | ".join(text.split()))
        if "error" in lower and "penyimpanan" in lower:
            detail = _flash_error_detail(page)
            logger.warning("Superman store error detail: %s", detail)
            raise RuntimeError(f"Superman menolak simpan draft: {' '.join(text.split())} {detail}".strip())
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


def _raise_if_store_rejected(status: int, body: dict | list | str | None) -> None:
    """Superman bisa membalas /spp/store dengan error tanpa membuat draft — jangan anggap sukses."""
    snippet = body if isinstance(body, str) else str(body)
    logger.warning("Superman /spp/store HTTP %s: %s", status, snippet[:2000])
    reason = ""
    if status >= 400:
        reason = f"HTTP {status}"
    elif isinstance(body, dict):
        flag_fail = (
            body.get("success") is False
            or body.get("ok") is False
            or str(body.get("status", "")).lower() in ("false", "error", "failed", "gagal")
        )
        if flag_fail or body.get("errors"):
            reason = str(body.get("message") or body.get("msg") or body.get("errors") or "ditolak")
    if reason:
        raise RuntimeError(f"Superman menolak simpan draft: {reason}. Respons: {snippet[:300]}")


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
        store_resp = resp_info.value
        try:
            store_body = store_resp.json()
        except Exception:
            try:
                store_body = store_resp.text()
            except Exception:
                store_body = None
    _raise_if_store_rejected(store_resp.status, store_body)

    # Jangan pakai networkidle — SPA Superman sering punya poll/websocket
    # yang membuat wait menggantung di Railway sampai timeout.
    try:
        page.wait_for_load_state("domcontentloaded", timeout=15000)
    except Exception:
        pass
    page.wait_for_timeout(2000)
    if on_progress:
        on_progress(91, "Draft tersimpan di Superman")
    return store_body


def pause_for_review(page: Page, message: str) -> None:
    print(message)
    if not page.context.browser:
        return
    try:
        input("Tekan Enter setelah cek form / upload dokumen ... ")
    except EOFError:
        page.wait_for_timeout(30000)