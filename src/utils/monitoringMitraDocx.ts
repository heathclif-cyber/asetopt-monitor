/**
 * Laporan monitoring kompensasi per mitra — unduhan .docx
 * Isi: identitas mitra, ringkasan historis, track record tagihan & pembayaran.
 */
import JSZip from 'jszip'
import type { KerjaSama } from '@/types'
import { formatRupiah, formatTanggal } from '@/lib/utils'
import { escXml } from '@/utils/invoiceDocxUtils'
import {
  MONITORING_STATUS_LABEL,
  type MonitoringGroup,
} from '@/utils/monitoringKompensasiUtils'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`

const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`

function p(text: string, opts?: { bold?: boolean; center?: boolean; size?: number; spaceAfter?: number }): string {
  const size = opts?.size ?? 22 // half-points (22 = 11pt)
  const jc = opts?.center ? `<w:jc w:val="center"/>` : ''
  const bold = opts?.bold ? `<w:b/><w:bCs/>` : ''
  const sa = opts?.spaceAfter ?? 80
  return `<w:p>
    <w:pPr><w:spacing w:after="${sa}" w:line="276" w:lineRule="auto"/>${jc}</w:pPr>
    <w:r><w:rPr>${bold}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/></w:rPr>
    <w:t xml:space="preserve">${escXml(text)}</w:t></w:r>
  </w:p>`
}

function pMulti(parts: { text: string; bold?: boolean }[], opts?: { spaceAfter?: number }): string {
  const sa = opts?.spaceAfter ?? 60
  const runs = parts.map(part => {
    const bold = part.bold ? `<w:b/><w:bCs/>` : ''
    return `<w:r><w:rPr>${bold}<w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr>
      <w:t xml:space="preserve">${escXml(part.text)}</w:t></w:r>`
  }).join('')
  return `<w:p><w:pPr><w:spacing w:after="${sa}"/></w:pPr>${runs}</w:p>`
}

function heading(text: string, level: 1 | 2 = 1): string {
  const size = level === 1 ? 28 : 22
  return p(text, { bold: true, size, spaceAfter: 120 })
}

function emptyLine(): string {
  return `<w:p><w:pPr><w:spacing w:after="60"/></w:pPr></w:p>`
}

function pageBreak(): string {
  return `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`
}

function tc(text: string, opts?: { bold?: boolean; width?: number; right?: boolean; shade?: string }): string {
  const w = opts?.width ?? 1200
  const bold = opts?.bold ? `<w:b/><w:bCs/>` : ''
  const jc = opts?.right ? `<w:jc w:val="right"/>` : ''
  const shd = opts?.shade
    ? `<w:shd w:val="clear" w:color="auto" w:fill="${opts.shade}"/>`
    : ''
  return `<w:tc>
    <w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${shd}</w:tcPr>
    <w:p><w:pPr>${jc}<w:spacing w:before="40" w:after="40"/></w:pPr>
      <w:r><w:rPr>${bold}<w:sz w:val="16"/><w:szCs w:val="16"/></w:rPr>
      <w:t xml:space="preserve">${escXml(text)}</w:t></w:r>
    </w:p>
  </w:tc>`
}

function table(headers: string[], rows: string[][], colWidths: number[]): string {
  const totalW = colWidths.reduce((s, w) => s + w, 0)
  const headerRow = `<w:tr>${headers.map((h, i) =>
    tc(h, { bold: true, width: colWidths[i], shade: 'D9E2F3' }),
  ).join('')}</w:tr>`
  const body = rows.map(row =>
    `<w:tr>${row.map((cell, i) =>
      tc(cell, {
        width: colWidths[i],
        right: i >= 4 && i <= 7, // nominal columns roughly
      }),
    ).join('')}</w:tr>`,
  ).join('')

  const grid = colWidths.map(w => `<w:gridCol w:w="${w}"/>`).join('')
  return `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="${totalW}" w:type="dxa"/>
      <w:tblBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="666666"/>
        <w:left w:val="single" w:sz="4" w:space="0" w:color="666666"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="666666"/>
        <w:right w:val="single" w:sz="4" w:space="0" w:color="666666"/>
        <w:insideH w:val="single" w:sz="4" w:space="0" w:color="AAAAAA"/>
        <w:insideV w:val="single" w:sz="4" w:space="0" w:color="AAAAAA"/>
      </w:tblBorders>
    </w:tblPr>
    <w:tblGrid>${grid}</w:tblGrid>
    ${headerRow}${body}
  </w:tbl>`
}

