/**
 * Agregasi data laporan format HO (Proker Optimalisasi Aset PTPN I).
 * Sheet: Cash In, Pendapatan, Piutang — per proker (ID Monika) + breakdown bulanan.
 *
 * Nilai internal: Rupiah penuh.
 * Excel HO memakai satuan Rp 000 (÷1000) di layer export.
 */
import type {
  Aset,
  CashIn,
  KerjaSama,
  Kompensasi,
  PBB,
  PengakuanPendapatan,
  PendapatanDiterimaDimuka,
} from '@/types'
import type { RKAPTargetRow } from '@/store/rkapStore'
import { BULAN_COLS } from '@/store/rkapStore'
import { resolveMonikaId, KATEGORI_BY_KODE } from '@/utils/laporanProgramUtils'

export const BULAN_LABELS_HO = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
] as const

export interface HOCashMonth {
  target: number
  /** Realisasi kompensasi = pokok (DPP / nominal), bukan total tagihan */
  kompensasi: number
  denda: number
  ppn: number
  pph: number
  pbb: number
  jaminan: number
  noDokSap: string
  totalDiluarJaminan: number
  pct: number | null
}

export interface HOPendapatanMonth {
  target: number
  pendapatan: number
  ppn: number
  pph: number
  pbb: number
  total: number
  noDokSap: string
  pct: number | null
}

export interface HOPiutangMonth {
  aging1_30: number
  aging31_60: number
  aging61_90: number
  aging91_180: number
  aging181_360: number
  aging361: number
  saldo: number
}

export interface HOMasterRow {
  no: number
  obyek: string
  kodeMonika: string
  noPks: string
  lokasi: string
  alamat: string
  skema: string
  mitra: string
  bidangUsaha: string
  statusAlasHak: string
  luasM2: number | null
  tglMulai: string | null
  tglBerakhir: string | null
  jangkaTahun: number | null
  totalKompensasiFix: number
  totalKompensasiVar: number
  /** RKAP tahunan (Eksisting) — target proker di RKAP */
  rkapEksisting: number
  rkapNew: number
  nonRkapEksisting: number
  nonRkapNew: number
  targetTahun: number
  rkapBulan: number[]
  cashByMonth: HOCashMonth[]
  pendapatanByMonth: HOPendapatanMonth[]
  piutangByMonth: HOPiutangMonth[]
  isOrphan: boolean
}

export interface HOSummary {
  targetCash: number
  realisasiCash: number
  targetPendapatan: number
  /**
   * Pendapatan (akrual) = DPP / nominal di periode.
   * Standar: STANDAR_AKUNTANSI.md
   */
  realisasiPendapatan: number
  /** Alias = realisasiPendapatan */
  pendapatanPokok: number
  pendapatanPpn: number
  pendapatanPph: number
  pendapatanPbb: number
  /**
   * Cash In = uang masuk (pembayaran) di periode.
   * Bukan DPP+pajak di kertas tagihan.
   */
  totalSdPajak: number
  /** Alias eksplisit Cash In (= totalSdPajak / realisasiCash) */
  cashIn: number
  saldoPiutang: number
  /** Breakdown aging piutang bulan terakhir di filter */
  piutang1_30: number
  piutang31_60: number
  piutang61_90: number
  piutang91_180: number
  piutang181_360: number
  piutang361: number
  nProker: number
  /** Σ target tahun / RKAP proker (bukan per bulan) */
  totalRkapTahun: number
  totalTargetTahun: number
}

function dateKey(s: string | null | undefined): string {
  return (s ?? '').slice(0, 10)
}

function parseYMD(s: string): { y: number; m: number; d: number } | null {
  const key = dateKey(s)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null
  const [y, m, d] = key.split('-').map(Number)
  return { y, m: m - 1, d }
}

function daysBetween(fromKey: string, toKey: string): number {
  const a = new Date(`${fromKey}T12:00:00`).getTime()
  const b = new Date(`${toKey}T12:00:00`).getTime()
  return Math.floor((b - a) / (1000 * 60 * 60 * 24))
}

