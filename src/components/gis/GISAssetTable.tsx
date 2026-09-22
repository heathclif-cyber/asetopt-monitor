import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, FileWarning, MapPin, RefreshCw, X } from 'lucide-react'
import { gisApi } from '@/lib/gisApi'
import type { GISAssetSummary } from '@/types/gis'
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

  const load = async () => {
    setLoading(true); setError('')
    try {
      const result = await gisApi.konsesiSummaries()
      setItems(result.data); setNote(result.availability_note)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Ringkasan aset tidak dapat dimuat.')
    } finally { setLoading(false) }
  }

  useEffect(() => { void load() }, [])
  useEffect(() => {
    if (!items.some(item => item.official_forest_state == null || item.official_forest_state === 'queued' || item.official_forest_state === 'running')) return
    const timer = window.setTimeout(() => { void load() }, 3500)
    return () => window.clearTimeout(timer)
  }, [items])
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('id-ID')
    return items.filter(item => !needle || `${item.kode_aset} ${item.nama_aset} ${item.lokasi} ${item.konsesi_names.join(' ')}`.toLocaleLowerCase('id-ID').includes(needle))
  }, [items, query])
  const dashboard = useMemo(() => {
    const total = (field: keyof GISAssetSummary) => items.reduce((sum, item) => sum + (typeof item[field] === 'number' ? item[field] as number : 0), 0)
    const forestReady = items.filter(item => item.official_forest_state === 'complete').length
    return {
      count: items.length,
      konsesi: total('konsesi_area_ha'),
      hutan: total('hutan_area_ha'),
      tanaman: total('tanaman_area_ha'),
      okupasi: total('okupasi_area_ha'),
      kerjaSama: total('kerja_sama_area_ha'),
      tersedia: total('dapat_dimanfaatkan_area_ha'),
      forestReady,
    }
  }, [items])

  return <div className="space-y-4">
    <section className="rounded-xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><div><h2 className="text-sm font-bold text-slate-900">Ringkasan GIS Konsesi</h2><p className="mt-0.5 text-xs text-slate-500">Akumulasi penggunaan areal dari seluruh konsesi yang tampil di tabel.</p></div><p className="text-xs font-medium text-slate-500">Data hutan: {dashboard.forestReady}/{dashboard.count || 0} konsesi</p></div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
        <DashboardMetric label="Konsesi" value={dashboard.count.toLocaleString('id-ID')} tone="blue" note="aset tanah" />
        <DashboardMetric label="Luas konsesi" value={hectares(dashboard.konsesi)} tone="blue" note="berdasarkan peta GIS, bukan konsesi resmi" />
        <DashboardMetric label="Kawasan hutan" value={hectares(dashboard.hutan)} tone="green" note="peta kawasan hutan" />
        <DashboardMetric label="Tanaman" value={hectares(dashboard.tanaman)} tone="green" />
        <DashboardMetric label="Okupasi" value={hectares(dashboard.okupasi)} tone="amber" />
        <DashboardMetric label="Kerja sama" value={hectares(dashboard.kerjaSama)} tone="amber" />
        <DashboardMetric label="Dapat dimanfaatkan" value={hectares(dashboard.tersedia)} tone="blue" />
      </div>
    </section>
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0"><div><CardTitle>Tabel konsesi dan penggunaan areal</CardTitle><CardDescription>Satu baris berasal dari satu polygon konsesi KML. Draf tetap terlihat agar informasi yang kurang dapat dikelola; hanya data terbit yang menjadi catatan resmi.</CardDescription></div><Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Muat ulang</Button></CardHeader>
      <CardContent className="space-y-3"><div className="sticky top-14 z-20 -mx-1 flex flex-wrap items-center gap-3 bg-white px-1 py-2 shadow-sm"><input value={query} onChange={event => setQuery(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm md:max-w-sm" placeholder="Cari nomor hak, nama, atau kebun" /><span className="text-xs text-slate-500">{filtered.length} konsesi</span></div>{note && <p className="rounded bg-blue-50 p-3 text-xs text-blue-950"><FileWarning className="mr-1 inline h-3.5 w-3.5" />{note}</p>}{error && <p className="rounded bg-red-50 p-3 text-sm text-red-800">{error}</p>}<div className="max-h-[calc(100vh-10rem)] overflow-auto rounded-md border"><table className="min-w-[1230px] w-full text-sm"><thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500 shadow-sm"><tr><th className="px-3 py-3">Konsesi / lokasi</th><th className="px-3 py-3 text-right">Konsesi</th><th className="px-3 py-3 text-right">Tanaman</th><th className="px-3 py-3 text-right">Hutan</th><th className="px-3 py-3 text-right">Okupasi</th><th className="px-3 py-3 text-right">Kerja sama</th><th className="px-3 py-3 text-right">Estimasi dapat dimanfaatkan</th><th className="px-3 py-3">Status data</th><th className="px-3 py-3"></th></tr></thead><tbody>{loading ? <tr><td className="px-3 py-7 text-center text-slate-500" colSpan={9}>Menghitung ringkasan konsesi…</td></tr> : filtered.map(item => <tr key={item.id} className="border-t align-top hover:bg-slate-50"><td className="p-0"><button type="button" className="block w-full px-3 py-3 text-left outline-none hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1B4F72]" onClick={() => setSelectedAsset(item)}><p className="font-medium text-slate-900">{item.kode_aset} · {item.nama_aset}</p><p className="mt-0.5 max-w-[270px] text-xs text-slate-500">{item.lokasi || 'Lokasi belum tersedia di KML'} · {item.record_state === 'draf' ? 'Draf' : 'Terbit'}</p><p className="mt-1 text-xs font-medium text-[#1B4F72]">Lihat detail lokasi & koordinat</p></button></td><td className="px-3 py-3 text-right font-medium">{hectares(item.konsesi_area_ha)}</td><td className="px-3 py-3 text-right">{hectares(item.tanaman_area_ha)}</td><td className="px-3 py-3 text-right">{item.official_forest_state === 'queued' || item.official_forest_state === 'running' ? <span className="text-xs text-slate-500">Menghitung…</span> : hectares(item.hutan_area_ha)}</td><td className="px-3 py-3 text-right">{hectares(item.okupasi_area_ha)}</td><td className="px-3 py-3 text-right">{hectares(item.kerja_sama_area_ha)}</td><td className="px-3 py-3 text-right font-semibold text-[#1B4F72]">{hectares(item.dapat_dimanfaatkan_area_ha)}</td><td className="px-3 py-3"><p className={item.missing_layers.length || item.record_state === 'draf' ? 'text-amber-700' : 'text-emerald-700'}>{item.analysis_status}</p>{item.missing_layers.length > 0 && <p className="mt-1 text-xs text-slate-500">Belum ada: {item.missing_layers.map(kind => layerLabel[kind] ?? kind).join(', ')}</p>}</td><td className="px-3 py-3"><Button size="sm" variant="outline" disabled={!item.bbox} onClick={() => onShowMap(item)}><MapPin size={14} /> Peta</Button></td></tr>)}{!loading && filtered.length === 0 && <tr><td className="px-3 py-7 text-center text-slate-500" colSpan={9}>Belum ada konsesi KML yang diunggah.</td></tr>}</tbody></table></div></CardContent>
    </Card>
    {selectedAsset && <div className="fixed inset-0 z-50"><button type="button" aria-label="Tutup detail lokasi" className="absolute inset-0 cursor-default bg-slate-950/25" onClick={() => setSelectedAsset(null)} /><aside aria-label="Detail lokasi konsesi" className="absolute inset-y-0 right-0 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl"><div className="flex items-start justify-between border-b p-5"><div><p className="text-xs font-semibold uppercase tracking-wide text-[#1B4F72]">Detail lokasi konsesi</p><h2 className="mt-1 text-lg font-bold text-slate-900">{selectedAsset.kode_aset}</h2><p className="mt-1 text-sm text-slate-600">{selectedAsset.nama_aset}</p></div><Button variant="ghost" size="icon" aria-label="Tutup" onClick={() => setSelectedAsset(null)}><X size={19} /></Button></div><div className="flex-1 space-y-5 overflow-y-auto p-5"><section className="rounded-lg border border-blue-100 bg-blue-50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-[#1B4F72]">Titik tengah lokasi</p><p className="mt-2 font-mono text-base font-semibold text-slate-900">{coordinates(selectedAsset)}</p><p className="mt-1 text-xs text-slate-600">Titik representatif berada di dalam poligon konsesi.</p>{selectedAsset.center_lat !== null && selectedAsset.center_lng !== null && <a className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-[#1B4F72] hover:underline" href={`https://www.google.com/maps?q=${selectedAsset.center_lat},${selectedAsset.center_lng}`} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Buka koordinat</a>}</section><section><h3 className="text-sm font-bold text-slate-900">Informasi lokasi</h3><dl className="mt-3 space-y-3 text-sm"><div><dt className="text-xs text-slate-500">Lokasi / kebun</dt><dd className="mt-0.5 font-medium text-slate-900">{selectedAsset.lokasi || 'Belum tersedia di KML'}</dd></div><div><dt className="text-xs text-slate-500">Status data</dt><dd className="mt-0.5 font-medium capitalize text-slate-900">{selectedAsset.record_state}</dd></div></dl></section><section><h3 className="text-sm font-bold text-slate-900">Penggunaan areal</h3><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-xs text-slate-500">Konsesi</dt><dd className="mt-0.5 font-semibold">{hectares(selectedAsset.konsesi_area_ha)}</dd></div><div><dt className="text-xs text-slate-500">Kawasan hutan</dt><dd className="mt-0.5 font-semibold">{hectares(selectedAsset.hutan_area_ha)}</dd></div><div><dt className="text-xs text-slate-500">Tanaman</dt><dd className="mt-0.5 font-semibold">{hectares(selectedAsset.tanaman_area_ha)}</dd></div><div><dt className="text-xs text-slate-500">Okupasi</dt><dd className="mt-0.5 font-semibold">{hectares(selectedAsset.okupasi_area_ha)}</dd></div><div><dt className="text-xs text-slate-500">Kerja sama</dt><dd className="mt-0.5 font-semibold">{hectares(selectedAsset.kerja_sama_area_ha)}</dd></div><div><dt className="text-xs text-slate-500">Dapat dimanfaatkan</dt><dd className="mt-0.5 font-semibold text-[#1B4F72]">{hectares(selectedAsset.dapat_dimanfaatkan_area_ha)}</dd></div></dl></section>{selectedAsset.missing_layers.length > 0 && <p className="rounded-md bg-amber-50 p-3 text-xs text-amber-800">Belum ada data: {selectedAsset.missing_layers.map(kind => layerLabel[kind] ?? kind).join(', ')}.</p>}</div><div className="border-t p-4"><Button className="w-full" disabled={!selectedAsset.bbox} onClick={() => { onShowMap(selectedAsset); setSelectedAsset(null) }}><MapPin size={16} /> Lihat konsesi di peta</Button></div></aside></div>}
  </div>
}