function statusKsLabel(status: string): string {
  const map: Record<string, string> = {
    aktif: 'Aktif',
    sp1: 'SP1',
    sp2: 'SP2',
    sp3: 'SP3',
    putus: 'Putus',
    selesai: 'Selesai',
  }
  return map[status] ?? status ?? '-'
}

function avgHariTelat(group: MonitoringGroup): number {
  if (group.rows.length === 0) return 0
  const sum = group.rows.reduce((s, r) => s + r.hariTerlambat, 0)
  return Math.round(sum / group.rows.length)
}

function buildMitraSectionXml(
  group: MonitoringGroup,
  tahun: number,
  ks: KerjaSama | undefined,
  asOfLabel: string,
): string {
  const rows = group.rows
  const terlambatRows = rows.filter(r => r.hariTerlambat > 0 || r.statusBayar === 'terlambat')
  const outstandingRows = rows.filter(r => r.sisa > 0.5)
  const dendaRows = rows.filter(r => r.nominalDenda > 0.5)

  const identity = [
    pMulti([{ text: 'Nama Mitra: ', bold: true }, { text: group.namaMitra }]),
    pMulti([{ text: 'No. Perjanjian: ', bold: true }, { text: group.noPerjanjian || '-' }]),
    pMulti([{ text: 'Status Kerja Sama: ', bold: true }, { text: statusKsLabel(group.statusKs) }]),
    pMulti([{ text: 'Aset: ', bold: true }, { text: group.namaAset || '-' }]),
    pMulti([
      { text: 'ID Monika / Proker: ', bold: true },
      { text: `${group.monikaId ?? '—'} — ${group.namaProker}` },
    ]),
  ]
  if (ks?.tgl_mulai) {
    identity.push(pMulti([
      { text: 'Periode KS: ', bold: true },
      {
        text: `${formatTanggal(ks.tgl_mulai)} s.d. ${ks.tgl_selesai ? formatTanggal(ks.tgl_selesai) : '—'}`,
      },
    ]))
  }
  if (ks?.no_kontrak_sap) {
    identity.push(pMulti([
      { text: 'No. Kontrak SAP: ', bold: true },
      { text: ks.no_kontrak_sap },
    ]))
  }

  const ringkas = [
    pMulti([{ text: `Jumlah tahap tagihan: `, bold: true }, { text: String(group.nTagihan) }]),
    pMulti([{ text: `Lunas / Terlambat / Sebagian / Belum: `, bold: true }, {
      text: `${group.nLunas} / ${group.nTerlambat} / ${group.nSebagian} / ${group.nBelumBayar}`,
    }]),
    pMulti([{ text: `Total tagihan: `, bold: true }, { text: formatRupiah(group.totalTagihan) }]),
    pMulti([{ text: `Cash in (diterima): `, bold: true }, { text: formatRupiah(group.cashIn) }]),
    pMulti([{ text: `Outstanding: `, bold: true }, { text: formatRupiah(group.outstanding) }]),
    pMulti([{ text: `Total denda (estimasi): `, bold: true }, { text: formatRupiah(group.totalDenda) }]),
    pMulti([{
      text: `% Tertagih: `,
      bold: true,
    }, {
      text: group.pctTertagih != null ? `${group.pctTertagih.toFixed(1)}%` : '—',
    }]),
    pMulti([{ text: `Rata-rata hari keterlambatan: `, bold: true }, { text: `${avgHariTelat(group)} hari` }]),
  ]

  // Track record table — slightly condensed for Word width
  const colW = [400, 1100, 1400, 1100, 1100, 1200, 1200, 1000, 1100, 900, 1200, 1000]
  const headers = [
    'No',
    'Periode',
    'No. Invoice',
    'Tgl Terbit',
    'Jatuh Tempo',
    'Tagihan',
    'Cash In',
    'Sisa',
    'Tgl Bayar',
    'Hari Telat',
    'Denda',
    'Status',
  ]
  const tableRows = rows.map((r, i) => [
    String(i + 1),
    r.periodeLabel,
    r.noInvoice ?? '(belum terbit)',
    r.tglTerbit ? formatTanggal(r.tglTerbit) : '—',
    formatTanggal(r.tglJatuhTempo),
    formatRupiah(r.totalTagihan),
    formatRupiah(r.cashIn),
    formatRupiah(r.sisa),
    r.tglBayarLabel,
    r.hariTerlambat > 0 ? `${r.hariTerlambat} hr` : '0',
    r.nominalDenda > 0.5 ? formatRupiah(r.nominalDenda) : '—',
    MONITORING_STATUS_LABEL[r.statusBayar],
  ])

  // Narrative notes
  const notes: string[] = []
  if (outstandingRows.length > 0) {
    notes.push(
      `Masih terdapat ${outstandingRows.length} tahap dengan outstanding ` +
      `(${formatRupiah(group.outstanding)}). Perlu ditindaklanjuti penagihan.`,
    )
  } else if (group.nTagihan > 0) {
    notes.push('Seluruh tagihan pada periode laporan sudah lunas (tidak ada outstanding).')
  }
  if (terlambatRows.length > 0) {
    const maxTelat = Math.max(...terlambatRows.map(r => r.hariTerlambat))
    notes.push(
      `Terdapat ${terlambatRows.length} tahap dengan riwayat/status keterlambatan ` +
      `(maks. ${maxTelat} hari).`,
    )
  }
  if (dendaRows.length > 0) {
    notes.push(
      `Estimasi denda terkumpul ${formatRupiah(group.totalDenda)} ` +
      `pada ${dendaRows.length} tahap (perhitungan sesuai tarif denda & grace period tagihan).`,
    )
  }
  if (rows.some(r => !r.noInvoice)) {
    notes.push('Sebagian tahap belum memiliki nomor invoice resmi (belum diterbitkan di sistem).')
  }
  if (notes.length === 0) {
    notes.push('Tidak ada catatan khusus untuk mitra ini pada periode laporan.')
  }

  // Detail pembayaran per tahap (historikal)
  const paymentNarrative = rows.flatMap((r, idx) => {
    const head = p(
      `${idx + 1}. ${r.periodeLabel} | Invoice ${r.noInvoice ?? '(belum terbit)'} | ` +
      `terbit ${r.tglTerbit ? formatTanggal(r.tglTerbit) : '—'} | ` +
      `JT ${formatTanggal(r.tglJatuhTempo)} | tagihan ${formatRupiah(r.totalTagihan)} | ` +
      `status ${MONITORING_STATUS_LABEL[r.statusBayar]}` +
      (r.hariTerlambat > 0 ? ` | keterlambatan ${r.hariTerlambat} hari` : ' | tepat waktu / belum JT') +
      (r.nominalDenda > 0.5 ? ` | denda ${formatRupiah(r.nominalDenda)}` : '') +
      '.',
      { size: 18, spaceAfter: 20 },
    )
    if (r.pembayaranDetail.length === 0) {
      return [
        head,
        p(
          `    Pembayaran: belum ada yang tercatat` +
          (r.sisa > 0.5 ? ` — sisa ${formatRupiah(r.sisa)}` : '') + '.',
          { size: 16, spaceAfter: 80 },
        ),
      ]
    }
    const pays = r.pembayaranDetail.map((pay, j) =>
      p(
        `    ${j + 1}) ${formatTanggal(pay.tgl)} — ${formatRupiah(pay.nominal)}` +
        (pay.noPembayaran ? ` (${pay.noPembayaran})` : ''),
        { size: 16, spaceAfter: 20 },
      ),
    )
    return [head, ...pays, emptyLine()]
  })

  return [
    p('LAPORAN MONITORING KOMPENSASI', { bold: true, center: true, size: 32, spaceAfter: 40 }),
    p('PT Perkebunan Nusantara I Regional 8', { center: true, size: 20, spaceAfter: 40 }),
    p(`Tahun Jatuh Tempo ${tahun} · Dicetsak ${asOfLabel}`, { center: true, size: 18, spaceAfter: 200 }),

    heading('A. Identitas Mitra', 2),
    ...identity,
    emptyLine(),

    heading(`B. Ringkasan Historis Tahun ${tahun}`, 2),
    ...ringkas,
    emptyLine(),

    heading('C. Track Record Tagihan & Pembayaran', 2),
    p(
      'Tabel berikut merangkum setiap tahap kompensasi: penerbitan invoice, jatuh tempo, realisasi bayar, keterlambatan, dan denda.',
      { size: 18, spaceAfter: 100 },
    ),
    table(headers, tableRows, colW),
    emptyLine(),

    heading('D. Rincian Historikal per Tahap', 2),
    ...paymentNarrative,
    emptyLine(),

    heading('E. Catatan Monitoring', 2),
    ...notes.map((n, i) => p(`${i + 1}. ${n}`, { size: 20, spaceAfter: 60 })),
    emptyLine(),
    p(
      'Catatan: Denda untuk tagihan outstanding dihitung s.d. tanggal cetak; ' +
      'untuk tagihan lunas dihitung s.d. tanggal pelunasan. Dokumen ini bersifat internal untuk monitoring collection.',
      { size: 16, spaceAfter: 40 },
    ),
  ].join('')
}

