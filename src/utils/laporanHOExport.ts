/**
 * Export Excel format HO — sheet Pendapatan & Piutang
 * (meniru struktur Proker Optimalisasi Aset PTPN I / Regional 8).
 * Sheet Cash In tidak diekspor.
 *
 * Satuan nilai: Rp 000 (÷1000) sesuai template HO.
 */
import ExcelJS from 'exceljs'
import {
  BULAN_LABELS_HO,
  toRp000,
  type HOMasterRow,
} from '@/utils/laporanHOUtils'
import { downloadWorkbook, newWorkbook, todayKey, EXCEL_BRAND } from '@/utils/excelTemplate'

const NAVY = EXCEL_BRAND.navy
const HEADER_FG = EXCEL_BRAND.headerFg
const ALT = EXCEL_BRAND.altRow
const TOTAL_BG = EXCEL_BRAND.totalBg
const BORDER = EXCEL_BRAND.border
const MONEY_FMT = '#,##0'
const PCT_FMT = '0.0"%"'

function thin(): Partial<ExcelJS.Borders> {
  const e: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: BORDER } }
  return { top: e, left: e, bottom: e, right: e }
}

function styleHeader(cell: ExcelJS.Cell, wrap = true) {
  cell.font = { name: 'Calibri', size: 9, bold: true, color: { argb: HEADER_FG } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: NAVY } }
  cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: wrap }
  cell.border = thin()
}

function styleMeta(cell: ExcelJS.Cell, bold = false, size = 11) {
  cell.font = { name: 'Calibri', size, bold, color: { argb: NAVY } }
  cell.alignment = { vertical: 'middle', horizontal: 'left' }
}

function moneyCell(cell: ExcelJS.Cell, value: number, alt: boolean) {
  cell.value = value
  cell.numFmt = MONEY_FMT
  cell.alignment = { horizontal: 'right', vertical: 'middle' }
  cell.border = thin()
  cell.font = { name: 'Calibri', size: 9 }
  if (alt) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT } }
}

function textCell(cell: ExcelJS.Cell, value: string | number | null | undefined, alt: boolean, align: 'left' | 'center' = 'left') {
  cell.value = value ?? ''
  cell.alignment = { horizontal: align, vertical: 'middle', wrapText: true }
  cell.border = thin()
  cell.font = { name: 'Calibri', size: 9 }
  if (alt) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT } }
}

function pctCell(cell: ExcelJS.Cell, value: number | null, alt: boolean) {
  if (value == null) {
    cell.value = ''
  } else {
    cell.value = value
    cell.numFmt = PCT_FMT
  }
  cell.alignment = { horizontal: 'center', vertical: 'middle' }
  cell.border = thin()
  cell.font = { name: 'Calibri', size: 9 }
  if (alt) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT } }
}

function formatTglHO(iso: string | null): string {
  if (!iso) return ''
  const k = iso.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) return iso
  const [y, m, d] = k.split('-')
  return `${d}/${m}/${y}`
}

const MASTER_HEADERS = [
  'No',
  'Obyek Kerjasama',
  'Kode MONIKA',
  'No PKS/Add',
  'Lokasi (Unit/Kebun)',
  'Alamat Lengkap',
  'Skema Kerja Sama',
  'Mitra / Calon Mitra',
  'Bidang Usaha',
  'Status Alas Hak',
  'Luas Obyek Kerjasama (m2)',
  'Mulai Kerjasama',
  'Berakhir Kerjasama',
  'Jangka Waktu (Tahun)',
  'Total Kompensasi Fix (Rp 000)',
  'Total Kompensasi Variable (Rp 000)',
  'RKAP Eksisting (Rp 000)',
  'RKAP New Project (Rp 000)',
  'NON RKAP Eksisting (Rp 000)',
  'NON RKAP New Project (Rp 000)',
  'Target Tahun (Rp 000)',
] as const

const MASTER_WIDTHS = [5, 28, 14, 14, 16, 22, 12, 22, 14, 12, 12, 12, 12, 10, 12, 12, 12, 12, 12, 12, 12]

