import JSZip from 'jszip'
import { formatRupiah, formatTanggal } from '@/lib/utils'
import { terbilang } from '@/utils/terbilang'
import { Kompensasi } from '@/types'
import {
  escXml,
  formatTanggalSurat,
  loadTemplate,
  patchDocumentXml,
  downloadDocx,
} from '@/utils/invoiceDocxUtils'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

async function patchInvoiceKompensasiZip(
  zip: JSZip,
  k: Kompensasi,
  noInvoice: string,
  tanggalSurat: string,
): Promise<void> {
  const ks = k.kerja_sama
  const aset = ks?.aset as { nama_aset?: string } | undefined
  const namaAset = aset?.nama_aset ?? '-'
  const pengurang = k.pengurang ?? 0
  const efektif = Math.max(0, (k.total_tagihan ?? 0) - pengurang)

  await patchDocumentXml(zip, (xml) => {
    xml = xml.replace('KUITANSI', 'INVOICE')
    xml = xml.replace('PT Sinergi Perkebunan Nusantara', escXml(ks?.nama_mitra ?? '-'))
    xml = xml.replace('Rp1.298.753.502', escXml(formatRupiah(efektif)))
    xml = xml.replace(
      'Satu Miliar Dua Ratus Sembilan Puluh Delapan Juta Tujuh Ratus Lima Puluh Tiga Ribu Lima Ratus Dua Rupiah',
      escXml(terbilang(efektif)),
    )
    xml = xml.replace(
      /Pembelian TBS Kelapa Sawit sesuai Invoice No\. [^<]+/,
      escXml(`Kompensasi sewa ${namaAset} periode ${k.periode_label ?? formatTanggal(k.tgl_jatuh_tempo)} sesuai Invoice No. ${noInvoice}`),
    )
    xml = xml.replace('Makassar, 21 April 2026', escXml(`Makassar, ${formatTanggalSurat(tanggalSurat)}`))
    if (xml.includes('No.     ')) {
      xml = xml.replace('No.     ', escXml(`No. ${noInvoice}`))
    }
    return xml
  })
}

export async function buildInvoiceKompensasiDocxBlob(
  k: Kompensasi,
  noInvoice: string,
  tanggalSurat: string,
): Promise<Blob> {
  const zip = await loadTemplate('/invoice/template_invoice_kompensasi.docx')
  await patchInvoiceKompensasiZip(zip, k, noInvoice, tanggalSurat)
  return zip.generateAsync({
    type: 'blob',
    mimeType: DOCX_MIME,
  })
}

export async function generateInvoiceKompensasiDocx(
  k: Kompensasi,
  noInvoice: string,
  tanggalSurat: string,
): Promise<void> {
  const blob = await buildInvoiceKompensasiDocxBlob(k, noInvoice, tanggalSurat)
  const ks = k.kerja_sama
  const mitra = (ks?.nama_mitra ?? 'mitra').replace(/[^a-zA-Z0-9]/g, '_')
  const filename = `Invoice_${mitra}_${noInvoice.replace(/[^a-zA-Z0-9]/g, '_')}.docx`

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}