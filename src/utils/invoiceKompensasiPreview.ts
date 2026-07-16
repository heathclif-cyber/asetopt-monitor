/**
 * Invoice kompensasi = surat tagihan formal (bukan kuitansi).
 * Template dasar: draf tagihan PBB (letterhead + nomor/perihal + tabel + rekening).
 * Kuitansi terpisah di KuitansiDialog (setelah pembayaran).
 */
import { formatRupiah, formatTanggal } from '@/lib/utils'
import { terbilang } from '@/utils/terbilang'
import type { Kompensasi } from '@/types'
import {
  BANK_INFO,
  escXml,
  letterfooterHTML,
  letterheadHTML,
  LETTER_STYLES,
  loadTemplate,
} from '@/utils/invoiceDocxUtils'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
/** Format surat tagihan formal (bukan kuitansi). ?v= bust cache browser dari file kuitansi lama. */
const TEMPLATE_PATH = '/invoice/template_invoice_kompensasi.docx?v=tagihan-2'

export interface InvoiceLineItem {
  keterangan: string
  nilai: number
}

function getAsetFields(k: Kompensasi) {
  const ks = k.kerja_sama
  const aset = ks?.aset as { nama_aset?: string; alamat?: string } | undefined
  return {
    ks,
    namaAset: aset?.nama_aset ?? '-',
    alamatAset: aset?.alamat ?? '-',
  }
}

/** Nilai yang ditagihkan (total invoice − pengurang) */
export function getEfektifTagihan(k: Kompensasi): number {
  return Math.max(0, (k.total_tagihan ?? 0) - (k.pengurang ?? 0))
}

export function buildInvoiceLineItems(k: Kompensasi): InvoiceLineItem[] {
  const { namaAset } = getAsetFields(k)
  const periode = k.periode_label ?? formatTanggal(k.tgl_jatuh_tempo)
  const items: InvoiceLineItem[] = [
    {
      keterangan: `Kompensasi sewa ${namaAset} — periode ${periode}`,
      nilai: k.nominal ?? 0,
    },
  ]
  if ((k.nominal_ppn ?? 0) > 0) {
    items.push({
      keterangan: `PPN ${k.ppn_persen ?? 0}%`,
      nilai: k.nominal_ppn,
    })
  }
  if ((k.pph_mode === 'bukti_potong') && (k.nominal_pph ?? 0) > 0) {
    items.push({
      keterangan: `PPh ${k.pph_persen ?? 0}% (bukti potong)`,
      nilai: -Math.abs(k.nominal_pph),
    })
  }
  if ((k.pengurang ?? 0) > 0) {
    items.push({
      keterangan: k.keterangan_pengurang?.trim()
        ? `Pengurang — ${k.keterangan_pengurang}`
        : 'Pengurang',
      nilai: -Math.abs(k.pengurang ?? 0),
    })
  }
  return items
}

function makeTableRowXml(keterangan: string, nilai: string): string {
  return (
    `<w:tr>` +
    `<w:tc><w:tcPr><w:tcW w:w="6033" w:type="dxa"/></w:tcPr>` +
    `<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto"/><w:jc w:val="both"/></w:pPr>` +
    `<w:r><w:t xml:space="preserve">${escXml(keterangan)}</w:t></w:r>` +
    `</w:p></w:tc>` +
    `<w:tc><w:tcPr><w:tcW w:w="3436" w:type="dxa"/></w:tcPr>` +
    `<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto"/><w:jc w:val="right"/></w:pPr>` +
    `<w:r><w:t>${escXml(nilai)}</w:t></w:r>` +
    `</w:p></w:tc></w:tr>`
  )
}

