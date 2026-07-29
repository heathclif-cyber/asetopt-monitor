import type { Aset, KerjaSama, Kompensasi } from '@/types'
import { findTglPelunasan, hitungDenda } from '@/utils/taxUtils'
import { resolveMonikaId } from '@/utils/laporanProgramUtils'
import { formatTanggal } from '@/lib/utils'
import {
  addTemplatedSheet,
  downloadWorkbook,
  newWorkbook,
  todayKey,
  type ExcelColumn,
} from '@/utils/excelTemplate'

export type MonitoringStatusBayar = 'lunas' | 'sebagian' | 'belum_bayar' | 'terlambat'

export interface MonitoringDetailRow {
  id: string
  ksId: string
  monikaId: string | null
  namaProker: string
  namaMitra: string
  namaAset: string
  noPerjanjian: string
  periodeLabel: string
  noInvoice: string | null
  /** Tanggal terbit tagihan (invoice_tgl), fallback created_at */
  tglTerbit: string | null
  tglTerbitSource: 'invoice' | 'created' | 'none'
  tglJatuhTempo: string
  totalTagihan: number
  cashIn: number
  sisa: number
  /** Semua tgl bayar (sorted asc) */
  tglBayarList: string[]
  tglBayarPertama: string | null
  tglBayarTerakhir: string | null
  /** Label tampilan: satu tgl / "a → b" / "—" */
  tglBayarLabel: string
  /** Rincian pembayaran historikal */
  pembayaranDetail: { tgl: string; nominal: number; noPembayaran: string | null }[]
  hariTerlambat: number
  nominalDenda: number
  statusBayar: MonitoringStatusBayar
  statusKs: string
  nPembayaran: number
}

export interface MonitoringProkerRow {
  monikaId: string
  namaProker: string
  mitraList: string[]
  nTagihan: number
  nLunas: number
  nTerlambat: number
  nBelumBayar: number
  nSebagian: number
  totalTagihan: number
  cashIn: number
  outstanding: number
  totalDenda: number
  pctTertagih: number | null
}

/** Satu unit monitoring = mitra (KS) atau proker (Monika), berisi daftar tagihan */
export interface MonitoringGroup {
  key: string
  groupBy: 'mitra' | 'proker'
  /** Mitra (KS) atau nama proker */
  title: string
  subtitle: string
  monikaId: string | null
  namaProker: string
  namaMitra: string
  noPerjanjian: string
  statusKs: string
  namaAset: string
  rows: MonitoringDetailRow[]
  nTagihan: number
  nLunas: number
  nTerlambat: number
  nSebagian: number
  nBelumBayar: number
  totalTagihan: number
  cashIn: number
  outstanding: number
  totalDenda: number
  pctTertagih: number | null
}

function summarizeDetailRows(rows: MonitoringDetailRow[]) {
  let nLunas = 0
  let nTerlambat = 0
  let nSebagian = 0
  let nBelumBayar = 0
  let totalTagihan = 0
  let cashIn = 0
  let outstanding = 0
  let totalDenda = 0
  for (const r of rows) {
    totalTagihan += r.totalTagihan
    cashIn += r.cashIn
    outstanding += r.sisa
    totalDenda += r.nominalDenda
    if (r.statusBayar === 'lunas') nLunas += 1
    else if (r.statusBayar === 'terlambat') nTerlambat += 1
    else if (r.statusBayar === 'sebagian') nSebagian += 1
    else nBelumBayar += 1
  }
  return {
    nTagihan: rows.length,
    nLunas,
    nTerlambat,
    nSebagian,
    nBelumBayar,
    totalTagihan,
    cashIn,
    outstanding,
    totalDenda,
    pctTertagih: totalTagihan > 0 ? (cashIn / totalTagihan) * 100 : null,
  }
}

