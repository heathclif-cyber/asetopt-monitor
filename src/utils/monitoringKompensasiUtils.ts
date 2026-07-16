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
  proker: MonitoringProkerRow[],
): void {
  const wb = XLSX.utils.book_new()
  const today = new Date().toISOString().slice(0, 10)

  const detailSheet = [
    [
      'ID Monika',
      'Proker / Aset',
      'Mitra',
      'No. Perjanjian',
      'Periode',
      'No. Invoice',
      'Tgl Terbit',
      'Sumber Tgl Terbit',
      'Tgl Jatuh Tempo',
      'Total Tagihan',
      'Cash In',
      'Sisa',
      'Tgl Bayar',
      'Hari Telat',
      'Denda',
      'Status Bayar',
      'Status KS',
      'N Pembayaran',
    ],
    ...detail.map(r => [
      r.monikaId ?? '—',
      r.namaProker,
      r.namaMitra,
      r.noPerjanjian,
      r.periodeLabel,
      r.noInvoice ?? '',
      r.tglTerbit ?? '',
      r.tglTerbitSource,
      r.tglJatuhTempo,
      r.totalTagihan,
      r.cashIn,
      r.sisa,
      r.tglBayarLabel,
      r.hariTerlambat,
      Math.round(r.nominalDenda),
      STATUS_LABEL[r.statusBayar],
      r.statusKs,
      r.nPembayaran,
    ]),
  ]
  const ws1 = XLSX.utils.aoa_to_sheet(detailSheet)
  ws1['!cols'] = [16, 28, 24, 20, 14, 18, 12, 12, 14, 14, 14, 12, 22, 10, 12, 12, 10, 10].map(wch => ({ wch }))
  XLSX.utils.book_append_sheet(wb, ws1, 'Detail Tagihan')

  const prokerSheet = [
    [
      'ID Monika',
      'Proker / Aset',
      'Mitra',
      'N Tagihan',
      'N Lunas',
      'N Terlambat',
      'N Sebagian',
      'N Belum',
      'Total Tagihan',
      'Cash In',
      'Outstanding',
      'Total Denda',
      '% Tertagih',
    ],
    ...proker.map(r => [
      r.monikaId,
      r.namaProker,
      r.mitraList.join('; '),
      r.nTagihan,
      r.nLunas,
      r.nTerlambat,
      r.nSebagian,
      r.nBelumBayar,
      r.totalTagihan,
      r.cashIn,
      r.outstanding,
      Math.round(r.totalDenda),
      r.pctTertagih != null ? +r.pctTertagih.toFixed(1) : null,
    ]),
  ]
  const ws2 = XLSX.utils.aoa_to_sheet(prokerSheet)
  ws2['!cols'] = [16, 28, 36, 10, 10, 12, 10, 10, 14, 14, 14, 12, 10].map(wch => ({ wch }))
  XLSX.utils.book_append_sheet(wb, ws2, 'Per Proker')

  XLSX.writeFile(wb, `Monitoring_Kompensasi_${tahun}_${today}.xlsx`)
}

export { STATUS_LABEL as MONITORING_STATUS_LABEL }
