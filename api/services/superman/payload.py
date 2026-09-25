from __future__ import annotations

from dataclasses import asdict, dataclass, fields
from datetime import datetime, timedelta, timezone
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
    PROFIT_CENTER_SEARCH,
)


# Image API tanpa tzdata; WIB tetap UTC+7 tanpa DST.
WIB = timezone(timedelta(hours=7))


def _tanggal_dokumen() -> str:
    """Tanggal surat SPPn/SPPb = hari dibuat (WIB), bukan tanggal bayar.

    Superman menurunkan bulan nomor dari tanggal ini; tanggal mundur ke bulan lalu
    membuat nomor bentrok (mis. SPPn/99/VIII/2026 sudah terpakai) dan simpan gagal.
    """
    # Superman mem-parse d-m-Y; format d/m/Y membuat simpan gagal ("Terdapat Error Saat Proses Penyimpanan").
    return datetime.now(WIB).strftime("%d-%m-%Y")


@dataclass
class LineItem:
    gl_code: str
    sap_customer: str
    profit_center_search: str
    cash_flow: str
    uraian: str
    nominal: int
    customer_nama: str = ""


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

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "DeklarasiPayload":
        raw = dict(data or {})
        line_items = [LineItem(**item) for item in (raw.pop("line_items", None) or [])]
        sppb_raw = raw.pop("sppb_item", None)
        sppb_item = SppbLineItem(**sppb_raw) if sppb_raw else None
        allowed = {f.name for f in fields(cls)}
        cleaned = {k: v for k, v in raw.items() if k in allowed and k not in ("line_items", "sppb_item")}
        return cls(line_items=line_items, sppb_item=sppb_item, **cleaned)


def _efektif_tagihan(kompensasi: models.Kompensasi) -> float:
    total = float(kompensasi.total_tagihan or 0)
    pengurang = float(kompensasi.pengurang or 0)
    return max(0.0, total - pengurang)


def _kas_diterima(kompensasi: models.Kompensasi, pay_rows: list) -> float:
    pay_total = sum(float(p.nominal_bayar or 0) for p in pay_rows)
    return min(pay_total, _efektif_tagihan(kompensasi))


def _porsi_diterima(kompensasi: models.Kompensasi, pay_rows: list) -> tuple[int, int, int, int]:
    """(dpp, ppn, pph, kas) sebanding uang masuk terhadap kewajiban kas efektif.

    Tagihan belum lunas tetap boleh di-SPPn-kan: DPP/PPN/PPh diskalakan dengan
    rasio kas/efektif. Selisih pembulatan diserap PPN agar SPPn − SPPb = kas persis.
    """
    efektif = _efektif_tagihan(kompensasi)
    kas = _kas_diterima(kompensasi, pay_rows)
    if efektif <= 0 or kas <= 0:
        return 0, 0, 0, 0
    rasio = kas / efektif
    pph_full = 0.0
    if str(kompensasi.pph_mode or "none") == "bukti_potong":
        pph_full = float(kompensasi.nominal_pph or 0)
    dpp = int(round(float(kompensasi.nominal or 0) * rasio))
    pph = int(round(pph_full * rasio))
    kas_i = int(round(kas))
    if float(kompensasi.pengurang or 0) > 0:
        ppn = int(round(float(kompensasi.nominal_ppn or 0) * rasio))
    else:
        ppn = kas_i + pph - dpp
    return dpp, ppn, pph, kas_i


def _is_sebagian(kompensasi: models.Kompensasi, pay_rows: list) -> bool:
    return _kas_diterima(kompensasi, pay_rows) + 0.5 < _efektif_tagihan(kompensasi)


def _belum_ada_pembayaran(kompensasi: models.Kompensasi) -> ValueError:
    return ValueError(
        f"Belum ada pembayaran yang diterima untuk tagihan ini "
        f"(kewajiban efektif: Rp {_efektif_tagihan(kompensasi):,.0f})."
    )