/** Grup monitoring per mitra (kerja sama) — unit utama track collection */
export function groupMonitoringByMitra(rows: MonitoringDetailRow[]): MonitoringGroup[] {
  const map = new Map<string, MonitoringDetailRow[]>()
  for (const r of rows) {
    const key = r.ksId || `unknown-${r.id}`
    const list = map.get(key) ?? []
    list.push(r)
    map.set(key, list)
  }

  return Array.from(map.entries())
    .map(([key, groupRows]) => {
      const sorted = [...groupRows].sort((a, b) => a.tglJatuhTempo.localeCompare(b.tglJatuhTempo))
      const head = sorted[0]
      const agg = summarizeDetailRows(sorted)
      return {
        key,
        groupBy: 'mitra' as const,
        title: head.namaMitra,
        subtitle: [
          head.monikaId ?? null,
          head.namaProker !== head.namaMitra ? head.namaProker : null,
          head.noPerjanjian !== '-' ? head.noPerjanjian : null,
        ].filter(Boolean).join(' · '),
        monikaId: head.monikaId,
        namaProker: head.namaProker,
        namaMitra: head.namaMitra,
        noPerjanjian: head.noPerjanjian,
        statusKs: head.statusKs,
        namaAset: head.namaAset,
        rows: sorted,
        ...agg,
      }
    })
    .sort((a, b) => {
      // yang ada outstanding/denda dulu, lalu abjad mitra
      if (a.nTerlambat !== b.nTerlambat) return b.nTerlambat - a.nTerlambat
      if (a.outstanding !== b.outstanding) return b.outstanding - a.outstanding
      return a.namaMitra.localeCompare(b.namaMitra, 'id')
    })
}

/** Grup monitoring per proker (ID Monika) */
export function groupMonitoringByProker(rows: MonitoringDetailRow[]): MonitoringGroup[] {
  const map = new Map<string, MonitoringDetailRow[]>()
  for (const r of rows) {
    const key = r.monikaId?.trim() || '__tanpa_monika__'
    const list = map.get(key) ?? []
    list.push(r)
    map.set(key, list)
  }

  return Array.from(map.entries())
    .map(([key, groupRows]) => {
      const sorted = [...groupRows].sort((a, b) => {
        const m = a.namaMitra.localeCompare(b.namaMitra, 'id')
        if (m !== 0) return m
        return a.tglJatuhTempo.localeCompare(b.tglJatuhTempo)
      })
      const head = sorted[0]
      const agg = summarizeDetailRows(sorted)
      const mitraUnique = Array.from(new Set(sorted.map(r => r.namaMitra))).sort((a, b) => a.localeCompare(b, 'id'))
      const monikaId = key === '__tanpa_monika__' ? null : key
      return {
        key,
        groupBy: 'proker' as const,
        title: head.namaProker,
        subtitle: [
          monikaId,
          mitraUnique.length <= 2 ? mitraUnique.join(', ') : `${mitraUnique.length} mitra`,
        ].filter(Boolean).join(' · '),
        monikaId,
        namaProker: head.namaProker,
        namaMitra: mitraUnique.join(', '),
        noPerjanjian: '-',
        statusKs: '-',
        namaAset: head.namaAset,
        rows: sorted,
        ...agg,
      }
    })
    .sort((a, b) => {
      if (a.nTerlambat !== b.nTerlambat) return b.nTerlambat - a.nTerlambat
      if (a.outstanding !== b.outstanding) return b.outstanding - a.outstanding
      return (a.monikaId ?? 'zzz').localeCompare(b.monikaId ?? 'zzz', 'id')
    })
}

export interface MonitoringSummary {
  totalTagihan: number
  totalCashIn: number
  totalSisa: number
  totalDenda: number
  pctTertagih: number
  nTerlambat: number
  nLunas: number
  nTagihan: number
}

function yearOf(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const y = Number(String(dateStr).slice(0, 4))
  return Number.isFinite(y) ? y : null
}

function dateKey(s: string): string {
  return s.slice(0, 10)
}

/** Cakupan tagihan di monitoring */
export type MonitoringHorizon = 'jt_berjalan' | 'full_year'

/**
 * JT berjalan = tgl jatuh tempo ≤ asOf (outstanding hanya tahap yang sudah waktunya).
 * Full year = semua JT di tahun tersebut (termasuk yang belum JT).
 */
