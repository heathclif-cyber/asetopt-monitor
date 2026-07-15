import type { Aset, KerjaSama, Kompensasi } from '@/types'
import type { RKAPTargetRow } from '@/store/rkapStore'

/** Kategori program mengikuti klasifikasi sheet Optimalisasi Aset (LM). */
export const KATEGORI_BY_KODE: Record<string, string> = {
  'R800027-0015': 'Industri Lainnya',
  'R800038-0029': 'Perkebunan',
  'R800009-0031': 'Pertambangan',
  'R800031-0026': 'Pertambangan',
  'R800001-0002': 'Properti',
  'R800021-0016': 'Perkebunan',
  'R800011-0017': 'Properti',
  'R800012-0018': 'Kerja Sama Agrowisata',
  'R800013-0019': 'Properti',
  'R800002-0032': 'Properti',
  'R800014-0020': 'Properti',
  'R800015-0012': 'Properti',
  'R800039-0033': 'Properti',
  'R800019-0023': 'Properti',
  'R800003-0004': 'Properti',
  'R800017-0025': 'Properti',
  'R800006-0007': 'Properti',
  'R800033-0028': 'Properti',
  'R800010-0010': 'Properti',
  'R800004-0005': 'Properti',
  'R800032-0027': 'Properti',
  'R800005-0006': 'Properti',
  'R800007-0008': 'Peternakan',
  'R800026-0014': 'Properti',
  'R800041-0035': 'Properti',
  'R800042-0036': 'Properti',
}

export type ProgramHorizon = 'full_year' | 'ytd'

export interface ProgramLaporanRow {
  no: number
  key: string
  kategori: string
  programAset: string
  kode: string
  rkap: number
  pendapatan: number
  cashIn: number
  capaianPct: number | null
  prosesMitra: string
  monitoring: string
  mitraList: string[]
  nTagihan: number
  nLunas: number
  isOrphan: boolean
}

function dateKey(dateStr: string): string {
  return dateStr.slice(0, 10)
}

function yearOf(dateStr: string): number {
  return Number(dateStr.slice(0, 4))
}

function inferKategori(kode: string, nama: string): string {
  if (kode && KATEGORI_BY_KODE[kode]) return KATEGORI_BY_KODE[kode]
  const n = nama.toLowerCase()
  if (n.includes('gula') || n.includes('pabrik gula')) return 'Industri Lainnya'
  if (n.includes('takalar') || n.includes('sidrap') || n.includes('kebun')) return 'Perkebunan'
  if (n.includes('tinanggea') || n.includes('tambang') || n.includes('stockpile')) return 'Pertambangan'
  if (n.includes('marinsow') || n.includes('agrowisata')) return 'Kerja Sama Agrowisata'
  if (n.includes('kabaru') || n.includes('ternak')) return 'Peternakan'
  return 'Properti'
}

function statusLabelKS(status: string | undefined): string {
  switch (status) {
    case 'aktif': return 'Aktif'
    case 'sp1': return 'SP1'
    case 'sp2': return 'SP2'
    case 'sp3': return 'SP3'
    case 'putus': return 'Putus'
    case 'selesai': return 'Selesai'
    default: return status ?? '-'
  }
}

function statusLabelAset(status: string | undefined): string {
  switch (status) {
    case 'pipeline': return 'Pipeline — pencarian mitra'
    case 'prospek': return 'Prospek — penjajakan mitra'
    case 'negosiasi': return 'Negosiasi'
    case 'aktif_ks': return 'Ada kerja sama'
    case 'selesai': return 'Selesai'
    default: return 'Belum ada mitra'
  }
}

/**
 * Resolve program key for a kompensasi:
 * 1) rkap_kode if it matches an RKAP program
 * 2) aset.kode_aset if it matches an RKAP program
 * 3) orphan by aset id / name
 */
function resolveProgramKey(
  k: Kompensasi,
  ks: KerjaSama | undefined,
  rkapByKode: Map<string, RKAPTargetRow>,
): { key: string; kode: string; namaHint: string; isOrphan: boolean } {
  const aset = ks?.aset as Aset | undefined
  const asetKode = aset?.kode_aset?.trim() || ''
  const rkapKode = k.rkap_kode?.trim() || ''

  // Prefer asset code when it is a known RKAP program (hindari salah taut rkap_kode)
  if (asetKode && rkapByKode.has(asetKode)) {
    return { key: asetKode, kode: asetKode, namaHint: rkapByKode.get(asetKode)!.nama, isOrphan: false }
  }
  // Remapping sadar (contoh Meilani → Gedung Timur) saat aset tidak punya baris RKAP sendiri
  if (rkapKode && rkapByKode.has(rkapKode)) {
    return { key: rkapKode, kode: rkapKode, namaHint: rkapByKode.get(rkapKode)!.nama, isOrphan: false }
  }
  // Orphan: aset / KS tanpa baris RKAP
  if (aset?.id) {
    return {
      key: `aset:${aset.id}`,
      kode: asetKode,
      namaHint: aset.nama_aset || 'Aset tanpa program RKAP',
      isOrphan: true,
    }
  }
  if (ks?.id) {
    return {
      key: `ks:${ks.id}`,
      kode: rkapKode,
      namaHint: ks.nama_mitra || 'Kerja sama tanpa aset',
      isOrphan: true,
    }
  }
  return { key: `komp:${k.id}`, kode: rkapKode, namaHint: k.periode_label || 'Tanpa program', isOrphan: true }
}

