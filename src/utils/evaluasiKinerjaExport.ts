import ExcelJS from 'exceljs'
import type { HOMasterRow } from '@/utils/laporanHOUtils'
import { BULAN_LABELS_HO } from '@/utils/laporanHOUtils'

/**
 * Mengisi salinan workbook Evaluasi Kinerja yang disetujui pengguna.
 * Struktur, style, sheet, ukuran kolom, dan layout berasal langsung dari file
 * template; fungsi ini hanya mengubah nilai sel bahan laporan.
 */
const TEMPLATE_URL = '/templates/Worksheet in Template Evaluasi Kinerja 2026_Rev.xlsx'
const BIDANG_USAHA = [
  'Properti', 'Hospitality', 'Kesehatan', 'Pertambangan', 'Energy',
  'Kawasan Industri', 'Peternakan', 'Pertanian', 'Perkebunan',
  'Industri Lainnya', 'Kerja Sama Agrowisata',
] as const

const rpJuta = (value: number) => Math.round((value || 0) / 1_000_000 * 100) / 100
// Template Cash memakai target Cash In; template Pendapatan memakai target Pendapatan (laba-rugi).
const rkapBulanFor = (row: HOMasterRow, kind: 'cash' | 'pendapatan') => kind === 'cash' ? row.rkapBulan : row.rkapPendapatanBulan
const targetTahunFor = (row: HOMasterRow, kind: 'cash' | 'pendapatan') => kind === 'cash' ? row.targetTahun : row.targetPendapatanTahun
const total = (values: number[]) => values.reduce((sum, value) => sum + (value || 0), 0)
export type PrognosaEvaluasi = { kode: string; cash: number[]; pendapatan: number[] }

function canonicalBidang(value: string): string {
  const source = value.trim().toLowerCase()
  return BIDANG_USAHA.find(label => label.toLowerCase() === source)
    ?? BIDANG_USAHA.find(label => source.includes(label.toLowerCase()))
    ?? ''
}

function sumRows(rows: HOMasterRow[], bidang: string, select: (row: HOMasterRow) => number): number {
  return rows
    .filter(row => canonicalBidang(row.bidangUsaha) === bidang)
    .reduce((sum, row) => sum + select(row), 0)
}

function setNumber(cell: ExcelJS.Cell, value: number) {
  cell.value = Math.abs(value) < 0.005 ? 0 : value
}

/**
 * Workbook sumber memakai shared formula Excel. ExcelJS dapat membaca namun
 * gagal menulisnya kembali ketika salah satu selnya diperbarui (contohnya O17).
 * Ubah menjadi formula biasa dengan hasil rumus yang sama; style/layout tidak
 * disentuh dan Excel akan menghitung ulang saat file dibuka.
 */
function normalizeSharedFormulas(workbook: ExcelJS.Workbook) {
  const formulas: Array<{ cell: ExcelJS.Cell; formula: string }> = []
  workbook.worksheets.forEach(ws => {
    ws.eachRow({ includeEmpty: true }, row => row.eachCell({ includeEmpty: true }, cell => {
      const model = cell.model as { shareType?: string; sharedFormula?: string } | undefined
      if (model?.shareType === 'shared' || model?.sharedFormula) {
        const formula = cell.formula
        if (formula) formulas.push({ cell, formula })
      }
    }))
  })
  formulas.forEach(({ cell, formula }) => { cell.value = { formula } })
  workbook.calcProperties.fullCalcOnLoad = true
}

// Nilai rupiah → juta tanpa pembulatan berarti (presisi sampai rupiah) agar jumlahnya sama dengan aplikasi.
const juta = (value: number) => Math.round(value || 0) / 1_000_000
const jutaText = (value: number) => {
  const text = String(juta(value))
  return text.includes('e') ? '0' : text
}
// Rumus penjumlahan yang terbaca di Excel, mis. =0+12.5+3.25 (satu suku per bulan).
const rumusJumlah = (values: number[]): ExcelJS.CellFormulaValue | number =>
  values.length === 0 ? 0 : { formula: values.map(v => jutaText(v)).join('+') }

/**
 * Sheet ringkasan: SELURUH angkanya rumus bawaan template (SUMIF ke sheet "per Proker", M = D + SUM(G:L)).
 * Fungsi ini hanya mengisi judul periode, sehingga ringkasan selalu sama dengan sheet per proker (one data).
 */