export function isJtInHorizon(
  tglJatuhTempo: string,
  tahun: number,
  horizon: MonitoringHorizon,
  asOf: Date = new Date(),
): boolean {
  if (yearOf(tglJatuhTempo) !== tahun) return false
  if (horizon === 'full_year') return true
  const asOfKey = dateKey(
    `${asOf.getFullYear()}-${String(asOf.getMonth() + 1).padStart(2, '0')}-${String(asOf.getDate()).padStart(2, '0')}`,
  )
  return dateKey(tglJatuhTempo) <= asOfKey
}

function resolveStatus(
  totalDibayar: number,
  efektif: number,
  hariTerlambat: number,
): MonitoringStatusBayar {
  if (efektif > 0 && totalDibayar >= efektif) return 'lunas'
  if (totalDibayar > 0) return hariTerlambat > 0 ? 'terlambat' : 'sebagian'
  if (hariTerlambat > 0) return 'terlambat'
  return 'belum_bayar'
}

function formatTglBayarLabel(list: string[]): string {
  if (list.length === 0) return '—'
  if (list.length === 1) return formatTanggal(list[0])
  const first = list[0]
  const last = list[list.length - 1]
  if (first === last) return formatTanggal(first)
  return `${formatTanggal(first)} → ${formatTanggal(last)}`
}

export function buildMonitoringDetailRows(opts: {
  allKompensasi: Kompensasi[]
  daftarKS: KerjaSama[]
  daftarAset?: Aset[]
  rkapByKode?: Map<string, string>
  tahun: number
  asOf?: Date
  /**
   * Default `jt_berjalan`: hanya tagihan JT ≤ hari ini (sisa/outstanding tidak
   * memasukkan tahap full-year yang belum jatuh tempo).
   */
  horizon?: MonitoringHorizon
}): MonitoringDetailRow[] {
  const { allKompensasi, daftarKS, daftarAset = [], rkapByKode, tahun } = opts
  const asOf = opts.asOf ?? new Date()
  const horizon: MonitoringHorizon = opts.horizon ?? 'jt_berjalan'
  const ksMap = new Map(daftarKS.map(k => [k.id, k]))
  const asetByKode = new Map(
    daftarAset.filter(a => a.kode_aset?.trim()).map(a => [a.kode_aset.trim(), a]),
  )

  const rows: MonitoringDetailRow[] = []

  for (const k of allKompensasi) {
    if (!k.tgl_jatuh_tempo) continue
    if (!isJtInHorizon(k.tgl_jatuh_tempo, tahun, horizon, asOf)) continue

    const ks = ksMap.get(k.ks_id) ?? k.kerja_sama
    const monikaId = resolveMonikaId(k, ks)
    const aset = (ks?.aset as Aset | undefined)
      ?? (monikaId ? asetByKode.get(monikaId) : undefined)
    const namaAset = aset?.nama_aset ?? (ks?.aset as Aset | undefined)?.nama_aset ?? '-'
    const namaProker =
      (monikaId && rkapByKode?.get(monikaId))
      || namaAset
      || monikaId
      || 'Tanpa ID Monika'

    const pembayaran = [...(k.pembayaran ?? [])].sort((a, b) =>
      dateKey(a.tgl_bayar).localeCompare(dateKey(b.tgl_bayar)),
    )
    const efektif = Math.max(0, (k.total_tagihan ?? 0) - (k.pengurang ?? 0))
    const cashIn = pembayaran.reduce((s, p) => s + (p.nominal_bayar || 0), 0)
    const sisa = Math.max(0, efektif - cashIn)
    const isLunas = efektif > 0 && cashIn + 0.5 >= efektif

    // Lunas: denda + telat membeku di tgl pelunasan. Belum lunas: s.d. hari ini.
    const tglAsOf = isLunas
      ? (findTglPelunasan(pembayaran, efektif) ?? dateKey(asOf.toISOString()))
      : dateKey(asOf.toISOString())

    // Denda sejak lewat JT (grace 0). maks_hari_bayar tidak menunda denda —
    // dulu default 14 membuat "telat 14 hari, denda —".
    const denda = hitungDenda({
      nominal: k.nominal ?? 0,
      tglJatuhTempo: k.tgl_jatuh_tempo,
      tglHariIni: tglAsOf,
      persenDendaPerHari: (k.persen_denda_per_hari ?? 0) / 100,
      maksHariBayar: 0,
    })

    const statusBayar = resolveStatus(cashIn, efektif, denda.hariTerlambat)
    const tglBayarList = pembayaran.map(p => dateKey(p.tgl_bayar))
    const pembayaranDetail = pembayaran.map(p => ({
      tgl: dateKey(p.tgl_bayar),
      nominal: p.nominal_bayar || 0,
      noPembayaran: p.no_pembayaran ?? null,
    }))

    let tglTerbit: string | null = null
    let tglTerbitSource: MonitoringDetailRow['tglTerbitSource'] = 'none'
    if (k.invoice_tgl) {
      tglTerbit = dateKey(k.invoice_tgl)
      tglTerbitSource = 'invoice'
    } else if (k.created_at) {
      tglTerbit = dateKey(k.created_at)
      tglTerbitSource = 'created'
    }

    rows.push({
      id: k.id,
      ksId: k.ks_id,
      monikaId,
      namaProker,
      namaMitra: ks?.nama_mitra ?? '-',
      namaAset,
      noPerjanjian: ks?.no_perjanjian ?? '-',
      periodeLabel: k.periode_label ?? formatTanggal(k.tgl_jatuh_tempo),
      noInvoice: k.no_invoice,
      tglTerbit,
      tglTerbitSource,
      tglJatuhTempo: dateKey(k.tgl_jatuh_tempo),
      totalTagihan: efektif,
      cashIn,
      sisa,
      tglBayarList,
      tglBayarPertama: tglBayarList[0] ?? null,
      tglBayarTerakhir: tglBayarList[tglBayarList.length - 1] ?? null,
      tglBayarLabel: formatTglBayarLabel(tglBayarList),
      pembayaranDetail,
      hariTerlambat: denda.hariTerlambat,
      nominalDenda: denda.nominalDenda,
      statusBayar,
      statusKs: ks?.status ?? '-',
      nPembayaran: pembayaran.length,
    })
  }

  return rows.sort((a, b) => a.tglJatuhTempo.localeCompare(b.tglJatuhTempo))
}

