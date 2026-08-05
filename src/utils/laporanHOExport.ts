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
  summarizeHO,
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

/** Nilai uang sudah dalam satuan Rp 000 (÷1000). */
function moneyCell(cell: ExcelJS.Cell, value: number, alt: boolean) {
  cell.value = Math.round(value || 0)
  cell.numFmt = MONEY_FMT
  cell.alignment = { horizontal: 'right', vertical: 'middle' }
  cell.border = thin()
  cell.font = { name: 'Calibri', size: 9 }
  if (value < 0) {
    cell.font = { name: 'Calibri', size: 9, color: { argb: 'FFB91C1C' } }
  }
  if (alt) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ALT } }
}

function intCell(cell: ExcelJS.Cell, value: number | null | undefined, alt: boolean) {
  cell.value = value ?? ''
  cell.numFmt = '0'
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
  c5.value = `${subtitle} · Bulan: ${bulanLabel} · Diekspor: ${todayKey()}`
  c5.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF64748B' } }

  // Banner satuan — selaras template HO Rekap
  ws.mergeCells(6, 1, 6, Math.min(colCount, 12))
  const c6 = ws.getCell(6, 1)
  c6.value = 'Dalam Rp 000 (ribu rupiah), kecuali dinyatakan lain. Contoh: 7.500 = Rp 7.500.000'
  c6.font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF0F766E' } }
  c6.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFECFDF5' } }
  c6.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }
  ws.getRow(6).height = 18
}

/** Index kolom master (0-based) yang berupa uang → sudah /1000 (Rp 000) */
const MASTER_MONEY_IDX = new Set([14, 15, 16, 17, 18, 19, 20])
/** Index non-uang numerik: No, Luas, Jangka */
const MASTER_INT_IDX = new Set([0, 10, 13])

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
    if (MASTER_MONEY_IDX.has(i) && typeof v === 'number') moneyCell(cell, v, alt)
    else if (MASTER_INT_IDX.has(i) && typeof v === 'number') intCell(cell, v, alt)
    else if (typeof v === 'number') intCell(cell, v, alt)
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
    views: [{ state: 'frozen', xSplit: 3, ySplit: 9, showGridLines: false }],
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

  writeTitleBlock(ws, 'MONITORING PENERIMAAN PENDAPATAN', 'Format HO — Realisasi Pendapatan (pokok / akrual)', tahun, months, colCount)

  // Header mulai baris 7 (setelah banner satuan di baris 6)
  const h1 = 7
  const h2 = 8
  const h3 = 9
  MASTER_HEADERS.forEach((h, i) => {
    ws.mergeCells(h1, i + 1, h3, i + 1)
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

    ;['Target', 'Pendapatan (= Pokok)', 'PPN', 'PPH (−)', 'PBB', 'Total s.d. pajak', 'No Dok (SAP)', '%'].forEach((s, j) => {
      const cell = ws.getCell(h2, start + j)
      cell.value = s
      styleHeader(cell)
    })
    ;['(Rp 000)', '(Rp 000)', '(Rp 000)', '(Rp 000)', '(Rp 000)', '(Rp 000)', '', ''].forEach((s, j) => {
      const cell = ws.getCell(h3, start + j)
      cell.value = s
      styleHeader(cell)
    })
  })
  ws.getRow(h1).height = 22
  ws.getRow(h2).height = 28
  ws.getRow(h3).height = 16

  let rIdx = 10
  const totals = months.map(() => ({
    target: 0, pendapatan: 0, ppn: 0, pph: 0, pbb: 0, total: 0,
  }))

  rows.forEach((r, ri) => {
    const alt = ri % 2 === 1
    writeMasterCells(ws, rIdx, r, alt)
    months.forEach((m, mi) => {
      const pm = r.pendapatanByMonth[m]
      const base = masterCount + mi * subPerMonth + 1
      const pctVsTarget = pm.target > 0 ? (pm.pendapatan / pm.target) * 100 : null
      ;[
        toRp000(pm.target),
        toRp000(pm.pendapatan),
        toRp000(pm.ppn),
        toRp000(pm.pph),
        toRp000(pm.pbb),
        toRp000(pm.total),
      ].forEach((v, j) => moneyCell(ws.getCell(rIdx, base + j), v, alt))
      textCell(ws.getCell(rIdx, base + 6), pm.noDokSap, alt)
      pctCell(ws.getCell(rIdx, base + 7), pctVsTarget, alt)

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
    // % capaian = pendapatan (pokok) / target
    const pct = t.target > 0 ? (t.pendapatan / t.target) * 100 : null
    const pc = ws.getCell(rIdx, base + 7)
    pctCell(pc, pct, false)
    pc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_BG } }
  })

  rIdx += 2
  ws.mergeCells(rIdx, 1, rIdx, Math.min(8, colCount))
  ws.getCell(rIdx, 1).value =
    'Catatan: Rp 000. Pendapatan = Pokok (DPP). Total s.d. pajak = Pendapatan+PPN+PPH(−)+PBB. % = Pendapatan/Target. PPH negatif.'
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
    views: [{ state: 'frozen', xSplit: 3, ySplit: 9, showGridLines: false }],
  })

  const subPerMonth = 7
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
  const h3 = 9
  MASTER_HEADERS.forEach((h, i) => {
    ws.mergeCells(h1, i + 1, h3, i + 1)
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
    ;['(Rp 000)', '(Rp 000)', '(Rp 000)', '(Rp 000)', '(Rp 000)', '(Rp 000)', '(Rp 000)'].forEach((s, j) => {
      const cell = ws.getCell(h3, start + j)
      cell.value = s
      styleHeader(cell)
    })
  })
  ws.getRow(h1).height = 22
  ws.getRow(h2).height = 28
  ws.getRow(h3).height = 16

  let rIdx = 10
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
        toRp000(pm.aging1_30),
        toRp000(pm.aging31_60),
        toRp000(pm.aging61_90),
        toRp000(pm.aging91_180),
        toRp000(pm.aging181_360),
        toRp000(pm.aging361),
        toRp000(pm.saldo),
      ]
      vals.forEach((v, j) => moneyCell(ws.getCell(rIdx, base + j), v, alt))
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
    'Catatan: Semua kolom uang dalam Rp 000 (nilai asli ÷ 1.000). Aging dari tgl jatuh tempo. Contoh: 50.000 = Rp 50.000.000'
  ws.getCell(rIdx, 1).font = { name: 'Calibri', size: 8, italic: true, color: { argb: 'FF64748B' } }

  return ws
}

