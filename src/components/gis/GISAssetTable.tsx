import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, FileSpreadsheet, FileWarning, MapPin, RefreshCw, X } from 'lucide-react'
import { gisApi } from '@/lib/gisApi'
import { exportKonsesiExcel } from '@/utils/gisKonsesiExport'
import type { GISAdministrasiReference, GISAssetSummary } from '@/types/gis'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const layerLabel: Record<string, string> = {
  konsesi: 'konsesi', tanaman: 'tanaman', hutan: 'kawasan hutan', opset: 'kerja sama', okupasi: 'okupasi',
}

function hectares(value: number | null) {
  return value === null ? '—' : `${value.toLocaleString('id-ID', { maximumFractionDigits: 2 })} ha`
}

function coordinates(item: GISAssetSummary) {
  return item.center_lat === null || item.center_lng === null
    ? 'Koordinat belum tersedia'
    : `${item.center_lat.toFixed(6)}, ${item.center_lng.toFixed(6)}`
}
const rightsLabel: Record<GISAssetSummary['rights_status'], string> = { berlaku: 'Berlaku', berakhir: 'Berakhir', belum_beralas_hak: 'Belum beralas hak', belum_lengkap: 'Data alas hak belum lengkap', belum_berlaku: 'Belum mulai berlaku', belum_diketahui: 'Masa berlaku belum diketahui' }
function localDate(value: string | null) { return value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Belum diisi' }

const REGION_LEVELS: { level: GISAdministrasiReference['level']; label: string }[] = [
  { level: 'provinsi', label: 'Provinsi' },
  { level: 'kabupaten_kota', label: 'Kabupaten/kota' },
  { level: 'kecamatan', label: 'Kecamatan' },
]

function DashboardMetric({ label, value, tone = 'slate', note }: { label: string; value: string; tone?: 'slate' | 'blue' | 'green' | 'amber'; note?: string }) {
  const tones = {
    slate: 'border-slate-200 bg-white text-slate-900',
    blue: 'border-blue-100 bg-blue-50/70 text-[#1B4F72]',
    green: 'border-emerald-100 bg-emerald-50/70 text-emerald-800',
    amber: 'border-amber-100 bg-amber-50/70 text-amber-800',
  }
  return <div className={`rounded-lg border px-3 py-2.5 ${tones[tone]}`}>
    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 text-lg font-bold leading-none tabular-nums">{value}</p>
    {note && <p className="mt-1 text-[10px] text-slate-500">{note}</p>}
  </div>
}

export function GISAssetTable({ onShowMap }: { onShowMap: (asset: GISAssetSummary) => void }) {
  const [items, setItems] = useState<GISAssetSummary[]>([])
  const [note, setNote] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedAsset, setSelectedAsset] = useState<GISAssetSummary | null>(null)
  const [exporting, setExporting] = useState(false)
  const [regions, setRegions] = useState<GISAdministrasiReference[]>([])
  // One selected code per level, ordered provinsi → kecamatan; the deepest one is the active filter.
  const [regionPath, setRegionPath] = useState<string[]>(['', '', ''])
  const activeDepth = regionPath.filter(Boolean).length - 1
  const activeRegion = activeDepth < 0 ? null : regions.find(region => region.level === REGION_LEVELS[activeDepth].level && region.region_code === regionPath[activeDepth]) ?? null

  const load = async () => {
    setLoading(true); setError('')
    try {
      const result = await gisApi.konsesiSummaries(activeRegion ? { level: activeRegion.level, code: activeRegion.region_code } : undefined)
      setItems(result.data); setNote(result.availability_note)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Ringkasan aset tidak dapat dimuat.')
    } finally { setLoading(false) }
  }

  useEffect(() => { void gisApi.administrasiReference().then(result => setRegions(result.data)).catch(() => setRegions([])) }, [])
  useEffect(() => { void load() }, [activeRegion?.level, activeRegion?.region_code])
  const regionOptions = (depth: number) => regions
    .filter(region => region.level === REGION_LEVELS[depth].level && (depth === 0 || region.parent_code === regionPath[depth - 1]))
    .sort((a, b) => a.region_name.localeCompare(b.region_name, 'id-ID'))
  const selectRegion = (depth: number, code: string) => setRegionPath(path => path.map((value, index) => index < depth ? value : index === depth ? code : ''))
  const regionLabel = regionPath.slice(0, activeDepth + 1).map((code, depth) => regions.find(region => region.level === REGION_LEVELS[depth].level && region.region_code === code)?.region_name ?? code).join(' › ')
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('id-ID')
    return items.filter(item => !needle || `${item.kode_aset} ${item.nama_aset} ${item.lokasi} ${item.konsesi_names.join(' ')}`.toLocaleLowerCase('id-ID').includes(needle))
  }, [items, query])
  const dashboard = useMemo(() => {
    const total = (field: keyof GISAssetSummary) => items.reduce((sum, item) => sum + (typeof item[field] === 'number' ? item[field] as number : 0), 0)
    return {
      count: items.length,
      konsesi: total('konsesi_area_ha'),
      hutan: total('hutan_area_ha'),
      tanaman: total('tanaman_area_ha'),
      okupasi: total('okupasi_area_ha'),
      kerjaSama: total('kerja_sama_area_ha'),
      tersedia: total('dapat_dimanfaatkan_area_ha'),
    }
  }, [items])
  const rights = useMemo(() => {
    const counts = { berlaku: 0, berakhir: 0, belum_beralas_hak: 0, belum_lengkap: 0, belum_berlaku: 0, belum_diketahui: 0 }
    const kinds = new Map<string, { total: number; berlaku: number; berakhir: number }>()
    for (const item of items) {
      counts[item.rights_status] += 1
      const name = item.jenis_alas_hak?.trim() || 'Belum diisi'
      const group = kinds.get(name) ?? { total: 0, berlaku: 0, berakhir: 0 }
      group.total += 1
      if (item.rights_status === 'berlaku' || item.rights_status === 'berakhir') group[item.rights_status] += 1
      kinds.set(name, group)
    }
    return { counts, kinds: [...kinds.entries()].sort((a, b) => b[1].total - a[1].total) }
  }, [items])

  return <div className="space-y-4">
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><div><h2 className="text-sm font-bold text-slate-900">Ringkasan GIS Konsesi</h2><p className="mt-0.5 text-xs text-slate-500">{activeRegion ? <>Akumulasi areal konsesi di <strong className="text-slate-700">{regionLabel}</strong>. Luas dihitung hanya bagian konsesi di dalam wilayah ini.</> : 'Akumulasi penggunaan areal dari seluruh konsesi yang tampil di tabel.'}</p></div>{activeRegion && <Button variant="ghost" size="sm" onClick={() => setRegionPath(['', '', ''])}><X size={14} /> Hapus filter wilayah</Button>}</div>
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-3">{REGION_LEVELS.map(({ label }, depth) => {
        const options = regionOptions(depth)
        return <label key={label} className="text-xs font-medium text-slate-600">{label}<select className="mt-1 h-9 w-full rounded-md border border-input bg-white px-2 text-sm text-slate-900 disabled:bg-slate-100 disabled:text-slate-400" value={regionPath[depth]} disabled={loading || (depth > 0 && !regionPath[depth - 1]) || options.length === 0} onChange={event => selectRegion(depth, event.target.value)}><option value="">{depth > 0 && !regionPath[depth - 1] ? `Pilih ${REGION_LEVELS[depth - 1].label.toLowerCase()} dulu` : options.length ? `Semua ${label.toLowerCase()}` : 'Data batas wilayah belum ada'}</option>{options.map(region => <option key={region.region_code} value={region.region_code}>{region.region_name}</option>)}</select></label>
      })}</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
        <DashboardMetric label="Konsesi" value={dashboard.count.toLocaleString('id-ID')} tone="blue" note="aset tanah" />
        <DashboardMetric label="Luas konsesi" value={hectares(dashboard.konsesi)} tone="blue" note="berdasarkan peta GIS, bukan konsesi resmi" />
        <DashboardMetric label="Kawasan hutan" value={hectares(dashboard.hutan)} tone="green" note="peta kawasan hutan" />
        <DashboardMetric label="Tanaman" value={hectares(dashboard.tanaman)} tone="green" />
        <DashboardMetric label="Okupasi" value={hectares(dashboard.okupasi)} tone="amber" />
        <DashboardMetric label="Kerja sama" value={hectares(dashboard.kerjaSama)} tone="amber" />
        <DashboardMetric label="Dapat dimanfaatkan" value={hectares(dashboard.tersedia)} tone="blue" />
      </div>
      <details className="mt-3 rounded-lg border border-blue-100 bg-white p-3"><summary className="cursor-pointer text-sm font-semibold text-[#1B4F72]">Detail lanjutan alas hak · status berlaku, berakhir, dan jenis alas hak</summary><div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6"><DashboardMetric label="Berlaku" value={String(rights.counts.berlaku)} tone="green" /><DashboardMetric label="Berakhir" value={String(rights.counts.berakhir)} tone="amber" /><DashboardMetric label="Belum beralas hak" value={String(rights.counts.belum_beralas_hak)} /><DashboardMetric label="Data belum lengkap" value={String(rights.counts.belum_lengkap)} /><DashboardMetric label="Belum mulai" value={String(rights.counts.belum_berlaku)} /><DashboardMetric label="Masa berlaku belum diketahui" value={String(rights.counts.belum_diketahui)} /></div><div className="mt-4 overflow-x-auto"><p className="mb-2 text-xs font-semibold text-slate-700">Rincian jenis alas hak</p><table className="w-full min-w-[450px] text-left text-xs"><thead><tr className="border-b text-slate-500"><th className="py-2">Jenis alas hak</th><th>Jumlah</th><th>Berlaku</th><th>Berakhir</th></tr></thead><tbody>{rights.kinds.map(([kind, count]) => <tr key={kind} className="border-b last:border-0"><td className="py-2">{kind}</td><td>{count.total}</td><td>{count.berlaku}</td><td>{count.berakhir}</td></tr>)}</tbody></table></div><p className="mt-2 text-xs text-slate-500">Dihitung per konsesi. Status hanya berlaku bila nomor dan jenis alas hak terisi serta tanggal berakhir atau masa tidak terbatas diketahui.</p></details>
    </section>
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0"><div><CardTitle>Tabel konsesi dan penggunaan areal</CardTitle><CardDescription>Satu baris berasal dari satu polygon konsesi KML. Draf tetap terlihat agar informasi yang kurang dapat dikelola; hanya data terbit yang menjadi catatan resmi.</CardDescription></div><div className="flex shrink-0 flex-wrap gap-2"><Button variant="outline" size="sm" disabled={loading || exporting || filtered.length === 0} title="Unduh tabel yang tampil (mengikuti pencarian) sebagai Excel" onClick={async () => { setExporting(true); try { await exportKonsesiExcel(filtered, query.trim(), activeRegion ? regionLabel : '') } catch (cause) { setError(cause instanceof Error ? cause.message : 'Gagal membuat file Excel.') } finally { setExporting(false) } }}><FileSpreadsheet size={15} /> {exporting ? 'Menyiapkan…' : 'Unduh Excel'}</Button><Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Muat ulang</Button></div></CardHeader>
      <CardContent className="space-y-3"><div className="sticky top-14 z-20 -mx-1 flex flex-wrap items-center gap-3 bg-white px-1 py-2 shadow-sm"><input value={query} onChange={event => setQuery(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm md:max-w-sm" placeholder="Cari nomor hak, nama, atau kebun" /><span className="text-xs text-slate-500">{filtered.length} konsesi</span></div><p className="rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><FileWarning className="mr-1 inline h-3.5 w-3.5" /><strong>Draf berbasis KML, bukan dokumen resmi.</strong> Luas dan status di tabel ini dihitung dari poligon peta GIS dan belum diverifikasi terhadap dokumen alas hak asli. File Excel yang diunduh memuat keterangan yang sama.</p>{note && <p className="rounded bg-blue-50 p-3 text-xs text-blue-950"><FileWarning className="mr-1 inline h-3.5 w-3.5" />{note}</p>}{error && <p className="rounded bg-red-50 p-3 text-sm text-red-800">{error}</p>}<div className="max-h-[calc(100vh-10rem)] overflow-auto rounded-md border"><table className="min-w-[1230px] w-full text-sm"><thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 shadow-sm"><tr><th className="px-3 py-3">Konsesi / lokasi</th><th className="px-3 py-3 text-right">Konsesi</th><th className="px-3 py-3 text-right">Tanaman</th><th className="px-3 py-3 text-right">Hutan</th><th className="px-3 py-3 text-right">Okupasi</th><th className="px-3 py-3 text-right">Kerja sama</th><th className="px-3 py-3 text-right">Estimasi dapat dimanfaatkan</th><th className="px-3 py-3">Status data</th><th className="px-3 py-3"></th></tr></thead><tbody>{loading ? <tr><td className="px-3 py-7 text-center text-slate-500" colSpan={9}>Menghitung ringkasan konsesi…</td></tr> : filtered.map(item => <tr key={item.id} className="border-t align-top hover:bg-slate-50"><td className="p-0"><button type="button" className="block w-full px-3 py-3 text-left outline-none hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1B4F72]" onClick={() => setSelectedAsset(item)}><p className="font-medium text-slate-900">{item.kode_aset} · {item.nama_aset}</p><p className="mt-0.5 max-w-[270px] text-xs text-slate-500">{item.lokasi || 'Lokasi belum tersedia di KML'} · {item.record_state === 'draf' ? 'Draf' : 'Terbit'}</p><p className="mt-1 text-xs font-medium text-[#1B4F72]">Lihat detail lokasi & koordinat</p></button></td><td className="px-3 py-3 text-right font-medium">{hectares(item.konsesi_area_ha)}</td><td className="px-3 py-3 text-right">{hectares(item.tanaman_area_ha)}</td><td className="px-3 py-3 text-right">{hectares(item.hutan_area_ha)}</td><td className="px-3 py-3 text-right">{hectares(item.okupasi_area_ha)}</td><td className="px-3 py-3 text-right">{hectares(item.kerja_sama_area_ha)}</td><td className="px-3 py-3 text-right font-semibold text-[#1B4F72]">{hectares(item.dapat_dimanfaatkan_area_ha)}</td><td className="px-3 py-3"><p className={item.missing_layers.length || item.record_state === 'draf' ? 'text-amber-700' : 'text-emerald-700'}>{item.analysis_status}</p>{item.missing_layers.length > 0 && <p className="mt-1 text-xs text-slate-500">Belum ada: {item.missing_layers.map(kind => layerLabel[kind] ?? kind).join(', ')}</p>}</td><td className="px-3 py-3"><Button size="sm" variant="outline" disabled={!item.bbox} onClick={() => onShowMap(item)}><MapPin size={14} /> Peta</Button></td></tr>)}{!loading && !error && filtered.length === 0 && <tr><td className="px-3 py-7 text-center text-slate-500" colSpan={9}>{items.length ? 'Tidak ada konsesi yang cocok dengan pencarian.' : 'Belum ada konsesi KML yang diunggah.'}</td></tr>}</tbody></table></div></CardContent>
    </Card>
    {selectedAsset && <div className="fixed inset-0 z-50"><button type="button" aria-label="Tutup detail lokasi" className="absolute inset-0 cursor-default bg-slate-950/25" onClick={() => setSelectedAsset(null)} /><aside aria-label="Detail lokasi konsesi" className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl"><div className="flex items-start justify-between border-b p-5"><div><p className="text-xs font-semibold uppercase tracking-wide text-[#1B4F72]">Detail lokasi konsesi</p><h2 className="mt-1 text-lg font-bold text-slate-900">{selectedAsset.kode_aset}</h2><p className="mt-1 text-sm text-slate-600">{selectedAsset.nama_aset}</p></div><Button variant="ghost" size="icon" aria-label="Tutup" onClick={() => setSelectedAsset(null)}><X size={19} /></Button></div><div className="flex-1 space-y-5 overflow-y-auto p-5"><section className="rounded-lg border border-blue-100 bg-blue-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-[#1B4F72]">Titik tengah lokasi</p><p className="mt-2 font-mono text-base font-semibold text-slate-900">{coordinates(selectedAsset)}</p><p className="mt-1 text-xs text-slate-600">Titik representatif berada di dalam poligon konsesi.</p>{selectedAsset.center_lat !== null && selectedAsset.center_lng !== null && <a className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[#1B4F72] hover:underline" href={`https://www.google.com/maps?q=${selectedAsset.center_lat},${selectedAsset.center_lng}`} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Buka koordinat</a>}</section><section><h3 className="text-sm font-bold text-slate-900">Informasi lokasi</h3><dl className="mt-3 space-y-3 text-sm"><div><dt className="text-xs text-slate-500">Lokasi / kebun</dt><dd className="mt-0.5 font-medium text-slate-900">{selectedAsset.lokasi || 'Belum tersedia di KML'}</dd></div><div><dt className="text-xs text-slate-500">Status data</dt><dd className="mt-0.5 font-medium capitalize text-slate-900">{selectedAsset.record_state}</dd></div></dl></section><section><h3 className="text-sm font-bold text-slate-900">Penggunaan areal</h3><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-slate-500">Konsesi</dt><dd className="mt-0.5 font-semibold">{hectares(selectedAsset.konsesi_area_ha)}</dd></div><div><dt className="text-xs text-slate-500">Kawasan hutan</dt><dd className="mt-0.5 font-semibold">{hectares(selectedAsset.hutan_area_ha)}</dd></div><div><dt className="text-xs text-slate-500">Tanaman</dt><dd className="mt-0.5 font-semibold">{hectares(selectedAsset.tanaman_area_ha)}</dd></div><div><dt className="text-xs text-slate-500">Okupasi</dt><dd className="mt-0.5 font-semibold">{hectares(selectedAsset.okupasi_area_ha)}</dd></div><div><dt className="text-xs text-slate-500">Kerja sama</dt><dd className="mt-0.5 font-semibold">{hectares(selectedAsset.kerja_sama_area_ha)}</dd></div><div><dt className="text-xs text-slate-500">Dapat dimanfaatkan</dt><dd className="mt-0.5 font-semibold text-[#1B4F72]">{hectares(selectedAsset.dapat_dimanfaatkan_area_ha)}</dd></div></dl></section><details className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-semibold text-[#1B4F72]">Detail lanjutan alas hak</summary><dl className="mt-3 grid grid-cols-2 gap-3 text-sm">{([['Status alas hak', rightsLabel[selectedAsset.rights_status]], ['Jenis alas hak', selectedAsset.jenis_alas_hak], ['Nomor alas hak', selectedAsset.nomor_alas_hak], ['Pemegang hak', selectedAsset.pemegang_hak], ['Tanggal mulai', localDate(selectedAsset.tanggal_mulai)], ['Tanggal terbit', localDate(selectedAsset.tanggal_terbit)], ['Tanggal berakhir', selectedAsset.expiry_mode === 'indefinite' ? 'Tidak terbatas' : localDate(selectedAsset.tanggal_berakhir)], ['Sumber dokumen', selectedAsset.sumber_dokumen], ['Catatan', selectedAsset.catatan]] as [string, string | null][]).map(([label, value]) => <div key={label}><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-0.5 font-medium">{value || 'Belum diisi'}</dd></div>)}</dl></details>{selectedAsset.missing_layers.length > 0 && <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-800">Belum ada data: {selectedAsset.missing_layers.map(kind => layerLabel[kind] ?? kind).join(', ')}.</p>}</div><div className="border-t p-4"><Button className="w-full" disabled={!selectedAsset.bbox} onClick={() => { onShowMap(selectedAsset); setSelectedAsset(null) }}><MapPin size={16} /> Lihat konsesi di peta</Button></div></aside></div>}
  </div>
}
