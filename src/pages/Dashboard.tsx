import { useEffect, useMemo } from 'react'
import { useAsetStore } from '@/store/asetStore'
import { useKerjaSamaStore } from '@/store/kerjaSamaStore'
import { useKompensasiStore } from '@/store/kompensasiStore'
import { useNotifikasiStore } from '@/store/notifikasiStore'
import { useNJOPStore } from '@/store/njopStore'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { StatusBadge } from '@/components/common/StatusBadge'
import { formatTanggal, hitungSisaHari } from '@/lib/utils'
import { hitungPotensiNJOP } from '@/utils/potensiUtils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line
} from 'recharts'
import { Building2, Handshake, Clock, TrendingUp, AlertTriangle } from 'lucide-react'

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

    return { totalAset, asetPipeline, asetAktifKS, totalPotensiNJOP }
  }, [daftarAset, dataNJOP])

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

  const trendData = useMemo(() => {
    const byBulan: Record<string, number> = {}
    allKompensasi.forEach(k => {
      const bulan = k.tgl_jatuh_tempo.slice(0, 7)
      if (!byBulan[bulan]) byBulan[bulan] = 0
      byBulan[bulan] += k.nominal
    })
    return Object.entries(byBulan)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([bulan, total]) => ({
        bulan: new Date(bulan + '-01').toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }),
        total: Math.round(total / 1000000),
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

        {/* Line chart tren kompensasi */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Tren Kompensasi per Bulan (Juta Rp)</CardTitle>
          </CardHeader>
          <CardContent>
            {trendData.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">Belum ada data kompensasi</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={trendData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="bulan" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => [`Rp ${v}jt`, 'Total']} />
                  <Line type="monotone" dataKey="total" stroke="#5B2C6F" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
