import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  FileDown,
  ArrowRight,
  CheckCircle2,
  Upload,
  FileText,
  Building2,
  CalendarDays,
  Hash,
  Banknote,
  ClipboardList,
} from 'lucide-react'
import { useKompensasiStore } from '@/store/kompensasiStore'
import { useKerjaSamaStore } from '@/store/kerjaSamaStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SearchableSelect } from '@/components/common/SearchableSelect'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { StatusBadge } from '@/components/common/StatusBadge'
import { DocumentUpload } from '@/components/common/DocumentUpload'
import { InvoicePreviewPanel } from '@/components/common/InvoicePreviewPanel'
import { api } from '@/lib/apiClient'
import { supabase } from '@/lib/supabase'
import { cn, formatRupiah, formatTanggal } from '@/lib/utils'
import { generateNoInvoice, prefetchTemplate } from '@/utils/invoiceDocxUtils'
import {
  buildInvoiceKompensasiDocxBlob,
  generateInvoiceKompensasiDocx,
} from '@/utils/invoiceKompensasiPreview'
import type { SupermanDocRequirement } from '@/types'

const INVOICE_TEMPLATE = '/invoice/template_invoice_kompensasi.docx'

const today = () => new Date().toISOString().split('T')[0]

const STEPS = [
  { n: 1, label: 'Pilih tagihan' },
  { n: 2, label: 'Detail invoice' },
  { n: 3, label: 'Simpan & unduh' },
  { n: 4, label: 'Upload PDF' },
] as const

