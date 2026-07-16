import * as XLSX from 'xlsx'
import type { Aset, KerjaSama, Kompensasi, Pembayaran } from '@/types'
import { hitungDenda } from '@/utils/taxUtils'
import { resolveMonikaId } from '@/utils/laporanProgramUtils'
import { formatTanggal } from '@/lib/utils'

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

/** Tanggal pelunasan: tgl bayar terakhir yang membuat kumulatif ≥ efektif */
function findTglPelunasan(
  payments: Pembayaran[],
  efektif: number,
): string | null {
  if (efektif <= 0 || payments.length === 0) return null
  const sorted = [...payments].sort((a, b) =>
    dateKey(a.tgl_bayar).localeCompare(dateKey(b.tgl_bayar)),
  )
  let cum = 0
  for (const p of sorted) {
    cum += p.nominal_bayar || 0
    if (cum + 0.5 >= efektif) return dateKey(p.tgl_bayar)
  }
  return null
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
}): MonitoringDetailRow[] {
  const { allKompensasi, daftarKS, daftarAset = [], rkapByKode, tahun } = opts
  const asOf = opts.asOf ?? new Date()
  const ksMap = new Map(daftarKS.map(k => [k.id, k]))
  const asetByKode = new Map(
    daftarAset.filter(a => a.kode_aset?.trim()).map(a => [a.kode_aset.trim(), a]),
  )

  const rows: MonitoringDetailRow[] = []

  for (const k of allKompensasi) {
    if (!k.tgl_jatuh_tempo || yearOf(k.tgl_jatuh_tempo) !== tahun) continue

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

    const tglAsOf = isLunas
      ? (findTglPelunasan(pembayaran, efektif) ?? dateKey(asOf.toISOString()))
      : dateKey(asOf.toISOString())

    const denda = hitungDenda({
      nominal: k.nominal ?? 0,
      tglJatuhTempo: k.tgl_jatuh_tempo,
      tglHariIni: new Date(tglAsOf + 'T12:00:00'),
      persenDendaPerHari: (k.persen_denda_per_hari ?? 0) / 100,
      maksHariBayar: k.maks_hari_bayar ?? 0,
    })

    // Untuk status: hari telat s.d. hari ini jika belum lunas; jika lunas pakai as-of pelunasan
    const hariForStatus = isLunas
      ? denda.hariTerlambat
      : hitungDenda({
          nominal: k.nominal ?? 0,
          tglJatuhTempo: k.tgl_jatuh_tempo,
          tglHariIni: asOf,
          persenDendaPerHari: (k.persen_denda_per_hari ?? 0) / 100,
          maksHariBayar: k.maks_hari_bayar ?? 0,
        }).hariTerlambat

    const statusBayar = resolveStatus(cashIn, efektif, hariForStatus)
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
      hariTerlambat: isLunas ? denda.hariTerlambat : hariForStatus,
      // Lunas: denda historis s.d. pelunasan; belum lunas: denda s.d. hari ini
      nominalDenda: isLunas
        ? denda.nominalDenda
        : hitungDenda({
            nominal: k.nominal ?? 0,
            tglJatuhTempo: k.tgl_jatuh_tempo,
            tglHariIni: asOf,
            persenDendaPerHari: (k.persen_denda_per_hari ?? 0) / 100,
            maksHariBayar: k.maks_hari_bayar ?? 0,
          }).nominalDenda,
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

export function exportMonitoringExcel(
  tahun: number,
  detail: MonitoringDetailRow[],
  groups: MonitoringGroup[],
  groupBy: 'mitra' | 'proker',
): void {
  const wb = XLSX.utils.book_new()
  const today = new Date().toISOString().slice(0, 10)

  const detailSheet = [
    [
      'Mitra',
      'No. Perjanjian',
      'ID Monika',
      'Proker / Aset',
      'Periode',
      'No. Invoice',
      'Tgl Terbit',
      'Tgl Jatuh Tempo',
      'Total Tagihan',
      'Cash In',
      'Sisa',
      'Tgl Bayar',
      'Hari Telat',
      'Denda',
      'Status Bayar',
      'Status KS',
    ],
    ...detail.map(r => [
      r.namaMitra,
      r.noPerjanjian,
      r.monikaId ?? '—',
      r.namaProker,
      r.periodeLabel,
      r.noInvoice ?? '',
      r.tglTerbit ?? '',
      r.tglJatuhTempo,
      r.totalTagihan,
      r.cashIn,
      r.sisa,
      r.tglBayarLabel,
      r.hariTerlambat,
      Math.round(r.nominalDenda),
      STATUS_LABEL[r.statusBayar],
      r.statusKs,
    ]),
  ]
  const ws1 = XLSX.utils.aoa_to_sheet(detailSheet)
  ws1['!cols'] = [24, 18, 16, 28, 14, 18, 12, 14, 14, 14, 12, 22, 10, 12, 12, 10].map(wch => ({ wch }))
  XLSX.utils.book_append_sheet(wb, ws1, 'Detail Tagihan')

  const groupSheet = [
    [
      groupBy === 'mitra' ? 'Mitra' : 'Proker',
      'ID Monika',
      groupBy === 'mitra' ? 'Proker' : 'Mitra',
      'No. Perjanjian',
      'N Tagihan',
      'N Lunas',
      'N Terlambat',
      'Total Tagihan',
      'Cash In',
      'Outstanding',
      'Total Denda',
      '% Tertagih',
    ],
    ...groups.map(g => [
      g.title,
      g.monikaId ?? '—',
      groupBy === 'mitra' ? g.namaProker : g.namaMitra,
      g.noPerjanjian,
      g.nTagihan,
      g.nLunas,
      g.nTerlambat,
      g.totalTagihan,
      g.cashIn,
      g.outstanding,
      Math.round(g.totalDenda),
      g.pctTertagih != null ? +g.pctTertagih.toFixed(1) : null,
    ]),
  ]
  const ws2 = XLSX.utils.aoa_to_sheet(groupSheet)
  ws2['!cols'] = [28, 16, 28, 18, 10, 10, 12, 14, 14, 14, 12, 10].map(wch => ({ wch }))
  XLSX.utils.book_append_sheet(wb, ws2, groupBy === 'mitra' ? 'Per Mitra' : 'Per Proker')

  XLSX.writeFile(wb, `Monitoring_Kompensasi_${tahun}_${today}.xlsx`)
}

export { STATUS_LABEL as MONITORING_STATUS_LABEL }
