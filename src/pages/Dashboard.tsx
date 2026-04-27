import { useEffect, useMemo } from 'react'
import { useAsetStore } from '@/store/asetStore'
import { useKerjaSamaStore } from '@/store/kerjaSamaStore'
import { useKompensasiStore } from '@/store/kompensasiStore'
import { useNotifikasiStore } from '@/store/notifikasiStore'
import { useNJOPStore } from '@/store/njopStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { StatusBadge } from '@/components/common/StatusBadge'
import { formatTanggal, hitungSisaHari } from '@/lib/utils'
import { hitungPotensiNJOP } from '@/utils/potensiUtils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { Building2, Handshake, Clock, TrendingUp, AlertTriangle, Banknote, ReceiptText, Percent } from 'lucide-react'

export function Dashboard() {
  const { daftarAset, fetchAset } = useAsetStore()
  const { daftarKS, fetchKS } = useKerjaSamaStore()
  const { allKompensasi, fetchAllKompensasi } = useKompensasiStore()
  const { jatuhTempoH14, spAktif, checkJatuhTempo, fetchSPAktif } = useNotifikasiStore()
  const { fetchAllNJOP, dataNJOP } = useNJOPStore()

  useEffect(() => {
    fetchAset()
    fetchKS()
    fetchAllKompensasi()
    fetchSPAktif()
    fetchAllNJOP()
  }, [])

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

    const totalTagihan = allKompensasi.reduce((sum, k) => sum + (k.total_tagihan ?? 0), 0)
    const totalCashIn = allKompensasi
      .flatMap(k => k.pembayaran ?? [])
      .reduce((sum, p) => sum + (p.nominal_bayar ?? 0), 0)
    const collectionRate = totalTagihan > 0 ? (totalCashIn / totalTagihan) * 100 : 0

    return { totalAset, asetPipeline, asetAktifKS, totalPotensiNJOP, totalTagihan, totalCashIn, collectionRate }
  }, [daftarAset, dataNJOP, allKompensasi])

  const ksWithSP = daftarKS.filter(ks => ['sp1', 'sp2', 'sp3'].includes(ks.status))

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
    return Object.entries(byBulan)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([bulan, { tagihan, cashIn }]) => ({
        bulan: new Date(bulan + '-01').toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }),
        tagihan: Math.round(tagihan / 1_000_000),
        cashIn: Math.round(cashIn / 1_000_000),
      }))
  }, [allKompensasi])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-sm text-gray-500 mt-1">Ringkasan program optimalisasi aset</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">Total Aset</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{stats.totalAset}</p>
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
                <p className="text-3xl font-bold text-[#117A65] mt-1">{stats.asetPipeline}</p>
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
                <p className="text-3xl font-bold text-[#5B2C6F] mt-1">{stats.asetAktifKS}</p>
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
                <p className={`text-3xl font-bold mt-1 ${jatuhTempoH14.length > 0 ? 'text-red-600' : 'text-gray-900'}`}>
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
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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

        <Card>
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium">Collection Rate</p>
                <p className={`text-3xl font-bold mt-1 ${stats.collectionRate >= 80 ? 'text-[#117A65]' : stats.collectionRate >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
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
            {ksWithSP.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">Tidak ada SP aktif</p>
            ) : (
              <div className="space-y-2">
                {ksWithSP.map(ks => (
                  <div key={ks.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                    <div>
                      <p className="text-sm font-medium">{ks.nama_mitra}</p>
                      <p className="text-xs text-gray-500">{(ks.aset as any)?.nama_aset ?? '-'}</p>
                    </div>
                    <StatusBadge type="ks" value={ks.status} />
                  </div>
                ))}
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
    </div>
  )
}