function buildRingkasanSheet(
  wb: ExcelJS.Workbook,
  rows: HOMasterRow[],
  tahun: number,
  months: number[],
) {
  const ws = wb.addWorksheet('Ringkasan TOTAL', {
    views: [{ showGridLines: false }],
  })
  ;[28, 18, 18, 36].forEach((w, i) => { ws.getColumn(i + 1).width = w })

  const s = summarizeHO(rows, months)
  const sYear = summarizeHO(rows, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
  const bulanLabel = months.map(m => BULAN_LABELS_HO[m]).join(', ')

  ws.mergeCells(1, 1, 1, 4)
  const t1 = ws.getCell(1, 1)
  t1.value = 'PROGRAM KERJA OPTIMALISASI ASET PTPN I — REGIONAL 8'
  t1.font = { name: 'Calibri', size: 12, bold: true, color: { argb: NAVY } }

  ws.mergeCells(2, 1, 2, 4)
  const t2 = ws.getCell(2, 1)
  t2.value = `RINGKASAN TOTAL · ${bulanLabel} ${tahun}`
  t2.font = { name: 'Calibri', size: 14, bold: true, color: { argb: NAVY } }

  ws.mergeCells(3, 1, 3, 4)
  const t3 = ws.getCell(3, 1)
  t3.value = `Dalam Rp 000 (nilai asli ÷ 1.000) · ${rows.length} proker · Diekspor: ${todayKey()}`
  t3.font = { name: 'Calibri', size: 9, italic: true, color: { argb: 'FF64748B' } }

  // Header
  const headers = ['Uraian', 'Nilai (Rp 000)', 'Nilai (Rp penuh)', 'Keterangan']
  headers.forEach((h, i) => {
    const cell = ws.getCell(5, i + 1)
    cell.value = h
    styleHeader(cell)
  })
  ws.getRow(5).height = 20

  type Row = { uraian: string; value: number; ket: string; bold?: boolean; danger?: boolean }
  const lines: Row[] = [
    { uraian: 'Jumlah proker', value: rows.length, ket: 'Baris di laporan', bold: true },
    { uraian: 'Σ RKAP Eksisting (tahun)', value: s.totalRkapTahun, ket: 'Total target RKAP proker' },
    { uraian: 'Σ Target Tahun', value: s.totalTargetTahun, ket: 'RKAP + Non-RKAP' },
    { uraian: '', value: 0, ket: '' },
    { uraian: `PENDAPATAN · ${bulanLabel}`, value: 0, ket: '', bold: true },
    { uraian: '  Target RKAP', value: s.targetPendapatan, ket: 'Target periode terpilih' },
    {
      uraian: 'PENDAPATAN (= Pokok / DPP)',
      value: s.realisasiPendapatan,
      ket: 'Ini yang disebut pendapatan',
      bold: true,
    },
    { uraian: '  PPN', value: s.pendapatanPpn, ket: 'Positif — di luar pendapatan' },
    { uraian: '  PPH', value: s.pendapatanPph, ket: 'Minus — di luar pendapatan', danger: true },
    { uraian: '  PBB', value: s.pendapatanPbb, ket: 'Di luar pendapatan' },
    {
      uraian: 'Total s.d. pajak',
      value: s.totalSdPajak,
      ket: 'Pendapatan + PPN + PPH(−) + PBB',
      bold: true,
    },
    {
      uraian: 'Capaian vs Target (%)',
      value: s.targetPendapatan > 0 ? (s.realisasiPendapatan / s.targetPendapatan) * 100 : 0,
      ket: s.targetPendapatan > 0 ? 'Pendapatan (pokok) / Target × 100' : 'Tidak ada target',
      bold: true,
    },
    { uraian: '', value: 0, ket: '' },
    { uraian: `PIUTANG · ${bulanLabel}`, value: 0, ket: '', bold: true },
    { uraian: '  1 – 30 hari', value: s.piutang1_30, ket: 'Aging' },
    { uraian: '  31 – 60 hari', value: s.piutang31_60, ket: 'Aging' },
    { uraian: '  61 – 90 hari', value: s.piutang61_90, ket: 'Aging' },
    { uraian: '  91 – 180 hari', value: s.piutang91_180, ket: 'Aging' },
    { uraian: '  181 – 360 hari', value: s.piutang181_360, ket: 'Aging' },
    { uraian: '  > 361 hari', value: s.piutang361, ket: 'Aging' },
    {
      uraian: 'TOTAL SALDO PIUTANG',
      value: s.saldoPiutang,
      ket: 'Snapshot outstanding akhir bulan',
      bold: true,
    },
    { uraian: '', value: 0, ket: '' },
    {
      uraian: `Pendapatan (= pokok) full year ${tahun}`,
      value: sYear.realisasiPendapatan,
      ket: 'Σ pokok 12 bulan',
      bold: true,
    },
  ]

  let r = 6
  lines.forEach(line => {
    if (!line.uraian && line.value === 0 && !line.ket) {
      r += 1
      return
    }
    const isPct = line.uraian.includes('Capaian')
    const isCount = line.uraian === 'Jumlah proker'
    const isSection = line.uraian === line.uraian.toUpperCase() && line.value === 0 && line.bold

    ws.getCell(r, 1).value = line.uraian
    ws.getCell(r, 1).font = {
      name: 'Calibri',
      size: 10,
      bold: !!line.bold,
      color: { argb: line.danger ? 'FFB91C1C' : NAVY },
    }
    ws.getCell(r, 1).border = thin()

    if (isSection) {
      ws.getCell(r, 2).value = ''
      ws.getCell(r, 3).value = ''
    } else if (isCount) {
      ws.getCell(r, 2).value = line.value
      ws.getCell(r, 2).numFmt = '0'
      ws.getCell(r, 3).value = line.value
      ws.getCell(r, 3).numFmt = '0'
    } else if (isPct) {
      ws.getCell(r, 2).value = line.value
      ws.getCell(r, 2).numFmt = '0.0"%"'
      ws.getCell(r, 3).value = line.value
      ws.getCell(r, 3).numFmt = '0.0"%"'
    } else {
      moneyCell(ws.getCell(r, 2), toRp000(line.value), false)
      // Kolom Rp penuh (bukan ÷1000)
      const full = ws.getCell(r, 3)
      full.value = Math.round(line.value || 0)
      full.numFmt = '#,##0'
      full.alignment = { horizontal: 'right', vertical: 'middle' }
      full.border = thin()
      full.font = {
        name: 'Calibri',
        size: 9,
        bold: !!line.bold,
        color: { argb: line.danger ? 'FFB91C1C' : 'FF000000' },
      }
    }

    if (line.bold && !isSection) {
      ;[1, 2, 3, 4].forEach(c => {
        const cell = ws.getCell(r, c)
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_BG } }
        cell.font = {
          name: 'Calibri',
          size: 10,
          bold: true,
          color: { argb: line.danger ? 'FFB91C1C' : 'FF78350F' },
        }
        cell.border = thin()
      })
      if (!isCount && !isPct) {
        moneyCell(ws.getCell(r, 2), toRp000(line.value), false)
        ws.getCell(r, 2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_BG } }
        ws.getCell(r, 2).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF78350F' } }
        ws.getCell(r, 3).value = Math.round(line.value || 0)
        ws.getCell(r, 3).numFmt = '#,##0'
        ws.getCell(r, 3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TOTAL_BG } }
        ws.getCell(r, 3).font = { name: 'Calibri', size: 10, bold: true, color: { argb: 'FF78350F' } }
        ws.getCell(r, 3).border = thin()
      }
    }

    ws.getCell(r, 4).value = line.ket
    ws.getCell(r, 4).font = { name: 'Calibri', size: 9, color: { argb: 'FF64748B' } }
    ws.getCell(r, 4).border = thin()
    r += 1
  })

  r += 1
  ws.mergeCells(r, 1, r, 4)
  ws.getCell(r, 1).value =
    'Catatan: Pendapatan = Pokok (DPP). Total s.d. pajak = pendapatan+pajak. Kolom B = Rp 000. Kolom C = Rupiah penuh.'
  ws.getCell(r, 1).font = { name: 'Calibri', size: 8, italic: true, color: { argb: 'FF64748B' } }

  return ws
}

export async function exportLaporanHOExcel(
  rows: HOMasterRow[],
  opts: { tahun: number; months: number[] },
): Promise<void> {
  const { tahun, months } = opts
  const sortedMonths = [...months].sort((a, b) => a - b)
  const wb = newWorkbook()
  buildRingkasanSheet(wb, rows, tahun, sortedMonths)
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
