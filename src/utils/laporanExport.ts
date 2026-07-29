import * as XLSX from 'xlsx'
import type { ProgramLaporanRow } from '@/utils/laporanProgramUtils'

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

export function exportLaporanDetailExcel(
  rows: LaporanDetailExportRow[],
  opts: { tahun: number; bulanBasis: string; monthsLabel?: string },
): void {
  const today = new Date().toISOString().slice(0, 10)
  const headers = [
    'Mitra',
    'Aset',
    'Periode',
    'No. Perjanjian',
    'Status',
    'Tgl Billing / JT',
    'Tgl Pembayaran',
    'No. Kontrak SAP',
    'No. Invoice SAP',
    'No. Billing SAP',
    'Total Tagihan',
    'Cash In',
    'Pendapatan Akrual',
    'Sisa',
  ]

  const data = rows.map(r => [
    r.namaMitra,
    r.namaAset,
    r.periodeLabel,
    r.noPerjanjian,
    STATUS_LABEL[r.status] ?? r.status,
    r.tglBilling?.slice(0, 10) ?? '',
    r.tglBayarList.join(', '),
    r.noKontrakSAP === '-' ? '' : r.noKontrakSAP,
    r.noInvoice === '-' ? '' : r.noInvoice,
    r.noBilling === '-' ? '' : r.noBilling,
    Math.round(r.totalTagihan),
    Math.round(r.cashIn),
    Math.round(r.pendapatanAkrual),
    Math.round(r.sisa),
  ])

  const total = [
    'TOTAL',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    Math.round(rows.reduce((s, r) => s + r.totalTagihan, 0)),
    Math.round(rows.reduce((s, r) => s + r.cashIn, 0)),
    Math.round(rows.reduce((s, r) => s + r.pendapatanAkrual, 0)),
    Math.round(rows.reduce((s, r) => s + r.sisa, 0)),
  ]

  const meta = [
    [`Laporan Pendapatan — Detail Tagihan ${opts.tahun}`],
    [`Basis filter: ${opts.bulanBasis === 'diterima' ? 'Tanggal bayar (diterima)' : 'Jatuh tempo'}`],
    opts.monthsLabel ? [`Bulan: ${opts.monthsLabel}`] : [],
    [`Diekspor: ${today}`],
    [],
  ].filter(r => r.length > 0)

  const ws = XLSX.utils.aoa_to_sheet([...meta, headers, ...data, total])
  ws['!cols'] = [22, 22, 14, 16, 12, 12, 22, 16, 16, 14, 14, 12, 14, 12].map(wch => ({ wch }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Detail Tagihan')
  XLSX.writeFile(wb, `Laporan_Pendapatan_Detail_${opts.tahun}_${today}.xlsx`)
}

export function exportLaporanProgramExcel(
  rows: ProgramLaporanRow[],
  opts: { tahun: number; horizon: string },
): void {
  const today = new Date().toISOString().slice(0, 10)
  const headers = [
    'No',
    'ID Monika',
    'Nama Proker',
    'Kategori',
    'RKAP',
    'Pendapatan',
    'Cash In',
    'Capaian %',
  ]

  const data = rows.map(r => [
    r.no,
    r.kode,
    r.programAset,
    r.kategori,
    Math.round(r.rkap),
    Math.round(r.pendapatan),
    Math.round(r.cashIn),
    r.capaianPct != null ? +r.capaianPct.toFixed(1) : null,
  ])

  const total = [
    '',
    '',
    'TOTAL',
    '',
    Math.round(rows.reduce((s, r) => s + r.rkap, 0)),
    Math.round(rows.reduce((s, r) => s + r.pendapatan, 0)),
    Math.round(rows.reduce((s, r) => s + r.cashIn, 0)),
    '',
  ]

  const meta = [
    [`Laporan Pendapatan — Per Proker ${opts.tahun}`],
    [`Cakupan: ${opts.horizon === 'ytd' ? 'YTD' : 'Full year'}`],
    [`Diekspor: ${today}`],
    [],
  ]

  const ws = XLSX.utils.aoa_to_sheet([...meta, headers, ...data, total])
  ws['!cols'] = [6, 16, 32, 14, 14, 14, 14, 10].map(wch => ({ wch }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Per Proker')
  XLSX.writeFile(wb, `Laporan_Pendapatan_Proker_${opts.tahun}_${today}.xlsx`)
}
