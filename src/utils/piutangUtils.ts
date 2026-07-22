import type { KerjaSama, Kompensasi, SuratPeringatan } from '@/types'
import { hitungDenda } from '@/utils/taxUtils'
import { formatTanggal } from '@/lib/utils'

/** Bucket aging piutang untuk collection */
export type PiutangAging =
  | 'invoice_belum_jt' // invoice terbit, JT masih di depan
  | 'dalam_grace' // lewat JT, masih maks hari bayar
  | '1_30' // 1–30 hari lewat grace
  | '31_60'
  | '61_90'
  | '90_plus'

export type PiutangAlasan = 'invoice' | 'jatuh_tempo' | 'keduanya'

export interface PiutangRow {
  id: string
  ksId: string
  namaMitra: string
  namaAset: string
  noPerjanjian: string
  noWa: string
  periodeLabel: string
  tglJatuhTempo: string
  tahunJT: number
  /** Invoice internal / nomor dokumen */
  noInvoice: string | null
  noInvoiceSap: string | null
  invoiceTgl: string | null
  hasInvoice: boolean
  efektifTagihan: number
  totalDibayar: number
  sisa: number
  hariDariJT: number
  hariLewatGrace: number
  dalamGrace: boolean
  nominalDenda: number
  aging: PiutangAging
  alasan: PiutangAlasan
  statusKs: string
  spJenis: string | null
  maksHariBayar: number
}

export const PIUTANG_AGING_LABEL: Record<PiutangAging, string> = {
  invoice_belum_jt: 'Invoice · belum JT',
  dalam_grace: 'Dalam masa bayar',
  '1_30': 'Overdue 1–30 hari',
  '31_60': 'Overdue 31–60 hari',
  '61_90': 'Overdue 61–90 hari',
  '90_plus': 'Overdue > 90 hari',
}

export const PIUTANG_AGING_ORDER: PiutangAging[] = [
  '90_plus',
  '61_90',
  '31_60',
  '1_30',
  'dalam_grace',
  'invoice_belum_jt',
]

function dateKey(s: string): string {
  return s.slice(0, 10)
}

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function daysBetween(from: Date, to: Date): number {
  const a = startOfDay(from).getTime()
  const b = startOfDay(to).getTime()
  return Math.floor((b - a) / (1000 * 60 * 60 * 24))
}

export function hasInvoiceIssued(k: Kompensasi): boolean {
  return Boolean(
    (k.invoice_tgl && String(k.invoice_tgl).trim())
    || (k.no_invoice && String(k.no_invoice).trim())
    || (k.no_invoice_sap && String(k.no_invoice_sap).trim()),
  )
}

export function resolvePiutangAging(
  hariDariJT: number,
  hariLewatGrace: number,
  dalamGrace: boolean,
  hasInvoice: boolean,
): PiutangAging {
  if (hariDariJT < 0) return 'invoice_belum_jt'
  if (dalamGrace || hariLewatGrace <= 0) return 'dalam_grace'
  if (hariLewatGrace <= 30) return '1_30'
  if (hariLewatGrace <= 60) return '31_60'
  if (hariLewatGrace <= 90) return '61_90'
  return '90_plus'
}

/**
 * Piutang = sisa > 0 DAN (invoice sudah diterbitkan ATAU tgl JT sudah tiba/lewat).
 * Tidak dibatasi tahun — piutang multi-tahun ikut masuk.
 */
