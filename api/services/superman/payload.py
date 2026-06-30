from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

from sqlalchemy.orm import joinedload

import models
from database import SessionLocal
from services.superman.komoditi_map import (
    CF_PENDAPATAN_ID,
    CF_PPH_ID,
    CF_PPN_ID,
    GL_PPH,
    GL_PPN,
    KPP_RECIPIENT_NAME,
    PROFIT_CENTER_PPN_SEARCH,
    PROFIT_CENTER_SEARCH,
    SAP_CUSTOMER,
    resolve_gl_pendapatan_aset,
)


def _to_superman_date(raw: str) -> str:
    if not raw:
        return ""
    parts = raw.split("-")
    if len(parts) == 3 and len(parts[0]) == 4:
        y, m, d = parts
        return f"{d}-{m}-{y}"
    return raw


@dataclass
class LineItem:
    gl_code: str
    sap_customer: str
    profit_center_search: str
    cash_flow: str
    uraian: str
    nominal: int


@dataclass
class SppbLineItem:
    gl_code: str
    profit_center_search: str
    cash_flow: str
    uraian: str
    nominal: int


@dataclass
class DeklarasiPayload:
    kompensasi_id: str
    no_do: str
    no_pembayaran: str
    no_invoice: str
    no_kontrak: str
    ba_au58: str
    mitra_pembeli: str
    tanggal_transfer: str
    dpp_pokok: int
    pajak_ppn: int
    pph_nominal: int
    pph_persen: float
    jumlah_transfer: int
    periode_label: str
    uraian_pokok: str
    uraian_ppn: str
    uraian_pph: str
    referensi: str
    kontrak_sap: str
    gl_pendapatan: str
    gl_ppn: str
    gl_pph: str
    jenis_form: str
    kpp_recipient: str
    line_items: list[LineItem]
    sppb_item: SppbLineItem | None = None

    def to_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data["line_items"] = [asdict(li) for li in self.line_items]
        if self.sppb_item:
            data["sppb_item"] = asdict(self.sppb_item)
        return data


def _efektif_tagihan(kompensasi: models.Kompensasi) -> float:
    total = float(kompensasi.total_tagihan or 0)
    pengurang = float(kompensasi.pengurang or 0)
    return max(0.0, total - pengurang)


def _load_kompensasi(db, kompensasi_id: str) -> models.Kompensasi:
    row = (
        db.query(models.Kompensasi)
        .options(
            joinedload(models.Kompensasi.kerja_sama).joinedload(models.KerjaSama.aset),
            joinedload(models.Kompensasi.pembayaran),
        )
        .filter(models.Kompensasi.id == kompensasi_id.strip())
        .first()
    )
    if not row:
        raise ValueError(f"Kompensasi tidak ditemukan: {kompensasi_id}")
    return row


