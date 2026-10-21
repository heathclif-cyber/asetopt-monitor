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
  'R800032-0027': 'Properti',
  'R800005-0006': 'Properti',
  'R800007-0008': 'Peternakan',
  'R800026-0014': 'Properti',
  'R800041-0035': 'Properti',
  // Kanonik KS Meilani / Sekper (ex R800004-0005 Gedung Timur di seed lama)
  'R800042-0036': 'Properti',
}

export interface ProgramLaporanRow {
  no: number
  key: string
  kategori: string
  programAset: string
  /** ID Monika (wajib) */
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
  /** true = realisasi punya ID Monika tapi belum ada di master RKAP tahun ini */
  isOrphan: boolean
  /** true = baris RKAP tanpa ID Monika (invalid, perlu diperbaiki) */
  missingMonikaId?: boolean
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
 * Resolusi proker by **ID Monika (kode)** — SSOT untuk HO / RKAP / laporan.
 *
 * Urutan:
 * 1. `kompensasi.rkap_kode` (kode monika di tagihan) — **utama**
 * 2. `aset.kode_aset` dari KS (fallback jika rkap_kode kosong)
 *
 * Jika monika pindah/berubah (ex Mini Soccer vs Cafe), **perbaiki rkap_kode
 * di tagihan** agar mengarah ke kode yang benar — jangan tebak dari mitra/aset.
 */
export function resolveMonikaId(
  k: Kompensasi,
  ks: KerjaSama | undefined,
): string | null {
  const rkapKode = k.rkap_kode?.trim() || ''
  if (rkapKode) return rkapKode
  const asetKode = (ks?.aset as Aset | undefined)?.kode_aset?.trim() || ''
  if (asetKode) return asetKode
  return null
}

export function summarizeProgramRows(rows: ProgramLaporanRow[]) {
  // Exclude invalid rows from totals
  const valid = rows.filter(r => !r.missingMonikaId)
  const rkap = valid.reduce((s, r) => s + r.rkap, 0)
  const pendapatan = valid.reduce((s, r) => s + r.pendapatan, 0)
  const cashIn = valid.reduce((s, r) => s + r.cashIn, 0)
  return {
    rkap,
    pendapatan,
    cashIn,
    capaianPct: rkap > 0 ? (cashIn / rkap) * 100 : null,
  }
}

/**
 * Per Proker dari baris Detail yang sudah difilter sama
 * (tahun, bulan, basis JT/diterima) → total Pendapatan & Cash In selaras Detail.
 *
 * Hanya baris dengan monikaId; tanpa Monika tidak masuk (sama aturan lama).
 */
export function buildProgramLaporanRowsFromDetail(opts: {
  detailRows: Array<{
    monikaId: string | null
    namaMitra: string
    namaAset: string
    pendapatan: number
    cashIn: number
    totalTagihan: number
    sisa: number
    status: string
  }>
  rkapRows: RKAPTargetRow[]
  daftarAset: Aset[]
  daftarKS: KerjaSama[]
}): ProgramLaporanRow[] {
  const { detailRows, rkapRows, daftarAset, daftarKS } = opts

  const asetByKode = new Map(
    daftarAset.filter(a => a.kode_aset?.trim()).map(a => [a.kode_aset.trim(), a]),
  )
  const rkapByMonika = new Map<string, RKAPTargetRow>()
  const rkapInvalidNoKode: RKAPTargetRow[] = []
  rkapRows.forEach(r => {
    const kode = r.kode?.trim()
    if (!kode) {
      rkapInvalidNoKode.push(r)
      return
    }
    const prev = rkapByMonika.get(kode)
    if (!prev) rkapByMonika.set(kode, r)
    else {
      rkapByMonika.set(kode, {
        ...prev,
        total: (prev.total ?? 0) + (r.total ?? 0),
        no: Math.min(prev.no, r.no),
        nama: prev.nama || r.nama,
      })
    }
  })

  type Acc = {
    pendapatan: number
    cashIn: number
    tagihan: number
    nTagihan: number
    nLunas: number
    mitra: Map<string, string>
    namaHint: string
  }
  const acc = new Map<string, Acc>()
  const ensure = (kode: string, namaHint: string) => {
    let a = acc.get(kode)
    if (!a) {
      a = {
        pendapatan: 0,
        cashIn: 0,
        tagihan: 0,
        nTagihan: 0,
        nLunas: 0,
        mitra: new Map(),
        namaHint,
      }
      acc.set(kode, a)
    }
    return a
  }

  rkapByMonika.forEach((r, kode) => {
    const aset = asetByKode.get(kode)
    ensure(kode, r.nama || aset?.nama_aset || kode)
  })

  detailRows.forEach(row => {
    const kode = row.monikaId?.trim()
    if (!kode) return
    const rkap = rkapByMonika.get(kode)
    const aset = asetByKode.get(kode)
    const a = ensure(kode, rkap?.nama || aset?.nama_aset || row.namaAset || kode)
    a.pendapatan += row.pendapatan
    a.cashIn += row.cashIn
    a.tagihan += row.totalTagihan
    a.nTagihan += 1
    if (row.sisa <= 0.5 && row.totalTagihan > 0) a.nLunas += 1
    if (row.namaMitra && row.namaMitra !== '-') {
      a.mitra.set(row.namaMitra, row.namaMitra)
    }
  })

  const ksByMonika = new Map<string, KerjaSama[]>()
  daftarKS.forEach(ks => {
    const kode = (ks.aset as Aset | undefined)?.kode_aset?.trim()
    if (!kode) return
    const list = ksByMonika.get(kode) ?? []
    list.push(ks)
    ksByMonika.set(kode, list)
  })

  const rows: ProgramLaporanRow[] = []
  const used = new Set<string>()
  const rkapList = Array.from(rkapByMonika.entries()).sort(
    (a, b) => (a[1].no ?? 0) - (b[1].no ?? 0),
  )

  rkapList.forEach(([kode, r], idx) => {
    used.add(kode)
    const a = acc.get(kode)
    const aset = asetByKode.get(kode)
    const rkap = r.total ?? 0
    const pendapatan = a?.pendapatan ?? 0
    const cashIn = a?.cashIn ?? 0
    const capaianPct = rkap > 0 ? (cashIn / rkap) * 100 : null
    const mitraFromAcc = a ? Array.from(a.mitra.values()) : []
    const ksList = ksByMonika.get(kode) ?? []

    let prosesMitra = ''
    let monitoring = ''
    if (mitraFromAcc.length > 0) {
      prosesMitra = `Eksisting: ${mitraFromAcc.join('; ')}`
    } else if (ksList.length > 0) {
      prosesMitra = `Eksisting: ${ksList.map(k => `${k.nama_mitra} (${statusLabelKS(k.status)})`).join('; ')}`
    } else {
      prosesMitra = statusLabelAset(aset?.status)
    }

    if (a && a.nTagihan > 0) {
      if (a.nLunas === a.nTagihan && cashIn > 0) {
        monitoring = `Pembayaran lancar (${a.nLunas}/${a.nTagihan} tagihan lunas)`
      } else if (cashIn > 0) {
        monitoring = `Sebagian tertagih — ${a.nLunas}/${a.nTagihan} lunas`
      } else {
        monitoring = `Belum ada pembayaran · ${a.nTagihan} tagihan di filter`
      }
    } else if (ksList.length > 0) {
      monitoring = 'Ada kerja sama; belum ada tagihan di filter ini'
    } else {
      monitoring = '-'
    }

    rows.push({
      no: r.no || idx + 1,
      key: kode,
      kategori: inferKategori(kode, r.nama || aset?.nama_aset || ''),
      programAset: r.nama || aset?.nama_aset || kode,
      kode,
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

  const orphanMonika = Array.from(acc.entries())
    .filter(([kode, a]) => !used.has(kode) && (a.pendapatan > 0 || a.cashIn > 0 || a.nTagihan > 0))
    .sort((x, y) => x[0].localeCompare(y[0]))

  let orphanNo = rows.length + 1
  orphanMonika.forEach(([kode, a]) => {
    const aset = asetByKode.get(kode)
    const mitraFromAcc = Array.from(a.mitra.values())
    let monitoring = '-'
    if (a.nTagihan > 0) {
      if (a.nLunas === a.nTagihan && a.cashIn > 0) monitoring = `Pembayaran lancar (${a.nLunas}/${a.nTagihan} lunas)`
      else if (a.cashIn > 0) monitoring = `Sebagian tertagih — ${a.nLunas}/${a.nTagihan} lunas`
      else monitoring = `Belum ada pembayaran · ${a.nTagihan} tagihan`
    }
    rows.push({
      no: orphanNo++,
      key: kode,
      kategori: inferKategori(kode, a.namaHint),
      programAset: a.namaHint || aset?.nama_aset || kode,
      kode,
      rkap: 0,
      pendapatan: a.pendapatan,
      cashIn: a.cashIn,
      capaianPct: null,
      prosesMitra: mitraFromAcc.length
        ? `Eksisting: ${mitraFromAcc.join('; ')}`
        : statusLabelAset(aset?.status),
      monitoring,
      mitraList: mitraFromAcc,
      nTagihan: a.nTagihan,
      nLunas: a.nLunas,
      isOrphan: true,
    })
  })

  rkapInvalidNoKode.forEach((r, i) => {
    rows.push({
      no: r.no || 9000 + i,
      key: `invalid-no-monika:${r.id || r.no}`,
      kategori: inferKategori('', r.nama),
      programAset: r.nama,
      kode: '',
      rkap: r.total ?? 0,
      pendapatan: 0,
      cashIn: 0,
      capaianPct: null,
      prosesMitra: '⚠ Belum ada ID Monika',
      monitoring: 'Perbaiki di RKAP Monitor: isi ID Monika dari master aset',
      mitraList: [],
      nTagihan: 0,
      nLunas: 0,
      isOrphan: false,
      missingMonikaId: true,
    })
  })

  return rows
}
