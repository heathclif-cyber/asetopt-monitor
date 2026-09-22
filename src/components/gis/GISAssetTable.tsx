import { useEffect, useMemo, useState } from 'react'
import { FileWarning, MapPin, RefreshCw } from 'lucide-react'
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

export function GISAssetTable({ onShowMap }: { onShowMap: (asset: GISAssetSummary) => void }) {
  const [items, setItems] = useState<GISAssetSummary[]>([])
  const [note, setNote] = useState('')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  return <div className="space-y-4">
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0"><div><CardTitle>Tabel konsesi dan penggunaan areal</CardTitle><CardDescription>Satu baris berasal dari satu polygon konsesi KML. Draf tetap terlihat agar informasi yang kurang dapat dikelola; hanya data terbit yang menjadi catatan resmi.</CardDescription></div><Button variant="outline" size="sm" disabled={loading} onClick={() => void load()}><RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Muat ulang</Button></CardHeader>
      <CardContent className="space-y-3"><div className="flex flex-wrap items-center gap-3"><input value={query} onChange={event => setQuery(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm md:max-w-sm" placeholder="Cari nomor hak, nama, atau kebun" /><span className="text-xs text-slate-500">{filtered.length} konsesi</span></div>{note && <p className="rounded bg-blue-50 p-3 text-xs text-blue-950"><FileWarning className="mr-1 inline h-3.5 w-3.5" />{note}</p>}{error && <p className="rounded bg-red-50 p-3 text-sm text-red-800">{error}</p>}<div className="overflow-x-auto rounded-md border"><table className="min-w-[1230px] w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Konsesi / lokasi</th><th className="px-3 py-3 text-right">Konsesi</th><th className="px-3 py-3 text-right">Tanaman</th><th className="px-3 py-3 text-right">Hutan</th><th className="px-3 py-3 text-right">Okupasi</th><th className="px-3 py-3 text-right">Kerja sama</th><th className="px-3 py-3 text-right">Estimasi dapat dimanfaatkan</th><th className="px-3 py-3">Status data</th><th className="px-3 py-3"></th></tr></thead><tbody>{loading ? <tr><td className="px-3 py-7 text-center text-slate-500" colSpan={9}>Menghitung ringkasan konsesi…</td></tr> : filtered.map(item => <tr key={item.id} className="border-t align-top hover:bg-slate-50"><td className="px-3 py-3"><p className="font-medium text-slate-900">{item.kode_aset} · {item.nama_aset}</p><p className="mt-0.5 max-w-[270px] text-xs text-slate-500">{item.lokasi || 'Lokasi belum tersedia di KML'} · {item.record_state === 'draf' ? 'Draf' : 'Terbit'}</p></td><td className="px-3 py-3 text-right font-medium">{hectares(item.konsesi_area_ha)}</td><td className="px-3 py-3 text-right">{hectares(item.tanaman_area_ha)}</td><td className="px-3 py-3 text-right">{item.official_forest_state === 'queued' || item.official_forest_state === 'running' ? <span className="text-xs text-slate-500">Menghitung…</span> : hectares(item.hutan_area_ha)}</td><td className="px-3 py-3 text-right">{hectares(item.okupasi_area_ha)}</td><td className="px-3 py-3 text-right">{hectares(item.kerja_sama_area_ha)}</td><td className="px-3 py-3 text-right font-semibold text-[#1B4F72]">{hectares(item.dapat_dimanfaatkan_area_ha)}</td><td className="px-3 py-3"><p className={item.missing_layers.length || item.record_state === 'draf' ? 'text-amber-700' : 'text-emerald-700'}>{item.analysis_status}</p>{item.missing_layers.length > 0 && <p className="mt-1 text-xs text-slate-500">Belum ada: {item.missing_layers.map(kind => layerLabel[kind] ?? kind).join(', ')}</p>}</td><td className="px-3 py-3"><Button size="sm" variant="outline" disabled={!item.bbox} onClick={() => onShowMap(item)}><MapPin size={14} /> Peta</Button></td></tr>)}{!loading && filtered.length === 0 && <tr><td className="px-3 py-7 text-center text-slate-500" colSpan={9}>Belum ada konsesi KML yang diunggah.</td></tr>}</tbody></table></div></CardContent>
    </Card>
  </div>
}