function writeTitleBlock(
  ws: ExcelJS.Worksheet,
  title: string,
  subtitle: string,
  tahun: number,
  months: number[],
  colCount: number,
) {
  ws.mergeCells(1, 1, 1, Math.min(colCount, 8))
  const c1 = ws.getCell(1, 1)
  c1.value = 'PROGRAM KERJA OPTIMALISASI ASET PTPN I'
  styleMeta(c1, true, 12)
  ws.getRow(1).height = 20

  ws.mergeCells(2, 1, 2, Math.min(colCount, 8))
  const c2 = ws.getCell(2, 1)
  c2.value = title
  styleMeta(c2, true, 14)
  ws.getRow(2).height = 22

  ws.mergeCells(3, 1, 3, Math.min(colCount, 8))
  const c3 = ws.getCell(3, 1)
  c3.value = `TAHUN ${tahun}`
  styleMeta(c3, true, 11)

  ws.mergeCells(4, 1, 4, Math.min(colCount, 8))
  const c4 = ws.getCell(4, 1)
  c4.value = 'REGIONAL 8'
  styleMeta(c4, true, 11)

  ws.mergeCells(5, 1, 5, Math.min(colCount, 10))
  const c5 = ws.getCell(5, 1)
  const bulanLabel = months.map(m => BULAN_LABELS_HO[m]).join(', ')
  c5.value = `${subtitle} · Bulan: ${bulanLabel} · Satuan: Rp 000 · Diekspor: ${todayKey()}`
  c5.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF64748B' } }
}

function writeMasterCells(ws: ExcelJS.Worksheet, rowIdx: number, r: HOMasterRow, alt: boolean) {
  const vals: (string | number | null)[] = [
    r.no,
    r.obyek,
    r.kodeMonika,
    r.noPks,
    r.lokasi,
    r.alamat,
    r.skema,
    r.mitra,
    r.bidangUsaha,
    r.statusAlasHak,
    r.luasM2,
    formatTglHO(r.tglMulai),
    formatTglHO(r.tglBerakhir),
    r.jangkaTahun,
    toRp000(r.totalKompensasiFix),
    toRp000(r.totalKompensasiVar),
    toRp000(r.rkapEksisting),
    toRp000(r.rkapNew),
    toRp000(r.nonRkapEksisting),
    toRp000(r.nonRkapNew),
    toRp000(r.targetTahun),
  ]
  vals.forEach((v, i) => {
    const cell = ws.getCell(rowIdx, i + 1)
    if (typeof v === 'number') moneyCell(cell, v, alt)
    else textCell(cell, v, alt, i === 0 ? 'center' : 'left')
  })
}

// ── Pendapatan sheet ────────────────────────────────────────────────────────