export function aggregateMonitoringByProker(
  rows: MonitoringDetailRow[],
): MonitoringProkerRow[] {
  const map = new Map<string, {
    namaProker: string
    mitra: Set<string>
    nTagihan: number
    nLunas: number
    nTerlambat: number
    nBelumBayar: number
    nSebagian: number
    totalTagihan: number
    cashIn: number
    outstanding: number
    totalDenda: number
  }>()

  for (const r of rows) {
    const key = r.monikaId?.trim() || '__tanpa_monika__'
    let a = map.get(key)
    if (!a) {
      a = {
        namaProker: r.namaProker,
        mitra: new Set(),
        nTagihan: 0,
        nLunas: 0,
        nTerlambat: 0,
        nBelumBayar: 0,
        nSebagian: 0,
        totalTagihan: 0,
        cashIn: 0,
        outstanding: 0,
        totalDenda: 0,
      }
      map.set(key, a)
    }
    if (r.namaMitra && r.namaMitra !== '-') a.mitra.add(r.namaMitra)
    a.nTagihan += 1
    a.totalTagihan += r.totalTagihan
    a.cashIn += r.cashIn
    a.outstanding += r.sisa
    a.totalDenda += r.nominalDenda
    if (r.statusBayar === 'lunas') a.nLunas += 1
    else if (r.statusBayar === 'terlambat') a.nTerlambat += 1
    else if (r.statusBayar === 'sebagian') a.nSebagian += 1
    else a.nBelumBayar += 1
    if (r.namaProker && a.namaProker === 'Tanpa ID Monika' && r.namaProker !== 'Tanpa ID Monika') {
      a.namaProker = r.namaProker
    }
  }

  return Array.from(map.entries())
    .map(([monikaId, a]) => ({
      monikaId: monikaId === '__tanpa_monika__' ? '—' : monikaId,
      namaProker: a.namaProker,
      mitraList: Array.from(a.mitra).sort((x, y) => x.localeCompare(y, 'id')),
      nTagihan: a.nTagihan,
      nLunas: a.nLunas,
      nTerlambat: a.nTerlambat,
      nBelumBayar: a.nBelumBayar,
      nSebagian: a.nSebagian,
      totalTagihan: a.totalTagihan,
      cashIn: a.cashIn,
      outstanding: a.outstanding,
      totalDenda: a.totalDenda,
      pctTertagih: a.totalTagihan > 0 ? (a.cashIn / a.totalTagihan) * 100 : null,
    }))
    .sort((a, b) => a.monikaId.localeCompare(b.monikaId, 'id'))
}

