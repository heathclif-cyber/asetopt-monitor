import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Save, FileText, Zap } from 'lucide-react'
import { useKompensasiStore } from '@/store/kompensasiStore'
import { useKerjaSamaStore } from '@/store/kerjaSamaStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { SearchableSelect } from '@/components/common/SearchableSelect'
import { CurrencyInput } from '@/components/common/CurrencyInput'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { StatusBadge } from '@/components/common/StatusBadge'
import { SupermanDocChecklist } from '@/components/common/SupermanDocChecklist'
import { SupermanCaptchaDialog } from '@/components/common/SupermanCaptchaDialog'
import { SupermanProgressDialog } from '@/components/common/SupermanProgressDialog'
import { KuitansiDialog } from '@/components/common/KuitansiDialog'
import { api } from '@/lib/apiClient'
import { formatRupiah, formatTanggal } from '@/lib/utils'
import { Kompensasi, Pembayaran, SupermanStatus } from '@/types'

const schema = z.object({
  kompensasi_id: z.string().min(1, 'Pilih tahap tagihan'),
  tgl_bayar: z.string().min(1, 'Tanggal bayar wajib'),
  nominal_bayar: z.coerce.number().min(1, 'Nominal wajib > 0'),
  is_pph_disetor: z.boolean().optional(),
  keterangan: z.string().optional(),
  bukti_url: z.string().optional(),
})

type FormData = z.infer<typeof schema>

/** Tagihan yang masih bisa diinput cash in (belum lunas). Invoice tidak wajib. */
function isOpenForPayment(
  k: Kompensasi,
  getStatus: ReturnType<typeof useKompensasiStore.getState>['getKompensasiWithStatus'],
) {
  const pemb = (k.pembayaran ?? []) as Pembayaran[]
  const s = getStatus(k, pemb)
  return s.statusBayar !== 'lunas'
}