def _kode_customer_mitra(ks: models.KerjaSama) -> str:
    """Baris pendapatan memakai customer = mitra sendiri; kodenya No. Kontrak SAP KS."""
    kode = (ks.no_kontrak_sap or "").strip()
    if not kode:
        raise ValueError(
            f"No. Kontrak SAP untuk {ks.nama_mitra or 'mitra ini'} belum diisi di Kerja Sama — "
            "nomor itu dipakai sebagai Kode Customer mitra di Superman."
        )
    return kode


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
        dpp, ppn, pph, kas = _porsi_diterima(kompensasi, pay_rows)
        if kas <= 0:
            raise _belum_ada_pembayaran(kompensasi)
        sebagian = _is_sebagian(kompensasi, pay_rows)

        latest_pay = pay_rows[-1] if pay_rows else None

        pph_persen = float(kompensasi.pph_persen or 0) if pph > 0 else 0.0
        jenis_form = "sppb_sppn" if pph > 0 else "sppn"

        aset_nama = (ks.aset.nama_aset or "").strip() if ks.aset else "Aset"
        periode = (kompensasi.periode_label or "").strip()
        mitra = (ks.nama_mitra or "").strip()
        no_kontrak = (ks.no_perjanjian or ks.no_kontrak_sap or "").strip()
        no_invoice = (kompensasi.no_invoice or str(kompensasi.id)).strip()

        uraian_pokok = f"Penerimaan Sewa {aset_nama}"
        if periode:
            uraian_pokok += f" periode {periode}"
        if mitra:
            uraian_pokok += f" ({mitra})"
        if sebagian:
            uraian_pokok += " - pembayaran sebagian"

        uraian_ppn = f"PPN atas Penerimaan Sewa {aset_nama}"
        if periode:
            uraian_ppn += f" {periode}"
        uraian_pph = f"PPh Final atas Penerimaan Sewa {aset_nama}"
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
                    gl_code="",
                    sap_customer=_kode_customer_mitra(ks),
                    customer_nama=mitra,
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
                    sap_customer="",
                    profit_center_search=PROFIT_CENTER_SEARCH,
                    cash_flow=CF_PPN_ID,
                    uraian=uraian_ppn,
                    nominal=ppn,
                )
            )

        no_pembayaran = (latest_pay.no_pembayaran if latest_pay else "") or ""
        ba_au58 = no_kontrak or "-"

        return DeklarasiPayload(
            kompensasi_id=str(kompensasi.id),
            no_do="",
            no_pembayaran=no_pembayaran,
            no_invoice=no_invoice,
            no_kontrak=no_kontrak,
            ba_au58=ba_au58,
            mitra_pembeli=mitra,
            tanggal_transfer=_tanggal_dokumen(),
            dpp_pokok=dpp,
            pajak_ppn=ppn,
            pph_nominal=pph,
            pph_persen=pph_persen,
            jumlah_transfer=kas,
            periode_label=periode,
            uraian_pokok=uraian_pokok,
            uraian_ppn=uraian_ppn,
            uraian_pph=uraian_pph,
            referensi=(kompensasi.no_invoice or "").strip() or "-",
            kontrak_sap=(ks.no_kontrak_sap or "").strip(),
            gl_pendapatan="",
            gl_ppn=GL_PPN,
            gl_pph=GL_PPH,
            jenis_form=jenis_form,
            kpp_recipient=KPP_RECIPIENT_NAME,
            line_items=line_items,
            sppb_item=sppb_item,
        )
    finally:
        db.close()


def sppn_ready(kompensasi: models.Kompensasi, pay_rows: list) -> bool:
    """Minimal ada uang masuk — nominal SPPn mengikuti porsi yang diterima."""
    return _kas_diterima(kompensasi, pay_rows) > 0.5


def sppb_pph_ready(kompensasi: models.Kompensasi, pay_rows: list) -> bool:
    """PPh siap dideklarasikan — pph_mode aktif dan minimal 1 pembayaran ditandai disetor."""
    if str(kompensasi.pph_mode or "none") != "bukti_potong":
        return False
    return any(bool(p.is_pph_disetor) for p in pay_rows)


