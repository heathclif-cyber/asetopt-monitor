import ExcelJS from 'exceljs'
import type { HOMasterRow } from '@/utils/laporanHOUtils'
import { BULAN_LABELS_HO } from '@/utils/laporanHOUtils'

/**
 * Mengisi salinan workbook Evaluasi Kinerja yang disetujui pengguna.
 * Struktur, style, sheet, ukuran kolom, dan layout berasal langsung dari file
 * template; fungsi ini hanya mengubah nilai sel bahan laporan.
 */
const TEMPLATE_URL = '/templates/Evaluasi Kinerja s.d Juni 2026_REV.xlsx'
const BIDANG_USAHA = [
  'Properti', 'Hospitality', 'Kesehatan', 'Pertambangan', 'Energy',
  'Kawasan Industri', 'Peternakan', 'Pertanian', 'Perkebunan',
  'Industri Lainnya', 'Kerja Sama Agrowisata',
] as const

const rpJuta = (value: number) => Math.round((value || 0) / 1_000_000 * 100) / 100
const total = (values: number[]) => values.reduce((sum, value) => sum + (value || 0), 0)

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

function fillOpsetSheet(
  ws: ExcelJS.Worksheet,
  rows: HOMasterRow[],
  endMonth: number,
  tahun: number,
  kind: 'cash' | 'pendapatan',
) {
  const actualFor = (row: HOMasterRow, month: number) =>
    kind === 'cash'
      ? row.cashByMonth[month]?.totalDiluarJaminan ?? 0
      : row.pendapatanByMonth[month]?.total ?? 0

  // Hanya tulisan periode yang berubah; posisi, merge, font, warna, dan format
  // angka tetap milik workbook template.
  ws.getCell('D2').value = `s.d. ${BULAN_LABELS_HO[endMonth]} ${tahun}`
  Array.from({ length: 6 }, (_, offset) => endMonth + 1 + offset).forEach((month, offset) => {
    const cell = ws.getCell(3, 7 + offset)
    cell.value = month < 12 ? BULAN_LABELS_HO[month] : ''
  })

  BIDANG_USAHA.forEach((bidang, index) => {
    const rowNo = index + 5
    const actual = sumRows(rows, bidang, row => total(
      Array.from({ length: endMonth + 1 }, (_, month) => actualFor(row, month)),
    ))
    const rkapSdBulan = sumRows(rows, bidang, row => total(row.rkapBulan.slice(0, endMonth + 1)))
    const forecast = Array.from({ length: 6 }, (_, offset) => {
      const month = endMonth + 1 + offset
      return month < 12
        ? sumRows(rows, bidang, row => row.rkapBulan[month] ?? 0)
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

  const totalRow = 16
  ;['D', 'E', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'].forEach(col => {
    ws.getCell(`${col}${totalRow}`).value = { formula: `SUM(${col}5:${col}15)` }
  })
  ws.getCell(`F${totalRow}`).value = { formula: `IFERROR(D${totalRow}/E${totalRow},0)` }
  ws.getCell(`P${totalRow}`).value = { formula: `IFERROR(N${totalRow}/O${totalRow},0)` }
}

function fillPiutangSheet(ws: ExcelJS.Worksheet, rows: HOMasterRow[], endMonth: number) {
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
  opts: { tahun: number; endMonth: number },
) {
  const response = await fetch(TEMPLATE_URL)
  if (!response.ok) throw new Error('Template Evaluasi Kinerja tidak dapat dimuat.')

  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await response.arrayBuffer())
  fillOpsetSheet(workbook.getWorksheet('Opset Cash')!, rows, opts.endMonth, opts.tahun, 'cash')
  fillOpsetSheet(workbook.getWorksheet('Opset Pendapatan')!, rows, opts.endMonth, opts.tahun, 'pendapatan')
  fillPiutangSheet(workbook.getWorksheet('Piutang')!, rows, opts.endMonth)

  const bytes = await workbook.xlsx.writeBuffer()
  const url = URL.createObjectURL(new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `Evaluasi Kinerja s.d. ${BULAN_LABELS_HO[opts.endMonth]} ${opts.tahun}.xlsx`
  anchor.click()
  URL.revokeObjectURL(url)
}
