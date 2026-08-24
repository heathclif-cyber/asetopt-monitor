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

function fillOpsetSheet(
  ws: ExcelJS.Worksheet,
  rows: HOMasterRow[],
  endMonth: number,
  tahun: number,
  kind: 'cash' | 'pendapatan',
  prognosa: Map<string, PrognosaEvaluasi>,
) {
  const actualFor = (row: HOMasterRow, month: number) =>
    kind === 'cash'
      ? row.cashByMonth[month]?.totalDiluarJaminan ?? 0
      : row.pendapatanByMonth[month]?.total ?? 0

  // Hanya tulisan periode yang berubah; posisi, merge, font, warna, dan format
  // angka tetap milik workbook template.
  ws.getCell('D3').value = `s.d. ${BULAN_LABELS_HO[endMonth]} ${tahun}`
  Array.from({ length: 6 }, (_, offset) => endMonth + 1 + offset).forEach((month, offset) => {
    const cell = ws.getCell(4, 7 + offset)
    cell.value = month < 12 ? BULAN_LABELS_HO[month] : ''
  })

  BIDANG_USAHA.forEach((bidang, index) => {
    // Template Worksheet: baris 3–5 adalah header, kategori mulai baris 6.
    const rowNo = index + 6
    const actual = sumRows(rows, bidang, row => total(
      Array.from({ length: endMonth + 1 }, (_, month) => actualFor(row, month)),
    ))
    const rkapSdBulan = sumRows(rows, bidang, row => total(row.rkapBulan.slice(0, endMonth + 1)))
    const forecast = Array.from({ length: 6 }, (_, offset) => {
      const month = endMonth + 1 + offset
      return month < 12
        ? sumRows(rows, bidang, row => prognosa.get(row.kodeMonika)?.[kind]?.[month] ?? 0)
        : 0
    })
    const rkapTahun = sumRows(rows, bidang, row => row.targetTahun)

    setNumber(ws.getCell(`D${rowNo}`), rpJuta(actual))
    setNumber(ws.getCell(`E${rowNo}`), rpJuta(rkapSdBulan))
    ws.getCell(`F${rowNo}`).value = { formula: `IFERROR(D${rowNo}/E${rowNo},0)` }
    forecast.forEach((value, offset) => setNumber(ws.getCell(rowNo, 7 + offset), rpJuta(value)))
    ws.getCell(`M${rowNo}`).value = { formula: `SUM(G${rowNo}:L${rowNo})` }
    ws.getCell(`N${rowNo}`).value = { formula: `D${rowNo}+M${rowNo}` }
    setNumber(ws.getCell(`O${rowNo}`), rpJuta(rkapTahun))
    ws.getCell(`P${rowNo}`).value = { formula: `IFERROR(N${rowNo}/O${rowNo},0)` }
  })

  const totalRow = 17
  ;['D', 'E', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'].forEach(col => {
    ws.getCell(`${col}${totalRow}`).value = { formula: `SUM(${col}6:${col}16)` }
  })
  ws.getCell(`F${totalRow}`).value = { formula: `IFERROR(D${totalRow}/E${totalRow},0)` }
  ws.getCell(`P${totalRow}`).value = { formula: `IFERROR(N${totalRow}/O${totalRow},0)` }
}

