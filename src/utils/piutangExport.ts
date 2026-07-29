import { PIUTANG_AGING_LABEL, type PiutangRow } from '@/utils/piutangUtils'
import {
  addTemplatedSheet,
  downloadWorkbook,
  newWorkbook,
  todayKey,
  type ExcelColumn,
} from '@/utils/excelTemplate'

const ALASAN: Record<PiutangRow['alasan'], string> = {
  invoice: 'Invoice terbit',
  jatuh_tempo: 'Sudah JT',
  keduanya: 'Invoice + JT',
}

export async function exportPiutangExcel(
  rows: PiutangRow[],
  opts?: { includeSP?: boolean },
): Promise<void> {
  const includeSP = opts?.includeSP ?? false
  const today = todayKey()

  const columns: ExcelColumn[] = [
    { header: 'Mitra', key: 'namaMitra', width: 24, type: 'text' },
    { header: 'Aset', key: 'namaAset', width: 22, type: 'text' },
    { header: 'No. Perjanjian', key: 'noPerjanjian', width: 16, type: 'text' },
    { header: 'Periode', key: 'periodeLabel', width: 14, type: 'text' },
    { header: 'Tgl Jatuh Tempo', key: 'tglJatuhTempo', width: 14, type: 'date', align: 'center' },
    { header: 'Aging', key: 'aging', width: 18, type: 'text' },
    { header: 'Hari lewat JT', key: 'hariDariJT', width: 12, type: 'int', align: 'center' },
    { header: 'Alasan', key: 'alasan', width: 14, type: 'text' },
    { header: 'No. Invoice', key: 'noInvoice', width: 14, type: 'text' },
    { header: 'No. Invoice SAP', key: 'noInvoiceSap', width: 14, type: 'text' },
    { header: 'Tgl Invoice', key: 'invoiceTgl', width: 12, type: 'date', align: 'center' },
    { header: 'Tagihan efektif', key: 'efektifTagihan', width: 15, type: 'money' },
    { header: 'Dibayar', key: 'totalDibayar', width: 14, type: 'money' },
    { header: 'Sisa', key: 'sisa', width: 14, type: 'money' },
    { header: 'Est. Denda', key: 'nominalDenda', width: 14, type: 'money' },
    ...(includeSP
      ? [
          { header: 'SP aktif', key: 'spJenis', width: 10, type: 'text' as const, align: 'center' as const },
          { header: 'Status KS', key: 'statusKs', width: 12, type: 'text' as const },
        ]
      : []),
  ]

  const data = rows.map(r => ({
    namaMitra: r.namaMitra,
    namaAset: r.namaAset,
    noPerjanjian: r.noPerjanjian,
    periodeLabel: r.periodeLabel,
    tglJatuhTempo: r.tglJatuhTempo,
    aging: PIUTANG_AGING_LABEL[r.aging],
    hariDariJT: r.hariDariJT,
    alasan: ALASAN[r.alasan],
    noInvoice: r.noInvoice ?? '',
    noInvoiceSap: r.noInvoiceSap ?? '',
    invoiceTgl: r.invoiceTgl ?? '',
    efektifTagihan: Math.round(r.efektifTagihan),
    totalDibayar: Math.round(r.totalDibayar),
    sisa: Math.round(r.sisa),
    nominalDenda: Math.round(r.nominalDenda),
    ...(includeSP
      ? { spJenis: r.spJenis ?? '', statusKs: r.statusKs }
      : {}),
  }))

  const totalSisa = Math.round(rows.reduce((s, r) => s + r.sisa, 0))
  const totalDenda = Math.round(rows.reduce((s, r) => s + r.nominalDenda, 0))

  const wb = newWorkbook()
  addTemplatedSheet(wb, {
    sheetName: 'Piutang',
    title: 'Daftar Piutang — Collection',
    subtitle: 'Tagihan outstanding (sisa > 0) yang sudah ber-invoice atau jatuh tempo',
    metaLines: [
      `Jumlah tagihan: ${rows.length}`,
      `Total sisa piutang: ${totalSisa.toLocaleString('id-ID')}`,
      `Est. denda: ${totalDenda.toLocaleString('id-ID')}`,
      `Diekspor: ${today}`,
    ],
    columns,
    rows: data,
    totalKeys: ['efektifTagihan', 'totalDibayar', 'sisa', 'nominalDenda'],
    totalLabelCol: 0,
  })

  await downloadWorkbook(wb, `Piutang_${today}.xlsx`)
}