async function patchInvoiceTagihanXml(
  xml: string,
  k: Kompensasi,
  noInvoice: string,
  tanggalSurat: string,
  opts?: { jabatanMitra?: string; alamatMitra?: string },
): Promise<string> {
  const { ks, namaAset, alamatAset } = getAsetFields(k)
  const total = getEfektifTagihan(k)
  const tanggalFmt = formatTanggal(tanggalSurat)
  const tglMulaiFmt = ks?.tgl_mulai ? formatTanggal(ks.tgl_mulai) : '............'
  const jabatanMitra = opts?.jabatanMitra?.trim() ?? ''
  const alamatMitra = opts?.alamatMitra?.trim() ?? ''
  const items = buildInvoiceLineItems(k)
  const perihal = `Penagihan Pembayaran Kompensasi Sewa ${namaAset}`

  // Tanggal header
  xml = xml.replace(
    '<w:t>..........</w:t>',
    `<w:t xml:space="preserve">${escXml(tanggalFmt)}</w:t>`,
  )

  // Nomor surat
  xml = xml.replace(
    '<w:tab/><w:t xml:space="preserve">: </w:t></w:r></w:p><w:p w14:paraId="79B8C05A"',
    `<w:tab/><w:t xml:space="preserve">: ${escXml(noInvoice)}</w:t></w:r></w:p><w:p w14:paraId="79B8C05A"`,
  )

  // Perihal: run terpisah "Pajak Bumi dan Bangunan (PBB)" + placeholder objek
  // (jangan ganti dulu yang di body/tabel — urutan di bawah)
  xml = xml.replace(
    '<w:t xml:space="preserve"> [Nama Objek Kerja Sama]</w:t>',
    `<w:t xml:space="preserve"> ${escXml(namaAset)}</w:t>`,
  )

  // Jabatan mitra (opsional)
  const jabatanOld =
    '<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t>(</w:t></w:r>' +
    '<w:r w:rsidR="00D74FDD"><w:rPr><w:b/><w:bCs/></w:rPr><w:t xml:space="preserve">Jabatan </w:t></w:r>' +
    '<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t>Pimpinan</w:t></w:r>' +
    '<w:r w:rsidR="004B63D3"><w:rPr><w:b/><w:bCs/></w:rPr><w:t>/kalau perorangan kosongi</w:t></w:r>' +
    '<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t>)</w:t></w:r>'
  xml = xml.replace(
    jabatanOld,
    jabatanMitra
      ? `<w:r><w:rPr><w:b/><w:bCs/></w:rPr><w:t>${escXml(jabatanMitra)}</w:t></w:r>`
      : '',
  )

  xml = xml.replace('<w:t>(Nama Mitra)</w:t>', `<w:t>${escXml(ks?.nama_mitra ?? '-')}</w:t>`)

  const alamatMitraOld =
    '<w:r w:rsidRPr="00D74FDD"><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>(Alamat</w:t></w:r>' +
    '<w:r w:rsidR="00D74FDD" w:rsidRPr="00D74FDD"><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t xml:space="preserve"> Mitra</w:t></w:r>' +
    '<w:r w:rsidRPr="00D74FDD"><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>)</w:t></w:r>'
  xml = xml.replace(
    alamatMitraOld,
    alamatMitra ? `<w:r><w:t>${escXml(alamatMitra)}</w:t></w:r>` : '',
  )

  xml = xml.replace(
    '<w:t>(Nomor Perjanjian)</w:t>',
    `<w:t>${escXml(ks?.no_perjanjian ?? '—')}</w:t>`,
  )
  xml = xml.replace(
    '<w:t>(Tanggal Perjanjian)</w:t>',
    `<w:t>${escXml(tglMulaiFmt)}</w:t>`,
  )
  xml = xml.replace(
    '<w:t>(Alamat aset yang dikerjasamakan)</w:t>',
    `<w:t>${escXml(alamatAset)}</w:t>`,
  )

  const periode = k.periode_label ?? formatTanggal(k.tgl_jatuh_tempo)

  // Isi surat (satu run utuh di template)
  xml = xml.replace(
    ' tagihan pembayaran Pajak Bumi dan Bangunan (PBB), dengan rincian sebagai berikut:',
    escXml(
      ` tagihan pembayaran kompensasi sewa periode ${periode}, dengan rincian sebagai berikut:`,
    ),
  )

  // Baris tabel — ganti 2 baris contoh PBB
  const idx1 = xml.indexOf('<w:tr w:rsidR="00E00460" w:rsidRPr="004C052A" w14:paraId="284F18C5"')
  const idx2 = xml.indexOf('<w:tr w:rsidR="4CC0BE62"')
  if (idx1 !== -1 && idx2 !== -1 && idx2 > idx1) {
    const generatedRows = items
      .map(r => makeTableRowXml(r.keterangan, formatRupiah(r.nilai)))
      .join('')
    xml = xml.substring(0, idx1) + generatedRows + xml.substring(idx2)
  }

  // Total di footer tabel
  xml = xml.replace(
    '<w:r><w:rPr><w:highlight w:val="yellow"/><w:lang w:val="id-ID"/></w:rPr><w:t>Rp</w:t></w:r>',
    `<w:r><w:t>${escXml(formatRupiah(total))}</w:t></w:r>`,
  )

  // Kalimat total + terbilang
  const terbilangOld =
    '<w:r w:rsidR="00BD6B75"><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t xml:space="preserve">(Total PBB) </w:t></w:r>' +
    '<w:r w:rsidR="006A758E" w:rsidRPr="00EB3496"><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t xml:space="preserve"> (</w:t></w:r>' +
    '<w:r w:rsidR="00BD6B75"><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>Terbilang</w:t></w:r>' +
    '<w:r w:rsidR="006A758E" w:rsidRPr="00EB3496"><w:rPr><w:highlight w:val="yellow"/></w:rPr><w:t>)</w:t></w:r>'
  xml = xml.replace(
    terbilangOld,
    `<w:r><w:t xml:space="preserve">${escXml(formatRupiah(total))} (${escXml(terbilang(total))})</w:t></w:r>`,
  )

  // "Tagihan PBB sebesar" → "Tagihan sebesar" (run "PBB " terpisah)
  xml = xml.replace(
    '<w:r w:rsidR="001E717E"><w:t xml:space="preserve">PBB </w:t></w:r>',
    '',
  )

  // Perihal residual: sisa "Pajak Bumi dan Bangunan (PBB)" (setelah body & tabel diganti)
  xml = xml.replace(
    '<w:t>Pajak Bumi dan Bangunan (PBB)</w:t>',
    `<w:t>${escXml('Kompensasi Sewa')}</w:t>`,
  )
  xml = xml.replace(
    'Pajak Bumi dan Bangunan (PBB)',
    escXml('Kompensasi Sewa'),
  )

  xml = xml.replace(/<w:highlight w:val="yellow"\/>/g, '')

  void perihal
  return xml
}