export function BuatInvoice() {
  const [params] = useSearchParams()
  const { allKompensasi, fetchAllKompensasi, getKompensasiWithStatus } = useKompensasiStore()
  const { daftarKS, fetchKS } = useKerjaSamaStore()
  const [selectedKsId, setSelectedKsId] = useState('')
  const [selectedId, setSelectedId] = useState(params.get('kompensasi_id') ?? '')
  const [noInvoice, setNoInvoice] = useState('')
  const [tanggalSurat, setTanggalSurat] = useState(today())
  const [saving, setSaving] = useState(false)
  const [invoiceSaved, setInvoiceSaved] = useState(false)
  const [invoiceUploaded, setInvoiceUploaded] = useState(false)
  const [invoiceFileName, setInvoiceFileName] = useState<string | null>(null)
  const [docxBlob, setDocxBlob] = useState<Blob | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)

  useEffect(() => {
    fetchAllKompensasi()
    fetchKS()
    // Prefetch template di background — preview pertama tidak nunggu network
    prefetchTemplate(INVOICE_TEMPLATE)
  }, [])

  useEffect(() => {
    const kid = params.get('kompensasi_id')
    if (!kid || allKompensasi.length === 0) return
    const k = allKompensasi.find(x => x.id === kid)
    if (k) {
      setSelectedKsId(k.ks_id)
      setSelectedId(kid)
    }
  }, [allKompensasi, params])

  const selected = allKompensasi.find(k => k.id === selectedId)
  const ks = selected
    ? daftarKS.find(x => x.id === selected.ks_id)
    : (selectedKsId ? daftarKS.find(x => x.id === selectedKsId) : undefined)
  const ws = selected ? getKompensasiWithStatus(selected, selected.pembayaran ?? []) : null
  const kompensasiWithKs = selected ? { ...selected, kerja_sama: ks } : null
  const hasInvoiceInDb = !!selected?.no_invoice
  const showUpload = hasInvoiceInDb || invoiceSaved

  const activeStep = !selected
    ? 1
    : !noInvoice.trim()
      ? 2
      : !showUpload
        ? 3
        : invoiceUploaded
          ? 4
          : 3

  useEffect(() => {
    if (!selected || !ks) return
    const kodeAset = ks.aset?.kode_aset ?? 'AST'
    setNoInvoice(
      selected.no_invoice
      ?? generateNoInvoice(kodeAset, selected.periode_label, selected.tgl_jatuh_tempo),
    )
    setTanggalSurat(selected.invoice_tgl ?? today())
    setInvoiceSaved(!!selected.no_invoice)
  }, [selectedId, selected?.no_invoice, selected?.invoice_tgl, ks?.id])

  const ksOptions = useMemo(() => {
    const ksIds = new Set(allKompensasi.map(k => k.ks_id))
    return daftarKS
      .filter(item => ksIds.has(item.id))
      .map(item => ({
        id: item.id,
        noKontrak: item.no_perjanjian ?? item.no_kontrak_sap ?? 'Tanpa No. Kontrak',
        mitra: item.nama_mitra,
        aset: item.aset?.nama_aset ?? '-',
      }))
      .sort((a, b) => a.noKontrak.localeCompare(b.noKontrak))
  }, [allKompensasi, daftarKS])

  const tahapOptions = useMemo(() => {
    if (!selectedKsId) return []
    return allKompensasi
      .filter(k => k.ks_id === selectedKsId)
      .map(k => ({
        id: k.id,
        periode: k.periode_label ?? formatTanggal(k.tgl_jatuh_tempo),
        jatuhTempo: k.tgl_jatuh_tempo,
        total: k.total_tagihan,
        hasInvoice: !!k.no_invoice,
      }))
      .sort((a, b) => a.jatuhTempo.localeCompare(b.jatuhTempo))
  }, [selectedKsId, allKompensasi])

  const handleKsChange = (ksId: string) => {
    setSelectedKsId(ksId)
    const first = allKompensasi
      .filter(k => k.ks_id === ksId)
      .sort((a, b) => a.tgl_jatuh_tempo.localeCompare(b.tgl_jatuh_tempo))[0]
    setSelectedId(first?.id ?? '')
  }

  useEffect(() => {
    if (selected && selected.ks_id !== selectedKsId) {
      setSelectedKsId(selected.ks_id)
    }
  }, [selected?.ks_id])

  const fetchInvoiceDocStatus = () => {
    if (!selectedId) return
    api.get<{ requirements: SupermanDocRequirement[] }>(
      `/api/superman/doc-requirements?kompensasi_id=${selectedId}`,
    ).then(res => {
      const inv = res.requirements.find(r => r.doc_type === 'invoice')
      setInvoiceUploaded(!!inv?.uploaded)
      setInvoiceFileName(inv?.file_name ?? null)
    }).catch(() => {})
  }

  useEffect(() => { fetchInvoiceDocStatus() }, [selectedId])

  // Depend field stabil (bukan object baru tiap render) agar preview tidak rebuild terus
  useEffect(() => {
    if (!selected || !noInvoice.trim()) {
      setDocxBlob(null)
      setPreviewLoading(false)
      return
    }
    const payload = { ...selected, kerja_sama: ks }
    let cancelled = false
    setPreviewLoading(true)
    const timer = setTimeout(() => {
      buildInvoiceKompensasiDocxBlob(payload, noInvoice, tanggalSurat, { forPreview: true })
        .then(blob => { if (!cancelled) setDocxBlob(blob) })
        .catch(() => { if (!cancelled) setDocxBlob(null) })
        .finally(() => { if (!cancelled) setPreviewLoading(false) })
    }, 150)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [
    selected?.id,
    selected?.total_tagihan,
    selected?.pengurang,
    selected?.periode_label,
    selected?.tgl_jatuh_tempo,
    selected?.no_invoice,
    ks?.id,
    ks?.nama_mitra,
    (ks?.aset as { nama_aset?: string } | undefined)?.nama_aset,
    noInvoice,
    tanggalSurat,
  ])

  const handleSaveAndDownload = async () => {
    if (!kompensasiWithKs) return
    setSaving(true)
    try {
      await supabase.from('kompensasi').update({
        no_invoice: noInvoice,
        invoice_tgl: tanggalSurat,
      }).eq('id', kompensasiWithKs.id)
      await fetchAllKompensasi()
      setInvoiceSaved(true)
      fetchInvoiceDocStatus()
      await generateInvoiceKompensasiDocx(kompensasiWithKs, noInvoice, tanggalSurat)
    } catch (e) {
      console.error(e)
      alert('Gagal menyimpan atau mengunduh invoice.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4 pb-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-800">Buat Invoice</h1>
          <p className="text-xs text-gray-500 mt-1">
            Tagihan kompensasi mitra · isi form kiri · preview dokumen di kanan · unduh .docx
          </p>
        </div>
        {selected && (
          <div className="flex flex-wrap items-center gap-1.5">
            {hasInvoiceInDb || invoiceSaved ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                <CheckCircle2 size={12} /> No. invoice tersimpan
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
                <FileText size={12} /> Belum disimpan
              </span>
            )}
            {invoiceUploaded && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                <Upload size={12} /> PDF terlampir
              </span>
            )}
          </div>
        )}
      </div>

      {/* Step indicator */}
      <div className="bg-white border rounded-xl px-3 sm:px-4 py-3 shadow-sm">
        <ol className="flex flex-wrap items-center gap-1 sm:gap-0">
          {STEPS.map((s, i) => {
            const done = activeStep > s.n || (s.n === 4 && invoiceUploaded)
            const current = activeStep === s.n && !(s.n === 4 && invoiceUploaded)
            return (
              <li key={s.n} className="flex items-center min-w-0">
                {i > 0 && (
                  <span className={cn(
                    'hidden sm:block w-6 h-px mx-1.5 shrink-0',
                    done || current ? 'bg-[#1B4F72]/40' : 'bg-gray-200',
                  )} />
                )}
                <span className={cn(
                  'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors',
                  done && 'bg-emerald-50 text-emerald-700',
                  current && 'bg-[#1B4F72] text-white shadow-sm',
                  !done && !current && 'bg-gray-50 text-gray-400',
                )}>
                  <span className={cn(
                    'flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-bold shrink-0',
                    done && 'bg-emerald-200/80 text-emerald-800',
                    current && 'bg-white/20 text-white',
                    !done && !current && 'bg-gray-200 text-gray-500',
                  )}>
                    {done ? '✓' : s.n}
                  </span>
                  <span className="hidden xs:inline sm:inline truncate">{s.label}</span>
                </span>
              </li>
            )
          })}
        </ol>
      </div>

      {/* Split workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(340px,420px)_1fr] gap-4 items-start">
        {/* ── Form ─────────────────────────────────────────── */}
        <div className="space-y-3 min-w-0">
          {/* Card: pilih tagihan */}
          <Card className="shadow-sm border-gray-200/80 overflow-hidden">
            <CardHeader className="py-3.5 px-5 border-b bg-white">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#1B4F72]/10 text-[#1B4F72] shrink-0">
                  <ClipboardList size={16} />
                </span>
                <div>
                  <CardTitle className="text-sm font-semibold text-gray-900">Pilih Tagihan</CardTitle>
                  <p className="text-[11px] text-gray-500">Kontrak mitra dan tahap kompensasi</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-5 py-4 space-y-3.5">
              <div>
                <Label className="text-xs text-gray-600 inline-flex items-center gap-1.5">
                  <Building2 size={12} className="text-gray-400" />
                  No. Kontrak
                </Label>
                <div className="mt-1.5">
                  <SearchableSelect
                    className="h-9"
                    value={selectedKsId}
                    onValueChange={handleKsChange}
                    options={ksOptions.map(o => ({
                      value: o.id,
                      label: o.noKontrak,
                      description: `${o.mitra} · ${o.aset}`,
                      searchText: `${o.noKontrak} ${o.mitra} ${o.aset}`,
                    }))}
                    placeholder="Cari no. kontrak / mitra..."
                    searchPlaceholder="Ketik nomor kontrak, mitra, atau aset..."
                  />
                </div>
                {ks && (
                  <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2">
                    <p className="text-xs font-medium text-gray-800 leading-snug">{ks.nama_mitra}</p>
                    <p className="text-[11px] text-gray-500 mt-0.5">{ks.aset?.nama_aset ?? '-'}</p>
                  </div>
                )}
              </div>

              <div>
                <Label className="text-xs text-gray-600 inline-flex items-center gap-1.5">
                  <CalendarDays size={12} className="text-gray-400" />
                  Tahap Pembayaran
                </Label>
                <div className="mt-1.5">
                  <SearchableSelect
                    className="h-9"
                    value={selectedId}
                    disabled={!selectedKsId}
                    onValueChange={setSelectedId}
                    options={tahapOptions.map(o => ({
                      value: o.id,
                      label: o.periode,
                      description: `${formatRupiah(o.total)}${o.hasInvoice ? ' · ada invoice' : ' · belum invoice'}`,
                      searchText: `${o.periode} ${formatRupiah(o.total)}`,
                    }))}
                    placeholder={selectedKsId ? 'Cari & pilih tahap...' : 'Pilih kontrak dulu'}
                    searchPlaceholder="Ketik label periode..."
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card: ringkasan */}
          {selected && ws && (
            <Card className="shadow-sm border-gray-200/80 overflow-hidden">
              <CardHeader className="py-3 px-5 border-b bg-white">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 shrink-0">
                      <Banknote size={15} />
                    </span>
                    <CardTitle className="text-sm font-semibold text-gray-900">Ringkasan Tagihan</CardTitle>
                  </div>
                  <StatusBadge type="bayar" value={ws.statusBayar} />
                </div>
              </CardHeader>
              <CardContent className="px-5 py-3.5">
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="rounded-xl border bg-white px-3 py-2.5 shadow-sm">
                    <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">Total tagihan</p>
                    <CurrencyDisplay value={selected.total_tagihan} size="sm" className="text-gray-900 mt-0.5" />
                  </div>
                  <div className="rounded-xl border bg-white px-3 py-2.5 shadow-sm">
                    <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">Sisa</p>
                    <CurrencyDisplay
                      value={ws.sisaTagihan}
                      size="sm"
                      className={cn('mt-0.5', ws.sisaTagihan > 0 ? 'text-red-600' : 'text-emerald-700')}
                    />
                  </div>
                  <div className="col-span-2 rounded-xl border bg-slate-50/80 px-3 py-2.5 flex items-center justify-between gap-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-gray-400 font-medium">Jatuh tempo</p>
                      <p className="text-sm font-medium text-gray-800 mt-0.5">{formatTanggal(selected.tgl_jatuh_tempo)}</p>
                    </div>
                    {selected.periode_label && (
                      <span className="text-[11px] text-gray-600 bg-white border rounded-md px-2 py-1 max-w-[50%] truncate">
                        {selected.periode_label}
                      </span>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Card: detail + aksi */}
          {selected && (
            <Card className="shadow-sm border-gray-200/80 overflow-hidden">
              <CardHeader className="py-3.5 px-5 border-b bg-white">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700 shrink-0">
                    <Hash size={16} />
                  </span>
                  <div>
                    <CardTitle className="text-sm font-semibold text-gray-900">Detail Invoice</CardTitle>
                    <p className="text-[11px] text-gray-500">Nomor & tanggal surat — muncul di preview</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-5 py-4 space-y-3.5">
                <div>
                  <Label className="text-xs text-gray-600">No. Invoice</Label>
                  <Input
                    value={noInvoice}
                    onChange={e => setNoInvoice(e.target.value)}
                    className="mt-1.5 h-9 font-mono text-sm"
                    placeholder="No. invoice otomatis / edit manual"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-600">Tanggal Surat</Label>
                  <Input
                    type="date"
                    value={tanggalSurat}
                    onChange={e => setTanggalSurat(e.target.value)}
                    className="mt-1.5 h-9"
                  />
                </div>

                <div className="pt-1 flex flex-col gap-2">
                  <Button
                    onClick={handleSaveAndDownload}
                    disabled={saving || !noInvoice.trim()}
                    className="w-full h-10 bg-[#1B4F72] hover:bg-[#163f5c] shadow-sm"
                  >
                    <FileDown size={15} />
                    {saving ? 'Menyimpan...' : 'Simpan & Unduh .docx'}
                  </Button>
                  <p className="text-[10px] text-gray-400 text-center leading-relaxed">
                    Menyimpan no. invoice ke database lalu mengunduh file Word
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Card: upload Superman */}
          {showUpload && selected && (
            <Card className={cn(
              'shadow-sm overflow-hidden',
              invoiceUploaded
                ? 'border-emerald-200 ring-1 ring-emerald-100'
                : 'border-gray-200/80',
            )}>
              <CardHeader className="py-3.5 px-5 border-b bg-white">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={cn(
                      'flex h-9 w-9 items-center justify-center rounded-lg shrink-0',
                      invoiceUploaded ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
                    )}>
                      <Upload size={16} />
                    </span>
                    <div>
                      <CardTitle className="text-sm font-semibold text-gray-900">Upload untuk Superman</CardTitle>
                      <p className="text-[11px] text-gray-500">
                        PDF/gambar hasil cetak — wajib hanya saat deklarasi SPPn
                      </p>
                    </div>
                  </div>
                  <span className={cn(
                    'text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0',
                    invoiceUploaded
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700',
                  )}>
                    {invoiceUploaded ? 'Lengkap' : 'Opsional'}
                  </span>
                </div>
              </CardHeader>
              <CardContent className="px-5 py-4 space-y-3">
                <div className="rounded-xl border bg-slate-50/60 px-3 py-1">
                  <DocumentUpload
                    entityType="kompensasi"
                    entityId={selected.id}
                    docType="invoice"
                    label="File Invoice (PDF/gambar)"
                    uploaded={invoiceUploaded}
                    fileName={invoiceFileName}
                    onUploaded={fetchInvoiceDocStatus}
                  />
                </div>

                {invoiceUploaded ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5">
                    <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                    <p className="text-xs text-emerald-800 flex-1 min-w-[140px]">
                      Invoice siap untuk deklarasi Superman
                    </p>
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="h-8 text-xs border-emerald-600 text-emerald-700 hover:bg-emerald-100"
                    >
                      <Link to={`/jalur-b/pembayaran?kompensasi_id=${selected.id}`}>
                        Ke Pembayaran <ArrowRight size={12} />
                      </Link>
                    </Button>
                  </div>
                ) : (
                  <p className="text-[11px] text-gray-500 leading-relaxed">
                    Upload tidak wajib untuk membuat invoice. Lampirkan PDF bila akan kirim ke Superman dari menu Cash In.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {!selected && (
            <div className="rounded-xl border border-dashed border-gray-200 bg-white px-5 py-8 text-center">
              <div className="mx-auto w-11 h-11 rounded-xl bg-slate-50 flex items-center justify-center mb-3">
                <FileText size={20} className="text-slate-400" />
              </div>
              <p className="text-sm font-medium text-gray-700">Belum ada tagihan dipilih</p>
              <p className="text-xs text-gray-500 mt-1 max-w-xs mx-auto leading-relaxed">
                Pilih no. kontrak dan tahap pembayaran untuk mengisi detail dan melihat preview
              </p>
            </div>
          )}
        </div>

        {/* ── Preview ──────────────────────────────────────── */}
        <div className="min-w-0 xl:sticky xl:top-4 xl:self-start">
          <div className="rounded-xl border border-gray-200/80 shadow-sm overflow-hidden h-[min(78vh,820px)] min-h-[420px] flex flex-col">
            <InvoicePreviewPanel
              docxBlob={docxBlob}
              loading={previewLoading}
              ready={!!kompensasiWithKs && !!noInvoice.trim()}
              mitra={ks?.nama_mitra}
              periode={selected?.periode_label ?? undefined}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
