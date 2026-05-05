import { useState } from 'react'
import JSZip from 'jszip'
import { FileDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { formatRupiah, formatTanggal } from '@/lib/utils'
import { terbilang } from '@/utils/terbilang'
import { KerjaSama, PBBProporsionalResult } from '@/types'

interface InvoicePBBDialogProps {
  open: boolean
  onClose: () => void
  ks: KerjaSama
  hasil: { detail: PBBProporsionalResult[]; totalPBBDitanggung: number }
}

/* ─────────────────────────────────────────────────────────
   Shared data helper
───────────────────────────────────────────────────────── */
interface InvoiceData {
  ks: KerjaSama
  hasil: { detail: PBBProporsionalResult[]; totalPBBDitanggung: number }
  nomorSurat: string
  tanggalSurat: string
  jabatanMitra: string
  alamatMitra: string
}

/* ─────────────────────────────────────────────────────────
   1. DOWNLOAD: generate .docx dari template asli
───────────────────────────────────────────────────────── */
function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function makeTableRow(tahun: number, nilai: string): string {
  return (
    `<w:tr>` +
    `<w:tc><w:tcPr><w:tcW w:w="6033" w:type="dxa"/></w:tcPr>` +
    `<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr>` +
    `<w:r><w:t xml:space="preserve">Pajak Bumi dan Bangunan (PBB) Tahun ${tahun}</w:t></w:r>` +
    `</w:p></w:tc>` +
    `<w:tc><w:tcPr><w:tcW w:w="3436" w:type="dxa"/></w:tcPr>` +
    `<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto"/><w:jc w:val="right"/></w:pPr>` +
    `<w:r><w:t>${escXml(nilai)}</w:t></w:r>` +
    `</w:p></w:tc></w:tr>`
  )
}

async function generateDocx(data: InvoiceData): Promise<void> {
  const { ks, hasil, nomorSurat, tanggalSurat, jabatanMitra, alamatMitra } = data
  const namaAset   = escXml((ks.aset as any)?.nama_aset ?? '-')
  const alamatAset = escXml((ks.aset as any)?.alamat ?? '-')
  const total      = hasil.totalPBBDitanggung

  const res = await fetch('/invoice/template_tagihan_pbb.docx')
  const arrayBuffer = await res.arrayBuffer()
  const zip = await JSZip.loadAsync(arrayBuffer)
  let xml = await zip.file('word/document.xml')!.async('string')

  xml = xml.replace('<w:t>..........</w:t>',
    `<w:t xml:space="preserve">${escXml(formatTanggal(tanggalSurat))}</w:t>`)

  xml = xml.replace(
    '<w:tab/><w:t xml:space="preserve">: </w:t></w:r></w:p><w:p w14:paraId="79B8C05A"',
    `<w:tab/><w:t xml:space="preserve">: ${escXml(nomorSurat)}</w:t></w:r></w:p><w:p w14:paraId="79B8C05A"`)

  xml = xml.replace('<w:t xml:space="preserve"> [Nama Objek Kerja Sama]</w:t>',
    `<w:t xml:space="preserve"> ${namaAset}</w:t>`)

  const jabatanOld =
    '<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t>(</w:t></w:r>' +
    '<w:r w:rsidR="00D74FDD"><w:rPr><w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">Jabatan </w:t></w:r>' +
    '<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t>Pimpinan</w:t></w:r>' +
    '<w:r w:rsidR="004B63D3"><w:rPr><w:b/><w:bCs/></w:rPr><w:t>/kalau perorangan kosongi</w:t></w:r>' +
    '<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t>)</w:t></w:r>'
  xml = xml.replace(jabatanOld,
    jabatanMitra ? `<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t>${escXml(jabatanMitra)}</w:t></w:r>` : '')

  xml = xml.replace('<w:t>(Nama Mitra)</w:t>', `<w:t>${escXml(ks.nama_mitra)}</w:t>`)

  const alamatMitraOld =
    '<w:r w:rsidRPr="00D74FDD"><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>(Alamat</w:t></w:r>' +
    '<w:r w:rsidR="00D74FDD" w:rsidRPr="00D74FDD"><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t xml:space="preserve"> Mitra</w:t></w:r>' +
    '<w:r w:rsidRPr="00D74FDD"><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>)</w:t></w:r>'
  xml = xml.replace(alamatMitraOld, `<w:r><w:t>${escXml(alamatMitra)}</w:t></w:r>`)

  xml = xml.replace('<w:t>(Nomor Perjanjian)</w:t>', `<w:t>${escXml(ks.no_perjanjian ?? '—')}</w:t>`)
  xml = xml.replace('<w:t>(Tanggal Perjanjian)</w:t>', `<w:t>${escXml(formatTanggal(ks.tgl_mulai))}</w:t>`)
  xml = xml.replace('<w:t>(Alamat aset yang dikerjasamakan)</w:t>', `<w:t>${alamatAset}</w:t>`)

  const idx1 = xml.indexOf('<w:tr w:rsidR="00E00460" w:rsidRPr="004C052A" w14:paraId="284F18C5"')
  const idx2 = xml.indexOf('<w:tr w:rsidR="4CC0BE62"')
  if (idx1 !== -1 && idx2 !== -1 && idx2 > idx1) {
    const generatedRows = hasil.detail.map((r) => makeTableRow(r.tahun, formatRupiah(r.pbbProporsional))).join('')
    xml = xml.substring(0, idx1) + generatedRows + xml.substring(idx2)
  }

  xml = xml.replace(
    '<w:r><w:rPr><w:highlight w:val="yellow"/><w:lang w:val="id-ID"/></w:rPr><w:t>Rp</w:t></w:r>',
    `<w:r><w:t>${escXml(formatRupiah(total))}</w:t></w:r>`)

  const terbilangOld =
    '<w:r w:rsidR="00BD6B75"><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t xml:space="preserve">(Total PBB) </w:t></w:r>' +
    '<w:r w:rsidR="006A758E" w:rsidRPr="00EB3496"><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t xml:space="preserve"> (</w:t></w:r>' +
    '<w:r w:rsidR="00BD6B75"><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>Terbilang</w:t></w:r>' +
    '<w:r w:rsidR="006A758E" w:rsidRPr="00EB3496"><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>)</w:t></w:r>'
  xml = xml.replace(terbilangOld,
    `<w:r><w:t xml:space="preserve">${escXml(formatRupiah(total))} (${escXml(terbilang(total))})</w:t></w:r>`)

  // Hapus semua sisa highlight kuning
  xml = xml.replace(/<w:highlight w:val="yellow"\/>/g, '')

  zip.file('word/document.xml', xml)
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `Tagihan_PBB_${ks.nama_mitra.replace(/[^a-zA-Z0-9]/g, '_')}.docx`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/* ─────────────────────────────────────────────────────────
   2. PREVIEW: HTML yang merepresentasikan isi docx
───────────────────────────────────────────────────────── */
function buildPreviewHTML(data: InvoiceData, baseUrl: string): string {
  const { ks, hasil, nomorSurat, tanggalSurat, jabatanMitra, alamatMitra } = data
  const namaAset    = (ks.aset as any)?.nama_aset ?? '-'
  const alamatAset  = (ks.aset as any)?.alamat ?? '-'
  const total       = hasil.totalPBBDitanggung
  const tanggalFmt  = formatTanggal(tanggalSurat)
  const tglMulaiFmt = formatTanggal(ks.tgl_mulai)

  const pbbRows = hasil.detail.map((r) => `
    <tr>
      <td style="border:1px solid #000;padding:5pt 8pt;">Pajak Bumi dan Bangunan (PBB) Tahun ${r.tahun}</td>
      <td style="border:1px solid #000;padding:5pt 8pt;text-align:right;white-space:nowrap;">${formatRupiah(r.pbbProporsional)}</td>
    </tr>`).join('')

  const kepadaLines = [
    jabatanMitra ? `<div>${jabatanMitra}</div>` : '',
    `<div>${ks.nama_mitra}</div>`,
    alamatMitra  ? `<div>${alamatMitra}</div>` : '',
  ].filter(Boolean).join('')

  return `<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8">
<style>
  @page { size: A4 portrait; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Aptos, Calibri, Arial, sans-serif; font-size: 12pt; color: #000; background: #fff; }
  .page { width: 210mm; min-height: 297mm; padding: 0 2.5cm 2cm 3cm; display: flex; flex-direction: column; }
  .header { padding-top: 0.7cm; }
  .header-top { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .header-logo { height: 58px; width: auto; }
  .header-info { text-align: right; font-size: 9.5pt; line-height: 1.45; }
  .header-info .regional { font-size: 13pt; font-weight: bold; }
  .header-line { width: 100%; margin-top: 5px; display: block; }
  .body { flex: 1; padding-top: 14pt; line-height: 1.5; }
  .tanggal { text-align: right; margin-bottom: 12pt; }
  .meta { border-collapse: collapse; margin-bottom: 14pt; }
  .meta td { vertical-align: top; padding: 1pt 0; }
  .meta .lbl { width: 75pt; }
  .meta .sep { width: 8pt; }
  .kepada { margin-bottom: 14pt; line-height: 1.6; }
  .salam { margin-bottom: 8pt; }
  .isi { text-align: justify; margin-bottom: 10pt; line-height: 1.6; }
  .tabel { width: 100%; border-collapse: collapse; margin: 12pt 0; }
  .tabel th { border: 1px solid #000; padding: 5pt 8pt; background: #d9d9d9; font-weight: bold; text-align: center; }
  .bank { border-collapse: collapse; margin: 8pt 0 14pt 14pt; }
  .bank td { padding: 2pt 0; vertical-align: top; }
  .bank .lbl { width: 110pt; }
  .bank .sep { width: 10pt; }
  .penutup { margin-bottom: 28pt; }
  .ttd-wrap { display: flex; justify-content: flex-end; }
  .ttd { text-align: center; width: 195pt; line-height: 1.6; }
  .ttd-space { height: 54pt; }
  .ttd-garis { border-top: 1px solid #000; padding-top: 3pt; }
  .footer { margin-top: auto; padding-top: 8pt; }
  .footer-line { width: 100%; display: block; margin-bottom: 3pt; }
  .footer-body { display: flex; justify-content: space-between; align-items: flex-end; font-size: 8pt; line-height: 1.5; color: #444; }
  .footer-tagline { font-style: italic; color: #666; text-align: right; }
</style></head>
<body><div class="page">
  <div class="header">
    <div class="header-top">
      <img class="header-logo" src="${baseUrl}/invoice/logo-ptpn1.png" alt="PTPN1">
      <div class="header-info">
        <div class="regional">REGIONAL 8</div>
        <div>Alamat: Jalan Urip Sumoharjo No 72-76, Makassar, Sulawesi Selatan</div>
        <div>Telp : 0411-444830 &nbsp;&nbsp; Email: skrh_reg8@ptpn1.co.id</div>
      </div>
    </div>
    <img class="header-line" src="${baseUrl}/invoice/header-line.png" alt="">
  </div>
  <div class="body">
    <div class="tanggal">Makassar, ${tanggalFmt}</div>
    <table class="meta">
      <tr><td class="lbl">Nomor</td><td class="sep">:</td><td>${nomorSurat || ''}</td></tr>
      <tr><td class="lbl">Lampiran</td><td class="sep">:</td><td>-</td></tr>
      <tr><td class="lbl">Perihal</td><td class="sep">:</td><td><strong>Penagihan Pembayaran Pajak Bumi dan Bangunan (PBB) ${namaAset}</strong></td></tr>
    </table>
    <div class="kepada">Kepada Yth.<br>${kepadaLines}</div>
    <p class="salam">Dengan hormat,</p>
    <p class="isi">Menunjuk Perjanjian Kerja Sama Sewa No. <strong>${ks.no_perjanjian ?? '............'}</strong>
      tanggal ${tglMulaiFmt} tentang Pemanfaatan Aset yang berlokasi di ${alamatAset},
      dengan ini kami sampaikan tagihan pembayaran Pajak Bumi dan Bangunan (PBB), dengan rincian sebagai berikut:</p>
    <table class="tabel">
      <thead><tr>
        <th style="text-align:left">Keterangan</th>
        <th style="width:150pt;">Nilai (Rp)</th>
      </tr></thead>
      <tbody>${pbbRows}</tbody>
      <tfoot><tr>
        <td style="border:1px solid #000;padding:5pt 8pt;font-weight:bold;">Total</td>
        <td style="border:1px solid #000;padding:5pt 8pt;text-align:right;font-weight:bold;white-space:nowrap;">${formatRupiah(total)}</td>
      </tr></tfoot>
    </table>
    <p class="isi">Tagihan PBB sebesar <strong>${formatRupiah(total)}</strong>
      (<em>${terbilang(total)}</em>) sebagaimana diatas, dapat segera dibayarkan melalui:</p>
    <table class="bank">
      <tr><td class="lbl">Atas Nama</td><td class="sep">:</td><td>PT Perkebunan Nusantara I Regional 8</td></tr>
      <tr><td class="lbl">Nama Bank</td><td class="sep">:</td><td>Bank Rakyat Indonesia Cabang Ahmad Yani</td></tr>
      <tr><td class="lbl">Nomor Rekening</td><td class="sep">:</td><td>0050-01-005356-30-0</td></tr>
    </table>
    <p class="penutup">Demikian kami sampaikan, atas perhatian dan kerja sama yang baik diucapkan terima kasih.</p>
    <div class="ttd-wrap">
      <div class="ttd">
        <p>Makassar, ${tanggalFmt}</p>
        <p>Kepala Bagian/Manager</p>
        <p>PT Perkebunan Nusantara I Regional 8</p>
        <div class="ttd-space"></div>
        <div class="ttd-garis">( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )</div>
      </div>
    </div>
  </div>
  <div class="footer">
    <img class="footer-line" src="${baseUrl}/invoice/footer-line.png" alt="">
    <div class="footer-body">
      <div>
        <strong>PT PERKEBUNAN NUSANTARA I (PERSERO)</strong><br>
        Gedung Agro Plaza Lantai 14, Jl. H. R. Rasuna Said Kav X2 &ndash; 1, Jakarta 12950<br>
        Email: corcom@ptpn1.co.id
      </div>
      <div class="footer-tagline">AKHLAK &ndash; Amanah, Kompeten, Harmonis,<br>Loyal, Adaptif, Kolaboratif</div>
    </div>
  </div>
</div></body></html>`
}

/* ─────────────────────────────────────────────────────────
   3. DIALOG COMPONENT
───────────────────────────────────────────────────────── */
// Ukuran A4 dalam px pada 96dpi: 794 × 1123
const A4_W = 794
const SCALE = 0.47
const previewW = Math.round(A4_W * SCALE)           // ~373px
const previewH = Math.round(1123 * SCALE)            // ~528px

export function InvoicePBBDialog({ open, onClose, ks, hasil }: InvoicePBBDialogProps) {
  const today = new Date().toISOString().split('T')[0]
  const [nomorSurat,   setNomorSurat]   = useState('')
  const [tanggalSurat, setTanggalSurat] = useState(today)
  const [jabatanMitra, setJabatanMitra] = useState('')
  const [alamatMitra,  setAlamatMitra]  = useState('')
  const [isLoading,    setIsLoading]    = useState(false)

  const baseUrl     = typeof window !== 'undefined' ? window.location.origin : ''
  const invoiceData: InvoiceData = { ks, hasil, nomorSurat, tanggalSurat, jabatanMitra, alamatMitra }
  const previewHtml = buildPreviewHTML(invoiceData, baseUrl)

  const handleDownload = async () => {
    setIsLoading(true)
    try {
      await generateDocx(invoiceData)
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-5xl p-0 gap-0 overflow-hidden">
        <div className="flex h-full">

          {/* ── PANEL KIRI: Form ── */}
          <div className="flex flex-col w-80 shrink-0 border-r border-gray-200">
            <div className="px-5 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold">Invoice Tagihan PBB</h2>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 text-sm">
              {/* Ringkasan */}
              <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500">Mitra</span>
                  <span className="font-medium">{ks.nama_mitra}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Objek Aset</span>
                  <span className="font-medium text-right max-w-[140px] truncate">{(ks.aset as any)?.nama_aset ?? '-'}</span>
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-1 mt-1">
                  <span className="text-gray-500">Total PBB</span>
                  <span className="font-bold text-[#1B4F72]">{formatRupiah(hasil.totalPBBDitanggung)}</span>
                </div>
                {hasil.detail.map((r) => (
                  <div key={r.tahun} className="flex justify-between pl-3 text-gray-400">
                    <span>↳ {r.tahun}</span>
                    <span>{formatRupiah(r.pbbProporsional)}</span>
                  </div>
                ))}
              </div>

              {/* Form fields */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Nomor Surat</Label>
                  <Input value={nomorSurat} onChange={(e) => setNomorSurat(e.target.value)}
                    placeholder="Nomor/..." className="mt-1 text-sm h-8" />
                </div>
                <div>
                  <Label className="text-xs">Tanggal Surat</Label>
                  <Input type="date" value={tanggalSurat} onChange={(e) => setTanggalSurat(e.target.value)}
                    className="mt-1 text-sm h-8" />
                </div>
              </div>

              <div>
                <Label className="text-xs">Jabatan Pimpinan <span className="text-gray-400 font-normal">(opsional)</span></Label>
                <Input value={jabatanMitra} onChange={(e) => setJabatanMitra(e.target.value)}
                  placeholder="Direktur Utama..." className="mt-1 text-sm h-8" />
              </div>

              <div>
                <Label className="text-xs">Alamat Mitra</Label>
                <Input value={alamatMitra} onChange={(e) => setAlamatMitra(e.target.value)}
                  placeholder="Jl. ..." className="mt-1 text-sm h-8" />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex gap-2">
              <Button variant="outline" onClick={onClose} className="flex-1 h-9" disabled={isLoading}>
                Batal
              </Button>
              <Button className="flex-1 h-9 bg-[#1B4F72] gap-1.5" onClick={handleDownload} disabled={isLoading}>
                <FileDown size={14} />
                {isLoading ? 'Memproses...' : 'Download .docx'}
              </Button>
            </div>
          </div>

          {/* ── PANEL KANAN: Preview ── */}
          <div className="flex-1 bg-gray-100 flex flex-col">
            <div className="px-4 py-3 bg-white border-b border-gray-200 text-xs text-gray-500 font-medium uppercase tracking-wide">
              Preview Dokumen
            </div>
            <div className="flex-1 overflow-auto flex items-start justify-center p-4">
              <div
                style={{ width: previewW, height: previewH, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.18)' }}
              >
                <iframe
                  srcDoc={previewHtml}
                  style={{
                    width: A4_W,
                    height: 1123,
                    border: 'none',
                    transform: `scale(${SCALE})`,
                    transformOrigin: 'top left',
                    background: '#fff',
                  }}
                  title="Preview Invoice PBB"
                />
              </div>
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  )
}