export function summarizeMonitoringRows(rows: MonitoringDetailRow[]): MonitoringSummary {
  const totalTagihan = rows.reduce((s, r) => s + r.totalTagihan, 0)
  const totalCashIn = rows.reduce((s, r) => s + r.cashIn, 0)
  const totalSisa = rows.reduce((s, r) => s + r.sisa, 0)
  const totalDenda = rows.reduce((s, r) => s + r.nominalDenda, 0)
  const nTerlambat = rows.filter(r => r.statusBayar === 'terlambat').length
  const nLunas = rows.filter(r => r.statusBayar === 'lunas').length
  return {
    totalTagihan,
    totalCashIn,
    totalSisa,
    totalDenda,
    pctTertagih: totalTagihan > 0 ? (totalCashIn / totalTagihan) * 100 : 0,
    nTerlambat,
    nLunas,
    nTagihan: rows.length,
  }
}

const STATUS_LABEL: Record<MonitoringStatusBayar, string> = {
  lunas: 'Lunas',
  sebagian: 'Sebagian',
  belum_bayar: 'Belum Bayar',
  terlambat: 'Terlambat',
}

const SP_KS = new Set(['sp1', 'sp2', 'sp3', 'putus'])

function displayStatusKs(status: string, hideSp?: boolean): string {
  if (!status || status === '-') return ''
  if (hideSp && SP_KS.has(String(status).toLowerCase())) return ''
  return status
}