function fillOpsetPerProkerSheet(
  ws: ExcelJS.Worksheet,
  rows: HOMasterRow[],
  endMonth: number,
  tahun: number,
  kind: 'cash' | 'pendapatan',
  prognosa: Map<string, PrognosaEvaluasi>,
) {
  ws.getCell('G3').value = `s.d. ${BULAN_LABELS_HO[endMonth]} ${tahun}`
  Array.from({ length: 6 }, (_, offset) => endMonth + 1 + offset).forEach((month, offset) => {
    ws.getCell(4, 10 + offset).value = month < 12 ? BULAN_LABELS_HO[month].slice(0, 3) : ''
  })
  const sorted = [...rows].sort((a, b) => a.no - b.no).slice(0, 25)
  for (let index = 0; index < 25; index++) {
    const excelRow = index + 5
    const row = sorted[index]
    if (!row) {
      for (let col = 2; col <= 18; col++) ws.getCell(excelRow, col).value = ''
      continue
    }
    const actualFor = (month: number) => kind === 'cash'
      ? row.cashByMonth[month]?.totalDiluarJaminan ?? 0
      : row.pendapatanByMonth[month]?.total ?? 0
    const actual = total(Array.from({ length: endMonth + 1 }, (_, month) => actualFor(month)))
    const rkapSd = total(row.rkapBulan.slice(0, endMonth + 1))
    const forecast = Array.from({ length: 6 }, (_, offset) => {
      const month = endMonth + 1 + offset
      return month < 12 ? prognosa.get(row.kodeMonika)?.[kind]?.[month] ?? 0 : 0
    })
    const annualPrognosa = actual + total(forecast)
    ws.getCell(`B${excelRow}`).value = index + 1
    ws.getCell(`C${excelRow}`).value = row.bidangUsaha || ''
    ws.getCell(`D${excelRow}`).value = row.obyek || ''
    ws.getCell(`E${excelRow}`).value = row.lokasi || ''
    ws.getCell(`F${excelRow}`).value = row.mitra || ''
    setNumber(ws.getCell(`G${excelRow}`), rpJuta(actual))
    setNumber(ws.getCell(`H${excelRow}`), rpJuta(rkapSd))
    ws.getCell(`I${excelRow}`).value = { formula: `IFERROR(G${excelRow}/H${excelRow},0)` }
    forecast.forEach((value, offset) => setNumber(ws.getCell(excelRow, 10 + offset), rpJuta(value)))
    setNumber(ws.getCell(`P${excelRow}`), rpJuta(annualPrognosa))
    setNumber(ws.getCell(`Q${excelRow}`), rpJuta(row.targetTahun))
    ws.getCell(`R${excelRow}`).value = { formula: `IFERROR(P${excelRow}/Q${excelRow},0)` }
  }
  for (let col = 7; col <= 17; col++) ws.getCell(30, col).value = { formula: `SUM(${ws.getColumn(col).letter}5:${ws.getColumn(col).letter}29)` }
  ws.getCell('I30').value = { formula: 'IFERROR(G30/H30,0)' }
  ws.getCell('R30').value = { formula: 'IFERROR(P30/Q30,0)' }
}

function fillPiutangSheet(ws: ExcelJS.Worksheet, rows: HOMasterRow[], endMonth: number, tahun: number) {
  ws.getCell('D3').value = `Real s.d. ${BULAN_LABELS_HO[endMonth]} ${tahun}`
  const outstanding = rows
    .map(row => ({ row, value: row.piutangByMonth[endMonth]?.saldo ?? 0 }))
    .filter(item => Math.abs(item.value) > 0.5)
    .sort((a, b) => b.value - a.value)

  // Template menyediakan 11 baris data. Lebih dari 11 mitra tetap tersedia di
  // Laporan Format HO; file evaluasi menjaga layout tanpa menambah/menggeser baris.
  for (let index = 0; index < 11; index++) {
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
    ws.getCell(`${col}17`).value = { formula: `SUM(${col}6:${col}16)` }
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
  const prognosa = new Map((opts.prognosa ?? []).map(row => [row.kode, row]))
  fillOpsetSheet(workbook.getWorksheet('Opset Cash')!, rows, opts.endMonth, opts.tahun, 'cash', prognosa)
  fillOpsetPerProkerSheet(workbook.getWorksheet('Opset Cash per Proker')!, rows, opts.endMonth, opts.tahun, 'cash', prognosa)
  fillOpsetSheet(workbook.getWorksheet('Opset Pendapatan')!, rows, opts.endMonth, opts.tahun, 'pendapatan', prognosa)
  fillOpsetPerProkerSheet(workbook.getWorksheet('Opset Pendapatan per Proker')!, rows, opts.endMonth, opts.tahun, 'pendapatan', prognosa)
  fillPiutangSheet(workbook.getWorksheet('Piutang')!, rows, opts.endMonth, opts.tahun)

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
