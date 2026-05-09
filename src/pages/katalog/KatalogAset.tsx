import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useAsetStore } from '@/store/asetStore'
import { useNJOPStore } from '@/store/njopStore'
import { useKJPPStore } from '@/store/kjppStore'
import { useTimelineStore } from '@/store/timelineStore'
import { useKerjaSamaStore } from '@/store/kerjaSamaStore'
import { usePBBStore } from '@/store/pbbStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { KatalogCard } from '@/components/katalog/KatalogCard'
import { StatusBadge } from '@/components/common/StatusBadge'
import { CardSkeleton } from '@/components/common/LoadingSkeleton'
import { EmptyState } from '@/components/common/EmptyState'
import { hitungPotensiNJOP, PotensiResult } from '@/utils/potensiUtils'
import { formatRupiah } from '@/lib/utils'
import { Search, LayoutGrid, List } from 'lucide-react'
import type { Aset, NJOP, PenilaianKJPP, TimelineProgram, ProspekMitra, KerjaSama, PBB } from '@/types'

interface CatalogEntry {
  aset: Aset
  njopTerbaru: NJOP | null
  kjppTerbaru: PenilaianKJPP | null
  potensi: PotensiResult | null
  timeline: TimelineProgram[]
  timelineProgress: number
  prospek: ProspekMitra[]
  kerjaSama: KerjaSama | null
  pbbTerbaru: PBB | null
}

const PAGE_SIZE = 12

