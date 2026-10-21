import type { Kompensasi, KerjaSama } from '@/types'
import type { ColType, ExcelColumn } from '@/utils/excelTemplate'
import { hitungDenda } from '@/utils/taxUtils'
import { hitungPendapatan, hitungTagihan } from '@/utils/accountingTerms'

export type StatusBayar = 'lunas' | 'terlambat' | 'sebagian' | 'belum_bayar'
export type StatusSap = 'belum' | 'sebagian' | 'lengkap'
export type GroupBy = 'none' | 'mitra' | 'proker'

export const STATUS_BAYAR_LABEL: Record<StatusBayar, string> = {
  lunas: 'Lunas', terlambat: 'Terlambat', sebagian: 'Sebagian', belum_bayar: 'Belum Bayar',
}
export const STATUS_SAP_LABEL: Record<StatusSap, string> = {
  belum: 'Belum diinput', sebagian: 'Sebagian', lengkap: 'Lengkap',
}
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

export interface TagihanRecord {
  ksId: string
  mitra: string
  aset: string
  noPerjanjian: string
  noKontrakSap: string
  proker: string
  periode: string
  tglJatuhTempo: string
  tahun: number
  bulan: string
  dpp: number
  ppn: number
  pph: number
  pengurang: number
  totalTagihan: number
  totalDibayar: number
  sisa: number
  tglBayarTerakhir: string
  status: StatusBayar
  hariTerlambat: number
  denda: number
  noInvoiceSap: string
  noBillingSap: string
  statusSap: StatusSap
}

export interface ReportColumnDef {
  key: keyof TagihanRecord
  label: string
  category: 'Mitra & Kontrak' | 'Tagihan' | 'Pembayaran' | 'SAP'
  type: ColType
  width: number
}

export const TAGIHAN_COLUMNS: ReportColumnDef[] = [
  { key: 'mitra', label: 'Mitra', category: 'Mitra & Kontrak', type: 'text', width: 30 },
  { key: 'aset', label: 'Aset', category: 'Mitra & Kontrak', type: 'text', width: 28 },
  { key: 'proker', label: 'Proker (ID Monika)', category: 'Mitra & Kontrak', type: 'text', width: 18 },
  { key: 'noPerjanjian', label: 'No Perjanjian', category: 'Mitra & Kontrak', type: 'text', width: 24 },
  { key: 'noKontrakSap', label: 'No Kontrak SAP', category: 'Mitra & Kontrak', type: 'text', width: 20 },
  { key: 'periode', label: 'Periode', category: 'Tagihan', type: 'text', width: 20 },
  { key: 'tglJatuhTempo', label: 'Jatuh Tempo', category: 'Tagihan', type: 'date', width: 14 },
  { key: 'tahun', label: 'Tahun JT', category: 'Tagihan', type: 'int', width: 10 },
  { key: 'bulan', label: 'Bulan JT', category: 'Tagihan', type: 'text', width: 12 },
  { key: 'dpp', label: 'DPP', category: 'Tagihan', type: 'money', width: 18 },
  { key: 'ppn', label: 'PPN', category: 'Tagihan', type: 'money', width: 16 },
  { key: 'pph', label: 'PPh', category: 'Tagihan', type: 'money', width: 16 },
  { key: 'pengurang', label: 'Pengurang', category: 'Tagihan', type: 'money', width: 16 },
  { key: 'totalTagihan', label: 'Total Tagihan', category: 'Tagihan', type: 'money', width: 18 },
  { key: 'totalDibayar', label: 'Total Dibayar', category: 'Pembayaran', type: 'money', width: 18 },
  { key: 'sisa', label: 'Sisa', category: 'Pembayaran', type: 'money', width: 18 },
  { key: 'tglBayarTerakhir', label: 'Tgl Bayar Terakhir', category: 'Pembayaran', type: 'date', width: 16 },
  { key: 'status', label: 'Status Bayar', category: 'Pembayaran', type: 'text', width: 14 },
  { key: 'hariTerlambat', label: 'Hari Terlambat', category: 'Pembayaran', type: 'int', width: 12 },
  { key: 'denda', label: 'Denda', category: 'Pembayaran', type: 'money', width: 16 },
  { key: 'noInvoiceSap', label: 'No Invoice SAP', category: 'SAP', type: 'text', width: 20 },
  { key: 'noBillingSap', label: 'No Billing SAP', category: 'SAP', type: 'text', width: 20 },
  { key: 'statusSap', label: 'Status SAP', category: 'SAP', type: 'text', width: 14 },
]

