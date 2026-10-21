import type ExcelJS from 'exceljs'
import type { PiutangRow } from '@/utils/piutangUtils'

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const AGING_LABELS = ['1 - 30', '31 - 60', '61 - 90', '91 - 180', '181 - 360', '> 361']
const MONEY_FMT = '#,##0;(#,##0);"-"'

export function addPiutangProkerSheet(wb: ExcelJS.Workbook, rows: PiutangRow[], asOf: string): void {
  const year = Number(asOf.slice(0, 4))
  const month = Number(asOf.slice(5, 7)) - 1
  const ws = wb.addWorksheet('Daftar Piutang', {
    views: [{ state: 'frozen', xSplit: 4, ySplit: 7, showGridLines: false, topLeftCell: `${columnName(5 + month * 11)}8` }],
  })
  ws.getColumn(1).width = 2
  ws.getColumn(2).width = 15
  ws.getColumn(3).width = 6
  ws.getColumn(4).width = 45
  ws.mergeCells('B2:O2')
  ws.getCell('B2').value = `Daftar Piutang — Proker ${year} Regional 8`
  ws.getCell('B2').font = { name: 'Trebuchet MS', size: 14, bold: true }
  ws.mergeCells('B3:O3')
  ws.getCell('B3').value = `Posisi ${asOf} · Rupiah penuh · Sesuai filter ekspor · Saldo termasuk pajak, tanpa denda.`
  ws.mergeCells('B4:O4')
  ws.getCell('B4').value = 'Hanya bulan berjalan diisi. Saldo awal/historis dan bulan mendatang kosong; Current Issue dan Tindak Lanjut diisi manual.'
  ws.mergeCells('B5:O5')
  ws.getCell('B5').value = 'Berdasarkan piutang yang tercatat di Bagian Manajemen Aset dan Pemasaran Regional'
  for (const r of [3, 4, 5]) {
    ws.getRow(r).height = 30
    ws.getCell(r, 2).font = { name: 'Trebuchet MS', size: 10 }
    ws.getCell(r, 2).alignment = { vertical: 'middle', wrapText: true }
  }

  const header = (col: number, label: string, span = 1) => {
    ws.mergeCells(6, col, span === 1 ? 7 : 6, col + span - 1)
    ws.getCell(6, col).value = label
  }
  header(2, 'Regional')
  header(3, 'No.')
  header(4, 'Mitra')
  for (let m = 0; m < 12; m++) {
    const start = 5 + m * 11
    const previous = m === 0 ? `Desember ${year - 1}` : `${MONTHS[m - 1]} ${year}`
    header(start, `Saldo Per\n${previous}`)
    header(start + 1, 'Umur Piutang (Hari)', 6)
    AGING_LABELS.forEach((label, i) => { ws.getCell(7, start + 1 + i).value = label })
    header(start + 7, `Saldo Per\n${MONTHS[m]} ${year}`)
    header(start + 8, 'Current Issue')
    header(start + 9, 'Tindak Lanjut')
    header(start + 10, 'Keterangan')
    for (let i = 0; i < 11; i++) ws.getColumn(start + i).width = i >= 8 ? 42 : 22
  }
  ws.getRow(6).height = 32
  ws.getRow(7).height = 24
  const edge: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF000000' } }
  const border = { top: edge, bottom: edge, left: edge, right: edge }
  for (let r = 6; r <= 7; r++) {
    for (let c = 2; c <= 136; c++) {
      const cell = ws.getCell(r, c)
      cell.font = { name: 'Trebuchet MS', size: 11, bold: true }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD8D8D8' } }
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border = border
    }
  }

  const groups = new Map<string, PiutangRow[]>()
  for (const row of rows) {
    const group = groups.get(row.ksId) ?? []
    group.push(row)
    groups.set(row.ksId, group)
  }
  const start = 5 + month * 11
  const entries = [...groups.values()].sort((a, b) => a[0].namaMitra.localeCompare(b[0].namaMitra, 'id'))
  const totals = Array<number>(6).fill(0)
  entries.forEach((group, index) => {
    const row = 8 + index
    ws.getCell(row, 2).value = 'Regional 8'
    ws.getCell(row, 3).value = index + 1
    ws.getCell(row, 4).value = group[0].namaMitra
    const buckets = Array<number>(6).fill(0)
    for (const item of group) {
      const days = item.hariDariJT
      const bucket = days <= 30 ? 0 : days <= 60 ? 1 : days <= 90 ? 2 : days <= 180 ? 3 : days <= 360 ? 4 : 5
      buckets[bucket] += Math.round(item.sisa)
    }
    buckets.forEach((amount, i) => {
      ws.getCell(row, start + 1 + i).value = amount
      totals[i] += amount
    })
    const balance = buckets.reduce((sum, amount) => sum + amount, 0)
    ws.getCell(row, start + 7).value = {
      formula: `SUM(${columnName(start + 1)}${row}:${columnName(start + 6)}${row})`, result: balance,
    }
    ws.getCell(row, start + 10).value = `${group.length} tagihan · ${group[0].noPerjanjian} · Posisi ${asOf}. Umur 0 hari masuk 1–30; ≥361 hari masuk kelompok terakhir.`
    ws.getRow(row).height = 60
  })
  const totalRow = 8 + entries.length
  ws.mergeCells(totalRow, 2, totalRow, 4)
  ws.getCell(totalRow, 2).value = 'TOTAL'
  for (let i = 1; i <= 7; i++) {
    const col = start + i
    const result = i === 7 ? totals.reduce((sum, amount) => sum + amount, 0) : totals[i - 1]
    ws.getCell(totalRow, col).value = entries.length
      ? { formula: `SUM(${columnName(col)}8:${columnName(col)}${totalRow - 1})`, result }
      : 0
  }
  for (let r = 8; r <= totalRow; r++) {
    for (let c = 2; c <= 136; c++) {
      const cell = ws.getCell(r, c)
      cell.font = { name: 'Trebuchet MS', size: 10, bold: r === totalRow }
      cell.border = border
      const offset = (c - 5) % 11
      cell.alignment = { vertical: 'middle', horizontal: c >= 5 && offset <= 7 ? 'right' : 'left', wrapText: true }
      if (c >= 5 && offset <= 7) cell.numFmt = MONEY_FMT
      if (r === totalRow) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD8D8D8' } }
    }
  }
}

function columnName(index: number): string {
  let name = ''
  while (index > 0) {
    index--
    name = String.fromCharCode(65 + index % 26) + name
    index = Math.floor(index / 26)
  }
  return name
}
