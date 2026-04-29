import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAsetStore } from '@/store/asetStore'
import { useNJOPStore } from '@/store/njopStore'
import { useKJPPStore } from '@/store/kjppStore'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { StatusBadge } from '@/components/common/StatusBadge'
import { TableSkeleton } from '@/components/common/LoadingSkeleton'
import { EmptyState } from '@/components/common/EmptyState'
import { hitungPotensiNJOP } from '@/utils/potensiUtils'
import { formatAngka, formatTanggal, formatRupiah } from '@/lib/utils'
import { Info, TrendingUp, TrendingDown, ChevronDown, ChevronRight } from 'lucide-react'

type SortKey = 'nama' | 'potensiNJOP' | 'kjpp' | 'luas'
type SortDir = 'asc' | 'desc'

export function PotensiPendapatan() {
  const { daftarAset, isLoading, fetchAset } = useAsetStore()
  const { dataNJOP, fetchAllNJOP } = useNJOPStore()
  const { dataPenilaian, fetchAllKJPP } = useKJPPStore()
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('potensiNJOP')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const location = useLocation()

  useEffect(() => { fetchAset(); fetchAllNJOP(); fetchAllKJPP() }, [])
  useEffect(() => { fetchAllNJOP(); fetchAllKJPP() }, [location.key])

  const pipelineAset = daftarAset.filter(a => ['pipeline', 'prospek', 'negosiasi'].includes(a.status))

  const rows = useMemo(() => {
    return pipelineAset
      .filter(a => a.nama_aset.toLowerCase().includes(search.toLowerCase()) || a.kode_aset.toLowerCase().includes(search.toLowerCase()))
      .map(a => {
        const njopList = dataNJOP[a.id] ?? []
        const njopTerbaru = njopList[0] ?? null
        const kjppList = dataPenilaian[a.id] ?? []
        const kjppTerbaru = kjppList[0] ?? null

        let potensiTanah = 0, potensiBangunan = 0, totalPotensiNJOP = 0
        if (njopTerbaru) {
          const r = hitungPotensiNJOP({
            njopTanahPerM2: njopTerbaru.nilai_tanah_per_m2,
            luasTanahM2: a.luas_tanah_m2 ?? 0,
            njopBangunanPerM2: njopTerbaru.nilai_bangunan_per_m2,
            luasBangunanM2: a.luas_bangunan_m2 ?? 0,
          })
          potensiTanah = r.potensiTanah
          potensiBangunan = r.potensiBangunan
          totalPotensiNJOP = r.totalPotensi
        }

        let kjppStatus = 'Belum Dinilai'
        let kjppVariant = 'secondary'
        if (kjppTerbaru) {
          if (kjppTerbaru.berlaku_hingga && new Date(kjppTerbaru.berlaku_hingga) < new Date()) {
            kjppStatus = 'Kadaluarsa'; kjppVariant = 'warning'
          } else {
            kjppStatus = 'Tersedia'; kjppVariant = 'success'
          }
        }

        const selisih = kjppTerbaru ? kjppTerbaru.total_nilai - totalPotensiNJOP : null

        return { a, njopTerbaru, kjppTerbaru, potensiTanah, potensiBangunan, totalPotensiNJOP, kjppStatus, kjppVariant, selisih }
      })
      .sort((x, y) => {
        const dir = sortDir === 'asc' ? 1 : -1
        if (sortKey === 'nama') return dir * x.a.nama_aset.localeCompare(y.a.nama_aset)
        if (sortKey === 'potensiNJOP') return dir * (x.totalPotensiNJOP - y.totalPotensiNJOP)
        if (sortKey === 'kjpp') return dir * ((x.kjppTerbaru?.total_nilai ?? 0) - (y.kjppTerbaru?.total_nilai ?? 0))
        if (sortKey === 'luas') return dir * ((x.a.luas_tanah_m2 ?? 0) - (y.a.luas_tanah_m2 ?? 0))
        return 0
      })
  }, [pipelineAset, dataNJOP, dataPenilaian, search, sortKey, sortDir])

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return null
    return sortDir === 'asc' ? <ChevronDown size={12} /> : <ChevronRight size={12} className="rotate-90" />
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Potensi Pendapatan</h1>
        <p className="text-sm text-gray-500">Estimasi potensi berdasarkan NJOP dan penilaian KJPP (Jalur A)</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 flex items-start gap-2 text-sm">
        <Info size={15} className="text-blue-600 mt-0.5 shrink-0" />
        <div className="text-blue-700">
          <strong>Rumus:</strong> Potensi Tanah = NJOP Tanah/m² × Luas Tanah × 3,33% | Potensi Bangunan = NJOP Bangunan/m² × Luas Bangunan × 6,64%
        </div>
      </div>

      <div className="relative max-w-sm">
        <Input placeholder="Cari aset..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        {isLoading ? (
          <div className="p-6"><TableSkeleton /></div>
        ) : rows.length === 0 ? (
          <EmptyState title="Belum ada data" description="Tambahkan data NJOP untuk aset pipeline agar potensi pendapatan dapat dihitung." />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-gray-600 text-xs uppercase">
                <th className="text-left px-4 py-3 w-6"></th>
                <th className="text-left px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort('nama')}>
                  <span className="flex items-center gap-1">Aset <SortIcon k="nama" /></span>
                </th>
                <th className="text-right px-4 py-3 hidden lg:table-cell cursor-pointer select-none" onClick={() => toggleSort('luas')}>
                  <span className="flex items-center justify-end gap-1">Luas Tanah (m²) <SortIcon k="luas" /></span>
                </th>
                <th className="text-right px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort('potensiNJOP')}>
                  <span className="flex items-center justify-end gap-1">Potensi NJOP <SortIcon k="potensiNJOP" /></span>
                </th>
                <th className="text-right px-4 py-3 cursor-pointer select-none" onClick={() => toggleSort('kjpp')}>
                  <span className="flex items-center justify-end gap-1">Nilai KJPP <SortIcon k="kjpp" /></span>
                </th>
                <th className="text-right px-4 py-3">Selisih</th>
                <th className="text-center px-4 py-3">Status KJPP</th>
                <th className="text-left px-4 py-3 hidden md:table-cell">NJOP Tahun</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map(({ a, njopTerbaru, kjppTerbaru, potensiTanah, potensiBangunan, totalPotensiNJOP, kjppStatus, kjppVariant, selisih }) => (
                <>
                  <tr key={a.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}>
                    <td className="px-4 py-3 text-gray-400">
                      {expandedId === a.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{a.nama_aset}</div>
                      <div className="text-xs text-gray-500">{a.kode_aset}</div>
                    </td>
                    <td className="px-4 py-3 text-right hidden lg:table-cell text-gray-600">
                      {a.luas_tanah_m2 ? `${formatAngka(a.luas_tanah_m2)} m²` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {njopTerbaru
                        ? (a.luas_tanah_m2
                          ? <CurrencyDisplay value={totalPotensiNJOP} size="sm" className="font-semibold text-[#117A65]" />
                          : <span className="text-amber-600 text-xs font-medium">Luas belum diisi</span>)
                        : <span className="text-gray-400 text-xs">Belum ada NJOP</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {kjppTerbaru
                        ? <CurrencyDisplay value={kjppTerbaru.total_nilai} size="sm" className="font-semibold text-[#5B2C6F]" />
                        : <span className="text-gray-400 text-xs">-</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {selisih != null ? (
                        <span className={`flex items-center justify-end gap-1 text-xs font-medium ${selisih >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {selisih >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                          {formatRupiah(Math.abs(selisih))}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={kjppVariant as any}>{kjppStatus}</Badge>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-gray-500 text-xs">
                      {njopTerbaru ? `${njopTerbaru.tahun} (${njopTerbaru.sumber ?? '-'})` : '-'}
                    </td>
                  </tr>
                  {expandedId === a.id && (
                    <tr className="bg-green-50">
                      <td colSpan={8} className="px-8 py-4">
                        {!njopTerbaru && (
                          <p className="text-sm text-gray-500 italic mb-2">Belum ada data NJOP untuk aset ini. Tambahkan di Master Data → Data NJOP.</p>
                        )}
                        {njopTerbaru && !a.luas_tanah_m2 && (
                          <p className="text-sm text-amber-600 font-medium mb-2">⚠ Luas tanah belum diisi. Lengkapi di Master Data → Data Aset agar potensi dapat dihitung.</p>
                        )}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <p className="text-xs text-gray-500 mb-1">NJOP Tanah/m²</p>
                            <CurrencyDisplay value={njopTerbaru?.nilai_tanah_per_m2} size="sm" />
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Potensi Tanah</p>
                            <CurrencyDisplay value={potensiTanah} size="sm" className="text-[#117A65] font-medium" />
                            <p className="text-xs text-gray-400">× {formatAngka(a.luas_tanah_m2 ?? 0)} m² × 3,33%</p>
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-1">NJOP Bangunan/m²</p>
                            <CurrencyDisplay value={njopTerbaru?.nilai_bangunan_per_m2} size="sm" />
                          </div>
                          <div>
                            <p className="text-xs text-gray-500 mb-1">Potensi Bangunan</p>
                            <CurrencyDisplay value={potensiBangunan} size="sm" className="text-[#117A65] font-medium" />
                            <p className="text-xs text-gray-400">× {formatAngka(a.luas_bangunan_m2 ?? 0)} m² × 6,64%</p>
                          </div>
                        </div>
                        {kjppTerbaru && (
                          <div className="mt-3 pt-3 border-t grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <p className="text-xs text-gray-500 mb-1">KJPP</p>
                              <p className="font-medium">{kjppTerbaru.nama_kjpp ?? '-'}</p>
                              <p className="text-xs text-gray-400">No. {kjppTerbaru.no_laporan ?? '-'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 mb-1">Tgl Penilaian</p>
                              <p>{formatTanggal(kjppTerbaru.tgl_penilaian)}</p>
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 mb-1">Nilai Tanah KJPP</p>
                              <CurrencyDisplay value={kjppTerbaru.nilai_tanah} size="sm" className="text-[#5B2C6F] font-medium" />
                            </div>
                            <div>
                              <p className="text-xs text-gray-500 mb-1">Nilai Bangunan KJPP</p>
                              <CurrencyDisplay value={kjppTerbaru.nilai_bangunan} size="sm" className="text-[#5B2C6F] font-medium" />
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