function endOfMonthKey(tahun: number, monthIdx: number): string {
  const d = new Date(tahun, monthIdx + 1, 0)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${dd}`
}

function yearsBetween(start: string, end: string): number | null {
  const a = parseYMD(start)
  const b = parseYMD(end)
  if (!a || !b) return null
  const days = daysBetween(dateKey(start), dateKey(end))
  if (days < 0) return null
  return Math.round((days / 365.25) * 10) / 10
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

/** Lokasi (Unit/Kebun) — ambil potongan alamat paling relevan / fallback regional */
function inferLokasi(alamat: string | null | undefined, nama: string): string {
  const a = (alamat ?? '').trim()
  if (!a) {
    if (/makassar|boulevard|alauddin|pengayoman|slamet|masjid raya|bambapuang|kantor/i.test(nama)) {
      return 'Kantor Regional 8'
    }
    return ''
  }
  // Ambil segmen terakhir yang biasanya kota/kab
  const parts = a.split(',').map(s => s.trim()).filter(Boolean)
  if (parts.length >= 2) return parts[parts.length - 2] || parts[parts.length - 1]
  return parts[0] ?? a
}

function emptyCashMonth(target = 0): HOCashMonth {
  return {
    target,
    kompensasi: 0,
    denda: 0,
    ppn: 0,
    pph: 0,
    pbb: 0,
    jaminan: 0,
    noDokSap: '',
    totalDiluarJaminan: 0,
    pct: null,
  }
}

function emptyPendapatanMonth(target = 0): HOPendapatanMonth {
  return {
    target,
    pendapatan: 0,
    ppn: 0,
    pph: 0,
    pbb: 0,
    total: 0,
    noDokSap: '',
    pct: null,
  }
}

function emptyPiutangMonth(): HOPiutangMonth {
  return {
    aging1_30: 0,
    aging31_60: 0,
    aging61_90: 0,
    aging91_180: 0,
    aging181_360: 0,
    aging361: 0,
    saldo: 0,
  }
}

function finalizeCash(m: HOCashMonth): HOCashMonth {
  m.totalDiluarJaminan = m.kompensasi + m.denda + m.ppn + m.pph + m.pbb
  m.pct = m.target > 0 ? (m.totalDiluarJaminan / m.target) * 100 : null
  return m
}

function finalizePendapatan(m: HOPendapatanMonth): HOPendapatanMonth {
  m.total = m.pendapatan + m.ppn + m.pph + m.pbb
  m.pct = m.target > 0 ? (m.total / m.target) * 100 : null
  return m
}

function finalizePiutang(m: HOPiutangMonth): HOPiutangMonth {
  m.saldo =
    m.aging1_30 + m.aging31_60 + m.aging61_90 + m.aging91_180 + m.aging181_360 + m.aging361
  return m
}

function addAging(m: HOPiutangMonth, hariDariJT: number, sisa: number) {
  if (sisa <= 0) return
  // Belum JT: masuk bucket current (1-30) sebagai outstanding invoice — HO tetap catat saldo
  if (hariDariJT < 0) {
    m.aging1_30 += sisa
    return
  }
  if (hariDariJT <= 30) m.aging1_30 += sisa
  else if (hariDariJT <= 60) m.aging31_60 += sisa
  else if (hariDariJT <= 90) m.aging61_90 += sisa
  else if (hariDariJT <= 180) m.aging91_180 += sisa
  else if (hariDariJT <= 360) m.aging181_360 += sisa
  else m.aging361 += sisa
}

function pickActiveKS(list: KerjaSama[]): KerjaSama | undefined {
  if (!list.length) return undefined
  const rank = (s: string) => {
    if (s === 'aktif') return 0
    if (s === 'sp1' || s === 'sp2' || s === 'sp3') return 1
    if (s === 'selesai') return 2
    return 3
  }
  return [...list].sort((a, b) => rank(a.status) - rank(b.status))[0]
}

function pushDok(existing: string, next: string | null | undefined): string {
  const n = (next ?? '').trim()
  if (!n || n === '-') return existing
  if (!existing) return n
  if (existing.split('; ').includes(n)) return existing
  return `${existing}; ${n}`
}

/**
 * Alokasi pembayaran → kolom realisasi Cash In HO.
 *
 * - **Kompensasi = Pokok** = `nominal` (DPP)
 * - **PPN** = `nominal_ppn` (positif)
 * - **PPH** = **minus** (−`nominal_pph`) — potongan, mengurangi total cash in
 *
 * Proporsi: bayar / efektif_tagihan. Lunas penuh → Kompensasi = pokok utuh.
 * Total ≈ pokok + PPN + PPH(−) [= efektif saat bukti potong].
 */
function allocatePayment(k: Kompensasi, bayar: number): { pokok: number; ppn: number; pph: number } {
  if (bayar <= 0) return { pokok: 0, ppn: 0, pph: 0 }

  const pokokBase = Math.max(0, k.nominal ?? 0)
  const ppnBase = Math.max(0, k.nominal_ppn ?? 0)
  const pphBase = Math.max(0, k.nominal_pph ?? 0)
  const pengurang = Math.max(0, k.pengurang ?? 0)
  const efektif = Math.max(0, (k.total_tagihan ?? 0) - pengurang)

  if (efektif <= 0 || pokokBase <= 0) {
    return { pokok: bayar, ppn: 0, pph: 0 }
  }

  const ratio = Math.min(1, bayar / efektif)
  const pokok = pokokBase * ratio
  const ppn = ppnBase * ratio
  // PPH selalu dicatat negatif (mengurangi total)
  const pph = pphBase > 0 ? -pphBase * ratio : 0
  const over = bayar > efektif ? bayar - efektif : 0

  return { pokok: pokok + over, ppn, pph }
}

/** Resolusi ID Monika lebih longgar: rkap_kode → aset KS → aset_id lookup */
function resolveMonikaIdHO(
  k: Kompensasi,
  ks: KerjaSama | undefined,
  asetById: Map<string, Aset>,
): string | null {
  const direct = resolveMonikaId(k, ks)
  if (direct) return direct
  if (ks?.aset_id) {
    const kode = asetById.get(ks.aset_id)?.kode_aset?.trim()
    if (kode) return kode
  }
  const fromJoin = (ks?.aset as Aset | undefined)?.kode_aset?.trim()
  return fromJoin || null
}

export function buildLaporanHO(opts: {
  tahun: number
  rkapRows: RKAPTargetRow[]
  daftarAset: Aset[]
  daftarKS: KerjaSama[]
  allKompensasi: Kompensasi[]
  allCashIn?: CashIn[]
  allPBB?: PBB[]
  daftarPDDM?: PendapatanDiterimaDimuka[]
  allPengakuan?: PengakuanPendapatan[]
  /** Bulan 0–11 yang dihitung (default 12 bulan) */
  months?: number[]
}): HOMasterRow[] {
  const {
    tahun,
    rkapRows,
    daftarAset,
    daftarKS,
    allKompensasi,
    allCashIn = [],
    allPBB = [],
    daftarPDDM = [],
    allPengakuan = [],
  } = opts
  const months = opts.months?.length ? [...opts.months].sort((a, b) => a - b) : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
  const monthSet = new Set(months)

  const asetByKode = new Map(
    daftarAset.filter(a => a.kode_aset?.trim()).map(a => [a.kode_aset.trim(), a]),
  )
  const asetById = new Map(daftarAset.map(a => [a.id, a]))
  const ksMap = new Map(daftarKS.map(k => [k.id, k]))

  // KS dikelompokkan by monika
  const ksByMonika = new Map<string, KerjaSama[]>()
  daftarKS.forEach(ks => {
    const kode = (ks.aset as Aset | undefined)?.kode_aset?.trim()
      || (ks.aset_id ? asetById.get(ks.aset_id)?.kode_aset?.trim() : '')
      || ''
    if (!kode) return
    const list = ksByMonika.get(kode) ?? []
    list.push(ks)
    ksByMonika.set(kode, list)
  })

  // RKAP by monika
  const rkapByMonika = new Map<string, RKAPTargetRow>()
  rkapRows.forEach(r => {
    const kode = r.kode?.trim()
    if (!kode) return
    const prev = rkapByMonika.get(kode)
    if (!prev) {
      rkapByMonika.set(kode, { ...r })
    } else {
      const merged = { ...prev, total: (prev.total ?? 0) + (r.total ?? 0) }
      BULAN_COLS.forEach(col => {
        merged[col] = (prev[col] ?? 0) + (r[col] ?? 0)
      })
      rkapByMonika.set(kode, merged)
    }
  })

  type Acc = {
    cash: HOCashMonth[]
    pendapatan: HOPendapatanMonth[]
    piutang: HOPiutangMonth[]
    totalKompensasiFix: number
    namaHint: string
  }

  const acc = new Map<string, Acc>()

  const ensure = (kode: string, namaHint: string): Acc => {
    let a = acc.get(kode)
    if (!a) {
      const rkap = rkapByMonika.get(kode)
      const rkapBulan = BULAN_COLS.map(c => rkap?.[c] ?? 0)
      a = {
        cash: Array.from({ length: 12 }, (_, i) => emptyCashMonth(rkapBulan[i] ?? 0)),
        pendapatan: Array.from({ length: 12 }, (_, i) => emptyPendapatanMonth(rkapBulan[i] ?? 0)),
        piutang: Array.from({ length: 12 }, () => emptyPiutangMonth()),
        totalKompensasiFix: 0,
        namaHint,
      }
      acc.set(kode, a)
    } else if (namaHint && a.namaHint === kode) {
      a.namaHint = namaHint
    }
    return a
  }

  // Seed dari RKAP
  rkapByMonika.forEach((r, kode) => {
    const aset = asetByKode.get(kode)
    ensure(kode, r.nama || aset?.nama_aset || kode)
  })

  // ── Cash In dari pembayaran (by tgl_bayar) — Kompensasi=Pokok, PPH minus ─
  allKompensasi.forEach(k => {
    const ks = ksMap.get(k.ks_id) ?? k.kerja_sama
    const monikaId = resolveMonikaIdHO(k, ks, asetById)
    if (!monikaId) return

    const aset = asetByKode.get(monikaId)
    const rkap = rkapByMonika.get(monikaId)
    const a = ensure(monikaId, rkap?.nama || aset?.nama_aset || monikaId)

    // Total Kompensasi Fix (HO) = akumulasi pokok
    a.totalKompensasiFix += Math.max(0, k.nominal ?? 0)

    ;(k.pembayaran ?? []).forEach(p => {
      const parsed = parseYMD(p.tgl_bayar)
      if (!parsed || parsed.y !== tahun) return
      if (!monthSet.has(parsed.m)) return
      const bayar = p.nominal_bayar || 0
      if (bayar <= 0) return
      const { pokok, ppn, pph } = allocatePayment(k, bayar)
      const m = a.cash[parsed.m]
      m.kompensasi += pokok
      m.ppn += ppn
      m.pph += pph // sudah negatif
      // No Dok SAP = No Billing saja; kosong jika belum ada
      m.noDokSap = pushDok(m.noDokSap, k.no_billing_sap)
    })
  })

  // ── Denda & cash_in lain ────────────────────────────────────────────────
  allCashIn.forEach(ci => {
    const parsed = parseYMD(ci.tgl_terima)
    if (!parsed || parsed.y !== tahun) return
    if (!monthSet.has(parsed.m)) return

    const ks = ksMap.get(ci.ks_id) ?? ci.kerja_sama
    let monikaId = ci.rkap_kode?.trim() || null
    if (!monikaId && ci.kompensasi_id) {
      const k = allKompensasi.find(x => x.id === ci.kompensasi_id)
      if (k) monikaId = resolveMonikaIdHO(k, ksMap.get(k.ks_id) ?? k.kerja_sama, asetById)
    }
    if (!monikaId && ks) {
      monikaId = (ks.aset as Aset | undefined)?.kode_aset?.trim()
        || (ks.aset_id ? asetById.get(ks.aset_id)?.kode_aset?.trim() : null)
        || null
    }
    if (!monikaId) return

    const a = ensure(monikaId, rkapByMonika.get(monikaId)?.nama || monikaId)
    const m = a.cash[parsed.m]
    if (ci.jenis === 'denda') {
      m.denda += ci.nominal || 0
    } else {
      m.kompensasi += ci.nominal || 0
    }
  })

  // ── PBB (cash in) ───────────────────────────────────────────────────────
  allPBB.forEach(pbb => {
    const dibayar = Math.max(0, pbb.jumlah_pbb_dibayar ?? 0)
    const nilai = Math.max(0, pbb.nilai_pbb ?? 0)
    const status = (pbb.status_bayar ?? '').toLowerCase()
    const isPaid = dibayar > 0 || status === 'lunas' || status === 'sebagian'
    if (!isPaid && dibayar <= 0) return

    const tgl = pbb.tgl_bayar_pbb || pbb.tgl_jatuh_tempo
    const parsed = parseYMD(tgl ?? '')
    let monthIdx = parsed && parsed.y === tahun ? parsed.m : -1
    if (monthIdx < 0 && pbb.tahun === tahun && pbb.tgl_jatuh_tempo) {
      const jt = parseYMD(pbb.tgl_jatuh_tempo)
      if (jt && jt.y === tahun) monthIdx = jt.m
    }
    if (monthIdx < 0 || !monthSet.has(monthIdx)) return

    let monikaId = pbb.rkap_kode?.trim() || ''
    if (!monikaId && pbb.aset_id) monikaId = asetById.get(pbb.aset_id)?.kode_aset?.trim() || ''
    if (!monikaId && pbb.aset?.kode_aset) monikaId = pbb.aset.kode_aset.trim()
    if (!monikaId && pbb.aset_id) {
      const ksHit = daftarKS.find(k => k.aset_id === pbb.aset_id)
      monikaId = (ksHit?.aset as Aset | undefined)?.kode_aset?.trim()
        || (ksHit?.aset_id ? asetById.get(ksHit.aset_id)?.kode_aset?.trim() : '')
        || ''
    }
    if (!monikaId) return

    let nominalPbb = dibayar
    if (nominalPbb <= 0 && (status === 'lunas' || status === 'sebagian')) nominalPbb = nilai
    if (nominalPbb <= 0) return

    const a = ensure(monikaId, rkapByMonika.get(monikaId)?.nama || monikaId)
    a.cash[monthIdx].pbb += nominalPbb
    // PBB di sheet Pendapatan hanya jika masuk realisasi pendapatan (HO: kolom PBB)
    a.pendapatan[monthIdx].pbb += nominalPbb
  })

  // ── Pendapatan: primari dari tagihan JT (pokok), selaras Laporan Pendapatan ─
  // Akrual PSAK 73 dipakai jika ada pengakuan diakui di bulan yang sama (override per invoice match).
  const akrualByMonikaMonth = new Map<string, number>() // key monika|m → sum akrual
  const pddmById = new Map(daftarPDDM.map(p => [p.id, p]))

  allPengakuan
    .filter(pp => pp.status === 'diakui')
    .forEach(pp => {
      const parsed = parseYMD(pp.tgl_awal)
      if (!parsed || parsed.y !== tahun) return
      if (!monthSet.has(parsed.m)) return
      const pddm = pddmById.get(pp.pddm_id)
      if (!pddm?.ks_id) return
      const ks = ksMap.get(pddm.ks_id)
      const komp = allKompensasi.find(
        k => k.ks_id === pddm.ks_id && dateKey(k.tgl_jatuh_tempo) === dateKey(pp.tgl_awal),
      )
      const monikaId = komp
        ? resolveMonikaIdHO(komp, ksMap.get(komp.ks_id) ?? komp.kerja_sama, asetById)
        : (ks?.aset as Aset | undefined)?.kode_aset?.trim()
          || (ks?.aset_id ? asetById.get(ks.aset_id)?.kode_aset?.trim() : null)
          || null
      if (!monikaId) return
      const key = `${monikaId}|${parsed.m}`
      akrualByMonikaMonth.set(key, (akrualByMonikaMonth.get(key) ?? 0) + (pp.nominal || 0))
    })

  // Tagihan by JT → pendapatan pokok + PPN + PPH(−)
  // Jika bulan monika punya akrual, gunakan akrual sebagai pokok (bukan double-count invoice)
  const invoicePokokByMonikaMonth = new Map<string, number>()
  allKompensasi.forEach(k => {
    const parsed = parseYMD(k.tgl_jatuh_tempo)
    if (!parsed || parsed.y !== tahun) return
    if (!monthSet.has(parsed.m)) return
    const ks = ksMap.get(k.ks_id) ?? k.kerja_sama
    const monikaId = resolveMonikaIdHO(k, ks, asetById)
    if (!monikaId) return

    const a = ensure(monikaId, rkapByMonika.get(monikaId)?.nama || monikaId)
    const m = a.pendapatan[parsed.m]
    const key = `${monikaId}|${parsed.m}`
    const pokok = Math.max(0, k.nominal ?? 0)
    const ppn = Math.max(0, k.nominal_ppn ?? 0)
    const pphAbs = Math.max(0, k.nominal_pph ?? 0)

    invoicePokokByMonikaMonth.set(key, (invoicePokokByMonikaMonth.get(key) ?? 0) + pokok)
    m.ppn += ppn
    m.pph += pphAbs > 0 ? -pphAbs : 0 // PPH minus
    // No Dok SAP = No Billing saja; kosong jika belum ada
    m.noDokSap = pushDok(m.noDokSap, k.no_billing_sap)
  })

  // Set pokok pendapatan: prefer akrual jika ada, else sum invoice
  invoicePokokByMonikaMonth.forEach((invoicePokok, key) => {
    const [monikaId, mStr] = key.split('|')
    const monthIdx = Number(mStr)
    const a = acc.get(monikaId)
    if (!a) return
    const akrual = akrualByMonikaMonth.get(key) ?? 0
    a.pendapatan[monthIdx].pendapatan = akrual > 0 ? akrual : invoicePokok
  })

  // Monika yang hanya punya akrual tanpa tagihan JT di bulan itu
  akrualByMonikaMonth.forEach((akrual, key) => {
    if (invoicePokokByMonikaMonth.has(key)) return
    const [monikaId, mStr] = key.split('|')
    const monthIdx = Number(mStr)
    const a = ensure(monikaId, rkapByMonika.get(monikaId)?.nama || monikaId)
    a.pendapatan[monthIdx].pendapatan += akrual
  })

  // ── Piutang aging snapshot per akhir bulan ──────────────────────────────
  months.forEach(monthIdx => {
    const asOf = endOfMonthKey(tahun, monthIdx)
    allKompensasi.forEach(k => {
      const jt = dateKey(k.tgl_jatuh_tempo)
      if (!jt) return
      // Hanya tagihan yang sudah ada s.d. asOf
      if (jt > asOf) return

      const ks = ksMap.get(k.ks_id) ?? k.kerja_sama
      const monikaId = resolveMonikaIdHO(k, ks, asetById)
      if (!monikaId) return

      const efektif = Math.max(0, (k.total_tagihan ?? 0) - (k.pengurang ?? 0))
      const dibayar = (k.pembayaran ?? [])
        .filter(p => dateKey(p.tgl_bayar) && dateKey(p.tgl_bayar) <= asOf)
        .reduce((s, p) => s + (p.nominal_bayar || 0), 0)
      const sisa = Math.max(0, efektif - dibayar)
      if (sisa <= 0.5) return

      const hasInv = Boolean(
        (k.invoice_tgl && String(k.invoice_tgl).trim())
        || (k.no_invoice && String(k.no_invoice).trim())
        || (k.no_invoice_sap && String(k.no_invoice_sap).trim()),
      )
      const hariDariJT = daysBetween(jt, asOf)
      if (!hasInv && hariDariJT < 0) return

      const a = ensure(monikaId, rkapByMonika.get(monikaId)?.nama || monikaId)
      addAging(a.piutang[monthIdx], hariDariJT, sisa)
    })
  })

  // ── Susun baris master ──────────────────────────────────────────────────
  const kodeOrder: string[] = []
  const seen = new Set<string>()
  Array.from(rkapByMonika.entries())
    .sort((a, b) => (a[1].no ?? 0) - (b[1].no ?? 0))
    .forEach(([kode]) => {
      kodeOrder.push(kode)
      seen.add(kode)
    })
  // Orphan monika yang punya realisasi tapi tidak di RKAP
  Array.from(acc.keys())
    .filter(k => !seen.has(k))
    .sort((a, b) => a.localeCompare(b))
    .forEach(k => kodeOrder.push(k))

  const rows: HOMasterRow[] = kodeOrder.map((kode, idx) => {
    const a = acc.get(kode) ?? ensure(kode, kode)
    const rkap = rkapByMonika.get(kode)
    const aset = asetByKode.get(kode)
    const ksList = ksByMonika.get(kode) ?? []
    const ks = pickActiveKS(ksList)

    const rkapBulan = BULAN_COLS.map(c => rkap?.[c] ?? 0)
    const rkapTotal = rkap?.total ?? rkapBulan.reduce((s, v) => s + v, 0)
    const isOrphan = !rkap

    // Non-RKAP: orphan dengan realisasi — taruh di nonRkapEksisting
    const rkapEksisting = isOrphan ? 0 : rkapTotal
    const nonRkapEksisting = isOrphan ? a.totalKompensasiFix : 0

    const obyek = rkap?.nama || aset?.nama_aset || a.namaHint || kode
    const alamat = aset?.alamat ?? ''
    const luas =
      ks?.kerja_sama_aset?.reduce((s, x) => s + (x.luas_tanah_ks || 0) + (x.luas_bangunan_ks || 0), 0)
      || (aset?.luas_tanah_m2 ?? 0) + (aset?.luas_bangunan_m2 ?? 0)
      || null

    const tglMulai = ks?.tgl_mulai ?? null
    const tglBerakhir = ks?.tgl_selesai ?? null

    const cashByMonth = a.cash.map((m, i) => {
      m.target = rkapBulan[i] ?? 0
      return finalizeCash({ ...m })
    })
    const pendapatanByMonth = a.pendapatan.map((m, i) => {
      m.target = rkapBulan[i] ?? 0
      return finalizePendapatan({ ...m })
    })
    const piutangByMonth = a.piutang.map(m => finalizePiutang({ ...m }))

    return {
      no: idx + 1,
      obyek,
      kodeMonika: kode,
      noPks: ks?.no_perjanjian ?? '',
      lokasi: inferLokasi(alamat, obyek),
      alamat,
      skema: '', // skema KS belum di master KS; bisa diisi manual di Excel
      mitra: ks?.nama_mitra ?? (ksList.map(x => x.nama_mitra).join(', ') || ''),
      bidangUsaha: inferKategori(kode, obyek),
      statusAlasHak: aset?.sertifikat ?? '',
      luasM2: luas && luas > 0 ? luas : null,
      tglMulai,
      tglBerakhir,
      jangkaTahun: tglMulai && tglBerakhir ? yearsBetween(tglMulai, tglBerakhir) : null,
      totalKompensasiFix: a.totalKompensasiFix || rkapTotal,
      totalKompensasiVar: 0,
      rkapEksisting,
      rkapNew: 0,
      nonRkapEksisting,
      nonRkapNew: 0,
      targetTahun: rkapEksisting + nonRkapEksisting,
      rkapBulan,
      cashByMonth,
      pendapatanByMonth,
      piutangByMonth,
      isOrphan,
    }
  })

  return rows
}

export function summarizeHO(rows: HOMasterRow[], months: number[]): HOSummary {
  let targetCash = 0
  let realisasiCash = 0
  let targetPendapatan = 0
  let pendapatanPokok = 0
  let pendapatanPpn = 0
  let pendapatanPph = 0
  let pendapatanPbb = 0
  let saldoPiutang = 0
  let piutang1_30 = 0
  let piutang31_60 = 0
  let piutang61_90 = 0
  let piutang91_180 = 0
  let piutang181_360 = 0
  let piutang361 = 0
  let totalRkapTahun = 0
  let totalTargetTahun = 0

  const lastM = months.length ? months[months.length - 1] : 11

  rows.forEach(r => {
    totalRkapTahun += r.rkapEksisting ?? 0
    totalTargetTahun += r.targetTahun ?? 0
    months.forEach(m => {
      targetCash += r.cashByMonth[m]?.target ?? 0
      // Cash In = uang masuk (alokasi pembayaran)
      realisasiCash += r.cashByMonth[m]?.totalDiluarJaminan ?? 0
      const p = r.pendapatanByMonth[m]
      targetPendapatan += p?.target ?? 0
      // Pendapatan = akrual / DPP
      pendapatanPokok += p?.pendapatan ?? 0
      pendapatanPpn += p?.ppn ?? 0
      pendapatanPph += p?.pph ?? 0
      pendapatanPbb += p?.pbb ?? 0
    })
    const pi = r.piutangByMonth[lastM]
    saldoPiutang += pi?.saldo ?? 0
    piutang1_30 += pi?.aging1_30 ?? 0
    piutang31_60 += pi?.aging31_60 ?? 0
    piutang61_90 += pi?.aging61_90 ?? 0
    piutang91_180 += pi?.aging91_180 ?? 0
    piutang181_360 += pi?.aging181_360 ?? 0
    piutang361 += pi?.aging361 ?? 0
  })

  return {
    targetCash,
    realisasiCash,
    targetPendapatan,
    realisasiPendapatan: pendapatanPokok,
    pendapatanPokok,
    pendapatanPpn,
    pendapatanPph,
    pendapatanPbb,
    totalSdPajak: realisasiCash,
    cashIn: realisasiCash,
    saldoPiutang,
    piutang1_30,
    piutang31_60,
    piutang61_90,
    piutang91_180,
    piutang181_360,
    piutang361,
    nProker: rows.length,
    totalRkapTahun,
    totalTargetTahun,
  }
}

/**
 * Konversi Rupiah penuh → satuan HO **Rp 000** (÷ 1.000).
 * Pertahankan tanda (PPH minus).
 * Contoh: 7_500_000 → 7_500
 */
export function toRp000(value: number): number {
  if (value == null || Number.isNaN(value) || value === 0) return 0
  return Math.round(value / 1000)
}

/** Bulan 0..end inclusive → array [0,1,...,end] */
export function monthsThrough(endMonth: number): number[] {
  const end = Math.max(0, Math.min(11, endMonth))
  return Array.from({ length: end + 1 }, (_, i) => i)
}

/** Agregasi pendapatan (akrual) beberapa bulan */
export function sumPendapatanMonths(r: HOMasterRow, months: number[]): HOPendapatanMonth {
  const out: HOPendapatanMonth = {
    target: 0,
    pendapatan: 0,
    ppn: 0,
    pph: 0,
    pbb: 0,
    total: 0,
    noDokSap: '',
    pct: null,
  }
  const doks = new Set<string>()
  months.forEach(m => {
    const p = r.pendapatanByMonth[m]
    if (!p) return
    out.target += p.target
    out.pendapatan += p.pendapatan
    out.ppn += p.ppn
    out.pph += p.pph
    out.pbb += p.pbb
    out.total += p.total
    if (p.noDokSap) {
      p.noDokSap.split('; ').forEach(d => { if (d.trim()) doks.add(d.trim()) })
    }
  })
  out.noDokSap = Array.from(doks).join('; ')
  // % capaian = pendapatan (akrual) vs target
  out.pct = out.target > 0 ? (out.pendapatan / out.target) * 100 : null
  return out
}

/** Cash In (uang masuk) beberapa bulan — dari cashByMonth */
export function sumCashInMonths(r: HOMasterRow, months: number[]): number {
  let s = 0
  months.forEach(m => {
    s += r.cashByMonth[m]?.totalDiluarJaminan ?? 0
  })
  return s
}

/** Piutang s.d. bulan = snapshot akhir bulan terakhir (bukan jumlah aging) */
export function piutangAsOf(r: HOMasterRow, endMonth: number): HOPiutangMonth {
  return r.piutangByMonth[endMonth] ?? {
    aging1_30: 0,
    aging31_60: 0,
    aging61_90: 0,
    aging91_180: 0,
    aging181_360: 0,
    aging361: 0,
    saldo: 0,
  }
}

/** Bulan terakhir (0–11) yang punya realisasi cash/pendapatan */
export function findLatestActiveMonth(rows: HOMasterRow[]): number {
  for (let m = 11; m >= 0; m--) {
    const has = rows.some(r =>
      Math.abs(r.cashByMonth[m]?.totalDiluarJaminan ?? 0) > 0.5
      || Math.abs(r.pendapatanByMonth[m]?.pendapatan ?? 0) > 0.5
      || Math.abs(r.cashByMonth[m]?.kompensasi ?? 0) > 0.5,
    )
    if (has) return m
  }
  return new Date().getMonth()
}