function buildPendapatanSheet(
  wb: ExcelJS.Workbook,
  rows: HOMasterRow[],
  tahun: number,
  months: number[],
) {
  const ws = wb.addWorksheet('Pendapatan', {
    views: [{ state: 'frozen', xSplit: 3, ySplit: 8, showGridLines: false }],
  })

  // Per bulan: Target | Pendapatan | PPN | PPH | PBB | Total | No Dok SAP | %
  const subPerMonth = 8
  const masterCount = MASTER_HEADERS.length
  const colCount = masterCount + months.length * subPerMonth

  MASTER_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w })
  for (let i = 0; i < months.length; i++) {
    const base = masterCount + i * subPerMonth
    ;[10, 12, 10, 10, 10, 12, 14, 8].forEach((w, j) => {
      ws.getColumn(base + j + 1).width = w
    })
  }

  writeTitleBlock(ws, 'MONITORING PENERIMAAN PENDAPATAN', 'Format HO — Realisasi Pendapatan (akrual / DPP tagihan)', tahun, months, colCount)

  const h1 = 7
  const h2 = 8
  MASTER_HEADERS.forEach((h, i) => {
    ws.mergeCells(h1, i + 1, h2, i + 1)
    const cell = ws.getCell(h1, i + 1)
    cell.value = h
    styleHeader(cell)
  })

  months.forEach((m, mi) => {
    const start = masterCount + mi * subPerMonth + 1
    const end = start + subPerMonth - 1
    ws.mergeCells(h1, start, h1, end)
    const top = ws.getCell(h1, start)
    top.value = BULAN_LABELS_HO[m]
    styleHeader(top)
    for (let c = start; c <= end; c++) styleHeader(ws.getCell(h1, c))

    ;['Target', 'Pendapatan (Pokok)', 'PPN', 'PPH (−)', 'PBB', 'Total', 'No Dok (SAP)', '%'].forEach((s, j) => {
      const cell = ws.getCell(h2, start + j)
      cell.value = s
      styleHeader(cell)
    })
  })
  ws.getRow(h1).height = 22
  ws.getRow(h2).height = 28

  let rIdx = 9
  const totals = months.map(() => ({
    target: 0, pendapatan: 0, ppn: 0, pph: 0, pbb: 0, total: 0,
  }))

  rows.forEach((r, ri) => {
    const alt = ri % 2 === 1
    writeMasterCells(ws, rIdx, r, alt)
    months.forEach((m, mi) => {
      const pm = r.pendapatanByMonth[m]
      const base = masterCount + mi * subPerMonth + 1
      ;[
        toRp000(pm.target),
        toRp000(pm.pendapatan),
        toRp000(pm.ppn),
        toRp000(pm.pph),
        toRp000(pm.pbb),
        toRp000(pm.total),
      ].forEach((v, j) => moneyCell(ws.getCell(rIdx, base + j), v, alt))
      textCell(ws.getCell(rIdx, base + 6), pm.noDokSap, alt)
      pctCell(ws.getCell(rIdx, base + 7), pm.pct, alt)

      totals[mi].target += pm.target
      totals[mi].pendapatan += pm.pendapatan
      totals[mi].ppn += pm.ppn
      totals[mi].pph += pm.pph
      totals[mi].pbb += pm.pbb
      totals[mi].total += pm.total
    })
    rIdx += 1
  })

  for (let c = 1; c <= masterCount; c++) {
    const cell = ws.getCell(rIdx, c)
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_BG } }
    cell.border = thin()
    cell.font = { name: 'Calibri', size: 9, bold: true }
    if (c === 2) cell.value = 'TOTAL'
  }
  months.forEach((_, mi) => {
    const t = totals[mi]
    const base = masterCount + mi * subPerMonth + 1
    ;[t.target, t.pendapatan, t.ppn, t.pph, t.pbb, t.total].forEach((v, j) => {
      const cell = ws.getCell(rIdx, base + j)
      moneyCell(cell, toRp000(v), false)
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_BG } }
      cell.font = { name: 'Calibri', size: 9, bold: true }
    })
    const dok = ws.getCell(rIdx, base + 6)
    textCell(dok, '', false)
    dok.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_BG } }
    const pct = t.target > 0 ? (t.total / t.target) * 100 : null
    const pc = ws.getCell(rIdx, base + 7)
    pctCell(pc, pct, false)
    pc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_BG } }
  })

  rIdx += 2
  ws.mergeCells(rIdx, 1, rIdx, Math.min(8, colCount))
  ws.getCell(rIdx, 1).value =
    'Catatan: Pendapatan dari pengakuan akrual PSAK 73 (status diakui); fallback ke DPP tagihan JT di bulan tsb jika akrual belum ada. Satuan Rp 000.'
  ws.getCell(rIdx, 1).font = { name: 'Calibri', size: 8, italic: true, color: { argb: 'FF64748B' } }

  return ws
}

// ── Piutang sheet ───────────────────────────────────────────────────────────

