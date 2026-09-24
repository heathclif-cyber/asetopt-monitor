import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapPin, RefreshCw, Search } from 'lucide-react'
import { useAsetStore } from '@/store/asetStore'
import { useKonsesiStore } from '@/store/konsesiStore'
import { Aset } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { StatusBadge } from '@/components/common/StatusBadge'
import { TableSkeleton } from '@/components/common/LoadingSkeleton'

function hectares(value: number | null) {
  return value === null ? '—' : `${value.toLocaleString('id-ID', { maximumFractionDigits: 2 })} ha`
}

export function MasterAset() {
  const { daftarKonsesi, isLoading, error, fetchKonsesi } = useKonsesiStore()
  const { daftarAset, fetchAset } = useAsetStore()
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [kabupaten, setKabupaten] = useState('')
  const [onlyOptimised, setOnlyOptimised] = useState(false)
  const [page, setPage] = useState(1)
  const pageSize = 20

  useEffect(() => { void fetchKonsesi(); fetchAset() }, [])

  const asetByKonsesi = useMemo(() => {
    const map = new Map<string, Aset[]>()
    for (const aset of daftarAset) {
      for (const link of aset.aset_konsesi ?? []) map.set(link.konsesi_key, [...(map.get(link.konsesi_key) ?? []), aset])
    }
    return map
  }, [daftarAset])
  const kabupatenOptions = useMemo(() => [...new Set(daftarKonsesi.map(item => item.kabupaten).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b, 'id-ID')), [daftarKonsesi])
  const filtered = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('id-ID')
    return daftarKonsesi.filter(item =>
      (!kabupaten || item.kabupaten === kabupaten) &&
      (!onlyOptimised || asetByKonsesi.has(item.key)) &&
      (!needle || `${item.nama} ${item.lokasi} ${item.nomor_alas_hak ?? ''} ${item.kecamatan ?? ''} ${(asetByKonsesi.get(item.key) ?? []).map(a => `${a.kode_aset} ${a.nama_aset}`).join(' ')}`.toLocaleLowerCase('id-ID').includes(needle)))
  }, [daftarKonsesi, kabupaten, onlyOptimised, search, asetByKonsesi])
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)
  const unlinkedAset = daftarAset.filter(a => !a.aset_konsesi?.length).length

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Master Aset</h1>
        <p className="text-sm text-gray-500">Bersumber dari layer konsesi di Peta GIS. Ubah sertifikat, luas, dan batas bidang melalui Peta Aset.</p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => navigate('/master/aset/dioptimalkan')}>Aset dioptimalkan</Button>
        <Button variant="outline" disabled={isLoading} onClick={() => { void fetchKonsesi(true); fetchAset() }}><RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} /> Sinkronkan GIS</Button>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {[
        ['Konsesi GIS', daftarKonsesi.length.toLocaleString('id-ID'), `${daftarKonsesi.filter(item => item.record_state === 'draf').length} masih draf`],
        ['Luas konsesi', hectares(daftarKonsesi.reduce((sum, item) => sum + (item.luas_gis_ha ?? 0), 0)), 'dari poligon GIS'],
        ['Konsesi dioptimalkan', asetByKonsesi.size.toLocaleString('id-ID'), 'memiliki aset dioptimalkan'],
        ['Aset belum ditautkan', unlinkedAset.toLocaleString('id-ID'), 'dari menu Aset Dioptimalkan'],
      ].map(([label, value, note]) => <div key={label} className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2.5">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
        <p className="mt-1 text-lg font-bold tabular-nums text-[#1B4F72]">{value}</p>
        <p className="mt-0.5 text-[10px] text-slate-500">{note}</p>
      </div>)}
    </div>

    <div className="flex flex-wrap items-center gap-3">
      <div className="relative w-full max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input className="pl-9" placeholder="Cari sertifikat, kebun, kecamatan, atau aset" value={search} onChange={event => { setSearch(event.target.value); setPage(1) }} />
      </div>
      <select className="h-10 rounded-md border border-input bg-white px-3 text-sm" value={kabupaten} onChange={event => { setKabupaten(event.target.value); setPage(1) }}>
        <option value="">Semua kabupaten/kota</option>
        {kabupatenOptions.map(name => <option key={name} value={name}>{name}</option>)}
      </select>
      <label className="flex items-center gap-2 text-sm text-gray-700"><input type="checkbox" checked={onlyOptimised} onChange={event => { setOnlyOptimised(event.target.checked); setPage(1) }} /> Hanya yang memiliki aset dioptimalkan</label>
      <span className="text-xs text-gray-500">{filtered.length} konsesi</span>
    </div>

    {error && <p className="rounded bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <div className="overflow-x-auto rounded-xl border bg-white">
      {isLoading && !daftarKonsesi.length ? <div className="p-6"><TableSkeleton /></div> : <table className="w-full min-w-[980px] text-sm">
        <thead><tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-600">
          <th className="px-4 py-3">Sertifikat / bidang</th>
          <th className="px-4 py-3">Kebun</th>
          <th className="px-4 py-3">Wilayah</th>
          <th className="px-4 py-3 text-right">Luas GIS</th>
          <th className="px-4 py-3">Aset dioptimalkan</th>
          <th className="px-4 py-3"></th>
        </tr></thead>
        <tbody className="divide-y">
          {paginated.map(item => {
            const linked = asetByKonsesi.get(item.key) ?? []
            return <tr key={item.key} className="align-top hover:bg-gray-50">
              <td className="px-4 py-3">
                <p className="font-medium text-gray-900">{item.nama}{item.record_state === 'draf' && <span className="ml-1.5 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800">Draf</span>}</p>
                <p className="text-xs text-gray-500">{[item.jenis_alas_hak, item.nomor_alas_hak && `No. ${item.nomor_alas_hak}`].filter(Boolean).join(' ') || 'Alas hak belum diisi'}{item.luas_dokumen_ha !== null && ` · dokumen ${hectares(item.luas_dokumen_ha)}`}</p>
              </td>
              <td className="px-4 py-3 text-gray-700">{item.lokasi || '—'}</td>
              <td className="px-4 py-3 text-gray-700"><p>{item.kecamatan ? `Kec. ${item.kecamatan}` : '—'}</p><p className="text-xs text-gray-500">{[item.kabupaten, item.provinsi].filter(Boolean).join(', ')}</p></td>
              <td className="px-4 py-3 text-right tabular-nums">{hectares(item.luas_gis_ha)}</td>
              <td className="px-4 py-3">{linked.length ? <ul className="space-y-1">{linked.map(aset => <li key={aset.id} className="flex items-center gap-2"><span className="font-mono text-[11px] text-gray-500">{aset.kode_aset}</span><span className="text-gray-800">{aset.nama_aset}</span><StatusBadge type="aset" value={aset.status} /></li>)}</ul> : <span className="text-xs text-gray-400">—</span>}</td>
              <td className="px-4 py-3 text-right"><Button variant="ghost" size="icon" title="Lihat di peta" onClick={() => navigate(`/gis?bbox=${encodeURIComponent(item.bbox)}`)}><MapPin size={15} /></Button></td>
            </tr>
          })}
          {!isLoading && filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-500">{daftarKonsesi.length ? 'Tidak ada konsesi yang cocok.' : 'Belum ada layer konsesi di Peta GIS.'}</td></tr>}
        </tbody>
      </table>}
    </div>

    {totalPages > 1 && <div className="flex items-center justify-between text-sm text-gray-600">
      <span>Menampilkan {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} dari {filtered.length}</span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Sebelumnya</Button>
        <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Berikutnya</Button>
      </div>
    </div>}
  </div>
}