export function InputPembayaran() {
  const [params] = useSearchParams()
  const { allKompensasi, fetchAllKompensasi, getKompensasiWithStatus } = useKompensasiStore()
  const { daftarKS, fetchKS } = useKerjaSamaStore()
  const [selectedKsId, setSelectedKsId] = useState('')
  const [riwayat, setRiwayat] = useState<Pembayaran[]>([])
  const [docRefresh, setDocRefresh] = useState(0)
  const [docsReady, setDocsReady] = useState(false)
  const [captchaOpen, setCaptchaOpen] = useState(false)
  const [progressOpen, setProgressOpen] = useState(false)
  const [jobId, setJobId] = useState<string | null>(null)
  const [kuitansiTarget, setKuitansiTarget] = useState<Pembayaran | null>(null)
  const [lastSaved, setLastSaved] = useState<Pembayaran | null>(null)
  const [supermanStatus, setSupermanStatus] = useState<SupermanStatus | null>(null)
  const [saving, setSaving] = useState(false)

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      kompensasi_id: params.get('kompensasi_id') ?? '',
      tgl_bayar: new Date().toISOString().split('T')[0],
      nominal_bayar: 0,
      is_pph_disetor: false,
    },
  })

  const selectedId = form.watch('kompensasi_id')
  const selected = allKompensasi.find(k => k.id === selectedId)
  const ks = selected
    ? daftarKS.find(x => x.id === selected.ks_id)
    : (selectedKsId ? daftarKS.find(x => x.id === selectedKsId) : undefined)
  const ws = selected ? getKompensasiWithStatus(selected, riwayat) : null

  useEffect(() => {
    fetchAllKompensasi()
    fetchKS()
    api.get<SupermanStatus>('/api/superman/status').then(setSupermanStatus).catch(() => {})
  }, [])

  useEffect(() => {
    const kid = params.get('kompensasi_id')
    if (!kid || allKompensasi.length === 0) return
    const k = allKompensasi.find(x => x.id === kid)
    if (k) {
      setSelectedKsId(k.ks_id)
      form.setValue('kompensasi_id', kid)
    }
  }, [allKompensasi, params])

  useEffect(() => {
    setDocsReady(false)
  }, [selectedId])

  useEffect(() => {
    if (!selectedId) {
      setRiwayat([])
      return
    }
    api.get<Pembayaran[]>(`/api/pembayaran?kompensasi_id=${selectedId}`)
      .then(setRiwayat)
      .catch(() => setRiwayat([]))
  }, [selectedId, lastSaved])

  useEffect(() => {
    if (selected && ws && ws.sisaTagihan > 0) {
      form.setValue('nominal_bayar', ws.sisaTagihan)
    }
  }, [selectedId, ws?.sisaTagihan])

  const openKompensasi = useMemo(
    () => allKompensasi.filter(k => isOpenForPayment(k, getKompensasiWithStatus)),
    [allKompensasi, getKompensasiWithStatus],
  )

  const ksOptions = useMemo(() => {
    const ksIds = new Set(openKompensasi.map(k => k.ks_id))
    return daftarKS
      .filter(ksItem => ksIds.has(ksItem.id))
      .map(ksItem => ({
        id: ksItem.id,
        noKontrak: ksItem.no_perjanjian ?? ksItem.no_kontrak_sap ?? 'Tanpa No. Kontrak',
        mitra: ksItem.nama_mitra,
        aset: ksItem.aset?.nama_aset ?? '-',
      }))
      .sort((a, b) => a.mitra.localeCompare(b.mitra, 'id'))
  }, [openKompensasi, daftarKS])

  const tahapOptions = useMemo(() => {
    if (!selectedKsId) return []
    return openKompensasi
      .filter(k => k.ks_id === selectedKsId)
      .map(k => {
        const pemb = (k.pembayaran ?? []) as Pembayaran[]
        const s = getKompensasiWithStatus(k, pemb)
        return {
          id: k.id,
          periode: k.periode_label ?? formatTanggal(k.tgl_jatuh_tempo),
          jatuhTempo: k.tgl_jatuh_tempo,
          total: k.total_tagihan,
          sisa: s.sisaTagihan,
          status: s.statusBayar,
        }
      })
      .sort((a, b) => a.jatuhTempo.localeCompare(b.jatuhTempo))
  }, [selectedKsId, openKompensasi, getKompensasiWithStatus])

  const handleKsChange = (ksId: string) => {
    setSelectedKsId(ksId)
    const tahapForKs = openKompensasi
      .filter(k => k.ks_id === ksId)
      .sort((a, b) => a.tgl_jatuh_tempo.localeCompare(b.tgl_jatuh_tempo))
    form.setValue('kompensasi_id', tahapForKs[0]?.id ?? '')
  }

  useEffect(() => {
    if (selected && selected.ks_id !== selectedKsId) {
      setSelectedKsId(selected.ks_id)
    }
  }, [selected?.ks_id])

  const startSuperman = async (kompensasiId: string) => {
    try {
      const res = await api.post<{ job_id: string }>(`/api/superman/deklarasi/start?kompensasi_id=${kompensasiId}`)
      setJobId(res.job_id)
      setProgressOpen(true)
    } catch (e: any) {
      if (e.message?.includes('captcha') || e.message?.includes('Captcha')) {
        setCaptchaOpen(true)
      } else {
        alert(e.message ?? 'Gagal memulai Superman')
      }
    }
  }

  const onSubmit = async (data: FormData) => {
    if (!selected) return
    setSaving(true)
    try {
      const saved = await api.post<Pembayaran>('/api/pembayaran', {
        kompensasi_id: data.kompensasi_id,
        tgl_bayar: data.tgl_bayar,
        nominal_bayar: data.nominal_bayar,
        is_pph_disetor: data.is_pph_disetor ?? false,
        keterangan: data.keterangan || null,
        bukti_url: data.bukti_url || null,
      })
      setLastSaved(saved)
      await fetchAllKompensasi()
      form.setValue('keterangan', '')
      form.setValue('bukti_url', '')
    } catch (e: any) {
      alert(e.message ?? 'Gagal menyimpan pembayaran')
    } finally {
      setSaving(false)
    }
  }

  const selectedTahap = tahapOptions.find(t => t.id === selectedId)
  const isLunas = ws?.statusBayar === 'lunas'
  const supermanReady = !!(
    supermanStatus?.configured
    && supermanStatus.playwright_ready
    && supermanStatus.session_valid
  )
  // Superman opsional — tidak menghalangi input cash in
  const canAutoSuperman = !!(
    selected
    && !selected.superman
    && docsReady
    && (isLunas || (ws && ws.sisaTagihan <= 0.5))
    && supermanReady
  )

  const handleSupermanDone = (ref: string) => {
    setProgressOpen(false)
    fetchAllKompensasi()
    alert(`Superman selesai: ${ref}`)
  }

  const canSave = !!(selected && ws && ws.sisaTagihan > 0.5 && !saving)

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Input Pembayaran (Cash In)</h1>
        <p className="text-sm text-gray-500">
          Catat realisasi pembayaran mitra. Invoice tidak wajib di sini (boleh dibuat di aplikasi lain).
        </p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <div className="bg-white border rounded-xl p-5 space-y-4 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Mitra / Kerja Sama</Label>
              <div className="mt-1">
                <SearchableSelect
                  value={selectedKsId}
                  onValueChange={handleKsChange}
                  options={ksOptions.map(o => ({
                    value: o.id,
                    label: `${o.mitra} — ${o.noKontrak}`,
                    searchText: `${o.noKontrak} ${o.mitra} ${o.aset}`,
                    description: o.aset,
                  }))}
                  placeholder="Cari mitra / no. kontrak..."
                  searchPlaceholder="Ketik mitra, kontrak, atau aset..."
                />
              </div>
              {ks && (
                <p className="text-[11px] text-gray-500 mt-1">
                  Aset: {ks.aset?.nama_aset ?? '-'}
                  {ks.no_kontrak_sap ? ` · SAP: ${ks.no_kontrak_sap}` : ''}
                </p>
              )}
            </div>

            <div>
              <Label>Tahap Tagihan</Label>
              <div className="mt-1">
                <SearchableSelect
                  value={selectedId}
                  disabled={!selectedKsId}
                  onValueChange={v => form.setValue('kompensasi_id', v)}
                  options={tahapOptions.map(o => ({
                    value: o.id,
                    label: `${o.periode} — sisa ${formatRupiah(o.sisa)}`,
                    searchText: o.periode,
                    description: `Tagihan ${formatRupiah(o.total)} · JT ${formatTanggal(o.jatuhTempo)}`,
                  }))}
                  placeholder="Cari & pilih tahap..."
                  searchPlaceholder="Ketik label periode..."
                />
              </div>
              {selectedTahap && (
                <p className="text-[11px] text-gray-500 mt-1">
                  Jatuh tempo {formatTanggal(selectedTahap.jatuhTempo)}
                </p>
              )}
            </div>
          </div>

          {selected && ws && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm bg-gray-50 rounded-lg p-3 border border-gray-100">
              <div>
                <p className="text-xs text-gray-500">Total Tagihan</p>
                <CurrencyDisplay value={selected.total_tagihan} size="sm" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Sudah Dibayar</p>
                <CurrencyDisplay value={ws.totalDibayar} size="sm" className="text-green-700" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Sisa</p>
                <CurrencyDisplay value={ws.sisaTagihan} size="sm" className="text-red-600" />
              </div>
              <div>
                <p className="text-xs text-gray-500">Status</p>
                <StatusBadge type="bayar" value={ws.statusBayar} />
              </div>
            </div>
          )}

          {selected?.no_invoice && (
            <p className="text-xs text-gray-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              No. invoice (opsional / dari apps lain): <strong className="font-mono">{selected.no_invoice}</strong>
              {selected.invoice_tgl ? ` · ${formatTanggal(selected.invoice_tgl)}` : ''}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label>Tanggal Bayar</Label>
              <Input type="date" {...form.register('tgl_bayar')} className="mt-1" />
            </div>
            <div>
              <Label>Nominal Cash In (Rp)</Label>
              <CurrencyInput
                value={form.watch('nominal_bayar')}
                onChange={v => form.setValue('nominal_bayar', v)}
                className="mt-1"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="pph" {...form.register('is_pph_disetor')} />
            <Label htmlFor="pph" className="font-normal">PPh sudah disetor</Label>
          </div>

          <div>
            <Label>Link Bukti Transfer (opsional)</Label>
            <Input {...form.register('bukti_url')} className="mt-1" placeholder="https://..." />
          </div>
          <div>
            <Label>Keterangan (opsional)</Label>
            <Textarea {...form.register('keterangan')} className="mt-1" rows={2} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="bg-[#1E8449]" disabled={!canSave}>
            <Save size={14} /> {saving ? 'Menyimpan...' : 'Simpan Cash In'}
          </Button>
          {lastSaved && selected && (
            <Button type="button" variant="outline" onClick={() => setKuitansiTarget(lastSaved)}>
              <FileText size={14} /> Buat Kuitansi
            </Button>
          )}
        </div>
      </form>

      {selected && riwayat.length > 0 && (
        <div className="bg-white border rounded-xl p-5 shadow-sm">
          <h2 className="text-sm font-semibold mb-3">Riwayat Cash In</h2>
          <div className="space-y-2 text-sm">
            {riwayat.map(p => (
              <div key={p.id} className="flex items-center justify-between border-b border-gray-100 pb-2 gap-3">
                <span className="text-gray-500">{formatTanggal(p.tgl_bayar)}</span>
                <span className="font-medium text-green-700 tabular-nums">{formatRupiah(p.nominal_bayar)}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setKuitansiTarget(p)}>
                  Kuitansi
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Superman opsional — tidak memblokir input cash in */}
      {selected && (
        <details className="bg-white border rounded-xl p-4 shadow-sm group">
          <summary className="cursor-pointer text-sm font-medium text-gray-700 list-none flex items-center justify-between">
            <span>Otomasi Superman (opsional)</span>
            <span className="text-[11px] text-gray-400 font-normal">tidak wajib untuk catat cash in</span>
          </summary>
          <div className="mt-4 space-y-3 border-t pt-4">
            {supermanStatus && (
              <div className={`text-xs rounded-lg border px-3 py-2 ${
                supermanReady ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}>
                {!supermanStatus.configured && (
                  <p>Superman belum dikonfigurasi di service API.</p>
                )}
                {supermanStatus.configured && !supermanStatus.playwright_ready && (
                  <p>Playwright belum siap: {supermanStatus.playwright_error ?? 'periksa deploy API'}</p>
                )}
                {supermanStatus.configured && supermanStatus.playwright_ready && !supermanStatus.session_valid && (
                  <p>Session Superman kedaluwarsa — verifikasi captcha saat diminta.</p>
                )}
                {supermanReady && <p>Session Superman valid.</p>}
              </div>
            )}
            {selected.superman && (
              <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2">
                Superman: {selected.superman}
              </p>
            )}
            <SupermanDocChecklist
              kompensasiId={selected.id}
              refreshKey={docRefresh}
              onReadyChange={setDocsReady}
            />
            {!selected.superman && (
              <Button
                type="button"
                variant="outline"
                className="border-[#1B4F72] text-[#1B4F72]"
                disabled={!canAutoSuperman}
                title={
                  !supermanReady
                    ? 'Superman belum siap'
                    : !docsReady
                      ? 'Lengkapi dokumen pendukung dulu'
                      : !isLunas
                        ? 'Pembayaran harus lunas dulu'
                        : 'Jalankan otomasi Superman'
                }
                onClick={() => selected && startSuperman(selected.id)}
              >
                <Zap size={14} /> Kirim ke Superman
              </Button>
            )}
          </div>
        </details>
      )}

      <SupermanCaptchaDialog
        open={captchaOpen}
        onClose={() => setCaptchaOpen(false)}
        onVerified={() => selected && startSuperman(selected.id)}
      />
      <SupermanProgressDialog
        open={progressOpen}
        jobId={jobId}
        onDone={handleSupermanDone}
        onError={msg => { setProgressOpen(false); alert(msg) }}
        onClose={() => setProgressOpen(false)}
      />
      {kuitansiTarget && selected && (
        <KuitansiDialog
          open={!!kuitansiTarget}
          onClose={() => setKuitansiTarget(null)}
          kompensasi={{ ...selected, kerja_sama: ks }}
          pembayaran={kuitansiTarget}
        />
      )}
    </div>
  )
}