export function KatalogAset() {
  const { daftarAset, isLoading: asetLoading, fetchAset } = useAsetStore()
  const { dataNJOP, fetchAllNJOP } = useNJOPStore()
  const { dataPenilaian, fetchAllKJPP } = useKJPPStore()
  const { allTimeline, allProspek, fetchAllTimeline } = useTimelineStore()
  const { daftarKS, fetchKS } = useKerjaSamaStore()
  const { dataPBB, fetchAllPBB } = usePBBStore()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('semua')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [page, setPage] = useState(1)

  const location = useLocation()

  useEffect(() => {
    fetchAset()
    fetchAllNJOP()
    fetchAllKJPP()
    fetchAllTimeline()
    fetchKS()
    fetchAllPBB()
  }, [])

  useEffect(() => {
    fetchAllNJOP()
    fetchAllKJPP()
    fetchAllTimeline()
    fetchAllPBB()
  }, [location.key])

  const entries: CatalogEntry[] = useMemo(() => {
    return daftarAset.map(aset => {
      const njopList = dataNJOP[aset.id] ?? []
      const njopTerbaru = njopList[0] ?? null

      const kjppList = dataPenilaian[aset.id] ?? []
      const kjppTerbaru = kjppList[0] ?? null

      let potensi: PotensiResult | null = null
      if (njopTerbaru && (aset.luas_tanah_m2 || aset.luas_bangunan_m2)) {
        potensi = hitungPotensiNJOP({
          njopTanahPerM2: njopTerbaru.nilai_tanah_per_m2,
          luasTanahM2: aset.luas_tanah_m2 ?? 0,
          njopBangunanPerM2: njopTerbaru.nilai_bangunan_per_m2,
          luasBangunanM2: aset.luas_bangunan_m2 ?? 0,
        })
      }

      const timeline = allTimeline.filter(t => t.aset_id === aset.id).sort((a, b) => a.urutan - b.urutan)
      const completed = timeline.filter(t => t.status === 'selesai').length
      const timelineProgress = timeline.length > 0 ? Math.round((completed / timeline.length) * 100) : 0

      const prospek = allProspek.filter(p => p.aset_id === aset.id)
      const kerjaSama = daftarKS.find(k => k.aset_id === aset.id) ?? null

      const pbbList = (dataPBB[aset.id] ?? []).sort((a, b) => b.tahun - a.tahun)
      const pbbTerbaru = pbbList[0] ?? null

      return { aset, njopTerbaru, kjppTerbaru, potensi, timeline, timelineProgress, prospek, kerjaSama, pbbTerbaru }
    })
  }, [daftarAset, dataNJOP, dataPenilaian, allTimeline, allProspek, daftarKS, dataPBB])

  const filtered = useMemo(() => {
    return entries.filter(e => {
      const matchSearch =
        e.aset.nama_aset.toLowerCase().includes(search.toLowerCase()) ||
        e.aset.kode_aset.toLowerCase().includes(search.toLowerCase())
      const matchStatus = statusFilter === 'semua' || e.aset.status === statusFilter
      return matchSearch && matchStatus
    })
  }, [entries, search, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Reset page on filter change
  useEffect(() => { setPage(1) }, [search, statusFilter])

  const stats = useMemo(() => {
    const totalPotensi = entries.reduce((sum, e) => sum + (e.potensi?.totalPotensi ?? 0), 0)
    const withKJPP = entries.filter(e => e.kjppTerbaru).length
    const withKS = entries.filter(e => e.kerjaSama && ['aktif', 'sp1', 'sp2', 'sp3'].includes(e.kerjaSama.status)).length
    return { total: entries.length, totalPotensi, withKJPP, withKS }
  }, [entries])

  const isLoading = asetLoading

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Katalog Aset</h1>
        <p className="text-sm text-gray-500">Portofolio lengkap seluruh aset — NJOP, KJPP, timeline, prospek, kerja sama, dan PBB dalam satu tampilan</p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Total Aset" value={String(stats.total)} />
        <StatCard label="Total Potensi" value={formatRupiah(stats.totalPotensi)} highlight />
        <StatCard label="Aset dgn KJPP" value={String(stats.withKJPP)} />
        <StatCard label="Aset Aktif KS" value={String(stats.withKS)} />
      </div>

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Cari aset..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {['semua', 'pipeline', 'prospek', 'negosiasi', 'aktif_ks', 'selesai'].map(s => (
            <Button
              key={s}
              variant={statusFilter === s ? 'default' : 'outline'}
              size="sm"
              onClick={() => setStatusFilter(s)}
              className="text-xs h-8"
            >
              {s === 'semua' ? 'Semua' : <StatusBadge type="aset" value={s} />}
            </Button>
          ))}
          <div className="w-px h-6 bg-gray-200 mx-1 hidden sm:block" />
          <Button
            variant={viewMode === 'grid' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('grid')}
            className="h-8"
          >
            <LayoutGrid size={13} />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setViewMode('list')}
            className="h-8"
          >
            <List size={13} />
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-white p-6">
              <CardSkeleton />
            </div>
          ))}
        </div>
      ) : paginated.length === 0 ? (
        <EmptyState
          title="Belum ada data"
          description={search || statusFilter !== 'semua' ? 'Tidak ada aset yang sesuai dengan filter. Coba ubah kriteria pencarian.' : 'Tambahkan Data Aset di Master Data agar muncul di katalog.'}
        />
      ) : viewMode === 'grid' ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {paginated.map(entry => (
              <KatalogCard key={entry.aset.id} {...entry} />
            ))}
          </div>
          <PaginationBar page={page} totalPages={totalPages} total={filtered.length} onPageChange={setPage} />
        </>
      ) : (
        <>
          <div className="bg-white rounded-xl border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50 text-gray-600 text-xs uppercase">
                  <th className="text-left px-4 py-3">Aset</th>
                  <th className="text-right px-4 py-3 hidden lg:table-cell">Luas Tanah</th>
                  <th className="text-right px-4 py-3 hidden lg:table-cell">Luas Bangunan</th>
                  <th className="text-right px-4 py-3">Potensi NJOP</th>
                  <th className="text-center px-4 py-3 hidden md:table-cell">Status</th>
                  <th className="text-center px-4 py-3 hidden md:table-cell">Timeline</th>
                  <th className="text-center px-4 py-3 hidden md:table-cell">KS</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {paginated.map(entry => (
                  <tr key={entry.aset.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{entry.aset.nama_aset}</div>
                      <div className="text-xs text-gray-500 font-mono">{entry.aset.kode_aset}</div>
                      {entry.aset.alamat && (
                        <div className="text-xs text-gray-400 truncate max-w-[240px]">{entry.aset.alamat}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right hidden lg:table-cell text-gray-600 text-xs">
                      {entry.aset.luas_tanah_m2 != null ? `${new Intl.NumberFormat('id-ID').format(entry.aset.luas_tanah_m2)} m²` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right hidden lg:table-cell text-gray-600 text-xs">
                      {entry.aset.luas_bangunan_m2 != null ? `${new Intl.NumberFormat('id-ID').format(entry.aset.luas_bangunan_m2)} m²` : '-'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {entry.potensi ? (
                        <span className="font-medium text-[#117A65] text-xs">{formatRupiah(entry.potensi.totalPotensi)}</span>
                      ) : (
                        <span className="text-gray-400 text-xs">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center hidden md:table-cell">
                      <StatusBadge type="aset" value={entry.aset.status} />
                    </td>
                    <td className="px-4 py-3 text-center hidden md:table-cell">
                      {entry.timeline.length > 0 ? (
                        <span className="text-xs font-medium text-gray-600">{entry.timelineProgress}%</span>
                      ) : (
                        <span className="text-gray-300 text-xs">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center hidden md:table-cell">
                      {entry.kerjaSama ? (
                        <StatusBadge type="ks" value={entry.kerjaSama.status} />
                      ) : (
                        <span className="text-gray-300 text-xs">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <PaginationBar page={page} totalPages={totalPages} total={filtered.length} onPageChange={setPage} />
        </>
      )}
    </div>
  )
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-white rounded-xl border px-4 py-3">
      <p className="text-xs text-gray-500 mb-0.5">{label}</p>
      <p className={`text-sm font-bold ${highlight ? 'text-[#117A65]' : 'text-gray-900'}`}>{value}</p>
    </div>
  )
}

function PaginationBar({ page, totalPages, total, onPageChange }: {
  page: number
  totalPages: number
  total: number
  onPageChange: (p: number) => void
}) {
  return (
    <div className="flex items-center justify-between text-sm text-gray-500 pt-1">
      <span>
        Menampilkan {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} dari {total}
      </span>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page === 1} onClick={() => onPageChange(page - 1)}>
          Sebelumnya
        </Button>
        <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => onPageChange(page + 1)}>
          Berikutnya
        </Button>
      </div>
    </div>
  )
}
