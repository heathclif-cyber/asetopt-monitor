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
  realisasiPendapatan: number
  saldoPiutang: number
  nProker: number
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
 * Alokasi pembayaran ke komponen HO (Kompensasi/DPP, PPN, PPH) proporsional ke tagihan.
 */
function allocatePayment(k: Kompensasi, bayar: number): { dpp: number; ppn: number; pph: number } {
  const efektif = Math.max(0, (k.total_tagihan ?? 0) - (k.pengurang ?? 0))
  if (efektif <= 0 || bayar <= 0) {
    return { dpp: bayar, ppn: 0, pph: 0 }
  }
  const dppBase = Math.max(0, k.nominal ?? 0)
  const ppnBase = Math.max(0, k.nominal_ppn ?? 0)
  const pphBase = Math.max(0, k.nominal_pph ?? 0)
  const parts = dppBase + ppnBase + pphBase
  if (parts <= 0) return { dpp: bayar, ppn: 0, pph: 0 }
  const ratio = bayar / efektif
  // Skala ke proporsi komponen di tagihan, lalu normalisasi agar jumlah ≈ bayar
  let dpp = dppBase * ratio
  let ppn = ppnBase * ratio
  let pph = pphBase * ratio
  const sum = dpp + ppn + pph
  if (sum > 0 && Math.abs(sum - bayar) > 1) {
    const scale = bayar / sum
    dpp *= scale
    ppn *= scale
    pph *= scale
  }
  return { dpp, ppn, pph }
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

  // ── Cash In dari pembayaran kompensasi (by tgl_bayar) ──────────────────
  allKompensasi.forEach(k => {
    const ks = ksMap.get(k.ks_id) ?? k.kerja_sama
    const monikaId = resolveMonikaId(k, ks)
    if (!monikaId) return

    const aset = asetByKode.get(monikaId)
    const rkap = rkapByMonika.get(monikaId)
    const a = ensure(monikaId, rkap?.nama || aset?.nama_aset || monikaId)

    const efektif = Math.max(0, (k.total_tagihan ?? 0) - (k.pengurang ?? 0))
    a.totalKompensasiFix += efektif

    ;(k.pembayaran ?? []).forEach(p => {
      const parsed = parseYMD(p.tgl_bayar)
      if (!parsed || parsed.y !== tahun) return
      if (!monthSet.has(parsed.m)) return
      const bayar = p.nominal_bayar || 0
      if (bayar <= 0) return
      const { dpp, ppn, pph } = allocatePayment(k, bayar)
      const m = a.cash[parsed.m]
      m.kompensasi += dpp
      m.ppn += ppn
      m.pph += pph
      m.noDokSap = pushDok(m.noDokSap, k.no_billing_sap || k.no_invoice_sap || p.no_pembayaran)
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
      if (k) monikaId = resolveMonikaId(k, ksMap.get(k.ks_id) ?? k.kerja_sama)
    }
    if (!monikaId) {
      monikaId = (ks?.aset as Aset | undefined)?.kode_aset?.trim() || null
    }
    if (!monikaId) return

    const a = ensure(monikaId, rkapByMonika.get(monikaId)?.nama || monikaId)
    const m = a.cash[parsed.m]
    if (ci.jenis === 'denda') {
      m.denda += ci.nominal || 0
    } else {
      // Lainnya → masuk kompensasi (bukan jaminan; jaminan tidak di-track terpisah)
      m.kompensasi += ci.nominal || 0
    }
  })

  // ── PBB (cash in pajak ke rekening regional) ────────────────────────────
  // HO: kolom PBB di realisasi bulanan. Ambil dari tgl_bayar_pbb bila ada;
  // fallback tgl_jatuh_tempo jika sudah ada jumlah dibayar / status lunas·sebagian.
  allPBB.forEach(pbb => {
    const dibayar = Math.max(0, pbb.jumlah_pbb_dibayar ?? 0)
    const nilai = Math.max(0, pbb.nilai_pbb ?? 0)
    const status = (pbb.status_bayar ?? '').toLowerCase()
    const isPaid =
      dibayar > 0
      || status === 'lunas'
      || status === 'sebagian'
    if (!isPaid && dibayar <= 0) return

    const tgl = pbb.tgl_bayar_pbb || pbb.tgl_jatuh_tempo
    const parsed = parseYMD(tgl ?? '')
    // Juga coba cocokkan tahun PBB master (pbb.tahun) jika tanggal tidak di tahun laporan
    let monthIdx = parsed && parsed.y === tahun ? parsed.m : -1
    if (monthIdx < 0 && pbb.tahun === tahun && pbb.tgl_jatuh_tempo) {
      const jt = parseYMD(pbb.tgl_jatuh_tempo)
      if (jt && jt.y === tahun) monthIdx = jt.m
    }
    if (monthIdx < 0 || !monthSet.has(monthIdx)) return

    let monikaId = pbb.rkap_kode?.trim() || ''
    if (!monikaId && pbb.aset_id) {
      monikaId = asetById.get(pbb.aset_id)?.kode_aset?.trim() || ''
    }
    if (!monikaId && pbb.aset?.kode_aset) monikaId = pbb.aset.kode_aset.trim()
    // Fallback: aset dari KS yang pakai aset_id ini
    if (!monikaId && pbb.aset_id) {
      const ksHit = daftarKS.find(k => k.aset_id === pbb.aset_id)
      monikaId = (ksHit?.aset as Aset | undefined)?.kode_aset?.trim()
        || (ksHit?.aset_id ? asetById.get(ksHit.aset_id)?.kode_aset?.trim() : '')
        || ''
    }
    if (!monikaId) return

    // Lunas → full nilai/dibayar; sebagian → jumlah_pbb_dibayar; else nilai jika status lunas
    let nominal = dibayar
    if (nominal <= 0 && (status === 'lunas' || status === 'sebagian')) nominal = nilai
    if (nominal <= 0) return

    const a = ensure(monikaId, rkapByMonika.get(monikaId)?.nama || monikaId)
    a.cash[monthIdx].pbb += nominal
    a.pendapatan[monthIdx].pbb += nominal
  })

  // ── Pendapatan akrual (pengakuan diakui) ────────────────────────────────
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
      const monikaId =
        komp ? resolveMonikaId(komp, ksMap.get(komp.ks_id) ?? komp.kerja_sama)
          : (ks?.aset as Aset | undefined)?.kode_aset?.trim()
            || (ks?.aset_id ? asetById.get(ks.aset_id)?.kode_aset?.trim() : null)
            || null
      if (!monikaId) return

      const a = ensure(monikaId, rkapByMonika.get(monikaId)?.nama || monikaId)
      const m = a.pendapatan[parsed.m]
      m.pendapatan += pp.nominal || 0

      if (komp) {
        // Estimasi PPN/PPH proporsional ke DPP tagihan bulan itu
        const dpp = Math.max(0, komp.nominal ?? 0)
        if (dpp > 0 && pp.nominal > 0) {
          const scale = (pp.nominal || 0) / dpp
          m.ppn += Math.max(0, komp.nominal_ppn ?? 0) * scale
          m.pph += Math.max(0, komp.nominal_pph ?? 0) * scale
        }
        m.noDokSap = pushDok(m.noDokSap, komp.no_invoice_sap || komp.no_billing_sap)
      }
    })

  // Fallback pendapatan: jika tidak ada akrual, gunakan DPP tagihan JT di bulan tsb
  allKompensasi.forEach(k => {
    const parsed = parseYMD(k.tgl_jatuh_tempo)
    if (!parsed || parsed.y !== tahun) return
    if (!monthSet.has(parsed.m)) return
    const ks = ksMap.get(k.ks_id) ?? k.kerja_sama
    const monikaId = resolveMonikaId(k, ks)
    if (!monikaId) return
    const a = ensure(monikaId, rkapByMonika.get(monikaId)?.nama || monikaId)
    const m = a.pendapatan[parsed.m]
    if (m.pendapatan > 0) return // sudah dari akrual
    m.pendapatan += Math.max(0, k.nominal ?? 0)
    m.ppn += Math.max(0, k.nominal_ppn ?? 0)
    m.pph += Math.max(0, k.nominal_pph ?? 0)
    m.noDokSap = pushDok(m.noDokSap, k.no_invoice_sap || k.no_billing_sap)
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
      const monikaId = resolveMonikaId(k, ks)
      if (!monikaId) return

      const efektif = Math.max(0, (k.total_tagihan ?? 0) - (k.pengurang ?? 0))
      const dibayar = (k.pembayaran ?? [])
        .filter(p => dateKey(p.tgl_bayar) && dateKey(p.tgl_bayar) <= asOf)
        .reduce((s, p) => s + (p.nominal_bayar || 0), 0)
      const sisa = Math.max(0, efektif - dibayar)
      if (sisa <= 0.5) return

      // Hanya masuk piutang jika invoice terbit ATAU sudah JT
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
  let realisasiPendapatan = 0
  let saldoPiutang = 0

  rows.forEach(r => {
    months.forEach(m => {
      targetCash += r.cashByMonth[m]?.target ?? 0
      realisasiCash += r.cashByMonth[m]?.totalDiluarJaminan ?? 0
      targetPendapatan += r.pendapatanByMonth[m]?.target ?? 0
      realisasiPendapatan += r.pendapatanByMonth[m]?.total ?? 0
    })
    // Piutang: ambil snapshot bulan terakhir yang dipilih
    const lastM = months.length ? months[months.length - 1] : 11
    saldoPiutang += r.piutangByMonth[lastM]?.saldo ?? 0
  })

  return {
    targetCash,
    realisasiCash,
    targetPendapatan,
    realisasiPendapatan,
    saldoPiutang,
    nProker: rows.length,
  }
}

/** Konversi Rupiah → satuan HO (Rp 000) */
export function toRp000(value: number): number {
  if (!value) return 0
  return Math.round(value / 1000)
}
