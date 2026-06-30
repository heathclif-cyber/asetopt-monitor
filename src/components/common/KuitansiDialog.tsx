import { useState } from 'react'
import { FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { formatRupiah, formatTanggal } from '@/lib/utils'
import { terbilang } from '@/utils/terbilang'
import { Kompensasi, Pembayaran } from '@/types'
import {
  A4_PREVIEW, BANK_INFO, escXml, formatTanggalSurat,
  letterfooterHTML, letterheadHTML, LETTER_STYLES, loadTemplate, patchDocumentXml, downloadDocx,
} from '@/utils/invoiceDocxUtils'

interface Props {
  open: boolean
  onClose: () => void
  kompensasi: Kompensasi
  pembayaran: Pembayaran
}

function buildPreviewHTML(k: Kompensasi, p: Pembayaran, baseUrl: string) {
  const ks = k.kerja_sama
  const aset = (ks?.aset as any)?.nama_aset ?? '-'
  const noInv = k.no_invoice ?? '-'
  const keterangan = `Kompensasi sewa ${aset} periode ${k.periode_label ?? formatTanggal(k.tgl_jatuh_tempo)} sesuai Invoice No. ${noInv}`

  return `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8"><style>${LETTER_STYLES}
  .title { text-align: center; font-size: 14pt; font-weight: bold; text-decoration: underline; margin-bottom: 8pt; }
  .no { text-align: center; margin-bottom: 16pt; }
  .row { display: grid; grid-template-columns: 160px 12px 1fr; margin-bottom: 6pt; }
  .bank { margin-top: 16pt; }
  .sign { margin-top: 32pt; text-align: right; }
  </style></head><body><div class="page">
  ${letterheadHTML(baseUrl)}
  <div class="body">
    <div class="title">KUITANSI</div>
    <div class="no">No. ${noInv}</div>
    <div class="row"><span>Telah Diterima Dari</span><span>:</span><strong>${ks?.nama_mitra ?? '-'}</strong></div>
    <div class="row"><span>Banyaknya Uang (Termasuk PPN)</span><span>:</span><strong>${formatRupiah(p.nominal_bayar)}</strong></div>
    <div class="row"><span>Terbilang</span><span>:</span><em>${terbilang(p.nominal_bayar)}</em></div>
    <div class="row"><span>Untuk Pembayaran</span><span>:</span>${keterangan}</div>
    <table class="bank">
      <tr><td class="lbl">Bank Penerima</td><td class="sep">:</td><td>${BANK_INFO.bank}</td></tr>
      <tr><td class="lbl">Nama Pemilik Rekening</td><td class="sep">:</td><td>${BANK_INFO.atasNama}</td></tr>
      <tr><td class="lbl">Nomor Rekening</td><td class="sep">:</td><td>${BANK_INFO.rekening}</td></tr>
    </table>
    <div class="sign">Makassar, ${formatTanggalSurat(p.tgl_bayar)}</div>
  </div>
  ${letterfooterHTML(baseUrl)}
</div></body></html>`
}

async function generateDocx(k: Kompensasi, p: Pembayaran) {
  const ks = k.kerja_sama
  const aset = (ks?.aset as any)?.nama_aset ?? '-'
  const noInv = k.no_invoice ?? '-'
  const keterangan = `Kompensasi sewa ${aset} periode ${k.periode_label ?? formatTanggal(k.tgl_jatuh_tempo)} sesuai Invoice No. ${noInv}`

  const zip = await loadTemplate('/invoice/kuitansi_template.docx')
  await patchDocumentXml(zip, (xml) => {
    xml = xml.replace('PT Sinergi Perkebunan Nusantara', escXml(ks?.nama_mitra ?? '-'))
    xml = xml.replace('Rp1.298.753.502', escXml(formatRupiah(p.nominal_bayar)))
    xml = xml.replace(
      'Satu Miliar Dua Ratus Sembilan Puluh Delapan Juta Tujuh Ratus Lima Puluh Tiga Ribu Lima Ratus Dua Rupiah',
      escXml(terbilang(p.nominal_bayar)),
    )
    xml = xml.replace(
      /Pembelian TBS Kelapa Sawit sesuai Invoice No\. [^<]+/,
      escXml(keterangan),
    )
    xml = xml.replace('Makassar, 21 April 2026', escXml(`Makassar, ${formatTanggalSurat(p.tgl_bayar)}`))
    if (xml.includes('No.     ')) {
      xml = xml.replace('No.     ', escXml(`No. ${noInv}`))
    }
    return xml
  })
  await downloadDocx(zip, `Kuitansi_${(ks?.nama_mitra ?? 'mitra').replace(/[^a-zA-Z0-9]/g, '_')}.docx`)
}

export function KuitansiDialog({ open, onClose, kompensasi, pembayaran }: Props) {
  const [loading, setLoading] = useState(false)
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
  const previewHtml = buildPreviewHTML(kompensasi, pembayaran, baseUrl)
  const previewW = Math.round(A4_PREVIEW.width * A4_PREVIEW.scale)
  const previewH = Math.round(A4_PREVIEW.height * A4_PREVIEW.scale)

  const handleDownload = async () => {
    setLoading(true)
    try {
      await generateDocx(kompensasi, pembayaran)
    } catch (e) {
      console.error(e)
      alert('Gagal mengunduh kuitansi.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-4xl p-0 gap-0 overflow-hidden">
        <div className="flex h-full">
          <div className="flex flex-col w-72 shrink-0 border-r p-5">
            <DialogHeader className="p-0 mb-4">
              <DialogTitle>Kuitansi</DialogTitle>
            </DialogHeader>
            <div className="text-xs text-gray-600 space-y-2 flex-1">
              <p><span className="text-gray-400">Nominal:</span> {formatRupiah(pembayaran.nominal_bayar)}</p>
              <p><span className="text-gray-400">Tanggal:</span> {formatTanggal(pembayaran.tgl_bayar)}</p>
            </div>
            <DialogFooter className="p-0 pt-4">
              <Button variant="outline" onClick={onClose}>Tutup</Button>
              <Button onClick={handleDownload} disabled={loading} className="bg-[#1B4F72]">
                <FileDown size={14} /> {loading ? '...' : 'Unduh DOCX'}
              </Button>
            </DialogFooter>
          </div>
          <div className="flex-1 bg-gray-100 p-4 flex justify-center">
            <iframe title="Preview Kuitansi" srcDoc={previewHtml}
              style={{ width: previewW, height: previewH, border: '1px solid #ccc', background: '#fff' }} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}