def build_sppn_payload(kompensasi_id: str) -> DeklarasiPayload:
    """Payload SPPn saja — pokok+PPN(+diskon), independen dari status PPh."""
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
        if not sppn_ready(kompensasi, pay_rows):
            raise _belum_ada_pembayaran(kompensasi)
        dpp, ppn, _pph, _kas = _porsi_diterima(kompensasi, pay_rows)
        sebagian = _is_sebagian(kompensasi, pay_rows)

        latest_pay = pay_rows[-1] if pay_rows else None

        aset_nama = (ks.aset.nama_aset or "").strip() if ks.aset else "Aset"
        periode = (kompensasi.periode_label or "").strip()
        mitra = (ks.nama_mitra or "").strip()
        no_kontrak = (ks.no_perjanjian or ks.no_kontrak_sap or "").strip()
        no_invoice = (kompensasi.no_invoice or str(kompensasi.id)).strip()

        uraian_pokok = f"Penerimaan Sewa {aset_nama}"
        if periode:
            uraian_pokok += f" periode {periode}"
        if mitra:
            uraian_pokok += f" ({mitra})"
        if sebagian:
            uraian_pokok += " - pembayaran sebagian"
        uraian_ppn = f"PPN atas Penerimaan Sewa {aset_nama}"
        if periode:
            uraian_ppn += f" {periode}"

        line_items: list[LineItem] = []
        if dpp > 0:
            line_items.append(
                LineItem(
                    gl_code="",
                    sap_customer=_kode_customer_mitra(ks),
                    customer_nama=mitra,
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
                    sap_customer="",
                    profit_center_search=PROFIT_CENTER_SEARCH,
                    cash_flow=CF_PPN_ID,
                    uraian=uraian_ppn,
                    nominal=ppn,
                )
            )

        no_pembayaran = (latest_pay.no_pembayaran if latest_pay else "") or ""
        ba_au58 = no_kontrak or "-"

        return DeklarasiPayload(
            kompensasi_id=str(kompensasi.id),
            no_do="",
            no_pembayaran=no_pembayaran,
            no_invoice=no_invoice,
            no_kontrak=no_kontrak,
            ba_au58=ba_au58,
            mitra_pembeli=mitra,
            tanggal_transfer=_tanggal_dokumen(),
            dpp_pokok=dpp,
            pajak_ppn=ppn,
            pph_nominal=0,
            pph_persen=0.0,
            jumlah_transfer=dpp + ppn,
            periode_label=periode,
            uraian_pokok=uraian_pokok,
            uraian_ppn=uraian_ppn,
            uraian_pph="",
            referensi=(kompensasi.no_invoice or "").strip() or "-",
            kontrak_sap=(ks.no_kontrak_sap or "").strip(),
            gl_pendapatan="",
            gl_ppn=GL_PPN,
            gl_pph=GL_PPH,
            jenis_form="sppn",
            kpp_recipient=KPP_RECIPIENT_NAME,
            line_items=line_items,
            sppb_item=None,
        )
    finally:
        db.close()


def build_sppb_pph_payload(kompensasi_id: str) -> DeklarasiPayload:
    """Payload SPPb saja — PPh, independen dari status pokok/PPN."""
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
        if not sppb_pph_ready(kompensasi, pay_rows):
            raise ValueError(
                "PPh belum siap dideklarasikan — pastikan pph_mode 'bukti_potong' dan "
                "minimal 1 pembayaran ditandai 'PPh sudah disetor'."
            )

        _dpp, _ppn, pph, _kas = _porsi_diterima(kompensasi, pay_rows)
        if pph <= 0:
            raise ValueError("Nominal PPh nol — tidak ada yang perlu dideklarasikan.")
        pph_persen = float(kompensasi.pph_persen or 0)

        aset_nama = (ks.aset.nama_aset or "").strip() if ks.aset else "Aset"
        periode = (kompensasi.periode_label or "").strip()
        mitra = (ks.nama_mitra or "").strip()
        no_kontrak = (ks.no_perjanjian or ks.no_kontrak_sap or "").strip()
        no_invoice = (kompensasi.no_invoice or str(kompensasi.id)).strip()

        uraian_pph = f"PPh Final atas Penerimaan Sewa {aset_nama}"
        if no_kontrak:
            uraian_pph += f" kontrak {no_kontrak}"

        pph_pay_rows = [p for p in pay_rows if p.is_pph_disetor]
        latest_pph_pay = pph_pay_rows[-1] if pph_pay_rows else (pay_rows[-1] if pay_rows else None)
        no_pembayaran = (latest_pph_pay.no_pembayaran if latest_pph_pay else "") or ""
        ba_au58 = no_kontrak or "-"

        sppb_item = SppbLineItem(
            gl_code=GL_PPH,
            profit_center_search=PROFIT_CENTER_SEARCH,
            cash_flow=CF_PPH_ID,
            uraian=uraian_pph,
            nominal=pph,
        )

        return DeklarasiPayload(
            kompensasi_id=str(kompensasi.id),
            no_do="",
            no_pembayaran=no_pembayaran,
            no_invoice=no_invoice,
            no_kontrak=no_kontrak,
            ba_au58=ba_au58,
            mitra_pembeli=mitra,
            tanggal_transfer=_tanggal_dokumen(),
            dpp_pokok=0,
            pajak_ppn=0,
            pph_nominal=pph,
            pph_persen=pph_persen,
            jumlah_transfer=pph,
            periode_label=periode,
            uraian_pokok="",
            uraian_ppn="",
            uraian_pph=uraian_pph,
            referensi=(kompensasi.no_invoice or "").strip() or "-",
            kontrak_sap=(ks.no_kontrak_sap or "").strip(),
            gl_pendapatan="",
            gl_ppn=GL_PPN,
            gl_pph=GL_PPH,
            jenis_form="sppb",
            kpp_recipient=KPP_RECIPIENT_NAME,
            line_items=[],
            sppb_item=sppb_item,
        )
    finally:
        db.close()