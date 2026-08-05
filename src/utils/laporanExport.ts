import type { ProgramLaporanRow } from '@/utils/laporanProgramUtils'
import {
  addTemplatedSheet,
  downloadWorkbook,
  newWorkbook,
  todayKey,
  type ExcelColumn,
} from '@/utils/excelTemplate'

const STATUS_LABEL: Record<string, string> = {
  lunas: 'Lunas',
  sebagian: 'Belum Lunas',
  belum_bayar: 'Belum Lunas',
  terlambat: 'Belum Lunas',
}

export interface LaporanDetailExportRow {
  namaMitra: string
  namaAset: string
  periodeLabel: string
  noPerjanjian: string
  status: string
  tglBilling: string
  tglBayarList: string[]
  noKontrakSAP: string
  noInvoice: string
  noBilling: string
  totalTagihan: number
  cashIn: number
  pendapatanAkrual: number
  sisa: number
}

export async function exportLaporanDetailExcel(
  rows: LaporanDetailExportRow[],
  opts: { tahun: number; bulanBasis: string; monthsLabel?: string },
): Promise<void> {
  const today = todayKey()
  const columns: ExcelColumn[] = [
    { header: 'Mitra', key: 'namaMitra', width: 24, type: 'text' },
    { header: 'Aset', key: 'namaAset', width: 24, type: 'text' },
    { header: 'Periode', key: 'periodeLabel', width: 14, type: 'text' },
    { header: 'No. Perjanjian', key: 'noPerjanjian', width: 16, type: 'text' },
    { header: 'Status', key: 'status', width: 12, type: 'text', align: 'center' },
    { header: 'Tgl Billing / JT', key: 'tglBilling', width: 14, type: 'date', align: 'center' },
    { header: 'Tgl Pembayaran', key: 'tglBayar', width: 22, type: 'text' },
    { header: 'No. Kontrak SAP', key: 'noKontrakSAP', width: 16, type: 'text' },
    { header: 'No. Invoice SAP', key: 'noInvoice', width: 16, type: 'text' },
    { header: 'No. Billing SAP', key: 'noBilling', width: 14, type: 'text' },
    { header: 'Tagihan', key: 'totalTagihan', width: 15, type: 'money' },
    { header: 'Pendapatan', key: 'pendapatanAkrual', width: 15, type: 'money' },
    { header: 'Cash In', key: 'cashIn', width: 14, type: 'money' },
    { header: 'Sisa', key: 'sisa', width: 14, type: 'money' },
  ]

  const data = rows.map(r => ({
    namaMitra: r.namaMitra,
    namaAset: r.namaAset,
    periodeLabel: r.periodeLabel,
    noPerjanjian: r.noPerjanjian,
    status: STATUS_LABEL[r.status] ?? r.status,
    tglBilling: r.tglBilling?.slice(0, 10) ?? '',
    tglBayar: r.tglBayarList.join(', '),
    noKontrakSAP: r.noKontrakSAP === '-' ? '' : r.noKontrakSAP,
    noInvoice: r.noInvoice === '-' ? '' : r.noInvoice,
    noBilling: r.noBilling === '-' ? '' : r.noBilling,
    totalTagihan: Math.round(r.totalTagihan),
    cashIn: Math.round(r.cashIn),
    pendapatanAkrual: Math.round(r.pendapatanAkrual),
    sisa: Math.round(r.sisa),
  }))

  const wb = newWorkbook()
  addTemplatedSheet(wb, {
    sheetName: 'Detail Tagihan',
    title: `Laporan Pendapatan — Detail Tagihan ${opts.tahun}`,
    subtitle: 'Rekap kompensasi & cash in per tahap tagihan',
    metaLines: [
      `Basis filter: ${opts.bulanBasis === 'diterima' ? 'Tanggal bayar (diterima)' : 'Jatuh tempo'}`,
      ...(opts.monthsLabel ? [`Bulan: ${opts.monthsLabel}`] : []),
      `Jumlah baris: ${rows.length}`,
      `Diekspor: ${today}`,
    ],
    columns,
    rows: data,
    totalKeys: ['totalTagihan', 'cashIn', 'pendapatanAkrual', 'sisa'],
    totalLabelCol: 0,
  })

  await downloadWorkbook(wb, `Laporan_Pendapatan_Detail_${opts.tahun}_${today}.xlsx`)
}

export async function exportLaporanProgramExcel(
  rows: ProgramLaporanRow[],
  opts: { tahun: number; horizon: string },
): Promise<void> {
  const today = todayKey()
  const columns: ExcelColumn[] = [
    { header: 'No', key: 'no', width: 6, type: 'int', align: 'center' },
    { header: 'ID Monika', key: 'kode', width: 16, type: 'text' },
    { header: 'Nama Proker', key: 'programAset', width: 32, type: 'text' },
    { header: 'Kategori', key: 'kategori', width: 16, type: 'text' },
    { header: 'Target RKAP', key: 'rkap', width: 15, type: 'money' },
    { header: 'Pendapatan', key: 'pendapatan', width: 15, type: 'money' },
    { header: 'Cash In', key: 'cashIn', width: 15, type: 'money' },
    { header: 'Capaian %', key: 'capaianPct', width: 12, type: 'percent', align: 'center' },
  ]

  const data = rows.map(r => ({
    no: r.no,
    kode: r.kode,
    programAset: r.programAset,
    kategori: r.kategori,
    rkap: Math.round(r.rkap),
    pendapatan: Math.round(r.pendapatan),
    cashIn: Math.round(r.cashIn),
    capaianPct: r.capaianPct != null ? +r.capaianPct.toFixed(1) : null,
  }))

  const wb = newWorkbook()
  addTemplatedSheet(wb, {
    sheetName: 'Per Proker',
    title: `Laporan Pendapatan — Per Proker ${opts.tahun}`,
    subtitle: 'Rekap Optimalisasi Aset per ID Monika',
    metaLines: [
      `Cakupan: ${opts.horizon === 'ytd' ? 'YTD s.d. hari ini' : 'Full year'}`,
      `Jumlah program: ${rows.length}`,
      `Diekspor: ${today}`,
    ],
    columns,
    rows: data,
    totalKeys: ['rkap', 'pendapatan', 'cashIn'],
    totalLabelCol: 2,
  })

  await downloadWorkbook(wb, `Laporan_Pendapatan_Proker_${opts.tahun}_${today}.xlsx`)
}