export function buildProgramLaporanRows(opts: {
  rkapRows: RKAPTargetRow[]
  allKompensasi: Kompensasi[]
  daftarKS: KerjaSama[]
  daftarAset: Aset[]
  tahun: number
  horizon: ProgramHorizon
  asOf?: Date
}): ProgramLaporanRow[] {
  const { rkapRows, allKompensasi, daftarKS, daftarAset, tahun, horizon } = opts
  const asOf = opts.asOf ?? new Date()
  const asOfKey = dateKey(asOf.toISOString())

  const rkapByKode = new Map<string, RKAPTargetRow>()
  rkapRows.forEach(r => {
    if (r.kode?.trim()) rkapByKode.set(r.kode.trim(), r)
  })

  const ksMap = new Map(daftarKS.map(k => [k.id, k]))

  type Acc = {
    pendapatan: number
    cashIn: number
    nTagihan: number
    nLunas: number
    mitra: Map<string, string> // ksId -> nama + status
    asetIds: Set<string>
    kode: string
    namaHint: string
    isOrphan: boolean
  }

  const acc = new Map<string, Acc>()

  const ensure = (key: string, init: Partial<Acc> & { kode: string; namaHint: string; isOrphan: boolean }) => {
    let a = acc.get(key)
    if (!a) {
      a = {
        pendapatan: 0,
        cashIn: 0,
        nTagihan: 0,
        nLunas: 0,
        mitra: new Map(),
        asetIds: new Set(),
        kode: init.kode,
        namaHint: init.namaHint,
        isOrphan: init.isOrphan,
      }
      acc.set(key, a)
    }
    return a
  }

  // Seed semua baris RKAP (supaya program pipeline tetap tampil)
  rkapRows.forEach(r => {
    const kode = r.kode?.trim() || `rkap-no:${r.no}`
    ensure(kode, {
      kode: r.kode?.trim() || '',
      namaHint: r.nama,
      isOrphan: !r.kode?.trim(),
    })
  })

  const inCashInWindow = (tglBayar: string) => {
    if (!tglBayar || yearOf(tglBayar) !== tahun) return false
    if (horizon === 'ytd' && dateKey(tglBayar) > asOfKey) return false
    return true
  }

  const inPendapatanWindow = (tglJt: string) => {
    if (!tglJt || yearOf(tglJt) !== tahun) return false
    if (horizon === 'ytd' && dateKey(tglJt) > asOfKey) return false
    return true
  }

  // Pendapatan: nominal tagihan JT di tahun/cakupan
  // Cash In: pembayaran by tgl_bayar di tahun/cakupan (bisa dari tagihan tahun lain)
  allKompensasi.forEach(k => {
    const ks = ksMap.get(k.ks_id) ?? k.kerja_sama
    const resolved = resolveProgramKey(k, ks, rkapByKode)
    const a = ensure(resolved.key, {
      kode: resolved.kode,
      namaHint: resolved.namaHint,
      isOrphan: resolved.isOrphan,
    })

    if (ks) {
      a.mitra.set(ks.id, `${ks.nama_mitra} (${statusLabelKS(ks.status)})`)
      if (ks.aset_id) a.asetIds.add(ks.aset_id)
      const aset = ks.aset as Aset | undefined
      if (aset?.id) a.asetIds.add(aset.id)
    }

    // Cash in by payment date
    ;(k.pembayaran ?? []).forEach(p => {
      if (!inCashInWindow(p.tgl_bayar)) return
      a.cashIn += p.nominal_bayar || 0
    })

    // Pendapatan + status tagihan by JT
    if (!k.tgl_jatuh_tempo || !inPendapatanWindow(k.tgl_jatuh_tempo)) return

    const nominal = k.nominal ?? 0
    const tagihan = Math.max(0, (k.total_tagihan ?? 0) - (k.pengurang ?? 0))
    const dibayarAll = (k.pembayaran ?? []).reduce((s, p) => s + (p.nominal_bayar || 0), 0)

    a.pendapatan += nominal
    a.nTagihan += 1
    if (tagihan > 0 && dibayarAll >= tagihan) a.nLunas += 1
    else if (tagihan === 0 && dibayarAll > 0) a.nLunas += 1
  })

  // Aset → kode untuk status pipeline
  const asetByKode = new Map(daftarAset.filter(a => a.kode_aset).map(a => [a.kode_aset, a]))
  const asetById = new Map(daftarAset.map(a => [a.id, a]))

  // KS per aset kode (untuk proses mitra walau belum ada kompensasi di tahun ini)
  const ksByAsetKode = new Map<string, KerjaSama[]>()
  daftarKS.forEach(ks => {
    const kode = (ks.aset as Aset | undefined)?.kode_aset?.trim()
    if (!kode) return
    const list = ksByAsetKode.get(kode) ?? []
    list.push(ks)
    ksByAsetKode.set(kode, list)
  })

  const rows: ProgramLaporanRow[] = []
  const usedKeys = new Set<string>()

  // Urutan: baris RKAP dulu
  rkapRows.forEach((r, idx) => {
    const key = r.kode?.trim() || `rkap-no:${r.no}`
    usedKeys.add(key)
    const a = acc.get(key)
    const rkap = r.total ?? 0
    const pendapatan = a?.pendapatan ?? 0
    const cashIn = a?.cashIn ?? 0
    const capaianPct = rkap > 0 ? (cashIn / rkap) * 100 : null

    let prosesMitra = ''
    let monitoring = ''

    const mitraFromAcc = a ? Array.from(a.mitra.values()) : []
    const ksList = r.kode ? (ksByAsetKode.get(r.kode.trim()) ?? []) : []

    if (mitraFromAcc.length > 0) {
      prosesMitra = `Eksisting: ${mitraFromAcc.join('; ')}`
    } else if (ksList.length > 0) {
      prosesMitra = `Eksisting: ${ksList.map(k => `${k.nama_mitra} (${statusLabelKS(k.status)})`).join('; ')}`
    } else {
      const aset = r.kode ? asetByKode.get(r.kode.trim()) : undefined
      prosesMitra = statusLabelAset(aset?.status)
    }

    if (a && a.nTagihan > 0) {
      if (a.nLunas === a.nTagihan && cashIn > 0) {
        monitoring = `Pembayaran lancar (${a.nLunas}/${a.nTagihan} tagihan lunas)`
      } else if (cashIn > 0) {
        monitoring = `Sebagian tertagih — ${a.nLunas}/${a.nTagihan} lunas`
      } else {
        monitoring = `Belum ada pembayaran · ${a.nTagihan} tagihan di ${tahun}`
      }
      const spMitra = mitraFromAcc.filter(m => /SP[123]|Putus/i.test(m))
      if (spMitra.length) monitoring = `Status mitra bermasalah: ${spMitra.join('; ')}. ${monitoring}`
    } else if (ksList.length > 0) {
      monitoring = 'Ada kerja sama; belum ada tagihan di periode ini'
    } else {
      monitoring = '-'
    }

    rows.push({
      no: r.no || idx + 1,
      key,
      kategori: inferKategori(r.kode?.trim() || '', r.nama),
      programAset: r.nama,
      kode: r.kode?.trim() || '',
      rkap,
      pendapatan,
      cashIn,
      capaianPct,
      prosesMitra,
      monitoring,
      mitraList: mitraFromAcc,
      nTagihan: a?.nTagihan ?? 0,
      nLunas: a?.nLunas ?? 0,
      isOrphan: false,
    })
  })

  // Orphan programs (aset dengan realisasi tapi tidak di RKAP)
  const orphanEntries = Array.from(acc.entries()).filter(([key, a]) => a.isOrphan && !usedKeys.has(key) && (a.pendapatan > 0 || a.cashIn > 0 || a.nTagihan > 0))
  orphanEntries.sort((a, b) => a[1].namaHint.localeCompare(b[1].namaHint))

  let orphanNo = rows.length + 1
  orphanEntries.forEach(([key, a]) => {
    usedKeys.add(key)
    const mitraFromAcc = Array.from(a.mitra.values())
    let monitoring = '-'
    if (a.nTagihan > 0) {
      if (a.nLunas === a.nTagihan && a.cashIn > 0) monitoring = `Pembayaran lancar (${a.nLunas}/${a.nTagihan} lunas)`
      else if (a.cashIn > 0) monitoring = `Sebagian tertagih — ${a.nLunas}/${a.nTagihan} lunas`
      else monitoring = `Belum ada pembayaran · ${a.nTagihan} tagihan`
    }
    const aset = key.startsWith('aset:') ? asetById.get(key.slice(5)) : undefined
    rows.push({
      no: orphanNo++,
      key,
      kategori: inferKategori(a.kode, a.namaHint),
      programAset: a.namaHint,
      kode: a.kode,
      rkap: 0,
      pendapatan: a.pendapatan,
      cashIn: a.cashIn,
      capaianPct: null,
      prosesMitra: mitraFromAcc.length ? `Eksisting: ${mitraFromAcc.join('; ')}` : statusLabelAset(aset?.status),
      monitoring,
      mitraList: mitraFromAcc,
      nTagihan: a.nTagihan,
      nLunas: a.nLunas,
      isOrphan: true,
    })
  })

  return rows
}

export function summarizeProgramRows(rows: ProgramLaporanRow[]) {
  const rkap = rows.reduce((s, r) => s + r.rkap, 0)
  const pendapatan = rows.reduce((s, r) => s + r.pendapatan, 0)
  const cashIn = rows.reduce((s, r) => s + r.cashIn, 0)
  return {
    rkap,
    pendapatan,
    cashIn,
    capaianPct: rkap > 0 ? (cashIn / rkap) * 100 : null,
  }
}
