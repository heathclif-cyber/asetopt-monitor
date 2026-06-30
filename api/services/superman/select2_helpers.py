from __future__ import annotations

from playwright.sync_api import Page

BASE = "https://superman.ptpn1.co.id"


def _fetch_gl(page: Page, gl_kode: str) -> dict | None:
    resp = page.request.get(f"{BASE}/spp/master_gl_tambah_v2?page=1&q={gl_kode}")
    if not resp.ok:
        return None
    rows = resp.json().get("result") or []
    for row in rows:
        if row.get("master_gl_kode") == gl_kode:
            return row
    return rows[0] if rows else None


def _fetch_customer(page: Page, customer_code: str) -> dict | None:
    endpoints = (
        f"/spp/master_customer_tambah_v2?page=1&q={customer_code}",
        f"/spp/get_customer_sap?page=1&q={customer_code}",
        f"/spp/master_customer?page=1&q={customer_code}",
    )
    for path in endpoints:
        resp = page.request.get(f"{BASE}{path}")
        if not resp.ok:
            continue
        body = resp.json()
        rows = body.get("result") or body.get("data") or []
        for row in rows:
            code = (
                row.get("master_customer_kode")
                or row.get("customer_kode")
                or row.get("kode")
                or ""
            )
            if str(code).strip() == customer_code:
                return row
    return None


def _fetch_profit_center(page: Page, search: str) -> dict | None:
    resp = page.request.get(f"{BASE}/spp/get_profit_center?page=1&q={search}")
    if not resp.ok:
        return None
    rows = resp.json().get("result") or []
    search_n = search.strip().upper()
    for row in rows:
        kode = (row.get("master_profit_center_kode") or "").upper()
        unit = (row.get("master_profit_unit") or "").upper()
        if search_n == kode or search_n in unit:
            return row
    for row in rows:
        if "REGIONAL 8" in (row.get("master_profit_unit") or "").upper():
            return row
    return rows[0] if rows else None


def _customer_field_exists(page: Page, isi_index: int) -> bool:
    for sid in (
        f"sap_customer_sppn_{isi_index}",
        f"select_customer_sppn_{isi_index}",
        f"customer_sppn_{isi_index}",
    ):
        if page.locator(f"#{sid}").count():
            return True
    return False


def _verify_hidden_value(
    page: Page,
    hidden_ids: tuple[str, ...],
    expected: str,
    label: str,
) -> None:
    expected_s = str(expected).strip()
    for hid in hidden_ids:
        loc = page.locator(f"#{hid}")
        if not loc.count():
            continue
        val = str(loc.input_value() or "").strip()
        if val:
            return
    raise RuntimeError(f"{label}: hidden ID tidak terisi ({', '.join(hidden_ids)})")


def _set_select2_value(page: Page, select_id: str, hidden_id: str, option_id: str, option_text: str) -> None:
    page.evaluate(
        """([selectId, hiddenId, optId, optText]) => {
            const $sel = window.jQuery ? jQuery('#' + selectId) : null;
            if ($sel && $sel.length) {
                const opt = new Option(optText, optId, true, true);
                $sel.append(opt).trigger('change');
            }
            const hidden = document.getElementById(hiddenId);
            if (hidden) {
                hidden.style.display = 'block';
                hidden.value = optId;
                hidden.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }""",
        [select_id, hidden_id, option_id, option_text],
    )
    page.wait_for_timeout(600)


def pick_customer(page: Page, isi_index: int, customer_code: str) -> None:
    if not _customer_field_exists(page, isi_index):
        return

    row = _fetch_customer(page, customer_code)
    if not row:
        raise RuntimeError(f"Customer SAP {customer_code} tidak ditemukan di master Superman")

    customer_id = str(
        row.get("master_customer_id")
        or row.get("customer_id")
        or row.get("id")
        or ""
    )
    if not customer_id:
        raise RuntimeError(f"Customer SAP {customer_code}: ID kosong di response API")

    code = (
        row.get("master_customer_kode")
        or row.get("customer_kode")
        or row.get("kode")
        or customer_code
    )
    name = row.get("master_customer_nama") or row.get("customer_nama") or row.get("nama") or ""
    text = f"({code}) {name}".strip()
    pairs = (
        (f"sap_customer_sppn_{isi_index}", f"sap_customer_id_sppn_{isi_index}"),
        (f"select_customer_sppn_{isi_index}", f"select_customer_id_sppn_{isi_index}"),
        (f"customer_sppn_{isi_index}", f"customer_id_sppn_{isi_index}"),
    )
    for select_id, hidden_id in pairs:
        if not page.locator(f"#{select_id}").count():
            continue
        _set_select2_value(page, select_id, hidden_id, customer_id, text)
        _verify_hidden_value(
            page,
            (hidden_id,),
            customer_id,
            f"Customer SAP baris SPPn {isi_index}",
        )
        return

    raise RuntimeError(f"Tidak ada field customer SPPn untuk baris {isi_index}")


