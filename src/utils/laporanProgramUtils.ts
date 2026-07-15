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

/** Normalisasi nama proker untuk fuzzy match (hindari dobel Warung / Cafe). */
function normalizeProgramName(s: string): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\bjeneponto\b/g, ' ')
    .replace(/\b(lahan|eks|pabrik|kapas|bangunan|aset|jl\.?|jalan)\b/g, ' ')
    .replace(/[()[\]\-_/.,&+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Distinctive tokens for name matching. */
function nameTokens(s: string): string[] {
  return normalizeProgramName(s).split(' ').filter(t => t.length > 2)
}

/**
 * Cocokkan nama proker mirip, mis.:
 * "Lahan Eks Pabrik Kapas (Warung)" ≈ "Lahan Eks Pabrik Kapas Jeneponto - Warung Makan"
 */
export function programNamesMatch(a: string, b: string): boolean {
  const na = normalizeProgramName(a)
  const nb = normalizeProgramName(b)
  if (!na || !nb) return false
  if (na === nb) return true
  if (na.includes(nb) || nb.includes(na)) return true

  const ta = nameTokens(a)
  const tb = nameTokens(b)
  if (ta.length === 0 || tb.length === 0) return false

  const setB = new Set(tb)
  const overlap = ta.filter(t => setB.has(t)).length
  const minSize = Math.min(ta.length, tb.length)
  // Cukup 1 token khas jika salah satu nama pendek (warung, cafe)
  if (minSize === 1) return overlap >= 1
  return overlap >= Math.min(2, minSize)
}

function rkapRowKey(r: RKAPTargetRow): string {
  return r.kode?.trim() || `rkap-no:${r.no}`
}

type ResolveResult = { key: string; kode: string; namaHint: string; isOrphan: boolean }

/**
 * Resolve program key for a kompensasi:
 * 1) aset.kode_aset di master RKAP
 * 2) rkap_kode di master RKAP
 * 3) fuzzy nama aset / rkap_kode vs baris RKAP (termasuk RKAP tanpa kode)
 * 4) orphan by aset
 */
function resolveProgramKey(
  k: Kompensasi,
  ks: KerjaSama | undefined,
  rkapByKode: Map<string, RKAPTargetRow>,
  rkapRows: RKAPTargetRow[],
): ResolveResult {
  const aset = ks?.aset as Aset | undefined
  const asetKode = aset?.kode_aset?.trim() || ''
  const rkapKode = k.rkap_kode?.trim() || ''
  const asetNama = aset?.nama_aset || ''

  if (asetKode && rkapByKode.has(asetKode)) {
    const row = rkapByKode.get(asetKode)!
    return { key: rkapRowKey(row), kode: asetKode, namaHint: row.nama, isOrphan: false }
  }
  if (rkapKode && rkapByKode.has(rkapKode)) {
    const row = rkapByKode.get(rkapKode)!
    return { key: rkapRowKey(row), kode: rkapKode, namaHint: row.nama, isOrphan: false }
  }

  // Fuzzy: cocokkan ke baris RKAP (berguna saat RKAP tanpa kode, mis. Warung)
  const nameCandidates = [asetNama, rkapKode].filter(Boolean)
  for (const name of nameCandidates) {
    const hit = rkapRows.find(r => programNamesMatch(r.nama, name))
    if (hit) {
      return {
        key: rkapRowKey(hit),
        kode: hit.kode?.trim() || asetKode || rkapKode,
        namaHint: hit.nama,
        isOrphan: false,
      }
    }
  }

  if (aset?.id) {
    return {
      key: `aset:${aset.id}`,
      kode: asetKode,
      namaHint: asetNama || 'Aset tanpa program RKAP',
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

type Acc = {
  pendapatan: number
  cashIn: number
  nTagihan: number
  nLunas: number
  mitra: Map<string, string>
  asetIds: Set<string>
  kode: string
  namaHint: string
  isOrphan: boolean
}

function mergeAcc(target: Acc, source: Acc) {
  target.pendapatan += source.pendapatan
  target.cashIn += source.cashIn
  target.nTagihan += source.nTagihan
  target.nLunas += source.nLunas
  source.mitra.forEach((v, k) => target.mitra.set(k, v))
  source.asetIds.forEach(id => target.asetIds.add(id))
  if (!target.kode && source.kode) target.kode = source.kode
  if (source.namaHint && (!target.namaHint || target.isOrphan)) target.namaHint = source.namaHint
  target.isOrphan = target.isOrphan && source.isOrphan
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

  // Seed semua baris RKAP
  rkapRows.forEach(r => {
    ensure(rkapRowKey(r), {
      kode: r.kode?.trim() || '',
      namaHint: r.nama,
      isOrphan: false,
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

  allKompensasi.forEach(k => {
    const ks = ksMap.get(k.ks_id) ?? k.kerja_sama
    const resolved = resolveProgramKey(k, ks, rkapByKode, rkapRows)
    const a = ensure(resolved.key, {
      kode: resolved.kode,
      namaHint: resolved.namaHint,
      isOrphan: resolved.isOrphan,
    })
    // Jika resolve ke RKAP, pastikan tidak ter-flag orphan
    if (!resolved.isOrphan) a.isOrphan = false
    if (resolved.kode && !a.kode) a.kode = resolved.kode

    if (ks) {
      a.mitra.set(ks.id, `${ks.nama_mitra} (${statusLabelKS(ks.status)})`)
      if (ks.aset_id) a.asetIds.add(ks.aset_id)
      const aset = ks.aset as Aset | undefined
      if (aset?.id) a.asetIds.add(aset.id)
    }

    ;(k.pembayaran ?? []).forEach(p => {
      if (!inCashInWindow(p.tgl_bayar)) return
      a.cashIn += p.nominal_bayar || 0
    })

    if (!k.tgl_jatuh_tempo || !inPendapatanWindow(k.tgl_jatuh_tempo)) return

    const nominal = k.nominal ?? 0
    const tagihan = Math.max(0, (k.total_tagihan ?? 0) - (k.pengurang ?? 0))
    const dibayarAll = (k.pembayaran ?? []).reduce((s, p) => s + (p.nominal_bayar || 0), 0)

    a.pendapatan += nominal
    a.nTagihan += 1
    if (tagihan > 0 && dibayarAll >= tagihan) a.nLunas += 1
    else if (tagihan === 0 && dibayarAll > 0) a.nLunas += 1
  })

  // Merge sisa orphan ke baris RKAP yang namanya mirip (jika ada data yang sempat ter-key orphan)
  const rkapKeys = new Set(rkapRows.map(rkapRowKey))
  for (const [key, orphanAcc] of Array.from(acc.entries())) {
    if (!orphanAcc.isOrphan || rkapKeys.has(key)) continue
    const hit = rkapRows.find(r => programNamesMatch(r.nama, orphanAcc.namaHint))
    if (!hit) continue
    const targetKey = rkapRowKey(hit)
    const target = ensure(targetKey, {
      kode: hit.kode?.trim() || orphanAcc.kode,
      namaHint: hit.nama,
      isOrphan: false,
    })
    mergeAcc(target, orphanAcc)
    target.isOrphan = false
    if (orphanAcc.kode && !target.kode) target.kode = orphanAcc.kode
    acc.delete(key)
  }

  const asetByKode = new Map(daftarAset.filter(a => a.kode_aset).map(a => [a.kode_aset, a]))
  const asetById = new Map(daftarAset.map(a => [a.id, a]))

  // Lengkapi kode RKAP kosong dari aset yang namanya cocok
  rkapRows.forEach(r => {
    const key = rkapRowKey(r)
    const a = acc.get(key)
    if (!a) return
    if (!a.kode) {
      const matchAset = daftarAset.find(as => programNamesMatch(r.nama, as.nama_aset))
      if (matchAset?.kode_aset) a.kode = matchAset.kode_aset.trim()
    }
  })

  const ksByAsetKode = new Map<string, KerjaSama[]>()
  daftarKS.forEach(ks => {
    const kode = (ks.aset as Aset | undefined)?.kode_aset?.trim()
    if (!kode) return
    const list = ksByAsetKode.get(kode) ?? []
    list.push(ks)
    ksByAsetKode.set(kode, list)
  })

  // Juga index KS by fuzzy aset name for rkap without kode
  const ksByAsetName = daftarKS.map(ks => ({
    ks,
    nama: (ks.aset as Aset | undefined)?.nama_aset ?? '',
  }))

  const rows: ProgramLaporanRow[] = []
  const usedKeys = new Set<string>()

  rkapRows.forEach((r, idx) => {
    const key = rkapRowKey(r)
    usedKeys.add(key)
    const a = acc.get(key)
    const rkap = r.total ?? 0
    const pendapatan = a?.pendapatan ?? 0
    const cashIn = a?.cashIn ?? 0
    const capaianPct = rkap > 0 ? (cashIn / rkap) * 100 : null
    const displayKode = a?.kode || r.kode?.trim() || ''

    let prosesMitra = ''
    let monitoring = ''

    const mitraFromAcc = a ? Array.from(a.mitra.values()) : []
    let ksList = displayKode ? (ksByAsetKode.get(displayKode) ?? []) : []
    if (ksList.length === 0) {
      ksList = ksByAsetName
        .filter(x => x.nama && programNamesMatch(r.nama, x.nama))
        .map(x => x.ks)
    }

    if (mitraFromAcc.length > 0) {
      prosesMitra = `Eksisting: ${mitraFromAcc.join('; ')}`
    } else if (ksList.length > 0) {
      prosesMitra = `Eksisting: ${ksList.map(k => `${k.nama_mitra} (${statusLabelKS(k.status)})`).join('; ')}`
    } else {
      const aset = displayKode
        ? asetByKode.get(displayKode)
        : daftarAset.find(as => programNamesMatch(r.nama, as.nama_aset))
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
      kategori: inferKategori(displayKode, r.nama),
      programAset: r.nama,
      kode: displayKode,
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

  // Orphan sisa (benar-benar tidak ada di RKAP)
  const orphanEntries = Array.from(acc.entries()).filter(
    ([key, a]) => a.isOrphan && !usedKeys.has(key) && (a.pendapatan > 0 || a.cashIn > 0 || a.nTagihan > 0),
  )
  orphanEntries.sort((x, y) => x[1].namaHint.localeCompare(y[1].namaHint, 'id'))

  let orphanNo = rows.length + 1
  orphanEntries.forEach(([key, a]) => {
    // Safety: skip if still matches an RKAP name (should already be merged)
    if (rkapRows.some(r => programNamesMatch(r.nama, a.namaHint))) return

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