def build_payload_from_kompensasi(kompensasi_id: str) -> DeklarasiPayload:
    db = SessionLocal()
    try:
        kompensasi = _load_kompensasi(db, kompensasi_id)
        ks = kompensasi.kerja_sama
        if not ks:
            raise ValueError(f"Kerja sama tidak ditemukan untuk kompensasi: {kompensasi_id}")

        pay_rows = sorted(
            kompensasi.pembayaran or [],
            key=lambda p: (p.tgl_bayar or "", p.no_pembayaran or ""),
        )
        efektif = _efektif_tagihan(kompensasi)
        pay_total = sum(float(p.nominal_bayar or 0) for p in pay_rows)
        if pay_total + 0.5 < efektif:
            raise ValueError(
                f"Kompensasi belum lunas. Total pembayaran: Rp {pay_total:,.0f}, "
                f"kewajiban efektif: Rp {efektif:,.0f}"
            )

        latest_pay = pay_rows[-1] if pay_rows else None
        dpp = int(round(float(kompensasi.nominal or 0)))
        ppn = int(round(float(kompensasi.nominal_ppn or 0)))
        pph = 0
        if str(kompensasi.pph_mode or "none") == "bukti_potong":
            pph = int(round(float(kompensasi.nominal_pph or 0)))

        pph_persen = float(kompensasi.pph_persen or 0) if pph > 0 else 0.0
        jenis_form = "sppb_sppn" if pph > 0 else "sppn"
        gl_pendapatan = resolve_gl_pendapatan_aset()

        aset_nama = ks.aset.nama_aset if ks.aset else "Aset"
        periode = (kompensasi.periode_label or "").strip()
        mitra = (ks.nama_mitra or "").strip()
        no_kontrak = (ks.no_perjanjian or ks.no_kontrak_sap or "").strip()
        no_invoice = (kompensasi.no_invoice or str(kompensasi.id)).strip()

        uraian_pokok = f"Penerimaan kompensasi sewa {aset_nama}"
        if periode:
            uraian_pokok += f" periode {periode}"
        if mitra:
            uraian_pokok += f" oleh {mitra}"

        uraian_ppn = f"PPN atas kompensasi sewa {aset_nama}"
        if periode:
            uraian_ppn += f" {periode}"
        uraian_pph = f"PPh atas kompensasi sewa {aset_nama}"
        if no_kontrak:
            uraian_pph += f" kontrak {no_kontrak}"

        sppb_item = None
        if pph > 0:
            sppb_item = SppbLineItem(
                gl_code=GL_PPH,
                profit_center_search=PROFIT_CENTER_SEARCH,
                cash_flow=CF_PPH_ID,
                uraian=uraian_pph,
                nominal=pph,
            )

        line_items: list[LineItem] = []
        if dpp > 0:
            line_items.append(
                LineItem(
                    gl_code=gl_pendapatan,
                    sap_customer=SAP_CUSTOMER,
                    profit_center_search=PROFIT_CENTER_SEARCH,
                    cash_flow=CF_PENDAPATAN_ID,
                    uraian=uraian_pokok,
                    nominal=dpp,
                )
            )
        if ppn > 0:
            line_items.append(
                LineItem(
                    gl_code=GL_PPN,
                    sap_customer=SAP_CUSTOMER,
                    profit_center_search=PROFIT_CENTER_PPN_SEARCH,
                    cash_flow=CF_PPN_ID,
                    uraian=uraian_ppn,
                    nominal=ppn,
                )
            )

        raw_date = ""
        if latest_pay and latest_pay.tgl_bayar:
            raw_date = latest_pay.tgl_bayar.isoformat()
        elif kompensasi.invoice_tgl:
            raw_date = kompensasi.invoice_tgl.isoformat()

        no_pembayaran = (latest_pay.no_pembayaran if latest_pay else "") or ""
        ba_au58 = no_pembayaran or no_invoice

        return DeklarasiPayload(
            kompensasi_id=str(kompensasi.id),
            no_do="",
            no_pembayaran=no_pembayaran,
            no_invoice=no_invoice,
            no_kontrak=no_kontrak,
            ba_au58=ba_au58,
            mitra_pembeli=mitra,
            tanggal_transfer=_to_superman_date(raw_date),
            dpp_pokok=dpp,
            pajak_ppn=ppn,
            pph_nominal=pph,
            pph_persen=pph_persen,
            jumlah_transfer=int(round(efektif)),
            periode_label=periode,
            uraian_pokok=uraian_pokok,
            uraian_ppn=uraian_ppn,
            uraian_pph=uraian_pph,
            referensi=no_invoice,
            kontrak_sap=(ks.no_kontrak_sap or "").strip(),
            gl_pendapatan=gl_pendapatan,
            gl_ppn=GL_PPN,
            gl_pph=GL_PPH,
            jenis_form=jenis_form,
            kpp_recipient=KPP_RECIPIENT_NAME,
            line_items=line_items,
            sppb_item=sppb_item,
        )
    finally:
        db.close()