function buildPiutangSheet(
  wb: ExcelJS.Workbook,
  rows: HOMasterRow[],
  tahun: number,
  months: number[],
) {
  const ws = wb.addWorksheet('Piutang', {
    views: [{ state: 'frozen', xSplit: 3, ySplit: 8, showGridLines: false }],
  })

  // Per bulan: 1-30, 31-60, 61-90, 91-180, 181-360, >361, Saldo
  const subPerMonth = 7
  // Master subset for piutang (HO drops Status Alas Hak from some cols — keep consistent)
  const masterCount = MASTER_HEADERS.length
  const colCount = masterCount + months.length * subPerMonth

  MASTER_WIDTHS.forEach((w, i) => { ws.getColumn(i + 1).width = w })
  for (let i = 0; i < months.length; i++) {
    const base = masterCount + i * subPerMonth
    ;[11, 11, 11, 11, 11, 11, 12].forEach((w, j) => {
      ws.getColumn(base + j + 1).width = w
    })
  }

  writeTitleBlock(
    ws,
    'MONITORING PIUTANG',
    'Format HO — Aging piutang snapshot akhir bulan (invoice terbit atau sudah JT, sisa > 0)',
    tahun,
    months,
    colCount,
  )

  const h1 = 7
  const h2 = 8
  MASTER_HEADERS.forEach((h, i) => {
    ws.mergeCells(h1, i + 1, h2, i + 1)
    const cell = ws.getCell(h1, i + 1)
    cell.value = h
    styleHeader(cell)
  })

  months.forEach((m, mi) => {
    const start = masterCount + mi * subPerMonth + 1
    const end = start + subPerMonth - 1
    ws.mergeCells(h1, start, h1, end)
    const top = ws.getCell(h1, start)
    top.value = `${BULAN_LABELS_HO[m]} (Rp 000)`
    styleHeader(top)
    for (let c = start; c <= end; c++) styleHeader(ws.getCell(h1, c))

    ;['1 - 30', '31 - 60', '61 - 90', '91 - 180', '181 - 360', '>361', 'Saldo'].forEach((s, j) => {
      const cell = ws.getCell(h2, start + j)
      cell.value = s
      styleHeader(cell)
    })
  })
  ws.getRow(h1).height = 22
  ws.getRow(h2).height = 28

  let rIdx = 9
  const totals = months.map(() => ({
    a1: 0, a2: 0, a3: 0, a4: 0, a5: 0, a6: 0, saldo: 0,
  }))

  rows.forEach((r, ri) => {
    const alt = ri % 2 === 1
    writeMasterCells(ws, rIdx, r, alt)
    months.forEach((m, mi) => {
      const pm = r.piutangByMonth[m]
      const base = masterCount + mi * subPerMonth + 1
      const vals = [
        pm.aging1_30, pm.aging31_60, pm.aging61_90,
        pm.aging91_180, pm.aging181_360, pm.aging361, pm.saldo,
      ]
      vals.forEach((v, j) => moneyCell(ws.getCell(rIdx, base + j), toRp000(v), alt))
      totals[mi].a1 += pm.aging1_30
      totals[mi].a2 += pm.aging31_60
      totals[mi].a3 += pm.aging61_90
      totals[mi].a4 += pm.aging91_180
      totals[mi].a5 += pm.aging181_360
      totals[mi].a6 += pm.aging361
      totals[mi].saldo += pm.saldo
    })
    rIdx += 1
  })

  for (let c = 1; c <= masterCount; c++) {
    const cell = ws.getCell(rIdx, c)
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_BG } }
    cell.border = thin()
    cell.font = { name: 'Calibri', size: 9, bold: true }
    if (c === 2) cell.value = 'TOTAL'
  }
  months.forEach((_, mi) => {
    const t = totals[mi]
    const base = masterCount + mi * subPerMonth + 1
    ;[t.a1, t.a2, t.a3, t.a4, t.a5, t.a6, t.saldo].forEach((v, j) => {
      const cell = ws.getCell(rIdx, base + j)
      moneyCell(cell, toRp000(v), false)
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_BG } }
      cell.font = { name: 'Calibri', size: 9, bold: true }
    })
  })

  rIdx += 2
  ws.mergeCells(rIdx, 1, rIdx, Math.min(8, colCount))
  ws.getCell(rIdx, 1).value =
    'Catatan: Snapshot outstanding per akhir bulan (bukan rolling formula HO dari Pendapatan−Cash). Aging dari tgl jatuh tempo. Satuan Rp 000.'
  ws.getCell(rIdx, 1).font = { name: 'Calibri', size: 8, italic: true, color: { argb: 'FF64748B' } }

  return ws
}

export async function exportLaporanHOExcel(
  rows: HOMasterRow[],
  opts: { tahun: number; months: number[] },
): Promise<void> {
  const { tahun, months } = opts
  const sortedMonths = [...months].sort((a, b) => a - b)
  const wb = newWorkbook()
  buildPendapatanSheet(wb, rows, tahun, sortedMonths)
  buildPiutangSheet(wb, rows, tahun, sortedMonths)

  const bulanTag = sortedMonths.length === 12
    ? 'Full'
    : sortedMonths.map(m => String(m + 1).padStart(2, '0')).join('-')
  await downloadWorkbook(
    wb,
    `Laporan_HO_Proker_${tahun}_${bulanTag}_${todayKey()}.xlsx`,
  )
}
