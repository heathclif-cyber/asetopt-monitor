import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Plus, Search } from 'lucide-react'
import { useKonsesiStore } from '@/store/konsesiStore'
import { useKonsesiMasterStore } from '@/store/konsesiMasterStore'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SearchableSelect } from '@/components/common/SearchableSelect'
import { TableSkeleton } from '@/components/common/LoadingSkeleton'
import { KonsesiPanel } from '@/components/aset/KonsesiPanel'
import { konsesiLabel } from '@/components/aset/KonsesiPicker'
import { formatAngka, formatRupiah, formatTanggal } from '@/lib/utils'

// NJOP and PBB belong to the concession (bidang tanah): each SPPT row is
// entered once in the concession panel and reused by potensi and KS PBB.
export function DataNJOP() {
  const { daftarKonsesi, fetchKonsesi } = useKonsesiStore()
  const { semuaSPPT, isLoadingSemua, fetchAllSPPT } = useKonsesiMasterStore()
  const role = useAuthStore(state => state.user?.role)
  const canEdit = role !== 'viewer' && role !== 'viewer_aset'
  const [search, setSearch] = useState('')
  const [tahun, setTahun] = useState('')
  const [panelKey, setPanelKey] = useState<string | null>(null)
  const [addKey, setAddKey] = useState('')

  useEffect(() => { void fetchKonsesi(); void fetchAllSPPT() }, [])

  const konsesiByKey = useMemo(() => new Map(daftarKonsesi.map(item => [item.key, item])), [daftarKonsesi])
  const tahunOptions = useMemo(() => [...new Set(semuaSPPT.map(row => row.tahun))].sort((a, b) => b - a), [semuaSPPT])
  const rows = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase('id-ID')
    return semuaSPPT.filter(row => {
      const konsesi = konsesiByKey.get(row.konsesi_key)
      return (!tahun || row.tahun === Number(tahun)) &&
        (!needle || `${konsesi?.nama ?? ''} ${konsesi?.lokasi ?? ''} ${konsesi?.kabupaten ?? ''} ${row.no_sppt ?? ''}`.toLocaleLowerCase('id-ID').includes(needle))
    })
  }, [semuaSPPT, konsesiByKey, search, tahun])
  const konsesiWithSPPT = new Set(semuaSPPT.map(row => row.konsesi_key)).size

  return <div className="space-y-5">
    <div>
      <h1 className="text-2xl font-bold text-gray-900">NJOP & SPPT</h1>
      <p className="text-sm text-gray-500">NJOP dan PBB per bidang konsesi. {konsesiWithSPPT} dari {daftarKonsesi.length} bidang sudah memiliki SPPT/NJOP. PBB kerja sama dihitung proporsional dari luas KS terhadap bidang.</p>
    </div>

    <div className="flex flex-wrap items-end gap-3">
      <div className="relative w-full max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input className="pl-9" placeholder="Cari sertifikat, kebun, kabupaten, atau no. SPPT" value={search} onChange={event => setSearch(event.target.value)} />
      </div>
      <select className="h-10 rounded-md border border-input bg-white px-3 text-sm" value={tahun} onChange={event => setTahun(event.target.value)}>
        <option value="">Semua tahun</option>
        {tahunOptions.map(year => <option key={year} value={year}>{year}</option>)}
      </select>
      {canEdit && <div className="flex min-w-[320px] flex-1 items-center gap-2 sm:justify-end">
        <div className="w-full max-w-sm">
          <SearchableSelect value={addKey} onValueChange={setAddKey} placeholder="Pilih bidang untuk isi SPPT/NJOP" searchPlaceholder="Cari sertifikat, kebun, atau kabupaten..."
            options={daftarKonsesi.map(item => ({ value: item.key, label: konsesiLabel(item), searchText: `${item.nama} ${item.lokasi} ${item.kabupaten ?? ''}`, description: [item.kecamatan && `Kec. ${item.kecamatan}`, item.kabupaten].filter(Boolean).join(', ') || undefined }))} />
        </div>
        <Button disabled={!addKey} className="bg-[#1B4F72]" onClick={() => setPanelKey(addKey)}><Plus size={15} /> Isi SPPT</Button>
      </div>}
    </div>

    <div className="overflow-x-auto rounded-xl border bg-white">
      {isLoadingSemua && !semuaSPPT.length ? <div className="p-6"><TableSkeleton /></div> : <table className="w-full min-w-[980px] text-sm">
        <thead><tr className="border-b bg-gray-50 text-left text-xs uppercase text-gray-600">
          <th className="px-4 py-3">Bidang konsesi</th>
          <th className="px-4 py-3">Tahun / SPPT</th>
          <th className="px-4 py-3 text-right">Luas SPPT (m²)</th>
          <th className="px-4 py-3 text-right">NJOP tanah/m²</th>
          <th className="px-4 py-3 text-right">NJOP bangunan/m²</th>
          <th className="px-4 py-3 text-right">PBB</th>
          <th className="px-4 py-3">Status</th>
          <th className="px-4 py-3" />
        </tr></thead>
        <tbody className="divide-y">
          {rows.map(row => {
            const konsesi = konsesiByKey.get(row.konsesi_key)
            return <tr key={row.id} className="align-top hover:bg-gray-50">
              <td className="px-4 py-3"><p className="font-medium text-gray-900">{konsesi?.nama ?? 'Konsesi tidak ditemukan di GIS'}</p><p className="text-xs text-gray-500">{[konsesi?.lokasi, konsesi?.kabupaten].filter(Boolean).join(' · ')}</p></td>
              <td className="px-4 py-3"><p className="font-medium">{row.tahun}</p><p className="font-mono text-[11px] text-gray-500">{row.no_sppt ?? (row.nilai_pbb === null ? 'NJOP saja' : '—')}</p></td>
              <td className="px-4 py-3 text-right tabular-nums">{row.luas_tanah_sppt_m2 || row.luas_bangunan_sppt_m2 ? <>{formatAngka(row.luas_tanah_sppt_m2)}<p className="text-[11px] text-gray-500">bgn {formatAngka(row.luas_bangunan_sppt_m2)}</p></> : '—'}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatRupiah(row.njop_tanah_per_m2)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{formatRupiah(row.njop_bangunan_per_m2)}</td>
              <td className="px-4 py-3 text-right tabular-nums">{row.nilai_pbb === null ? '—' : formatRupiah(row.nilai_pbb)}{row.tgl_jatuh_tempo && <p className="text-[11px] text-gray-500">JT {formatTanggal(row.tgl_jatuh_tempo)}</p>}</td>
              <td className="px-4 py-3">{row.nilai_pbb === null ? <span className="text-xs text-gray-400">—</span> : row.status_bayar === 'lunas' ? <span className="text-emerald-700">Lunas</span> : <span className="text-amber-700">Belum</span>}</td>
              <td className="px-4 py-3 text-right"><Button variant="ghost" size="icon" title="Kelola di panel bidang" onClick={() => setPanelKey(row.konsesi_key)}><ClipboardList size={15} /></Button></td>
            </tr>
          })}
          {!isLoadingSemua && rows.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-500">{semuaSPPT.length ? 'Tidak ada data yang cocok.' : 'Belum ada SPPT/NJOP. Pilih bidang di atas untuk mulai mengisi.'}</td></tr>}
        </tbody>
      </table>}
    </div>
    <KonsesiPanel konsesiKey={panelKey} initialTab="sppt" onClose={() => setPanelKey(null)} />
  </div>
}
