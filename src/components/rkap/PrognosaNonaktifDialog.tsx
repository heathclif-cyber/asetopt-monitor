import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BULAN_LABELS } from '@/data/rkap2026'
import { formatRupiah } from '@/lib/utils'

interface Props {
  open: boolean
  onClose: () => void
  kode: string
  nama: string
  basisLabel: string
  dasarLabel: string
  currentMonth: number
  /** Prognosa per bulan jika tidak ada penonaktifan (Rp), indeks 0–11. */
  prognosaAsli: number[]
  nonaktifBulan: number[]
  alasan: string
  onSave: (bulan: number[], alasan: string) => Promise<void>
}

export function PrognosaNonaktifDialog({ open, onClose, kode, nama, basisLabel, dasarLabel, currentMonth, prognosaAsli, nonaktifBulan, alasan, onSave }: Props) {
  const [terpilih, setTerpilih] = useState<Set<number>>(new Set())
  const [catatan, setCatatan] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setTerpilih(new Set(nonaktifBulan))
    setCatatan(alasan)
    setError('')
  }, [open, nonaktifBulan, alasan])

  const bisaDiubah = (month: number) => month >= currentMonth
  const toggle = (month: number) => setTerpilih(prev => {
    const next = new Set(prev)
    if (next.has(month)) next.delete(month)
    else next.add(month)
    return next
  })
  const totalDinonaktifkan = Array.from(terpilih).reduce((s, m) => s + (prognosaAsli[m] ?? 0), 0)

  const simpan = async () => {
    setSaving(true)
    setError('')
    try {
      await onSave(Array.from(terpilih).sort((a, b) => a - b), catatan.trim())
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={value => { if (!value) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Atur prognosa — {basisLabel}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <p className="font-medium text-gray-800">{nama}</p>
            <p className="font-mono text-[11px] text-gray-500">{kode}</p>
          </div>
          <p className="rounded-md border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs text-sky-800">
            Pengaturan ini <strong>khusus untuk dasar prognosa "{dasarLabel}"</strong>. Dasar prognosa lain tidak ikut berubah.
          </p>
          <p className="text-xs text-gray-500">
            Centang bulan yang <strong>tidak diperkirakan tercapai</strong>. Prognosa bulan itu menjadi 0
            (bulan berjalan: hanya yang sudah terealisasi). Target RKAP tidak berubah.
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {BULAN_LABELS.map((label, month) => {
              const aktifUbah = bisaDiubah(month)
              return (
                <label
                  key={label}
                  className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-1.5 text-xs ${
                    terpilih.has(month) ? 'border-amber-300 bg-amber-50' : 'border-gray-200'
                  } ${aktifUbah ? 'cursor-pointer' : 'opacity-50'}`}
                  title={aktifUbah ? undefined : 'Bulan yang sudah lewat memakai realisasi'}
                >
                  <span className="flex items-center gap-1.5">
                    <input type="checkbox" checked={terpilih.has(month)} disabled={!aktifUbah} onChange={() => toggle(month)} />
                    {label}
                  </span>
                  <span className={`tabular-nums ${terpilih.has(month) ? 'text-gray-400 line-through' : 'text-gray-600'}`}>
                    {prognosaAsli[month] ? formatRupiah(prognosaAsli[month]) : '·'}
                  </span>
                </label>
              )
            })}
          </div>
          {terpilih.size > 0 && (
            <p className="text-xs text-amber-800">
              {terpilih.size} bulan dinonaktifkan · prognosa berkurang {formatRupiah(totalDinonaktifkan)}
            </p>
          )}
          <label className="block text-xs text-gray-500 space-y-1">
            Alasan (opsional)
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              rows={2}
              maxLength={300}
              value={catatan}
              onChange={e => setCatatan(e.target.value)}
              placeholder="Contoh: mitra belum menandatangani addendum"
            />
          </label>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Batal</Button>
          <Button onClick={simpan} disabled={saving}>Simpan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