function fillOpsetSheet(ws: ExcelJS.Worksheet, endMonth: number, tahun: number, lastRow: number) {
  // Bila proker lebih banyak dari baris template, rentang SUMIF (…$5:$30) harus ikut diperpanjang.
  if (lastRow > 30) {
    for (let row = 6; row <= 16; row++) {
      for (const col of ['D', 'E', 'G', 'H', 'I', 'J', 'K', 'L', 'N']) {
        const cell = ws.getCell(`${col}${row}`)
        const formula = cell.formula
        if (formula && formula.includes('per Proker')) cell.value = { formula: formula.replace(/\$30\b/g, `$${lastRow}`) }
      }
    }
  }
  ws.getCell('D3').value = `s.d. ${BULAN_LABELS_HO[endMonth]} ${tahun}`
  Array.from({ length: 6 }, (_, offset) => endMonth + 1 + offset).forEach((month, offset) => {
    ws.getCell(4, 7 + offset).value = month < 12 ? BULAN_LABELS_HO[month] : ''
  })
}

function fillOpsetPerProkerSheet(
  ws: ExcelJS.Worksheet,
  rows: HOMasterRow[],
  endMonth: number,
  tahun: number,
  kind: 'cash' | 'pendapatan',
  prognosa: Map<string, PrognosaEvaluasi>,
): { totalRow: number; lastRow: number } {
  ws.getCell('G3').value = `s.d. ${BULAN_LABELS_HO[endMonth]} ${tahun}`
  Array.from({ length: 6 }, (_, offset) => endMonth + 1 + offset).forEach((month, offset) => {
    ws.getCell(4, 10 + offset).value = month < 12 ? BULAN_LABELS_HO[month].slice(0, 3) : ''
  })
  const sorted = [...rows].sort((a, b) => a.no - b.no)
  let templateTotalRow = 5
  while (templateTotalRow < 200 && String(ws.getCell(`B${templateTotalRow}`).value ?? '').trim().toUpperCase() !== 'TOTAL') templateTotalRow++
  const templateSlots = templateTotalRow - 5
  const slots = Math.max(templateSlots, sorted.length)
  if (slots > templateSlots) ws.insertRows(templateTotalRow, Array.from({ length: slots - templateSlots }, () => []), 'i')
  for (let index = 0; index < slots; index++) {
    const excelRow = index + 5
    const row = sorted[index]
    if (!row) {
      for (let col = 2; col <= 18; col++) ws.getCell(excelRow, col).value = ''
      continue
    }
    const actualFor = (month: number) => kind === 'cash'
      ? row.cashByMonth[month]?.totalDiluarJaminan ?? 0
      : row.pendapatanByMonth[month]?.total ?? 0
    // RKAP hanya dari target RKAP resmi (rkap_target); proker di luar RKAP bernilai 0.
    const rkapBulan = rkapBulanFor(row, kind)
    const forecastAll = prognosa.get(row.kodeMonika)?.[kind] ?? Array(12).fill(0)
    const forecast = Array.from({ length: 6 }, (_, offset) => {
      const month = endMonth + 1 + offset
      return month < 12 ? forecastAll[month] ?? 0 : 0
    })
    const tidakTampil = total(forecastAll.slice(endMonth + 1 + 6))
    ws.getCell(`B${excelRow}`).value = index + 1
    ws.getCell(`C${excelRow}`).value = canonicalBidang(row.bidangUsaha) || row.bidangUsaha || ''
    ws.getCell(`D${excelRow}`).value = row.obyek || ''
    ws.getCell(`E${excelRow}`).value = row.lokasi || ''
    ws.getCell(`F${excelRow}`).value = row.mitra || ''
    ws.getCell(`G${excelRow}`).value = rumusJumlah(Array.from({ length: endMonth + 1 }, (_, month) => actualFor(month)))
    ws.getCell(`H${excelRow}`).value = rumusJumlah(rkapBulan.slice(0, endMonth + 1))
    ws.getCell(`I${excelRow}`).value = { formula: `IFERROR(G${excelRow}/H${excelRow},0)` }
    forecast.forEach((value, offset) => setNumber(ws.getCell(excelRow, 10 + offset), juta(value)))
    // Prognosa 2026 = realisasi + prognosa bulan mendatang (rumus template; bulan di luar 6 kolom ditambahkan eksplisit).
    ws.getCell(`P${excelRow}`).value = { formula: tidakTampil > 0.5 ? `G${excelRow}+SUM(J${excelRow}:O${excelRow})+${jutaText(tidakTampil)}` : `G${excelRow}+SUM(J${excelRow}:O${excelRow})` }
    ws.getCell(`Q${excelRow}`).value = rumusJumlah(rkapBulan)
    ws.getCell(`R${excelRow}`).value = { formula: `IFERROR(P${excelRow}/Q${excelRow},0)` }
  }
  const totalRow = 5 + slots
  for (let col = 7; col <= 17; col++) ws.getCell(totalRow, col).value = { formula: `SUM(${ws.getColumn(col).letter}5:${ws.getColumn(col).letter}${totalRow - 1})` }
  ws.getCell(`I${totalRow}`).value = { formula: `IFERROR(G${totalRow}/H${totalRow},0)` }
  ws.getCell(`R${totalRow}`).value = { formula: `IFERROR(P${totalRow}/Q${totalRow},0)` }
  return { totalRow, lastRow: totalRow - 1 }
}