def pick_gl(page: Page, isi_index: int, gl_kode: str) -> None:
    row = _fetch_gl(page, gl_kode)
    if not row:
        raise RuntimeError(f"GL {gl_kode} tidak ditemukan di master Superman")
    gl_id = str(row["master_gl_id"])
    text = f"({row['master_gl_kode']}) {row['master_gl_keterangan']}"
    page.select_option(f"#jenis_sap_sppn_{isi_index}", "gl", force=True)
    page.wait_for_timeout(400)
    _set_select2_value(
        page,
        f"sap_gl_sppn_{isi_index}",
        f"sap_gl_sppn_id_{isi_index}",
        gl_id,
        text,
    )
    _verify_hidden_value(
        page,
        (f"sap_gl_sppn_id_{isi_index}",),
        gl_id,
        f"GL baris SPPn {isi_index}",
    )


def pick_profit_center(page: Page, isi_index: int, search: str = "Regional 8") -> None:
    row = _fetch_profit_center(page, search)
    if not row:
        raise RuntimeError(f"Profit center '{search}' tidak ditemukan")
    pc_id = str(row["master_profit_center_id"])
    text = f"{row['master_profit_center_kode']} - {row['master_profit_unit']}"
    page.select_option(f"#jenis_center_sppn_{isi_index}", "profit_center", force=True)
    page.wait_for_timeout(400)
    select_id = f"select_profit_center_sppn_{isi_index}"
    hidden_candidates = (
        f"profit_center_sppn_id_{isi_index}",
        f"select_profit_center_sppn_id_{isi_index}",
        f"master_profit_center_id_sppn_{isi_index}",
    )
    for hidden_id in hidden_candidates:
        if page.locator(f"#{hidden_id}").count():
            _set_select2_value(page, select_id, hidden_id, pc_id, text)
            _verify_hidden_value(
                page,
                (hidden_id,),
                pc_id,
                f"Profit Center baris SPPn {isi_index}",
            )
            return
    page.evaluate(
        """([selectId, optId, optText]) => {
            const $sel = window.jQuery ? jQuery('#' + selectId) : null;
            if ($sel && $sel.length) {
                const opt = new Option(optText, optId, true, true);
                $sel.append(opt).trigger('change');
            }
        }""",
        [select_id, pc_id, text],
    )
    page.wait_for_timeout(600)
    _verify_hidden_value(
        page,
        hidden_candidates,
        pc_id,
        f"Profit Center baris SPPn {isi_index}",
    )


def pick_cash_flow(page: Page, isi_index: int, cf_id: str) -> None:
    sel = "#cash_flow_sppn" if isi_index == 1 else f"#cash_flow_sppn_{isi_index}"
    if page.locator(sel).count():
        page.select_option(sel, cf_id, force=True)
    page.wait_for_timeout(300)


def pick_gl_sppb(page: Page, isi_index: int, gl_kode: str) -> None:
    row = _fetch_gl(page, gl_kode)
    if not row:
        raise RuntimeError(f"GL {gl_kode} tidak ditemukan di master Superman")
    gl_id = str(row["master_gl_id"])
    text = f"({row['master_gl_kode']}) {row['master_gl_keterangan']}"
    page.select_option(f"#jenis_sap_sppb_{isi_index}", "gl", force=True)
    page.wait_for_timeout(400)
    _set_select2_value(
        page,
        f"sap_gl_sppb_{isi_index}",
        f"sap_gl_sppb_id_{isi_index}",
        gl_id,
        text,
    )


def pick_profit_center_sppb(page: Page, isi_index: int, search: str = "Regional 8") -> None:
    row = _fetch_profit_center(page, search)
    if not row:
        raise RuntimeError(f"Profit center '{search}' tidak ditemukan")
    pc_id = str(row["master_profit_center_id"])
    text = f"{row['master_profit_center_kode']} - {row['master_profit_unit']}"
    page.select_option(f"#jenis_center_sppb_{isi_index}", "profit_center", force=True)
    page.wait_for_timeout(400)
    select_id = f"select_profit_center_sppb_{isi_index}"
    hidden_candidates = (
        f"profit_center_sppb_id_{isi_index}",
        f"select_profit_center_sppb_id_{isi_index}",
        f"master_profit_center_id_sppb_{isi_index}",
    )
    for hidden_id in hidden_candidates:
        if page.locator(f"#{hidden_id}").count():
            _set_select2_value(page, select_id, hidden_id, pc_id, text)
            return
    page.evaluate(
        """([selectId, optId, optText]) => {
            const $sel = window.jQuery ? jQuery('#' + selectId) : null;
            if ($sel && $sel.length) {
                const opt = new Option(optText, optId, true, true);
                $sel.append(opt).trigger('change');
            }
        }""",
        [select_id, pc_id, text],
    )
    page.wait_for_timeout(600)


def pick_cash_flow_sppb(page: Page, isi_index: int, cf_id: str) -> None:
    sel = "#cash_flow_sppb_1" if isi_index == 1 else f"#cash_flow_sppb_{isi_index}"
    if page.locator(sel).count():
        page.select_option(sel, cf_id, force=True)
    page.wait_for_timeout(300)