export function buildPiutangRows(opts: {
  allKompensasi: Kompensasi[]
  daftarKS: KerjaSama[]
  spAktif?: SuratPeringatan[]
  asOf?: Date
}): PiutangRow[] {
  const { allKompensasi, daftarKS, spAktif = [] } = opts
  const asOf = opts.asOf ?? new Date()
  const today = startOfDay(asOf)
  const ksMap = new Map(daftarKS.map(k => [k.id, k]))

  const spByKs = new Map<string, string>()
  const spOrder: Record<string, number> = { SP1: 1, SP2: 2, SP3: 3, PUTUS: 4 }
  for (const sp of spAktif) {
    const cur = spByKs.get(sp.ks_id)
    if (!cur || (spOrder[sp.jenis] ?? 0) > (spOrder[cur] ?? 0)) {
      spByKs.set(sp.ks_id, sp.jenis)
    }
  }

  const rows: PiutangRow[] = []

  for (const k of allKompensasi) {
    if (!k.tgl_jatuh_tempo) continue

    const efektif = Math.max(0, (k.total_tagihan ?? 0) - (k.pengurang ?? 0))
    const totalDibayar = (k.pembayaran ?? []).reduce((s, p) => s + (p.nominal_bayar || 0), 0)
    const sisa = Math.max(0, efektif - totalDibayar)
    if (sisa <= 0.5) continue

    const invoice = hasInvoiceIssued(k)
    const jt = new Date(dateKey(k.tgl_jatuh_tempo) + 'T12:00:00')
    const hariDariJT = daysBetween(jt, today)
    const sudahJT = hariDariJT >= 0

    // Hanya piutang "aktif" untuk collection: invoice terbit ATAU sudah waktunya (JT)
    if (!invoice && !sudahJT) continue

    const maksHari = k.maks_hari_bayar ?? 0
    const graceEnd = new Date(jt)
    graceEnd.setDate(graceEnd.getDate() + maksHari)
    const hariLewatGrace = daysBetween(graceEnd, today)
    const dalamGrace = sudahJT && hariLewatGrace <= 0

    const denda = hitungDenda({
      nominal: k.nominal ?? 0,
      tglJatuhTempo: k.tgl_jatuh_tempo,
      tglHariIni: asOf,
      persenDendaPerHari: (k.persen_denda_per_hari ?? 0) / 100,
      maksHariBayar: maksHari,
    })

    const ks = ksMap.get(k.ks_id) ?? k.kerja_sama
    const aging = resolvePiutangAging(hariDariJT, hariLewatGrace, dalamGrace, invoice)
    const alasan: PiutangAlasan =
      invoice && sudahJT ? 'keduanya' : invoice ? 'invoice' : 'jatuh_tempo'

    rows.push({
      id: k.id,
      ksId: k.ks_id,
      namaMitra: ks?.nama_mitra ?? '-',
      namaAset: (ks?.aset as { nama_aset?: string } | undefined)?.nama_aset ?? '-',
      noPerjanjian: ks?.no_perjanjian ?? '-',
      noWa: ks?.no_wa_mitra ?? '',
      periodeLabel: k.periode_label ?? formatTanggal(k.tgl_jatuh_tempo),
      tglJatuhTempo: dateKey(k.tgl_jatuh_tempo),
      tahunJT: Number(dateKey(k.tgl_jatuh_tempo).slice(0, 4)),
      noInvoice: k.no_invoice,
      noInvoiceSap: k.no_invoice_sap,
      invoiceTgl: k.invoice_tgl ? dateKey(k.invoice_tgl) : null,
      hasInvoice: invoice,
      efektifTagihan: efektif,
      totalDibayar,
      sisa,
      hariDariJT,
      hariLewatGrace: Math.max(0, hariLewatGrace),
      dalamGrace,
      nominalDenda: denda.nominalDenda,
      aging,
      alasan,
      statusKs: ks?.status ?? '-',
      spJenis: spByKs.get(k.ks_id) ?? null,
      maksHariBayar: maksHari,
    })
  }

  return rows.sort((a, b) => {
    const ai = PIUTANG_AGING_ORDER.indexOf(a.aging)
    const bi = PIUTANG_AGING_ORDER.indexOf(b.aging)
    if (ai !== bi) return ai - bi
    if (b.sisa !== a.sisa) return b.sisa - a.sisa
    return a.tglJatuhTempo.localeCompare(b.tglJatuhTempo)
  })
}

export function summarizePiutang(rows: PiutangRow[]) {
  const byAging = Object.fromEntries(
    PIUTANG_AGING_ORDER.map(a => [a, { count: 0, sisa: 0 }]),
  ) as Record<PiutangAging, { count: number; sisa: number }>

  let totalSisa = 0
  let totalTagihan = 0
  let totalDibayar = 0
  let totalDenda = 0
  let nInvoice = 0
  let nTanpaInvoice = 0
  let nSP = 0

  for (const r of rows) {
    totalSisa += r.sisa
    totalTagihan += r.efektifTagihan
    totalDibayar += r.totalDibayar
    totalDenda += r.nominalDenda
    byAging[r.aging].count += 1
    byAging[r.aging].sisa += r.sisa
    if (r.hasInvoice) nInvoice += 1
    else nTanpaInvoice += 1
    if (r.spJenis) nSP += 1
  }

  return {
    nTagihan: rows.length,
    totalSisa,
    totalTagihan,
    totalDibayar,
    totalDenda,
    nInvoice,
    nTanpaInvoice,
    nSP,
    byAging,
  }
}
