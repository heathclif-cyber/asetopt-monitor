/**
 * Template Excel berstyle untuk AsetOpt / Manajemen Aset PTPN I Regional 8.
 * Warna brand: navy #1B4F72, aksen teal/emerald.
 */
import ExcelJS from 'exceljs'

export const EXCEL_BRAND = {
  navy: 'FF1B4F72',
  navyDark: 'FF0F3352',
  teal: 'FF0D9488',
  headerBg: 'FF1B4F72',
  headerFg: 'FFFFFFFF',
  metaBg: 'FFE8F1F8',
  altRow: 'FFF5F9FC',
  totalBg: 'FFFEF3C7',
  totalFg: 'FF78350F',
  border: 'FFCBD5E1',
  muted: 'FF64748B',
  money: 'FF0F766E',
  danger: 'FFB91C1C',
  white: 'FFFFFFFF',
} as const

export type ColType = 'text' | 'money' | 'number' | 'percent' | 'date' | 'int'

export interface ExcelColumn {
  header: string
  key: string
  width?: number
  type?: ColType
  /** Align override */
  align?: 'left' | 'center' | 'right'
}

export interface BuildSheetOpts {
  sheetName: string
  title: string
  subtitle?: string
  metaLines?: string[]
  columns: ExcelColumn[]
  /** Array of row objects keyed by column.key */
  rows: Record<string, unknown>[]
  /** Keys that sum into total row (money/number) */
  totalKeys?: string[]
  totalLabel?: string
  /** Column index (0-based) where TOTAL label is written */
  totalLabelCol?: number
}

const MONEY_FMT = '#,##0'
const PCT_FMT = '0.0"%"'

function thinBorder(): Partial<ExcelJS.Borders> {
  const edge: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: EXCEL_BRAND.border } }
  return { top: edge, left: edge, bottom: edge, right: edge }
}

function applyHeaderBand(
  ws: ExcelJS.Worksheet,
  colCount: number,
  title: string,
  subtitle: string | undefined,
  metaLines: string[],
): number {
  // Row 1 — org banner
  ws.mergeCells(1, 1, 1, colCount)
  const org = ws.getCell(1, 1)
  org.value = 'Manajemen Aset PTPN I Regional 8'
  org.font = { name: 'Calibri', size: 11, bold: true, color: { argb: EXCEL_BRAND.white } }
  org.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_BRAND.navyDark } }
  org.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(1).height = 22

  // Row 2 — report title
  ws.mergeCells(2, 1, 2, colCount)
  const titleCell = ws.getCell(2, 1)
  titleCell.value = title
  titleCell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: EXCEL_BRAND.navy } }
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_BRAND.metaBg } }
  titleCell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(2).height = 28

  let row = 3
  if (subtitle) {
    ws.mergeCells(row, 1, row, colCount)
    const sub = ws.getCell(row, 1)
    sub.value = subtitle
    sub.font = { name: 'Calibri', size: 10, italic: true, color: { argb: EXCEL_BRAND.muted } }
    sub.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_BRAND.metaBg } }
    sub.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
    ws.getRow(row).height = 18
    row += 1
  }

  for (const line of metaLines) {
    ws.mergeCells(row, 1, row, colCount)
    const m = ws.getCell(row, 1)
    m.value = line
    m.font = { name: 'Calibri', size: 9, color: { argb: EXCEL_BRAND.muted } }
    m.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_BRAND.metaBg } }
    m.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
    ws.getRow(row).height = 16
    row += 1
  }

  // spacer
  ws.getRow(row).height = 8
  row += 1
  return row
}

function formatCell(
  cell: ExcelJS.Cell,
  value: unknown,
  type: ColType,
  align?: 'left' | 'center' | 'right',
) {
  if (value === null || value === undefined || value === '') {
    cell.value = ''
  } else if (type === 'money' || type === 'number' || type === 'int' || type === 'percent') {
    const n = typeof value === 'number' ? value : Number(value)
    cell.value = Number.isFinite(n) ? n : String(value)
    if (type === 'money') cell.numFmt = MONEY_FMT
    if (type === 'percent') cell.numFmt = PCT_FMT
    if (type === 'int') cell.numFmt = '0'
  } else {
    cell.value = value as ExcelJS.CellValue
  }

  const horizontal =
    align
    ?? (type === 'money' || type === 'number' || type === 'int' || type === 'percent'
      ? 'right'
      : type === 'date'
        ? 'center'
        : 'left')

  cell.alignment = { vertical: 'middle', horizontal, wrapText: type === 'text' }
  cell.font = { name: 'Calibri', size: 10 }
  cell.border = thinBorder()
}

/**
 * Bangun satu sheet berstyle: banner org, judul, meta, header, data zebra, total.
 * Mengembalikan index baris header (1-based) untuk freeze.
 */
