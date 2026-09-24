import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { GISKonsesiReference } from '@/types/gis'
import type { AsetKonsesi } from '@/types'
import { Input } from '@/components/ui/input'

type Link = Pick<AsetKonsesi, 'konsesi_key' | 'konsesi_nama'>

function hectares(value: number | null) {
  return value === null ? '—' : `${value.toLocaleString('id-ID', { maximumFractionDigits: 2 })} ha`
}

export function konsesiLabel(item: GISKonsesiReference) {
  return [item.nama, item.lokasi, item.kabupaten].filter(Boolean).join(' · ')
}

export function KonsesiPicker({ konsesi, value, onChange, loading }: {
  konsesi: GISKonsesiReference[]
  value: Link[]
  onChange: (links: Link[]) => void
  loading?: boolean
}) {
  const [query, setQuery] = useState('')
  const selected = new Set(value.map(link => link.konsesi_key))
  const options = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('id-ID')
    return konsesi
      .filter(item => !needle || `${item.nama} ${item.lokasi} ${item.nomor_alas_hak ?? ''} ${item.provinsi ?? ''} ${item.kabupaten ?? ''} ${item.kecamatan ?? ''}`.toLocaleLowerCase('id-ID').includes(needle))
      .slice(0, 60)
  }, [konsesi, query])
  const toggle = (item: GISKonsesiReference) => onChange(selected.has(item.key)
    ? value.filter(link => link.konsesi_key !== item.key)
    : [...value, { konsesi_key: item.key, konsesi_nama: konsesiLabel(item) }])

  return <div className="space-y-2">
    {value.length > 0 && <div className="flex flex-wrap gap-1.5">
      {value.map(link => {
        const found = konsesi.some(item => item.key === link.konsesi_key)
        return <span key={link.konsesi_key} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${found ? 'bg-yellow-100 text-yellow-900' : 'bg-red-100 text-red-800'}`} title={found ? undefined : 'Konsesi ini tidak ditemukan lagi di GIS'}>
          {link.konsesi_nama}{!found && ' (tidak ada di GIS)'}
          <button type="button" aria-label={`Lepas ${link.konsesi_nama}`} onClick={() => onChange(value.filter(item => item.konsesi_key !== link.konsesi_key))}><X size={12} /></button>
        </span>
      })}
    </div>}
    <div className="relative">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <Input className="pl-9" value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari sertifikat, kebun, atau kabupaten" />
    </div>
    <div className="max-h-52 overflow-y-auto rounded-md border">
      {loading ? <p className="p-3 text-sm text-gray-500">Memuat konsesi dari GIS…</p>
        : options.length === 0 ? <p className="p-3 text-sm text-gray-500">Tidak ada konsesi yang cocok.</p>
        : options.map(item => <label key={item.key} className="flex cursor-pointer items-start gap-2 border-b px-3 py-2 text-sm last:border-0 hover:bg-gray-50">
          <input type="checkbox" className="mt-0.5" checked={selected.has(item.key)} onChange={() => toggle(item)} />
          <span className="min-w-0 flex-1">
            <span className="block font-medium text-gray-900">{item.nama}{item.record_state === 'draf' && <span className="ml-1.5 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-800">Draf</span>}</span>
            <span className="block text-xs text-gray-500">{[item.lokasi, item.kecamatan && `Kec. ${item.kecamatan}`, item.kabupaten].filter(Boolean).join(' · ')} · {hectares(item.luas_gis_ha)}</span>
          </span>
        </label>)}
    </div>
    {konsesi.length > options.length && !query && <p className="text-[11px] text-gray-500">Menampilkan {options.length} dari {konsesi.length} konsesi. Ketik untuk mencari.</p>}
  </div>
}
