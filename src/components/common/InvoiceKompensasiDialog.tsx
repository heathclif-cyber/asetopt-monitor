import { useEffect, useState } from 'react'
import { FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { formatRupiah } from '@/lib/utils'
import { Kompensasi } from '@/types'
import { supabase } from '@/lib/supabase'
import { generateNoInvoice } from '@/utils/invoiceDocxUtils'
import { DocxPreview } from '@/components/common/DocxPreview'
import {
  buildInvoiceKompensasiDocxBlob,
  generateInvoiceKompensasiDocx,
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
  const [docxBlob, setDocxBlob] = useState<Blob | null>(null)

  useEffect(() => {
    if (!open) return
    setNoInvoice(
      kompensasi.no_invoice ?? generateNoInvoice(kodeAset, kompensasi.periode_label, kompensasi.tgl_jatuh_tempo),
    )
    setTanggalSurat(kompensasi.invoice_tgl ?? today)
  }, [open, kompensasi.id, kompensasi.no_invoice, kompensasi.invoice_tgl])

  useEffect(() => {
    if (!open || !noInvoice.trim()) {
      setDocxBlob(null)
      return
    }
    let cancelled = false
    const timer = setTimeout(() => {
      buildInvoiceKompensasiDocxBlob(kompensasi, noInvoice, tanggalSurat)
        .then(blob => { if (!cancelled) setDocxBlob(blob) })
        .catch(() => { if (!cancelled) setDocxBlob(null) })
    }, 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [open, kompensasi, noInvoice, tanggalSurat])

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
                <div className="flex justify-between"><span className="text-gray-500">Total</span><span className="font-medium">{formatRupiah(kompensasi.total_tagihan)}</span></div>
              </div>
            </div>
            <DialogFooter className="px-5 py-4 border-t">
              <Button variant="outline" onClick={onClose}>Batal</Button>
              <Button onClick={handleSaveAndDownload} disabled={saving || downloading} className="bg-[#1B4F72]">
                <FileDown size={14} /> {saving || downloading ? 'Memproses...' : 'Simpan & Unduh'}
              </Button>
            </DialogFooter>
          </div>
          <div className="flex-1 bg-slate-800 p-4 overflow-auto">
            <DocxPreview blob={docxBlob} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}