export async function exportMonitoringExcel(
  tahun: number,
  detail: MonitoringDetailRow[],
  groups: MonitoringGroup[],
  groupBy: 'mitra' | 'proker',
  opts?: { hideSp?: boolean },
): Promise<void> {
  const hideSp = opts?.hideSp ?? false
  const today = todayKey()
  const wb = newWorkbook()

  const detailCols: ExcelColumn[] = [
    { header: 'Mitra', key: 'namaMitra', width: 24, type: 'text' },
    { header: 'No. Perjanjian', key: 'noPerjanjian', width: 16, type: 'text' },
    { header: 'ID Monika', key: 'monikaId', width: 14, type: 'text' },
    { header: 'Proker / Aset', key: 'namaProker', width: 26, type: 'text' },
    { header: 'Periode', key: 'periodeLabel', width: 14, type: 'text' },
    { header: 'No. Invoice', key: 'noInvoice', width: 14, type: 'text' },
    { header: 'Tgl Terbit', key: 'tglTerbit', width: 12, type: 'date', align: 'center' },
    { header: 'Tgl Jatuh Tempo', key: 'tglJatuhTempo', width: 14, type: 'date', align: 'center' },
    { header: 'Total Tagihan', key: 'totalTagihan', width: 14, type: 'money' },
    { header: 'Cash In', key: 'cashIn', width: 14, type: 'money' },
    { header: 'Sisa', key: 'sisa', width: 14, type: 'money' },
    { header: 'Tgl Bayar', key: 'tglBayarLabel', width: 20, type: 'text' },
    { header: 'Hari Telat', key: 'hariTerlambat', width: 10, type: 'int', align: 'center' },
    { header: 'Denda', key: 'nominalDenda', width: 12, type: 'money' },
    { header: 'Status Bayar', key: 'statusBayar', width: 12, type: 'text', align: 'center' },
    ...(hideSp
      ? []
      : [{ header: 'Status KS', key: 'statusKs', width: 10, type: 'text' as const, align: 'center' as const }]),
  ]

  const detailRows = detail.map(r => ({
    namaMitra: r.namaMitra,
    noPerjanjian: r.noPerjanjian,
    monikaId: r.monikaId ?? '—',
    namaProker: r.namaProker,
    periodeLabel: r.periodeLabel,
    noInvoice: r.noInvoice ?? '',
    tglTerbit: r.tglTerbit ?? '',
    tglJatuhTempo: r.tglJatuhTempo,
    totalTagihan: Math.round(r.totalTagihan),
    cashIn: Math.round(r.cashIn),
    sisa: Math.round(r.sisa),
    tglBayarLabel: r.tglBayarLabel,
    hariTerlambat: r.hariTerlambat,
    nominalDenda: Math.round(r.nominalDenda),
    statusBayar: STATUS_LABEL[r.statusBayar],
    ...(hideSp ? {} : { statusKs: displayStatusKs(r.statusKs, false) }),
  }))

  const totalSisa = detail.reduce((s, r) => s + r.sisa, 0)
  addTemplatedSheet(wb, {
    sheetName: 'Detail Tagihan',
    title: `Monitoring Kompensasi — Detail ${tahun}`,
    subtitle: 'Track record tagihan, pembayaran, keterlambatan & denda per tahap',
    metaLines: [
      `Jumlah tagihan: ${detail.length}`,
      `Total outstanding: ${Math.round(totalSisa).toLocaleString('id-ID')}`,
      `Diekspor: ${today}`,
    ],
    columns: detailCols,
    rows: detailRows,
    totalKeys: ['totalTagihan', 'cashIn', 'sisa', 'nominalDenda'],
    totalLabelCol: 0,
  })

  const groupCols: ExcelColumn[] = [
    {
      header: groupBy === 'mitra' ? 'Mitra' : 'Proker',
      key: 'title',
      width: 26,
      type: 'text',
    },
    { header: 'ID Monika', key: 'monikaId', width: 14, type: 'text' },
    {
      header: groupBy === 'mitra' ? 'Proker' : 'Mitra',
      key: 'secondary',
      width: 24,
      type: 'text',
    },
    { header: 'No. Perjanjian', key: 'noPerjanjian', width: 16, type: 'text' },
    { header: 'N Tagihan', key: 'nTagihan', width: 10, type: 'int', align: 'center' },
    { header: 'N Lunas', key: 'nLunas', width: 10, type: 'int', align: 'center' },
    { header: 'N Terlambat', key: 'nTerlambat', width: 11, type: 'int', align: 'center' },
    { header: 'Total Tagihan', key: 'totalTagihan', width: 14, type: 'money' },
    { header: 'Cash In', key: 'cashIn', width: 14, type: 'money' },
    { header: 'Outstanding', key: 'outstanding', width: 14, type: 'money' },
    { header: 'Total Denda', key: 'totalDenda', width: 12, type: 'money' },
    { header: '% Tertagih', key: 'pctTertagih', width: 11, type: 'percent', align: 'center' },
  ]

  const groupRows = groups.map(g => ({
    title: g.title,
    monikaId: g.monikaId ?? '—',
    secondary: groupBy === 'mitra' ? g.namaProker : g.namaMitra,
    noPerjanjian: g.noPerjanjian,
    nTagihan: g.nTagihan,
    nLunas: g.nLunas,
    nTerlambat: g.nTerlambat,
    totalTagihan: Math.round(g.totalTagihan),
    cashIn: Math.round(g.cashIn),
    outstanding: Math.round(g.outstanding),
    totalDenda: Math.round(g.totalDenda),
    pctTertagih: g.pctTertagih != null ? +g.pctTertagih.toFixed(1) : null,
  }))

  addTemplatedSheet(wb, {
    sheetName: groupBy === 'mitra' ? 'Per Mitra' : 'Per Proker',
    title: `Monitoring Kompensasi — Rekap ${groupBy === 'mitra' ? 'Mitra' : 'Proker'} ${tahun}`,
    subtitle: 'Ringkasan collection per unit monitoring',
    metaLines: [
      `Jumlah grup: ${groups.length}`,
      `Diekspor: ${today}`,
    ],
    columns: groupCols,
    rows: groupRows,
    totalKeys: ['nTagihan', 'nLunas', 'nTerlambat', 'totalTagihan', 'cashIn', 'outstanding', 'totalDenda'],
    totalLabelCol: 0,
  })

  await downloadWorkbook(wb, `Monitoring_Kompensasi_${tahun}_${today}.xlsx`)
}

export { STATUS_LABEL as MONITORING_STATUS_LABEL }