function fillPiutangSheet(ws: ExcelJS.Worksheet, rows: HOMasterRow[], endMonth: number, tahun: number) {
  ws.getCell('D3').value = `Real s.d. ${BULAN_LABELS_HO[endMonth]} ${tahun}`
  const outstanding = rows
    .map(row => ({ row, value: row.piutangByMonth[endMonth]?.saldo ?? 0 }))
    .filter(item => Math.abs(item.value) > 0.5)
    .sort((a, b) => b.value - a.value)

  const slots = Math.max(11, outstanding.length)
  if (slots > 11) ws.insertRows(17, Array.from({ length: slots - 11 }, () => []), 'i')
  for (let index = 0; index < slots; index++) {
    const excelRow = index + 6
    const item = outstanding[index]
    ws.getCell(`B${excelRow}`).value = item ? index + 1 : ''
    ws.getCell(`C${excelRow}`).value = item?.row.mitra || item?.row.obyek || ''
    setNumber(ws.getCell(`D${excelRow}`), rpJuta(item?.value ?? 0))
    // Angka SAP dan penjelasan selisih belum menjadi data aplikasi, sehingga
    // dibiarkan kosong untuk pelengkapan manual tanpa mengarang angka.
    ws.getCell(`E${excelRow}`).value = ''
    ws.getCell(`F${excelRow}`).value = { formula: `IF(E${excelRow}="","",D${excelRow}-E${excelRow})` }
    ws.getCell(`G${excelRow}`).value = ''
  }
  ;['D', 'E', 'F'].forEach(col => {
    ws.getCell(`${col}${6 + slots}`).value = { formula: `SUM(${col}6:${col}${5 + slots})` }
  })
}