export interface ReportConfig {
  columns: { key: keyof TagihanRecord; label: string }[]
  filters: {
    /** Kosong = semua tahun */
    tahun: number[]
    /** Kosong = semua mitra */
    mitra: string
    status: StatusBayar | 'all'
    sap: StatusSap | 'all'
  }
  groupBy: GroupBy
  totalRow: boolean
}

export function defaultConfig(): ReportConfig {
  const pick = (keys: (keyof TagihanRecord)[]) =>
    keys.map(key => ({ key, label: TAGIHAN_COLUMNS.find(c => c.key === key)!.label }))
  return {
    columns: pick(['mitra', 'periode', 'tglJatuhTempo', 'totalTagihan', 'totalDibayar', 'sisa', 'status']),
    filters: { tahun: [new Date().getFullYear()], mitra: 'all', status: 'all', sap: 'all' },
    groupBy: 'none',
    totalRow: true,
  }
}

/** Menerima config tersimpan yang mungkin usang: buang kolom yang tidak dikenal. */
export function normalizeConfig(raw: Partial<ReportConfig> | undefined): ReportConfig {
  const base = defaultConfig()
  if (!raw) return base
  const known = new Set(TAGIHAN_COLUMNS.map(c => c.key))
  const columns = (raw.columns ?? []).filter(c => known.has(c.key))
  return {
    columns: columns.length ? columns : base.columns,
    filters: { ...base.filters, ...(raw.filters ?? {}) },
    groupBy: raw.groupBy ?? 'none',
    totalRow: raw.totalRow ?? true,
  }
}

const dateKey = (v: string) => String(v ?? '').slice(0, 10)

const sapTerisi = (v: string | null | undefined) => !!v && v.trim() !== '' && v.trim() !== '-'

function statusBayarOf(dibayar: number, tagihan: number, hariTerlambat: number): StatusBayar {
  if (tagihan > 0 && dibayar >= tagihan) return 'lunas'
  if (dibayar > 0) return hariTerlambat > 0 ? 'terlambat' : 'sebagian'
  return hariTerlambat > 0 ? 'terlambat' : 'belum_bayar'
}

export function buildTagihanRecords(allKompensasi: Kompensasi[], daftarKS: KerjaSama[]): TagihanRecord[] {
  return allKompensasi.map(k => {
    const ks = daftarKS.find(x => x.id === k.ks_id) ?? k.kerja_sama
    const pembayaran = [...(k.pembayaran ?? [])].sort((a, b) => dateKey(a.tgl_bayar).localeCompare(dateKey(b.tgl_bayar)))
    const totalDibayar = pembayaran.reduce((s, p) => s + (p.nominal_bayar || 0), 0)
    const tglBayarTerakhir = pembayaran.length ? dateKey(pembayaran[pembayaran.length - 1].tgl_bayar) : ''
    const totalTagihan = hitungTagihan(k)
    const lunas = totalTagihan > 0 && totalDibayar + 0.5 >= totalTagihan
    const denda = hitungDenda({
      nominal: k.nominal,
      tglJatuhTempo: k.tgl_jatuh_tempo,
      tglHariIni: lunas && tglBayarTerakhir ? tglBayarTerakhir : new Date(),
      persenDendaPerHari: (k.persen_denda_per_hari ?? 0) / 100,
      maksHariBayar: 0,
    })
    const jt = dateKey(k.tgl_jatuh_tempo)
    const invoice = (k.no_invoice_sap ?? '').trim()
    const billing = (k.no_billing_sap ?? '').trim()
    const nSap = Number(sapTerisi(invoice)) + Number(sapTerisi(billing))
    return {
      ksId: k.ks_id,
      mitra: ks?.nama_mitra ?? '-',
      aset: (ks?.aset as { nama_aset?: string } | undefined)?.nama_aset ?? '-',
      noPerjanjian: ks?.no_perjanjian ?? '',
      noKontrakSap: ks?.no_kontrak_sap ?? '',
      proker: k.rkap_kode ?? '',
      periode: k.periode_label ?? jt,
      tglJatuhTempo: jt,
      tahun: Number(jt.slice(0, 4)) || 0,
      bulan: BULAN[Number(jt.slice(5, 7)) - 1] ?? '',
      dpp: hitungPendapatan(k),
      ppn: k.nominal_ppn ?? 0,
      pph: k.nominal_pph ?? 0,
      pengurang: k.pengurang ?? 0,
      totalTagihan,
      totalDibayar,
      sisa: Math.max(0, totalTagihan - totalDibayar),
      tglBayarTerakhir,
      status: lunas ? 'lunas' : statusBayarOf(totalDibayar, totalTagihan, denda.hariTerlambat),
      hariTerlambat: lunas && !tglBayarTerakhir ? 0 : denda.hariTerlambat,
      denda: denda.nominalDenda,
      noInvoiceSap: invoice,
      noBillingSap: billing,
      statusSap: nSap === 2 ? 'lengkap' : nSap === 1 ? 'sebagian' : 'belum',
    }
  })
}