export async function buildInvoiceKompensasiDocxBlob(
  k: Kompensasi,
  noInvoice: string,
  tanggalSurat: string,
  opts?: { forPreview?: boolean; jabatanMitra?: string; alamatMitra?: string },
): Promise<Blob> {
  const zip = await loadTemplate(TEMPLATE_PATH)
  const file = zip.file('word/document.xml')
  if (!file) throw new Error('document.xml tidak ditemukan di template invoice')
  let xml = await file.async('string')
  xml = await patchInvoiceTagihanXml(xml, k, noInvoice, tanggalSurat, opts)
  zip.file('word/document.xml', xml)

  return zip.generateAsync({
    type: 'blob',
    mimeType: DOCX_MIME,
    compression: opts?.forPreview ? 'STORE' : 'DEFLATE',
    compressionOptions: opts?.forPreview ? undefined : { level: 6 },
  })
}

export async function generateInvoiceKompensasiDocx(
  k: Kompensasi,
  noInvoice: string,
  tanggalSurat: string,
  opts?: { jabatanMitra?: string; alamatMitra?: string },
): Promise<void> {
  const blob = await buildInvoiceKompensasiDocxBlob(k, noInvoice, tanggalSurat, opts)
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

/** Preview HTML cepat (format surat tagihan, mirror unduhan .docx) */
export function buildInvoiceKompensasiHtml(
  k: Kompensasi,
  noInvoice: string,
  tanggalSurat: string,
  baseUrl: string,
  opts?: { jabatanMitra?: string; alamatMitra?: string },
): string {
  const { ks, namaAset, alamatAset } = getAsetFields(k)
  const total = getEfektifTagihan(k)
  const tanggalFmt = formatTanggal(tanggalSurat)
  const tglMulaiFmt = ks?.tgl_mulai ? formatTanggal(ks.tgl_mulai) : '............'
  const periode = k.periode_label ?? formatTanggal(k.tgl_jatuh_tempo)
  const items = buildInvoiceLineItems(k)
  const jabatanMitra = opts?.jabatanMitra?.trim() ?? ''
  const alamatMitra = opts?.alamatMitra?.trim() ?? ''

  const rows = items.map(r => `
    <tr>
      <td style="border:1px solid #000;padding:5pt 8pt;">${escXml(r.keterangan)}</td>
      <td style="border:1px solid #000;padding:5pt 8pt;text-align:right;white-space:nowrap;">${formatRupiah(r.nilai)}</td>
    </tr>`).join('')

  const kepadaLines = [
    jabatanMitra ? `<div>${escXml(jabatanMitra)}</div>` : '',
    `<div>${escXml(ks?.nama_mitra ?? '-')}</div>`,
    alamatMitra ? `<div>${escXml(alamatMitra)}</div>` : '',
  ].filter(Boolean).join('')

  return `<!DOCTYPE html>
<html lang="id"><head><meta charset="utf-8">
<style>
${LETTER_STYLES}
  .kepada { margin-bottom: 14pt; line-height: 1.6; }
  .salam { margin-bottom: 8pt; }
  .isi { text-align: justify; margin-bottom: 10pt; line-height: 1.6; }
  .penutup { margin-bottom: 28pt; }
  .ttd-wrap { display: flex; justify-content: flex-end; }
  .ttd { text-align: center; width: 195pt; line-height: 1.6; }
  .ttd-space { height: 54pt; }
  .ttd-garis { border-top: 1px solid #000; padding-top: 3pt; }
  .meta-strong { font-weight: bold; }
</style></head>
<body><div class="page">
  ${letterheadHTML(baseUrl)}
  <div class="body">
    <div class="tanggal">Makassar, ${tanggalFmt}</div>
    <table class="meta">
      <tr><td class="lbl">Nomor</td><td class="sep">:</td><td>${escXml(noInvoice || '')}</td></tr>
      <tr><td class="lbl">Lampiran</td><td class="sep">:</td><td>-</td></tr>
      <tr><td class="lbl">Perihal</td><td class="sep">:</td><td class="meta-strong">Penagihan Pembayaran Kompensasi Sewa ${escXml(namaAset)}</td></tr>
    </table>
    <div class="kepada">Kepada Yth.<br>${kepadaLines}</div>
    <p class="salam">Dengan hormat,</p>
    <p class="isi">Menunjuk Perjanjian Kerja Sama Sewa No. <strong>${escXml(ks?.no_perjanjian ?? '............')}</strong>
      tanggal ${tglMulaiFmt} tentang Pemanfaatan Aset yang berlokasi di ${escXml(alamatAset)},
      dengan ini kami sampaikan tagihan pembayaran kompensasi sewa periode <strong>${escXml(periode)}</strong>,
      dengan rincian sebagai berikut:</p>
    <table class="tabel">
      <thead><tr>
        <th style="text-align:left">Keterangan</th>
        <th style="width:150pt;">Nilai (Rp)</th>
      </tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr>
        <td style="border:1px solid #000;padding:5pt 8pt;font-weight:bold;">Total</td>
        <td style="border:1px solid #000;padding:5pt 8pt;text-align:right;font-weight:bold;white-space:nowrap;">${formatRupiah(total)}</td>
      </tr></tfoot>
    </table>
    <p class="isi">Tagihan sebesar <strong>${formatRupiah(total)}</strong>
      (<em>${escXml(terbilang(total))}</em>) sebagaimana di atas, dapat segera dibayarkan melalui:</p>
    <table class="bank">
      <tr><td class="lbl">Atas Nama</td><td class="sep">:</td><td>${escXml(BANK_INFO.atasNama)}</td></tr>
      <tr><td class="lbl">Nama Bank</td><td class="sep">:</td><td>${escXml(BANK_INFO.bank)}</td></tr>
      <tr><td class="lbl">Nomor Rekening</td><td class="sep">:</td><td>${escXml(BANK_INFO.rekening)}</td></tr>
    </table>
    <p class="isi" style="font-size:11pt;color:#333;">Jatuh tempo: <strong>${formatTanggal(k.tgl_jatuh_tempo)}</strong></p>
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
  ${letterfooterHTML(baseUrl)}
</div></body></html>`
}
