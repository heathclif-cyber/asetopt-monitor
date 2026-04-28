import { useEffect, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAsetStore } from '@/store/asetStore'
import { useKerjaSamaStore } from '@/store/kerjaSamaStore'
import { useKompensasiStore } from '@/store/kompensasiStore'
import { useNotifikasiStore } from '@/store/notifikasiStore'
import { useNJOPStore } from '@/store/njopStore'
import { usePBBStore } from '@/store/pbbStore'
import { useCashInStore } from '@/store/cashInStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { StatusBadge } from '@/components/common/StatusBadge'
import { formatTanggal, hitungSisaHari } from '@/lib/utils'
import { hitungPotensiNJOP } from '@/utils/potensiUtils'
import { hitungRKAP, getCashInPerBulanByYear } from '@/utils/rkapUtils'
import { RKAP_2026, BULAN_LABELS } from '@/data/rkap2026'
import { useRKAPStore, rowToRKAPItem } from '@/store/rkapStore'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ComposedChart, Area, Line, ReferenceLine,
} from 'recharts'
import { Building2, Handshake, Clock, TrendingUp, AlertTriangle, Banknote, ReceiptText, Percent, Target, ChevronRight, WalletCards, CalendarRange, FileText } from 'lucide-react'

const CURRENT_MONTH = new Date().getMonth()