export async function exportEvaluasiKinerjaExcel(
  rows: HOMasterRow[],
  opts: { tahun: number; endMonth: number; prognosa?: PrognosaEvaluasi[] },
) {
  const response = await fetch(TEMPLATE_URL)
  if (!response.ok) throw new Error('Template Evaluasi Kinerja tidak dapat dimuat.')

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await response.arrayBuffer())
  normalizeSharedFormulas(workbook)
  const divest = workbook.getWorksheet('Divest')
  if (divest) {
    divest.getCell('B1').value = 'Belum tersedia data divestasi aplikasi; isi manual'
    divest.getCell('B1').font = { name: 'Calibri', size: 10, bold: true }
    for (let row = 6; row <= 16; row++) {
      for (const column of ['C', 'D', 'E', 'F', 'H', 'I', 'J', 'M']) divest.getCell(`${column}${row}`).value = ''
    }
    divest.eachRow(row => row.eachCell(cell => {
      const formula = cell.formula
      if (formula && formula.includes('/')) cell.value = { formula: `IFERROR(${formula},"")` }
    }))
  }
  const prognosa = new Map((opts.prognosa ?? []).map(row => [row.kode, row]))
  const perProker = {
    cash: fillOpsetPerProkerSheet(workbook.getWorksheet('Opset Cash per Proker')!, rows, opts.endMonth, opts.tahun, 'cash', prognosa),
    pendapatan: fillOpsetPerProkerSheet(workbook.getWorksheet('Opset Pendapatan per Proker')!, rows, opts.endMonth, opts.tahun, 'pendapatan', prognosa),
  }
  const totalPerProker = { cash: perProker.cash.totalRow, pendapatan: perProker.pendapatan.totalRow }
  fillOpsetSheet(workbook.getWorksheet('Opset Cash')!, opts.endMonth, opts.tahun, perProker.cash.lastRow)
  fillOpsetSheet(workbook.getWorksheet('Opset Pendapatan')!, opts.endMonth, opts.tahun, perProker.pendapatan.lastRow)
  fillPiutangSheet(workbook.getWorksheet('Piutang')!, rows, opts.endMonth, opts.tahun)

  const remaining = Array.from({ length: 11 - opts.endMonth }, (_, index) => opts.endMonth + 1 + index)
  if (remaining.length > 6) {
    const detail = workbook.addWorksheet('Prognosa Sisa Tahun')
    detail.addRow(['ID Monika', 'Proker', ...remaining.map(month => BULAN_LABELS_HO[month] + ' Cash'), ...remaining.map(month => BULAN_LABELS_HO[month] + ' Pendapatan')])
    rows.forEach(row => detail.addRow([row.kodeMonika, row.obyek, ...remaining.map(month => rpJuta(prognosa.get(row.kodeMonika)?.cash[month] ?? 0)), ...remaining.map(month => rpJuta(prognosa.get(row.kodeMonika)?.pendapatan[month] ?? 0))]))
    detail.getRow(1).font = { bold: true }
    detail.columns.forEach(column => { column.width = 22 })
    detail.addRow(['Satuan: juta Rupiah. Total prognosa di template mencakup seluruh sisa tahun.'])
  }
  const unclassified = rows.filter(row => !canonicalBidang(row.bidangUsaha))
  if (unclassified.length) {
    const detail = workbook.addWorksheet('Kategori Belum Dipetakan')
    detail.addRow(['ID Monika', 'Proker', 'Bidang Usaha', 'Target Cash In Tahun (juta Rp)', 'Target Pendapatan Tahun (juta Rp)'])
    unclassified.forEach(row => detail.addRow([row.kodeMonika, row.obyek, row.bidangUsaha, rpJuta(total(row.rkapBulan)), rpJuta(total(row.rkapPendapatanBulan))]))
    detail.columns.forEach(column => { column.width = 25 })
    // Bidang di luar daftar tidak tertangkap SUMIF; baris TOTAL ringkasan merujuk langsung ke TOTAL sheet per proker
    // agar tetap sama dengan seluruh proker (rumus, bukan angka tambahan).
    for (const kind of ['cash', 'pendapatan'] as const) {
      const sheet = workbook.getWorksheet(kind === 'cash' ? 'Opset Cash' : 'Opset Pendapatan')!
      const sumber = `'${kind === 'cash' ? 'Opset Cash per Proker' : 'Opset Pendapatan per Proker'}'`
      const baris = totalPerProker[kind]
      const petaKolom: Record<string, string> = { D: 'G', E: 'H', G: 'J', H: 'K', I: 'L', J: 'M', K: 'N', L: 'O', N: 'Q' }
      Object.entries(petaKolom).forEach(([kolom, asal]) => { sheet.getCell(`${kolom}17`).value = { formula: `${sumber}!${asal}${baris}` } })
      sheet.getCell('D3').value = `s.d. ${BULAN_LABELS_HO[opts.endMonth]} ${opts.tahun} · Total termasuk bidang usaha belum dipetakan (lihat sheet rincian)`
    }
  }

  // Buang hasil rumus lama bawaan template: tanpa ini LibreOffice/penampil lain menampilkan angka basi
  // pada sel rumus yang tidak kita sentuh. Semua rumus dihitung ulang dari data saat file dibuka.
  workbook.worksheets.forEach(ws => ws.eachRow({ includeEmpty: false }, row => row.eachCell({ includeEmpty: false }, cell => {
    const formula = cell.formula
    if (formula) cell.value = { formula }
  })))
  workbook.calcProperties.fullCalcOnLoad = true

  const bytes = await workbook.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `Evaluasi Kinerja s.d. ${BULAN_LABELS_HO[opts.endMonth]} ${opts.tahun}.xlsx`
  // Sebagian browser tidak menjalankan unduhan untuk tautan Blob yang tidak
  // pernah menjadi bagian dari dokumen. URL juga jangan langsung dicabut karena
  // browser belum tentu selesai mengambil Blob pada tick yang sama.
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}
