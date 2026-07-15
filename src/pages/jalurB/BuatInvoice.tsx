import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { FileDown, ArrowRight, CheckCircle2, Upload } from 'lucide-react'
import { useKompensasiStore } from '@/store/kompensasiStore'
import { useKerjaSamaStore } from '@/store/kerjaSamaStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SearchableSelect } from '@/components/common/SearchableSelect'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { StatusBadge } from '@/components/common/StatusBadge'
import { DocumentUpload } from '@/components/common/DocumentUpload'
import { InvoicePreviewPanel } from '@/components/common/InvoicePreviewPanel'
import { api } from '@/lib/apiClient'
import { supabase } from '@/lib/supabase'
import { formatRupiah, formatTanggal } from '@/lib/utils'
import { generateNoInvoice } from '@/utils/invoiceDocxUtils'
import {
  buildInvoiceKompensasiDocxBlob,
  generateInvoiceKompensasiDocx,
} from '@/utils/invoiceKompensasiPreview'
import type { SupermanDocRequirement } from '@/types'

const today = () => new Date().toISOString().split('T')[0]

function Section({ step, title, children }: { step: number; title: string; children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#1B4F72] text-[11px] font-bold text-white shrink-0">
          {step}
        </span>
        <h2 className="text-sm font-semibold text-gray-800">{title}</h2>
      </div>
      <div className="pl-8">{children}</div>
    </section>
  )
}

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

  useEffect(() => {
    if (!kompensasiWithKs || !noInvoice.trim()) {
      setDocxBlob(null)
      return
    }
    let cancelled = false
    setPreviewLoading(true)
    const timer = setTimeout(() => {
      buildInvoiceKompensasiDocxBlob(kompensasiWithKs, noInvoice, tanggalSurat)
        .then(blob => { if (!cancelled) setDocxBlob(blob) })
        .catch(() => { if (!cancelled) setDocxBlob(null) })
        .finally(() => { if (!cancelled) setPreviewLoading(false) })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [kompensasiWithKs, noInvoice, tanggalSurat])

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

  const showUpload = hasInvoiceInDb || invoiceSaved

  return (
    <div className="-m-5 flex flex-col lg:flex-row min-h-[calc(100vh-56px)]">
      <aside className="w-full lg:w-[400px] xl:w-[420px] shrink-0 bg-white border-b lg:border-b-0 lg:border-r flex flex-col max-h-[50vh] lg:max-h-none">
        <div className="px-5 py-4 border-b shrink-0">
          <h1 className="text-lg font-bold text-gray-900">Buat Invoice</h1>
          <p className="text-xs text-gray-500 mt-0.5">Tagihan kompensasi mitra — preview di panel kanan</p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
          <Section step={1} title="Pilih Tagihan">
            <div className="space-y-3">
              <div>
                <Label className="text-xs text-gray-600">No. Kontrak</Label>
                <div className="mt-1">
                  <SearchableSelect
                    className="h-9"
                    value={selectedKsId}
                    onValueChange={handleKsChange}
                    options={ksOptions.map(o => ({
                      value: o.id,
                      label: o.noKontrak,
                      searchText: `${o.noKontrak}`,
                    }))}
                    placeholder="Cari no. kontrak..."
                    searchPlaceholder="Ketik nomor kontrak..."
                  />
                </div>
                {ks && (
                  <p className="text-[11px] text-gray-500 mt-1.5 leading-snug">
                    {ks.nama_mitra} · {ks.aset?.nama_aset ?? '-'}
                  </p>
                )}
              </div>

              <div>
                <Label className="text-xs text-gray-600">Tahap Pembayaran</Label>
                <div className="mt-1">
                  <SearchableSelect
                    className="h-9"
                    value={selectedId}
                    disabled={!selectedKsId}
                    onValueChange={setSelectedId}
                    options={tahapOptions.map(o => ({
                      value: o.id,
                      label: `${o.periode} — ${formatRupiah(o.total)}${!o.hasInvoice ? ' · baru' : ''}`,
                      searchText: o.periode,
                    }))}
                    placeholder="Cari & pilih tahap..."
                    searchPlaceholder="Ketik label periode..."
                  />
                </div>
              </div>
            </div>
          </Section>

          {selected && ws && (
            <Section step={2} title="Ringkasan Tagihan">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">Total</p>
                  <CurrencyDisplay value={selected.total_tagihan} size="sm" />
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide">Sisa</p>
                  <CurrencyDisplay value={ws.sisaTagihan} size="sm" className="text-red-600" />
                </div>
                <div className="rounded-lg bg-gray-50 px-3 py-2 col-span-2 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-gray-500 uppercase tracking-wide">Jatuh Tempo</p>
                    <p className="text-sm font-medium">{formatTanggal(selected.tgl_jatuh_tempo)}</p>
                  </div>
                  <StatusBadge type="bayar" value={ws.statusBayar} />
                </div>
              </div>
            </Section>
          )}

          {selected && (
            <Section step={3} title="Detail Invoice">
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-gray-600">No. Invoice</Label>
                  <Input
                    value={noInvoice}
                    onChange={e => setNoInvoice(e.target.value)}
                    className="mt-1 h-9 font-mono text-sm"
                  />
                </div>
                <div>
                  <Label className="text-xs text-gray-600">Tanggal Surat</Label>
                  <Input
                    type="date"
                    value={tanggalSurat}
                    onChange={e => setTanggalSurat(e.target.value)}
                    className="mt-1 h-9"
                  />
                </div>
                <Button
                  onClick={handleSaveAndDownload}
                  disabled={saving || !noInvoice.trim()}
                  className="w-full bg-[#1B4F72] h-10"
                >
                  <FileDown size={15} />
                  {saving ? 'Menyimpan...' : 'Simpan & Unduh .docx'}
                </Button>
              </div>
            </Section>
          )}

          {showUpload && selected && (
            <Section step={4} title="Upload untuk Superman">
              <div className="rounded-lg border bg-gray-50/50 p-3">
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
              {invoiceUploaded && (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-green-50 border border-green-200 px-3 py-2.5">
                  <CheckCircle2 size={16} className="text-green-600 shrink-0" />
                  <p className="text-xs text-green-800 flex-1">Invoice lengkap</p>
                  <Button asChild variant="outline" size="sm" className="h-8 text-xs border-green-600 text-green-700">
                    <Link to={`/jalur-b/pembayaran?kompensasi_id=${selected.id}`}>
                      Pembayaran <ArrowRight size={12} />
                    </Link>
                  </Button>
                </div>
              )}
              {!invoiceUploaded && (
                <p className="text-[11px] text-gray-500 flex items-center gap-1 mt-2">
                  <Upload size={12} /> Upload PDF hasil cetak invoice untuk deklarasi Superman
                </p>
              )}
            </Section>
          )}
        </div>
      </aside>

      <InvoicePreviewPanel
        docxBlob={docxBlob}
        loading={previewLoading}
        ready={!!kompensasiWithKs}
        mitra={ks?.nama_mitra}
        periode={selected?.periode_label ?? undefined}
      />
    </div>
  )
}