export function Dashboard() {
  const navigate = useNavigate()
  const { daftarAset, fetchAset } = useAsetStore()
  const { daftarKS, fetchKS } = useKerjaSamaStore()
  const { allKompensasi, fetchAllKompensasi } = useKompensasiStore()
  const { jatuhTempoH14, spAktif, checkJatuhTempo, fetchSPAktif } = useNotifikasiStore()
  const { fetchAllNJOP, dataNJOP } = useNJOPStore()
  const { rows: rkapRows, fetchRKAP } = useRKAPStore()
  const { allPBB, fetchAllPBB } = usePBBStore()
  const { allCashIn, fetchAllCashIn } = useCashInStore()

  const location = useLocation()

  // Fetch sekali saat pertama mount (data statis)
  useEffect(() => {
    fetchAset()
    fetchSPAktif()
    fetchAllNJOP()
    fetchAllPBB()
    fetchAllCashIn()
    fetchRKAP(CURRENT_MONTH >= 0 ? new Date().getFullYear() : 2026)
  }, [])

  // Re-fetch data yang berubah setiap kali dashboard dikunjungi (fix: status lunas tidak terupdate)
  useEffect(() => {
    fetchAllKompensasi()
    fetchAllCashIn()
    fetchKS()
    fetchSPAktif()
  }, [location.key])

  useEffect(() => {
    checkJatuhTempo(allKompensasi)
  }, [allKompensasi])

  const stats = useMemo(() => {
    const totalAset = daftarAset.length
    const asetPipeline = daftarAset.filter(a => ['pipeline', 'prospek', 'negosiasi'].includes(a.status)).length
    const asetAktifKS = daftarAset.filter(a => a.status === 'aktif_ks').length

    let totalPotensiNJOP = 0
    daftarAset
      .filter(a => ['pipeline', 'prospek', 'negosiasi'].includes(a.status))
      .forEach(a => {
        const njopList = dataNJOP[a.id]
        if (njopList && njopList.length > 0 && a.luas_tanah_m2) {
          const njop = njopList[0]
          const { totalPotensi } = hitungPotensiNJOP({
            njopTanahPerM2: njop.nilai_tanah_per_m2,
            luasTanahM2: a.luas_tanah_m2 ?? 0,
            njopBangunanPerM2: njop.nilai_bangunan_per_m2,
            luasBangunanM2: a.luas_bangunan_m2 ?? 0,
          })
          totalPotensiNJOP += totalPotensi
        }
      })

    const cashInLain = allCashIn.reduce((sum, ci) => sum + ci.nominal, 0)
    const totalTagihan = allKompensasi.reduce((sum, k) => sum + (k.total_tagihan ?? 0), 0) + cashInLain
    const totalCashIn = allKompensasi
      .flatMap(k => k.pembayaran ?? [])
      .reduce((sum, p) => sum + (p.nominal_bayar ?? 0), 0) + cashInLain
    const collectionRate = totalTagihan > 0 ? (totalCashIn / totalTagihan) * 100 : 0

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const totalPiutang = allKompensasi.reduce((sum, k) => {
      // Hanya hitung periode yang sudah jatuh tempo
      if (new Date(k.tgl_jatuh_tempo) > today) return sum
      const totalDibayar = (k.pembayaran ?? []).reduce((s, p) => s + p.nominal_bayar, 0)
      const efektif = (k.total_tagihan ?? 0) - (k.pengurang ?? 0)
      const sisa = Math.max(0, efektif - totalDibayar)
      return sum + sisa
    }, 0)

    return { totalAset, asetPipeline, asetAktifKS, totalPotensiNJOP, totalTagihan, totalCashIn, collectionRate, totalPiutang }
  }, [daftarAset, dataNJOP, allKompensasi, allCashIn])

  // Gunakan spAktif (dari tabel surat_peringatan) sebagai sumber tunggal SP di dashboard
  // agar sinkron dengan Notifikasi & SP — saat SP dihapus, dashboard ikut terupdate
  const spJenisOrder: Record<string, number> = { SP1: 1, SP2: 2, SP3: 3, PUTUS: 4 }
  const spByKS = useMemo(() => {
    const map = new Map<string, typeof spAktif[0]>()
    for (const sp of spAktif) {
      const existing = map.get(sp.ks_id)
      if (!existing || (spJenisOrder[sp.jenis] ?? 0) > (spJenisOrder[existing.jenis] ?? 0)) {
        map.set(sp.ks_id, sp)
      }
    }
    return Array.from(map.values())
  }, [spAktif])

  // Piutang: hanya periode yang sudah jatuh tempo tapi belum lunas, dikelompokkan per KS
  const piutangList = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const byKS: Record<string, { ksId: string; namaMitra: string; namaAset: string; totalTagihan: number; totalDibayar: number; sisaPiutang: number; adaTerlambat: boolean; hariTerlambat: number; jumlahPeriode: number }> = {}
    allKompensasi.forEach(k => {
      // Skip periode yang belum jatuh tempo
      const jtTempo = new Date(k.tgl_jatuh_tempo)
      if (jtTempo > today) return

      const totalDibayar = (k.pembayaran ?? []).reduce((s, p) => s + p.nominal_bayar, 0)
      const sisa = Math.max(0, ((k.total_tagihan ?? 0) - (k.pengurang ?? 0)) - totalDibayar)
      if (sisa <= 0) return  // sudah lunas

      const ks = daftarKS.find(x => x.id === k.ks_id)
      if (!ks) return
      const hariTerlambat = Math.max(0, Math.floor((today.getTime() - jtTempo.getTime()) / (1000 * 60 * 60 * 24)))
      if (!byKS[k.ks_id]) {
        byKS[k.ks_id] = {
          ksId: k.ks_id,
          namaMitra: ks.nama_mitra,
          namaAset: (ks.aset as any)?.nama_aset ?? '-',
          totalTagihan: 0,
          totalDibayar: 0,
          sisaPiutang: 0,
          adaTerlambat: false,
          hariTerlambat: 0,
          jumlahPeriode: 0,
        }
      }
      byKS[k.ks_id].totalTagihan  += k.total_tagihan ?? 0
      byKS[k.ks_id].totalDibayar  += totalDibayar
      byKS[k.ks_id].sisaPiutang   += sisa
      byKS[k.ks_id].jumlahPeriode += 1
      if (hariTerlambat > 0) {
        byKS[k.ks_id].adaTerlambat = true
        byKS[k.ks_id].hariTerlambat = Math.max(byKS[k.ks_id].hariTerlambat, hariTerlambat)
      }
    })
    return Object.values(byKS).sort((a, b) => b.sisaPiutang - a.sisaPiutang)
  }, [allKompensasi, daftarKS])

  // PBB Proporsional: hitung porsi PBB per KS berdasarkan tgl_mulai/tgl_selesai vs tahun SPPT
  const pbbProporsionalList = useMemo(() => {
    type PBBRow = {
      ksId: string; namaMitra: string; namaAset: string
      tahun: number; nilaiPBB: number; proporsi: number; pbbProporsional: number
      hariKS: number; hariDalamTahun: number; statusBayar: string
    }
    const rows: PBBRow[] = []

    daftarKS.forEach(ks => {
      const tglMulai  = new Date(ks.tgl_mulai)
      const tglSelesai = new Date(ks.tgl_selesai)
      const namaAset  = (ks.aset as any)?.nama_aset ?? '-'

      // Kumpulkan PBB untuk aset ini
      const pbbAset = allPBB.filter(p => p.aset_id === ks.aset_id)

      pbbAset.forEach(pbb => {
        const tahun = pbb.tahun
        // Rentang KS dalam tahun SPPT
        const thnMulai  = new Date(tahun, 0, 1)   // 1 Jan
        const thnAkhir  = new Date(tahun, 11, 31)  // 31 Des

        const overlapMulai  = tglMulai  > thnMulai  ? tglMulai  : thnMulai
        const overlapAkhir  = tglSelesai < thnAkhir ? tglSelesai : thnAkhir

        const hariKS = Math.max(0, Math.floor((overlapAkhir.getTime() - overlapMulai.getTime()) / 86_400_000) + 1)
        if (hariKS <= 0) return   // KS tidak overlap dengan tahun SPPT ini

        // Hari dalam tahun (366 jika kabisat)
        const hariDalamTahun = ((tahun % 4 === 0 && tahun % 100 !== 0) || tahun % 400 === 0) ? 366 : 365
        const proporsiWaktu = hariKS / hariDalamTahun

        // Proporsi luasan (NJOP-weighted) — jika data objek tersedia
        const njopSppt = (pbb.luas_tanah_sppt ?? 0) * (pbb.njop_tanah_per_m2 ?? 0)
                       + (pbb.luas_bangunan_sppt ?? 0) * (pbb.njop_bangunan_per_m2 ?? 0)
        const njopKS   = (pbb.luas_tanah_ks ?? 0) * (pbb.njop_tanah_per_m2 ?? 0)
                       + (pbb.luas_bangunan_ks ?? 0) * (pbb.njop_bangunan_per_m2 ?? 0)
        const proporsiArea = njopSppt > 0 ? njopKS / njopSppt : 1

        const proporsi = proporsiArea * proporsiWaktu
        const pbbProporsional = Math.round(pbb.nilai_pbb * proporsi)

        rows.push({
          ksId: ks.id, namaMitra: ks.nama_mitra, namaAset,
          tahun, nilaiPBB: pbb.nilai_pbb, proporsi, pbbProporsional,
          hariKS, hariDalamTahun, statusBayar: pbb.status_bayar,
        })
      })
    })

    return rows.sort((a, b) => b.tahun - a.tahun || b.pbbProporsional - a.pbbProporsional)
  }, [daftarKS, allPBB])

  const potensiChartData = daftarAset
    .filter(a => ['pipeline', 'prospek', 'negosiasi'].includes(a.status))
    .slice(0, 8)
    .map(a => {
      const njopList = dataNJOP[a.id]
      let potensiNJOP = 0
      if (njopList && njopList.length > 0) {
        const njop = njopList[0]
        const { totalPotensi } = hitungPotensiNJOP({
          njopTanahPerM2: njop.nilai_tanah_per_m2,
          luasTanahM2: a.luas_tanah_m2 ?? 0,
          njopBangunanPerM2: njop.nilai_bangunan_per_m2,
          luasBangunanM2: a.luas_bangunan_m2 ?? 0,
        })
        potensiNJOP = totalPotensi
      }
      return {
        name: a.kode_aset,
        potensiNJOP: Math.round(potensiNJOP / 1000000),
      }
    })
    .filter(d => d.potensiNJOP > 0)

  const rkapSummary = useMemo(() => {
    const tahun = new Date().getFullYear()
    const items = rkapRows.length > 0 ? rkapRows.map(rowToRKAPItem) : RKAP_2026
    const totalTarget = items.reduce((s, i) => s + i.total, 0)
    const cashIn = getCashInPerBulanByYear(allKompensasi, tahun, allCashIn)
    const months = hitungRKAP(items, cashIn)
    const ytdTarget = months.slice(0, CURRENT_MONTH + 1).reduce((s, m) => s + m.targetOriginal, 0)
    const ytdRealisasi = cashIn.slice(0, CURRENT_MONTH + 1).reduce((s, v) => s + v, 0)
    const achievement = ytdTarget > 0 ? (ytdRealisasi / ytdTarget) * 100 : 0
    const currentCarryOver = months[CURRENT_MONTH]?.carryOver ?? 0
    const chartData = months.slice(0, CURRENT_MONTH + 1).map(m => ({
      bulan: m.label,
      'Target': Math.round(m.targetOriginal / 1_000_000),
      'Realisasi': Math.round(m.realisasi / 1_000_000),
    }))
    const triwulan = [0, 1, 2, 3].map(q => {
      const bulanStart = q * 3
      const bulanEnd   = bulanStart + 3
      const label = `TW${q + 1}`
      const isFuture = bulanStart > CURRENT_MONTH
      const target = months.slice(bulanStart, bulanEnd).reduce((s, m) => s + m.targetOriginal, 0)
      const realisasi = cashIn.slice(bulanStart, bulanEnd).reduce((s, v) => s + v, 0)
      const achievement = target > 0 ? (realisasi / target) * 100 : 0
      const isCurrent = CURRENT_MONTH >= bulanStart && CURRENT_MONTH < bulanEnd
      return { label, target, realisasi, achievement, isFuture, isCurrent }
    })
    return { totalTarget, ytdTarget, ytdRealisasi, achievement, currentCarryOver, chartData, triwulan }
  }, [allKompensasi, rkapRows, allCashIn])

  const cashFlowData = useMemo(() => {
    const byBulan: Record<string, { tagihan: number; cashIn: number }> = {}
    allKompensasi.forEach(k => {
      const bulan = k.tgl_jatuh_tempo.slice(0, 7)
      if (!byBulan[bulan]) byBulan[bulan] = { tagihan: 0, cashIn: 0 }
      byBulan[bulan].tagihan += k.total_tagihan ?? 0
      ;(k.pembayaran ?? []).forEach(p => {
        const bln = p.tgl_bayar.slice(0, 7)
        if (!byBulan[bln]) byBulan[bln] = { tagihan: 0, cashIn: 0 }
        byBulan[bln].cashIn += p.nominal_bayar ?? 0
      })
    })
    
    allCashIn.forEach(ci => {
      const bln = ci.tgl_terima.slice(0, 7)
      if (!byBulan[bln]) byBulan[bln] = { tagihan: 0, cashIn: 0 }
      byBulan[bln].cashIn += ci.nominal
      byBulan[bln].tagihan += ci.nominal
    })

    return Object.entries(byBulan)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([bulan, { tagihan, cashIn }]) => ({
        bulan: new Date(bulan + '-01').toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }),
        tagihan: Math.round(tagihan / 1_000_000),
        cashIn: Math.round(cashIn / 1_000_000),
      }))
  }, [allKompensasi, allCashIn])

  // Proyeksi cash in 18 bulan — berdasarkan jadwal jatuh tempo KS eksisting
  const proyeksiCashInData = useMemo(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const currentYM = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

    // Kumpulkan semua tagihan per bulan jatuh tempo
    const byBulan: Record<string, { tagihan: number; cashIn: number; sisaTagihan: number }> = {}

    allKompensasi.forEach(k => {
      const bulan = k.tgl_jatuh_tempo.slice(0, 7)
      if (!byBulan[bulan]) byBulan[bulan] = { tagihan: 0, cashIn: 0, sisaTagihan: 0 }
      const totalDibayar = (k.pembayaran ?? []).reduce((s, p) => s + p.nominal_bayar, 0)
      const sisa = Math.max(0, ((k.total_tagihan ?? 0) - (k.pengurang ?? 0)) - totalDibayar)
      byBulan[bulan].tagihan     += k.total_tagihan ?? 0
      byBulan[bulan].sisaTagihan += sisa
      // Cash in aktual per bulan bayar
      ;(k.pembayaran ?? []).forEach(p => {
        const bln = p.tgl_bayar.slice(0, 7)
        if (!byBulan[bln]) byBulan[bln] = { tagihan: 0, cashIn: 0, sisaTagihan: 0 }
        byBulan[bln].cashIn += p.nominal_bayar
      })
    })

    allCashIn.forEach(ci => {
      const bln = ci.tgl_terima.slice(0, 7)
      if (!byBulan[bln]) byBulan[bln] = { tagihan: 0, cashIn: 0, sisaTagihan: 0 }
      byBulan[bln].cashIn += ci.nominal
      byBulan[bln].tagihan += ci.nominal
    })

    // Ambil 6 bulan lewat + bulan ini + 12 bulan ke depan
    const months: string[] = []
    for (let i = -6; i <= 12; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1)
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }

    let cumRealisasi = 0
    let cumProyeksi  = 0
    return months.map(ym => {
      const d     = byBulan[ym] ?? { tagihan: 0, cashIn: 0, sisaTagihan: 0 }
      const label = new Date(ym + '-01').toLocaleDateString('id-ID', { month: 'short', year: '2-digit' })
      const isPast = ym < currentYM
      const isCurrent = ym === currentYM

      if (isPast || isCurrent) cumRealisasi += d.cashIn
      else cumProyeksi += d.sisaTagihan

      return {
        bulan: label,
        ym,
        isFuture: ym > currentYM,
        isCurrent,
        realisasi:   isPast || isCurrent ? Math.round(d.cashIn / 1_000_000) : null,
        proyeksi:    ym >= currentYM     ? Math.round(d.sisaTagihan / 1_000_000) : null,
        tagihan:     Math.round(d.tagihan / 1_000_000),
        cumRealisasi: Math.round(cumRealisasi / 1_000_000),
        cumProyeksi:  Math.round((cumRealisasi + cumProyeksi) / 1_000_000),
      }
    })
  }, [allKompensasi, allCashIn])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold text-gray-900">Dashboard</h1>
        <p className="text-xs text-gray-500 mt-0.5">Ringkasan program optimalisasi aset</p>
      </div>

      {/* RKAP Section — paling atas */}
      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Target size={15} className="text-[#1B4F72]" />
            <span className="text-sm font-semibold text-gray-800">RKAP {new Date().getFullYear()} — Progress YTD</span>
            <span className="text-xs text-gray-400">s.d. {BULAN_LABELS[CURRENT_MONTH]}</span>
          </div>
          <button
            onClick={() => navigate('/rkap')}
            className="flex items-center gap-1 text-xs text-[#1B4F72] hover:underline font-medium"
          >
            Detail <ChevronRight size={13} />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 divide-y lg:divide-y-0 lg:divide-x divide-gray-100">
          <div className="px-5 py-4">
            <p className="text-[11px] text-gray-500 font-medium">Target RKAP {new Date().getFullYear()}</p>
            <CurrencyDisplay value={rkapSummary.totalTarget} size="lg" className="text-[#1B4F72] mt-1 block" />
            <p className="text-[11px] text-gray-400 mt-1">YTD: <span className="text-gray-600 font-medium"><CurrencyDisplay value={rkapSummary.ytdTarget} /></span></p>
          </div>
          <div className="px-5 py-4">
            <p className="text-[11px] text-gray-500 font-medium">Realisasi YTD</p>
            <CurrencyDisplay value={rkapSummary.ytdRealisasi} size="lg" className="text-[#117A65] mt-1 block" />
            {rkapSummary.currentCarryOver > 0 && (
              <p className="text-[11px] text-orange-600 mt-1 font-medium">
                ⚠ Carry-over: <CurrencyDisplay value={rkapSummary.currentCarryOver} />
              </p>
            )}
          </div>
          <div className="px-5 py-4 flex flex-col justify-between">
            <p className="text-[11px] text-gray-500 font-medium">Achievement YTD</p>
            <p className={`text-2xl font-bold mt-1 ${rkapSummary.achievement >= 100 ? 'text-[#117A65]' : rkapSummary.achievement >= 80 ? 'text-yellow-600' : 'text-red-600'}`}>
              {rkapSummary.achievement.toFixed(1)}%
            </p>
            <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${rkapSummary.achievement >= 100 ? 'bg-green-500' : rkapSummary.achievement >= 80 ? 'bg-yellow-400' : 'bg-red-500'}`}
                style={{ width: `${Math.min(100, rkapSummary.achievement)}%` }}
              />
            </div>
          </div>
        </div>

        {/* Capaian Triwulan */}
        <div className="px-5 pb-4 pt-1 border-t border-gray-100">
          <p className="text-[11px] text-gray-500 font-semibold uppercase tracking-wide mb-3">Capaian per Triwulan</p>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {rkapSummary.triwulan.map(tw => (
              <div
                key={tw.label}
                className={`rounded-lg p-3 border ${
                  tw.isFuture
                    ? 'bg-gray-50 border-gray-200 opacity-50'
                    : tw.achievement >= 100
                    ? 'bg-green-50 border-green-200'
                    : tw.achievement >= 75
                    ? 'bg-yellow-50 border-yellow-200'
                    : 'bg-red-50 border-red-200'
                } ${tw.isCurrent ? 'ring-2 ring-[#1B4F72]/30' : ''}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-gray-700">{tw.label}</span>
                  {tw.isCurrent && <span className="text-[9px] bg-[#1B4F72] text-white px-1.5 py-0.5 rounded-full">Berjalan</span>}
                  {tw.isFuture  && <span className="text-[9px] text-gray-400">Belum</span>}
                </div>
                <p className={`text-lg font-bold ${
                  tw.isFuture ? 'text-gray-400'
                  : tw.achievement >= 100 ? 'text-green-700'
                  : tw.achievement >= 75  ? 'text-yellow-700'
                  : 'text-red-700'
                }`}>
                  {tw.isFuture ? '—' : `${tw.achievement.toFixed(1)}%`}
                </p>
                <p className="text-[10px] text-gray-500 mt-0.5">
                  Realisasi: <span className="font-medium text-gray-700">{Math.round(tw.realisasi / 1_000_000)}jt</span>
                </p>
                <p className="text-[10px] text-gray-400">
                  Target: {Math.round(tw.target / 1_000_000)}jt
                </p>
                {!tw.isFuture && (
                  <div className="mt-1.5 h-1 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        tw.achievement >= 100 ? 'bg-green-500'
                        : tw.achievement >= 75 ? 'bg-yellow-400'
                        : 'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(100, tw.achievement)}%` }}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {rkapSummary.chartData.length > 0 && (
          <div className="px-5 pb-4 pt-1 border-t border-gray-100">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={rkapSummary.chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="bulan" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}jt`} />
                <Tooltip formatter={(v: number) => `Rp ${v}jt`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Target" fill="#94a3b8" radius={[3,3,0,0]} />
                <Bar dataKey="Realisasi" fill="#117A65" radius={[3,3,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">Total Aset</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{stats.totalAset}</p>
              </div>
              <Building2 className="text-[#1B4F72]" size={22} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">Di Pipeline</p>
                <p className="text-2xl font-bold text-[#117A65] mt-1">{stats.asetPipeline}</p>
              </div>
              <TrendingUp className="text-[#117A65]" size={22} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">Aktif KS</p>
                <p className="text-2xl font-bold text-[#5B2C6F] mt-1">{stats.asetAktifKS}</p>
              </div>
              <Handshake className="text-[#5B2C6F]" size={22} />
            </div>
          </CardContent>
        </Card>

        <Card className={jatuhTempoH14.length > 0 ? 'border-red-300' : ''}>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">Jatuh Tempo ≤14 Hari</p>
                <p className={`text-2xl font-bold mt-1 ${jatuhTempoH14.length > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                  {jatuhTempoH14.length}
                </p>
              </div>
              <Clock className={jatuhTempoH14.length > 0 ? 'text-red-500' : 'text-gray-400'} size={22} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div>
              <p className="text-xs text-gray-500 font-medium">Potensi NJOP (Pipeline)</p>
              <CurrencyDisplay value={stats.totalPotensiNJOP} size="lg" className="text-[#1B4F72] mt-1 block" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Stat keuangan */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">Total Tagihan (Pendapatan)</p>
                <CurrencyDisplay value={stats.totalTagihan} size="lg" className="text-[#1B4F72] mt-1 block" />
              </div>
              <ReceiptText className="text-[#1B4F72]" size={22} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">Total Cash In (Terbayar)</p>
                <CurrencyDisplay value={stats.totalCashIn} size="lg" className="text-[#117A65] mt-1 block" />
              </div>
              <Banknote className="text-[#117A65]" size={22} />
            </div>
          </CardContent>
        </Card>

        <Card className={stats.totalPiutang > 0 ? 'border-orange-300' : ''}>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">Total Piutang (Belum Bayar)</p>
                <CurrencyDisplay value={stats.totalPiutang} size="lg" className="text-orange-600 mt-1 block" />
                <p className="text-[10px] text-gray-400 mt-1">{piutangList.length} mitra</p>
              </div>
              <WalletCards className={stats.totalPiutang > 0 ? 'text-orange-500' : 'text-gray-400'} size={22} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">Collection Rate</p>
                <p className={`text-2xl font-bold mt-1 ${stats.collectionRate >= 80 ? 'text-[#117A65]' : stats.collectionRate >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {stats.collectionRate.toFixed(1)}%
                </p>
              </div>
              <Percent className={stats.collectionRate >= 80 ? 'text-[#117A65]' : stats.collectionRate >= 50 ? 'text-yellow-500' : 'text-red-500'} size={22} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* KS dengan SP aktif */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle size={16} className="text-orange-500" />
              Kerja Sama dengan SP Aktif
            </CardTitle>
          </CardHeader>
          <CardContent>
            {spByKS.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">Tidak ada SP aktif</p>
            ) : (
              <div className="space-y-2">
                {spByKS.map(sp => {
                  const ks = sp.kerja_sama as any
                  const aset = ks?.aset as any
                  return (
                    <div key={sp.ks_id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                      <div>
                        <p className="text-sm font-medium">{ks?.nama_mitra ?? '-'}</p>
                        <p className="text-xs text-gray-500">{aset?.nama_aset ?? '-'}</p>
                      </div>
                      <StatusBadge type="ks" value={sp.jenis.toLowerCase()} />
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Jatuh tempo h14 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock size={16} className="text-blue-500" />
              Kompensasi Jatuh Tempo ≤14 Hari
            </CardTitle>
          </CardHeader>
          <CardContent>
            {jatuhTempoH14.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">Tidak ada jatuh tempo dalam 14 hari</p>
            ) : (
              <div className="space-y-2">
                {jatuhTempoH14.slice(0, 5).map(k => (
                  <div key={k.id} className="flex items-center justify-between p-3 rounded-lg bg-red-50">
                    <div>
                      <p className="text-sm font-medium">{k.periode_label ?? '-'}</p>
                      <p className="text-xs text-gray-500">{formatTanggal(k.tgl_jatuh_tempo)}</p>
                    </div>
                    <div className="text-right">
                      <CurrencyDisplay value={k.total_tagihan} size="sm" className="font-semibold text-red-700" />
                      <p className="text-xs text-red-500">
                        {hitungSisaHari(k.tgl_jatuh_tempo)} hari lagi
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Daftar Piutang */}
      <Card className={piutangList.length > 0 ? 'border-orange-200' : ''}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <WalletCards size={16} className="text-orange-500" />
            Piutang Belum Dibayar
            {piutangList.length > 0 && (
              <span className="ml-auto text-xs font-normal text-orange-600 bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-full">
                {piutangList.length} mitra
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {piutangList.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">Semua tagihan sudah terbayar ✓</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-500 text-xs uppercase">
                    <th className="text-left px-3 py-2">Mitra</th>
                    <th className="text-left px-3 py-2 hidden md:table-cell">Aset</th>
                    <th className="text-center px-3 py-2 hidden md:table-cell">Periode</th>
                    <th className="text-right px-3 py-2">Total Tagihan</th>
                    <th className="text-right px-3 py-2">Sudah Bayar</th>
                    <th className="text-right px-3 py-2 font-semibold text-orange-700">Sisa Piutang</th>
                    <th className="text-center px-3 py-2 hidden md:table-cell">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {piutangList.map(item => (
                    <tr key={item.ksId} className={`hover:bg-gray-50 transition-colors ${item.adaTerlambat ? 'bg-red-50/40' : ''}`}>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-gray-900">{item.namaMitra}</p>
                        {item.adaTerlambat && (
                          <p className="text-xs text-red-600 mt-0.5">Terlambat s.d. {item.hariTerlambat} hari</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 hidden md:table-cell text-gray-500 text-xs">{item.namaAset}</td>
                      <td className="px-3 py-2.5 text-center hidden md:table-cell">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{item.jumlahPeriode} periode</span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-600">
                        <CurrencyDisplay value={item.totalTagihan} size="sm" />
                      </td>
                      <td className="px-3 py-2.5 text-right text-green-700">
                        <CurrencyDisplay value={item.totalDibayar} size="sm" />
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-orange-700">
                        <CurrencyDisplay value={item.sisaPiutang} size="sm" />
                      </td>
                      <td className="px-3 py-2.5 text-center hidden md:table-cell">
                        {item.adaTerlambat
                          ? <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Terlambat</span>
                          : <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Belum Bayar</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-gray-50 font-semibold">
                    <td colSpan={3} className="px-3 py-2 text-sm text-gray-700">Total</td>
                    <td className="px-3 py-2 text-right text-sm text-gray-600">
                      <CurrencyDisplay value={piutangList.reduce((s, i) => s + i.totalTagihan, 0)} size="sm" />
                    </td>
                    <td className="px-3 py-2 text-right text-sm text-green-700">
                      <CurrencyDisplay value={piutangList.reduce((s, i) => s + i.totalDibayar, 0)} size="sm" />
                    </td>
                    <td className="px-3 py-2 text-right text-sm text-orange-700">
                      <CurrencyDisplay value={stats.totalPiutang} size="sm" />
                    </td>
                    <td className="hidden md:table-cell" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card PBB Proporsional per KS */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileText size={16} className="text-amber-600" />
            PBB Proporsional per Kerja Sama
            <span className="ml-auto text-xs font-normal text-gray-400">berdasarkan jangka waktu KS vs tahun SPPT</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pbbProporsionalList.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">Belum ada data PBB yang terhubung dengan KS aktif</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-gray-500 text-xs uppercase">
                    <th className="text-left px-3 py-2">Mitra</th>
                    <th className="text-left px-3 py-2 hidden md:table-cell">Aset</th>
                    <th className="text-center px-3 py-2">Tahun SPPT</th>
                    <th className="text-right px-3 py-2 hidden md:table-cell">Nilai PBB</th>
                    <th className="text-center px-3 py-2 hidden md:table-cell">Proporsi</th>
                    <th className="text-right px-3 py-2 font-semibold text-amber-700">PBB Ditanggung</th>
                    <th className="text-center px-3 py-2">Status SPPT</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pbbProporsionalList.map((item, idx) => (
                    <tr key={`${item.ksId}-${item.tahun}-${idx}`} className="hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2.5 font-medium text-gray-900">{item.namaMitra}</td>
                      <td className="px-3 py-2.5 hidden md:table-cell text-gray-500 text-xs">{item.namaAset}</td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-medium">{item.tahun}</span>
                      </td>
                      <td className="px-3 py-2.5 text-right text-gray-500 hidden md:table-cell">
                        <CurrencyDisplay value={item.nilaiPBB} size="sm" />
                      </td>
                      <td className="px-3 py-2.5 text-center hidden md:table-cell">
                        <span className="text-xs text-gray-500">
                          {item.hariKS}hr / {item.hariDalamTahun}hr = {(item.proporsi * 100).toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold text-amber-700">
                        <CurrencyDisplay value={item.pbbProporsional} size="sm" />
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        {item.statusBayar === 'lunas'
                          ? <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Lunas</span>
                          : <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Belum Bayar</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 bg-amber-50 font-semibold">
                    <td colSpan={4} className="px-3 py-2 text-sm text-gray-700">Total PBB Ditanggung Mitra</td>
                    <td className="px-3 py-2 text-right text-sm text-amber-700">
                      <CurrencyDisplay value={pbbProporsionalList.reduce((s, i) => s + i.pbbProporsional, 0)} size="sm" />
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>


      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar chart potensi */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Potensi Pendapatan NJOP per Aset (Juta Rp)</CardTitle>
          </CardHeader>
          <CardContent>
            {potensiChartData.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">Belum ada data NJOP</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={potensiChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [`Rp ${v}jt`, 'Potensi NJOP']} />
                  <Bar dataKey="potensiNJOP" fill="#117A65" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Bar chart cash in vs tagihan */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tagihan vs Cash In per Bulan (Juta Rp)</CardTitle>
          </CardHeader>
          <CardContent>
            {cashFlowData.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">Belum ada data kompensasi</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={cashFlowData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="bulan" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number, name: string) => [`Rp ${v}jt`, name === 'tagihan' ? 'Tagihan' : 'Cash In']} />
                  <Legend formatter={(value) => value === 'tagihan' ? 'Tagihan' : 'Cash In'} />
                  <Bar dataKey="tagihan" fill="#1B4F72" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="cashIn" fill="#117A65" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Grafik Proyeksi Cash In KS Eksisting */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarRange size={16} className="text-[#5B2C6F]" />
            Proyeksi Cash In — Kerja Sama Eksisting
            <span className="ml-auto text-xs font-normal text-gray-400">6 bulan lewat + 12 bulan ke depan</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {proyeksiCashInData.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">Belum ada data kompensasi</p>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={proyeksiCashInData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="bulan" tick={{ fontSize: 10 }} />
                  <YAxis yAxisId="bar" tick={{ fontSize: 10 }} tickFormatter={v => `${v}jt`} />
                  <YAxis yAxisId="line" orientation="right" tick={{ fontSize: 10 }} tickFormatter={v => `${v}jt`} />
                  <Tooltip
                    formatter={(v: any, name: string) => [
                      v != null ? `Rp ${v}jt` : '—',
                      name === 'realisasi'   ? 'Cash In Aktual'
                      : name === 'proyeksi' ? 'Proyeksi (Sisa Tagihan)'
                      : name === 'cumRealisasi' ? 'Kumulatif Realisasi'
                      : 'Kumulatif Proyeksi',
                    ]}
                  />
                  <Legend
                    formatter={v =>
                      v === 'realisasi'    ? 'Cash In Aktual'
                      : v === 'proyeksi' ? 'Proyeksi Tagihan'
                      : v === 'cumRealisasi' ? 'Kumulatif Realisasi'
                      : 'Kumulatif Proyeksi'
                    }
                    wrapperStyle={{ fontSize: 11 }}
                  />
                  {/* Garis pemisah bulan ini */}
                  {proyeksiCashInData.find(d => d.isCurrent) && (
                    <ReferenceLine
                      yAxisId="bar"
                      x={proyeksiCashInData.find(d => d.isCurrent)?.bulan}
                      stroke="#1B4F72"
                      strokeDasharray="4 2"
                      label={{ value: 'Sekarang', position: 'top', fontSize: 10, fill: '#1B4F72' }}
                    />
                  )}
                  <Bar yAxisId="bar" dataKey="realisasi"  fill="#117A65" radius={[3,3,0,0]} name="realisasi" />
                  <Bar yAxisId="bar" dataKey="proyeksi"   fill="#3B82F6" radius={[3,3,0,0]} name="proyeksi" opacity={0.7} />
                  <Line yAxisId="line" type="monotone" dataKey="cumRealisasi" stroke="#117A65" strokeWidth={2} dot={false} name="cumRealisasi" />
                  <Line yAxisId="line" type="monotone" dataKey="cumProyeksi"  stroke="#3B82F6" strokeWidth={2} dot={false} strokeDasharray="4 2" name="cumProyeksi" />
                </ComposedChart>
              </ResponsiveContainer>
              <p className="text-[10px] text-gray-400 mt-2 text-center">
                * Proyeksi = sisa tagihan belum dibayar berdasarkan jadwal jatuh tempo KS eksisting. Garis putus-putus = proyeksi kumulatif.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
