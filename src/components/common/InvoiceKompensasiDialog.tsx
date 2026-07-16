import { useEffect, useMemo, useState } from 'react'
import { FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { formatRupiah } from '@/lib/utils'
import { Kompensasi } from '@/types'
import { supabase } from '@/lib/supabase'
import { generateNoInvoice } from '@/utils/invoiceDocxUtils'
import {
  buildInvoiceKompensasiHtml,
  generateInvoiceKompensasiDocx,
  getEfektifTagihan,
} from '@/utils/invoiceKompensasiPreview'

interface Props {
  open: boolean
  onClose: () => void
  kompensasi: Kompensasi
  onSaved?: () => void
}

export function InvoiceKompensasiDialog({ open, onClose, kompensasi, onSaved }: Props) {
  const today = new Date().toISOString().split('T')[0]
  const ks = kompensasi.kerja_sama
  const kodeAset = (ks?.aset as { kode_aset?: string } | undefined)?.kode_aset ?? 'AST'
  const [noInvoice, setNoInvoice] = useState(
    kompensasi.no_invoice ?? generateNoInvoice(kodeAset, kompensasi.periode_label, kompensasi.tgl_jatuh_tempo),
  )
  const [tanggalSurat, setTanggalSurat] = useState(kompensasi.invoice_tgl ?? today)
  const [saving, setSaving] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!open) return
    setNoInvoice(
      kompensasi.no_invoice ?? generateNoInvoice(kodeAset, kompensasi.periode_label, kompensasi.tgl_jatuh_tempo),
    )
    setTanggalSurat(kompensasi.invoice_tgl ?? today)
  }, [open, kompensasi.id, kompensasi.no_invoice, kompensasi.invoice_tgl])

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const previewHtml = useMemo(() => {
    if (!open || !noInvoice.trim()) return ''
    return buildInvoiceKompensasiHtml(kompensasi, noInvoice, tanggalSurat, baseUrl)
  }, [open, kompensasi, noInvoice, tanggalSurat, baseUrl])

  const handleSaveAndDownload = async () => {
    setSaving(true)
    try {
      await supabase.from('kompensasi').update({
        no_invoice: noInvoice,
        invoice_tgl: tanggalSurat,
      }).eq('id', kompensasi.id)
      onSaved?.()
      setDownloading(true)
      await generateInvoiceKompensasiDocx(kompensasi, noInvoice, tanggalSurat)
    } catch (e) {
      console.error(e)
      alert('Gagal menyimpan atau mengunduh invoice.')
    } finally {
      setSaving(false)
      setDownloading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-5xl p-0 gap-0 overflow-hidden">
        <div className="flex h-full min-h-[520px]">
          <div className="flex flex-col w-80 shrink-0 border-r">
            <DialogHeader className="px-5 py-4 border-b">
              <DialogTitle>Invoice Kompensasi</DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-sm">
              <div>
                <Label>No. Invoice</Label>
                <Input value={noInvoice} onChange={e => setNoInvoice(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Tanggal Invoice</Label>
                <Input type="date" value={tanggalSurat} onChange={e => setTanggalSurat(e.target.value)} className="mt-1" />
              </div>
              <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-gray-500">Mitra</span><span>{ks?.nama_mitra}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Periode</span><span>{kompensasi.periode_label ?? '-'}</span></div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Total ditagih</span>
                  <span className="font-medium">{formatRupiah(getEfektifTagihan(kompensasi))}</span>
                </div>
              </div>
              <p className="text-[11px] text-gray-500 leading-relaxed">
                Format: surat tagihan formal (bukan kuitansi). Kuitansi dibuat setelah cash in.
              </p>
            </div>
            <DialogFooter className="px-5 py-4 border-t">
              <Button variant="outline" onClick={onClose}>Batal</Button>
              <Button onClick={handleSaveAndDownload} disabled={saving || downloading} className="bg-[#1B4F72]">
                <FileDown size={14} /> {saving || downloading ? 'Memproses...' : 'Simpan & Unduh'}
              </Button>
            </DialogFooter>
          </div>
          <div className="flex-1 bg-slate-100 p-4 overflow-auto flex justify-center">
            {previewHtml ? (
              <iframe
                title="Preview invoice"
                srcDoc={previewHtml}
                className="bg-white shadow border-0"
                style={{ width: 560, height: 792, transform: 'scale(0.9)', transformOrigin: 'top center' }}
                sandbox=""
              />
            ) : (
              <p className="text-sm text-gray-400 self-center">Isi no. invoice untuk preview</p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
