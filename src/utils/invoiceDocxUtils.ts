import JSZip from 'jszip'
import { formatTanggal } from '@/lib/utils'

export const BANK_INFO = {
  atasNama: 'PT Perkebunan Nusantara I Regional 8',
  bank: 'Bank Rakyat Indonesia Cabang Ahmad Yani',
  rekening: '0050-01-005356-30-0',
}

export function escXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Cache raw template di memori — hindari fetch ulang tiap preview/unduh */
const templateBufferCache = new Map<string, ArrayBuffer>()

export async function loadTemplate(path: string): Promise<JSZip> {
  let buf = templateBufferCache.get(path)
  if (!buf) {
    const res = await fetch(path)
    if (!res.ok) throw new Error(`Template tidak ditemukan: ${path}`)
    buf = await res.arrayBuffer()
    templateBufferCache.set(path, buf)
  }
  // slice agar tiap loadAsync dapat salinan (load bisa transfer buffer)
  return JSZip.loadAsync(buf.slice(0))
}

/** Prefetch template agar preview pertama tidak menunggu network */
export function prefetchTemplate(path: string): void {
  if (templateBufferCache.has(path)) return
  void loadTemplate(path).catch(() => {})
}

export async function downloadDocx(zip: JSZip, filename: string): Promise<void> {
  const blob = await zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function replaceXmlText(xml: string, search: string, replace: string): string {
  return xml.split(search).join(replace)
}

export async function patchDocumentXml(zip: JSZip, patcher: (xml: string) => string): Promise<void> {
  const file = zip.file('word/document.xml')
  if (!file) throw new Error('document.xml tidak ditemukan di template')
  let xml = await file.async('string')
  xml = patcher(xml)
  zip.file('word/document.xml', xml)
}

export function generateNoInvoice(kodeAset: string, periodeLabel: string | null, tglJatuhTempo: string, seq = 1): string {
  const d = new Date(tglJatuhTempo)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const kode = (kodeAset || 'AST').replace(/[^A-Za-z0-9]/g, '').slice(0, 8)
  const periode = (periodeLabel || `${m}/${y}`).replace(/[^A-Za-z0-9]/g, '').slice(0, 12)
  return `R08A-${kode}/INV/${y}.${m}-${String(seq).padStart(3, '0')}-${periode}`
}

export function formatTanggalSurat(dateStr: string): string {
  return formatTanggal(dateStr)
}

export const A4_PREVIEW = { width: 794, height: 1123, scale: 0.47 }

export function letterheadHTML(baseUrl: string): string {
  return `
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
  </div>`
}

export function letterfooterHTML(baseUrl: string): string {
  return `
  <div class="footer">
    <img class="footer-line" src="${baseUrl}/invoice/footer-line.png" alt="">
    <div class="footer-body">
      <div>
        <strong>PT PERKEBUNAN NUSANTARA I (PERSERO)</strong><br>
        Gedung Agro Plaza Lantai 14, Jl. H. R. Rasuna Said Kav X2 – 1, Jakarta 12950<br>
        Email: corcom@ptpn1.co.id
      </div>
      <div class="footer-tagline">AKHLAK – Amanah, Kompeten, Harmonis,<br>Loyal, Adaptif, Kolaboratif</div>
    </div>
  </div>`
}

export const LETTER_STYLES = `
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
  .tabel { width: 100%; border-collapse: collapse; margin: 12pt 0; }
  .tabel th, .tabel td { border: 1px solid #000; padding: 5pt 8pt; }
  .tabel th { background: #d9d9d9; font-weight: bold; text-align: center; }
  .bank { border-collapse: collapse; margin: 8pt 0 14pt 14pt; }
  .bank td { padding: 2pt 0; vertical-align: top; }
  .bank .lbl { width: 110pt; }
  .bank .sep { width: 10pt; }
  .footer { margin-top: auto; padding-top: 8pt; }
  .footer-line { width: 100%; display: block; margin-bottom: 3pt; }
  .footer-body { display: flex; justify-content: space-between; align-items: flex-end; font-size: 8pt; line-height: 1.5; color: #444; }
  .footer-tagline { font-style: italic; color: #666; text-align: right; }
`