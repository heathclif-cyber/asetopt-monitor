import * as XLSX from 'xlsx'
import { PIUTANG_AGING_LABEL, type PiutangRow } from '@/utils/piutangUtils'

const ALASAN: Record<PiutangRow['alasan'], string> = {
  invoice: 'Invoice terbit',
  jatuh_tempo: 'Sudah JT',
  keduanya: 'Invoice + JT',
}

export function exportPiutangExcel(
  rows: PiutangRow[],
  opts?: { includeSP?: boolean },
): void {
  const includeSP = opts?.includeSP ?? false
  const today = new Date().toISOString().slice(0, 10)

  const headers = [
    'Mitra',
    'Aset',
    'No. Perjanjian',
    'Periode',
    'Tgl Jatuh Tempo',
    'Aging',
    'Hari lewat JT',
    'Alasan masuk piutang',
    'No. Invoice',
    'No. Invoice SAP',
    'Tgl Invoice',
    'Tagihan efektif',
    'Dibayar',
    'Sisa',
    'Est. Denda',
    ...(includeSP ? ['SP aktif', 'Status KS'] : []),
  ]

  const data = rows.map(r => [
    r.namaMitra,
    r.namaAset,
    r.noPerjanjian,
    r.periodeLabel,
    r.tglJatuhTempo,
    PIUTANG_AGING_LABEL[r.aging],
    r.hariDariJT < 0 ? r.hariDariJT : r.hariDariJT,
    ALASAN[r.alasan],
    r.noInvoice ?? '',
    r.noInvoiceSap ?? '',
    r.invoiceTgl ?? '',
    Math.round(r.efektifTagihan),
    Math.round(r.totalDibayar),
    Math.round(r.sisa),
    Math.round(r.nominalDenda),
    ...(includeSP ? [r.spJenis ?? '', r.statusKs] : []),
  ])

  const totalRow = [
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
    '',
    Math.round(rows.reduce((s, r) => s + r.efektifTagihan, 0)),
    Math.round(rows.reduce((s, r) => s + r.totalDibayar, 0)),
    Math.round(rows.reduce((s, r) => s + r.sisa, 0)),
    Math.round(rows.reduce((s, r) => s + r.nominalDenda, 0)),
    ...(includeSP ? ['', ''] : []),
  ]

  const ws = XLSX.utils.aoa_to_sheet([headers, ...data, totalRow])
  ws['!cols'] = headers.map((_, i) => ({
    wch: [22, 22, 16, 14, 12, 16, 10, 14, 14, 14, 12, 14, 12, 12, 12, 10, 10][i] ?? 12,
  }))

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Piutang')
  XLSX.writeFile(wb, `Piutang_${today}.xlsx`)
}