export function addTemplatedSheet(wb: ExcelJS.Workbook, opts: BuildSheetOpts): ExcelJS.Worksheet {
  const {
    sheetName,
    title,
    subtitle,
    metaLines = [],
    columns,
    rows,
    totalKeys = [],
    totalLabel = 'TOTAL',
    totalLabelCol = 0,
  } = opts

  const ws = wb.addWorksheet(sheetName, {
    views: [{ state: 'frozen', ySplit: 0, showGridLines: false }],
    properties: { defaultRowHeight: 18 },
  })

  const colCount = columns.length
  columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width ?? 14
  })

  const headerRowIdx = applyHeaderBand(ws, colCount, title, subtitle, metaLines)

  // Column headers
  const headerRow = ws.getRow(headerRowIdx)
  headerRow.height = 22
  columns.forEach((col, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = col.header
    cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: EXCEL_BRAND.headerFg } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_BRAND.headerBg } }
    cell.alignment = {
      vertical: 'middle',
      horizontal: col.type === 'money' || col.type === 'number' || col.type === 'percent' ? 'right' : 'center',
      wrapText: true,
    }
    cell.border = thinBorder()
  })

  // Data rows
  let rIdx = headerRowIdx + 1
  rows.forEach((row, rowI) => {
    const excelRow = ws.getRow(rIdx)
    excelRow.height = 18
    const alt = rowI % 2 === 1
    columns.forEach((col, cI) => {
      const cell = excelRow.getCell(cI + 1)
      formatCell(cell, row[col.key], col.type ?? 'text', col.align)
      if (alt) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_BRAND.altRow } }
      }
      // Highlight sisa/outstanding > 0 lightly if key suggests money residual
      if ((col.key === 'sisa' || col.key === 'outstanding' || col.key === 'nominalDenda' || col.key === 'totalDenda')
        && typeof row[col.key] === 'number'
        && (row[col.key] as number) > 0.5) {
        cell.font = { name: 'Calibri', size: 10, color: { argb: EXCEL_BRAND.danger }, bold: true }
      }
      if ((col.key === 'cashIn' || col.key === 'totalDibayar')
        && typeof row[col.key] === 'number'
        && (row[col.key] as number) > 0) {
        cell.font = { name: 'Calibri', size: 10, color: { argb: EXCEL_BRAND.money } }
      }
    })
    rIdx += 1
  })

  // Total row
  if (totalKeys.length > 0 && rows.length > 0) {
    const totalRow = ws.getRow(rIdx)
    totalRow.height = 20
    columns.forEach((col, cI) => {
      const cell = totalRow.getCell(cI + 1)
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: EXCEL_BRAND.totalBg } }
      cell.border = thinBorder()
      cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: EXCEL_BRAND.totalFg } }
      cell.alignment = { vertical: 'middle', horizontal: cI === totalLabelCol ? 'left' : 'right' }

      if (cI === totalLabelCol) {
        cell.value = totalLabel
      } else if (totalKeys.includes(col.key)) {
        const sum = rows.reduce((s, r) => s + (Number(r[col.key]) || 0), 0)
        cell.value = sum
        if (col.type === 'money' || col.type === 'number') cell.numFmt = MONEY_FMT
        if (col.type === 'percent') cell.numFmt = PCT_FMT
      } else {
        cell.value = ''
      }
    })
    rIdx += 1
  }

  // Footer note
  rIdx += 1
  ws.mergeCells(rIdx, 1, rIdx, colCount)
  const foot = ws.getCell(rIdx, 1)
  foot.value = 'Dokumen dihasilkan dari AsetOpt Monitor · Manajemen Aset PTPN I Regional 8'
  foot.font = { name: 'Calibri', size: 8, italic: true, color: { argb: EXCEL_BRAND.muted } }
  foot.alignment = { horizontal: 'left', indent: 1 }

  // Freeze below header row + auto filter
  ws.views = [{ state: 'frozen', ySplit: headerRowIdx, showGridLines: false }]
  ws.autoFilter = {
    from: { row: headerRowIdx, column: 1 },
    to: { row: headerRowIdx + Math.max(rows.length, 1), column: colCount },
  }

  return ws
}

export async function downloadWorkbook(wb: ExcelJS.Workbook, fileName: string): Promise<void> {
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName.endsWith('.xlsx') ? fileName : `${fileName}.xlsx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function newWorkbook(): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'AsetOpt Monitor'
  wb.company = 'Manajemen Aset PTPN I Regional 8'
  wb.created = new Date()
  wb.modified = new Date()
  return wb
}

export function todayKey(): string {
  return new Date().toISOString().slice(0, 10)
}