export function applyFilters(records: TagihanRecord[], f: ReportConfig['filters']): TagihanRecord[] {
  return records.filter(r =>
    (f.tahun.length === 0 || f.tahun.includes(r.tahun))
    && (f.mitra === 'all' || r.mitra === f.mitra)
    && (f.status === 'all' || r.status === f.status)
    && (f.sap === 'all' || r.statusSap === f.sap),
  )
}

export interface BuiltReport {
  columns: ExcelColumn[]
  rows: Record<string, unknown>[]
  totalKeys: string[]
}

const isNumeric = (t: ColType) => t === 'money' || t === 'number' || t === 'int'

export function buildReport(records: TagihanRecord[], config: ReportConfig): BuiltReport {
  const defs = new Map(TAGIHAN_COLUMNS.map(c => [c.key, c]))
  const selected = config.columns.map(c => ({ def: defs.get(c.key)!, label: c.label.trim() || defs.get(c.key)!.label }))
  const sorted = [...records].sort((a, b) =>
    a.mitra.localeCompare(b.mitra) || a.tglJatuhTempo.localeCompare(b.tglJatuhTempo))

  const toCell = (r: TagihanRecord, key: keyof TagihanRecord): unknown => {
    if (key === 'status') return STATUS_BAYAR_LABEL[r.status]
    if (key === 'statusSap') return STATUS_SAP_LABEL[r.statusSap]
    return r[key]
  }

  if (config.groupBy === 'none') {
    const columns: ExcelColumn[] = selected.map(({ def, label }) => ({ header: label, key: def.key, type: def.type, width: def.width }))
    const rows = sorted.map(r => Object.fromEntries(selected.map(({ def }) => [def.key, toCell(r, def.key)])))
    const totalKeys = config.totalRow ? selected.filter(s => isNumeric(s.def.type) && s.def.key !== 'tahun' && s.def.key !== 'hariTerlambat').map(s => s.def.key) : []
    return { columns, rows, totalKeys }
  }

  const groupKey = config.groupBy === 'mitra' ? 'mitra' : 'proker'
  const groups = new Map<string, TagihanRecord[]>()
  sorted.forEach(r => {
    const name = r[groupKey] || '(tanpa ' + (groupKey === 'mitra' ? 'mitra' : 'proker') + ')'
    groups.set(name, [...(groups.get(name) ?? []), r])
  })
  const numeric = selected.filter(s => isNumeric(s.def.type) && s.def.key !== 'tahun' && s.def.key !== 'hariTerlambat')
  const columns: ExcelColumn[] = [
    { header: groupKey === 'mitra' ? 'Mitra' : 'Proker (ID Monika)', key: '_group', type: 'text', width: 32 },
    { header: 'Jumlah Tagihan', key: '_count', type: 'int', width: 12 },
    ...numeric.map(({ def, label }) => ({ header: label, key: def.key, type: def.type, width: def.width })),
  ]
  const rows = Array.from(groups.entries()).map(([name, items]) => ({
    _group: name,
    _count: items.length,
    ...Object.fromEntries(numeric.map(({ def }) => [def.key, items.reduce((s, r) => s + (Number(r[def.key]) || 0), 0)])),
  }))
  return { columns, rows, totalKeys: config.totalRow ? ['_count', ...numeric.map(n => n.def.key)] : [] }
}
