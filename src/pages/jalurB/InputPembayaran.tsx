import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Save, FileText, Zap, ArrowRight } from 'lucide-react'
import { useKompensasiStore } from '@/store/kompensasiStore'
import { useKerjaSamaStore } from '@/store/kerjaSamaStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
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
  kompensasi_id: z.string().min(1),
  tgl_bayar: z.string().min(1),
  nominal_bayar: z.coerce.number().min(1),
  is_pph_disetor: z.boolean().optional(),
  keterangan: z.string().optional(),
  bukti_url: z.string().optional(),
})

type FormData = z.infer<typeof schema>

function isKompensasiEligible(k: Kompensasi, getStatus: ReturnType<typeof useKompensasiStore.getState>['getKompensasiWithStatus']) {
  const pemb = (k.pembayaran ?? []) as Pembayaran[]
  const s = getStatus(k, pemb)
  return s.statusBayar !== 'lunas' || !k.superman
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
  const ks = selected ? daftarKS.find(x => x.id === selected.ks_id) : (selectedKsId ? daftarKS.find(x => x.id === selectedKsId) : undefined)
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
    if (!selectedId) { setRiwayat([]); return }
    api.get<Pembayaran[]>(`/api/pembayaran?kompensasi_id=${selectedId}`)
      .then(setRiwayat)
      .catch(() => setRiwayat([]))
  }, [selectedId, lastSaved])

  useEffect(() => {
    if (selected && ws && ws.sisaTagihan > 0) {
      form.setValue('nominal_bayar', ws.sisaTagihan)
    }
  }, [selectedId, ws?.sisaTagihan])

  const eligibleKompensasi = useMemo(
    () => allKompensasi.filter(k => isKompensasiEligible(k, getKompensasiWithStatus)),
    [allKompensasi, getKompensasiWithStatus],
  )

  const ksOptions = useMemo(() => {
    const ksIds = new Set(eligibleKompensasi.map(k => k.ks_id))
    return daftarKS
      .filter(ksItem => ksIds.has(ksItem.id))
      .map(ksItem => ({
        id: ksItem.id,
        noKontrak: ksItem.no_perjanjian ?? ksItem.no_kontrak_sap ?? 'Tanpa No. Kontrak',
        mitra: ksItem.nama_mitra,
        aset: ksItem.aset?.nama_aset ?? '-',
      }))
      .sort((a, b) => a.noKontrak.localeCompare(b.noKontrak))
  }, [eligibleKompensasi, daftarKS])

  const tahapOptions = useMemo(() => {
    if (!selectedKsId) return []
    return eligibleKompensasi
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
          hasInvoice: !!k.no_invoice,
          noInvoice: k.no_invoice,
        }
      })
      .sort((a, b) => a.jatuhTempo.localeCompare(b.jatuhTempo))
  }, [selectedKsId, eligibleKompensasi, getKompensasiWithStatus])

  const handleKsChange = (ksId: string) => {
    setSelectedKsId(ksId)
    const tahapForKs = eligibleKompensasi
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
    if (!selected.no_invoice) {
      alert('Buat invoice kompensasi terlebih dahulu di menu Buat Invoice.')
      return
    }
    const willLunas = ws ? (ws.totalDibayar + data.nominal_bayar >= ws.efektifTagihan - 0.5) : false
    if (willLunas && !docsReady) {
      alert('Lengkapi dokumen Superman (invoice + rekening koran) terlebih dahulu.')
      return
    }
    try {
      const saved = await api.post<Pembayaran & { superman_job?: { job_id: string } }>('/api/pembayaran', {
        kompensasi_id: data.kompensasi_id,
        tgl_bayar: data.tgl_bayar,
        nominal_bayar: data.nominal_bayar,
        is_pph_disetor: data.is_pph_disetor ?? false,
        keterangan: data.keterangan || null,
        bukti_url: data.bukti_url || null,
      })
      setLastSaved(saved)
      await fetchAllKompensasi()
      if (willLunas) {
        await startSuperman(data.kompensasi_id)
      }
    } catch (e: any) {
      alert(e.message ?? 'Gagal menyimpan pembayaran')
    }
  }

  const selectedTahap = tahapOptions.find(t => t.id === selectedId)
  const isLunas = ws?.statusBayar === 'lunas'
  const supermanReady = !!(
    supermanStatus?.configured
    && supermanStatus.playwright_ready
    && supermanStatus.session_valid
  )
  const canAutoSuperman = !!(
    selected
    && !selected.superman
    && selected.no_invoice
    && docsReady
    && (isLunas || (ws && ws.sisaTagihan <= 0.5))
    && supermanReady
  )

  const handleSupermanDone = (ref: string) => {
    setProgressOpen(false)
    fetchAllKompensasi()
    alert(`Superman selesai: ${ref}`)
  }

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Input Pembayaran</h1>
        <p className="text-sm text-gray-500">
          Catat pembayaran mitra dan upload dokumen — saat lunas, Playwright otomatis mengisi SPPn/SPPb di Superman
        </p>
      </div>

      {supermanStatus && (
        <div className={`text-xs rounded-lg border px-3 py-2 ${
          supermanReady ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}>
          {!supermanStatus.configured && (
            <p>Superman belum dikonfigurasi — set <code>SUPERMAN_USER</code> dan <code>SUPERMAN_PASSWORD</code> di <code>api/.env</code>.</p>
          )}
          {supermanStatus.configured && !supermanStatus.playwright_ready && (
            <p>Playwright belum siap: {supermanStatus.playwright_error ?? 'jalankan'} <code>python scripts/setup_playwright.py</code> di folder <code>api/</code>.</p>
          )}
          {supermanStatus.configured && supermanStatus.playwright_ready && !supermanStatus.session_valid && (
            <p>Session Superman kedaluwarsa — klik <strong>Kirim ke Superman</strong> atau verifikasi captcha saat diminta.</p>
          )}
          {supermanReady && (
            <p>Otomasi Playwright aktif — session Superman valid, siap mengisi formulir SPPn/SPPb.</p>
          )}
        </div>
      )}

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
        <div className="bg-white border rounded-xl p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>No. Kontrak / Perjanjian</Label>
              <Select value={selectedKsId} onValueChange={handleKsChange}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="Pilih no. kontrak..." /></SelectTrigger>
                <SelectContent>
                  {ksOptions.map(o => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.noKontrak} — {o.mitra}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {ks && (
                <p className="text-[11px] text-gray-500 mt-1">
                  Mitra: {ks.nama_mitra} · Aset: {ks.aset?.nama_aset ?? '-'}
                  {ks.no_kontrak_sap ? ` · SAP: ${ks.no_kontrak_sap}` : ''}
                </p>
              )}
            </div>

            <div>
              <Label>Tahap Pembayaran</Label>
              <Select
                value={selectedId}
                disabled={!selectedKsId}
                onValueChange={v => form.setValue('kompensasi_id', v)}
              >
                <SelectTrigger className="mt-1"><SelectValue placeholder="Pilih tahap..." /></SelectTrigger>
                <SelectContent>
                  {tahapOptions.map(o => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.periode} — {formatRupiah(o.sisa)} sisa
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedTahap && (
                <p className="text-[11px] text-gray-500 mt-1">
                  Total tagihan {formatRupiah(selectedTahap.total)} · Jatuh tempo {formatTanggal(selectedTahap.jatuhTempo)}
                </p>
              )}
            </div>
          </div>

          {selected && ws && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm bg-gray-50 rounded-lg p-3">
              <div><p className="text-xs text-gray-500">Total Tagihan</p><CurrencyDisplay value={selected.total_tagihan} size="sm" /></div>
              <div><p className="text-xs text-gray-500">Sudah Dibayar</p><CurrencyDisplay value={ws.totalDibayar} size="sm" className="text-green-700" /></div>
              <div><p className="text-xs text-gray-500">Sisa</p><CurrencyDisplay value={ws.sisaTagihan} size="sm" className="text-red-600" /></div>
              <div><p className="text-xs text-gray-500">Status</p><StatusBadge type="bayar" value={ws.statusBayar} /></div>
            </div>
          )}

          {ks && (
            <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded p-2">
              No. kontrak <strong>{ks.no_perjanjian ?? ks.no_kontrak_sap ?? '—'}</strong> dipakai untuk field SP/OPL Superman.
              Upload PDF kontrak di checklist dokumen (diambil dari Kerja Sama).
            </p>
          )}

          {selected && (
            <div className="flex flex-wrap items-center gap-2">
              {selected.no_invoice ? (
                <>
                  <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
                    Invoice: <strong>{selected.no_invoice}</strong>
                    {selected.invoice_tgl ? ` · ${formatTanggal(selected.invoice_tgl)}` : ''}
                  </p>
                  <Button asChild variant="outline" size="sm">
                    <Link to={`/jalur-b/invoice?kompensasi_id=${selected.id}`}>Ubah Invoice</Link>
                  </Button>
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                  <span>Invoice belum dibuat — buat dulu di menu Buat Invoice.</span>
                  <Button asChild size="sm" variant="outline" className="h-7 text-xs">
                    <Link to={`/jalur-b/invoice?kompensasi_id=${selected.id}`}>
                      Buat Invoice <ArrowRight size={12} />
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          )}

          {selected?.superman && (
            <p className="text-xs text-green-700 bg-green-50 border border-green-200 rounded p-2">
              Superman: {selected.superman}
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Tanggal Bayar</Label>
              <Input type="date" {...form.register('tgl_bayar')} className="mt-1" />
            </div>
            <div>
              <Label>Nominal Dibayarkan (Rp)</Label>
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
            <Label>Link Bukti Transfer</Label>
            <Input {...form.register('bukti_url')} className="mt-1" placeholder="https://..." />
          </div>
          <div>
            <Label>Keterangan</Label>
            <Textarea {...form.register('keterangan')} className="mt-1" rows={2} />
          </div>
        </div>

        {selected && (
          <SupermanDocChecklist
            kompensasiId={selected.id}
            refreshKey={docRefresh}
            onReadyChange={setDocsReady}
          />
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" className="bg-[#1E8449]" disabled={!selected || !!selected?.superman}>
            <Save size={14} /> Simpan Pembayaran
          </Button>
          {selected && !selected.superman && (
            <Button
              type="button"
              variant="outline"
              className="border-[#1B4F72] text-[#1B4F72]"
              disabled={!canAutoSuperman}
              title={
                !supermanReady
                  ? 'Konfigurasi Playwright / session Superman belum siap'
                  : !docsReady
                    ? 'Upload invoice dan rekening koran terlebih dahulu'
                    : !isLunas
                      ? 'Pembayaran harus lunas dulu'
                      : 'Jalankan otomasi Playwright ke Superman'
              }
              onClick={() => selected && startSuperman(selected.id)}
            >
              <Zap size={14} /> Kirim ke Superman
            </Button>
          )}
          {lastSaved && selected && (
            <Button type="button" variant="outline" onClick={() => setKuitansiTarget(lastSaved)}>
              <FileText size={14} /> Buat Kuitansi
            </Button>
          )}
        </div>
      </form>

      {selected && riwayat.length > 0 && (
        <div className="bg-white border rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-3">Riwayat Pembayaran</h2>
          <div className="space-y-2 text-sm">
            {riwayat.map(p => (
              <div key={p.id} className="flex items-center justify-between border-b pb-2">
                <span className="text-gray-500">{formatTanggal(p.tgl_bayar)}</span>
                <span className="font-medium">{formatRupiah(p.nominal_bayar)}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setKuitansiTarget(p)}>
                  Kuitansi
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      <SupermanCaptchaDialog open={captchaOpen} onClose={() => setCaptchaOpen(false)}
        onVerified={() => selected && startSuperman(selected.id)} />
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