function wrapDocument(bodyInner: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${bodyInner}
    <w:sectPr>
      <w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>
      <w:pgMar w:top="720" w:right="720" w:bottom="720" w:left="720" w:header="0" w:footer="0" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`
}

async function blobFromDocumentXml(documentXml: string): Promise<Blob> {
  const zip = new JSZip()
  zip.file('[Content_Types].xml', CONTENT_TYPES)
  zip.folder('_rels')!.file('.rels', ROOT_RELS)
  const word = zip.folder('word')!
  word.file('document.xml', documentXml)
  word.folder('_rels')!.file('document.xml.rels', DOC_RELS)
  return zip.generateAsync({
    type: 'blob',
    mimeType: DOCX_MIME,
    compression: 'DEFLATE',
  })
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function safeFilePart(s: string): string {
  return (s || 'mitra').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 40)
}

/** Unduh laporan Word 1 mitra */
export async function downloadLaporanMitraDocx(opts: {
  group: MonitoringGroup
  tahun: number
  ks?: KerjaSama
}): Promise<void> {
  const asOfLabel = formatTanggal(new Date().toISOString().slice(0, 10))
  const body = buildMitraSectionXml(opts.group, opts.tahun, opts.ks, asOfLabel)
  const blob = await blobFromDocumentXml(wrapDocument(body))
  const name = `Monitoring_Kompensasi_${safeFilePart(opts.group.namaMitra)}_${opts.tahun}.docx`
  triggerDownload(blob, name)
}

/** Unduh laporan Word multi-mitra (page break antar mitra) */
export async function downloadLaporanSemuaMitraDocx(opts: {
  groups: MonitoringGroup[]
  tahun: number
  ksById: Map<string, KerjaSama>
}): Promise<void> {
  const asOfLabel = formatTanggal(new Date().toISOString().slice(0, 10))
  const sections = opts.groups.map((g, i) => {
    const ks = opts.ksById.get(g.key)
    const xml = buildMitraSectionXml(g, opts.tahun, ks, asOfLabel)
    return i < opts.groups.length - 1 ? xml + pageBreak() : xml
  })
  const blob = await blobFromDocumentXml(wrapDocument(sections.join('')))
  triggerDownload(blob, `Monitoring_Kompensasi_Semua_Mitra_${opts.tahun}.docx`)
}
