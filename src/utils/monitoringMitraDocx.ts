/**
 * Laporan monitoring kompensasi per mitra — unduhan .docx A4 portrait.
 * Struktur runut: perjanjian → mitra → alamat/profil → aset → ringkasan → tagihan → pembayaran → catatan.
 */
import JSZip from 'jszip'
import type { Aset, KerjaSama, ProspekMitra } from '@/types'
import { formatRupiah, formatTanggal } from '@/lib/utils'
import { escXml } from '@/utils/invoiceDocxUtils'
import {
  MONITORING_STATUS_LABEL,
  type MonitoringGroup,
  type MonitoringDetailRow,
} from '@/utils/monitoringKompensasiUtils'
import { supabase } from '@/lib/supabase'

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

/** Lebar area konten A4 portrait (margin ~2cm) ≈ 9638 dxa */
const CONTENT_W = 9638

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

// ─── Low-level OOXML helpers ─────────────────────────────────────────────────

function p(
  text: string,
  opts?: {
    bold?: boolean
    center?: boolean
    /** Default true untuk paragraf body — rapi kiri-kanan */
    justify?: boolean
    size?: number
    spaceAfter?: number
    spaceBefore?: number
    italic?: boolean
    color?: string
  },
): string {
  const size = opts?.size ?? 20
  let jc = ''
  if (opts?.center) jc = `<w:jc w:val="center"/>`
  else if (opts?.justify !== false) jc = `<w:jc w:val="both"/>`
  const bold = opts?.bold ? `<w:b/><w:bCs/>` : ''
  const italic = opts?.italic ? `<w:i/><w:iCs/>` : ''
  const color = opts?.color ? `<w:color w:val="${opts.color}"/>` : ''
  const sa = opts?.spaceAfter ?? 60
  const sb = opts?.spaceBefore ?? 0
  return `<w:p>
    <w:pPr>
      <w:spacing w:before="${sb}" w:after="${sa}" w:line="276" w:lineRule="auto"/>
      ${jc}
    </w:pPr>
    <w:r>
      <w:rPr>${bold}${italic}${color}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr>
      <w:t xml:space="preserve">${escXml(text)}</w:t>
    </w:r>
  </w:p>`
}

function emptyLine(after = 80): string {
  return `<w:p><w:pPr><w:spacing w:after="${after}"/></w:pPr></w:p>`
}

function pageBreak(): string {
  return `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`
}

function hLine(): string {
  return `<w:p>
    <w:pPr>
      <w:pBdr>
        <w:bottom w:val="single" w:sz="12" w:space="1" w:color="1B4F72"/>
      </w:pBdr>
      <w:spacing w:after="160"/>
    </w:pPr>
  </w:p>`
}

function sectionTitle(num: string, title: string): string {
  return p(`${num}. ${title}`, {
    bold: true,
    size: 22,
    spaceBefore: 200,
    spaceAfter: 120,
    color: '1B4F72',
    justify: false,
  })
}

function tc(
  text: string,
  opts?: {
    bold?: boolean
    width: number
    right?: boolean
    /** Justify teks di sel (default untuk kolom nilai panjang) */
    justify?: boolean
    shade?: string
    size?: number
    vAlign?: 'center' | 'top'
  },
): string {
  const bold = opts?.bold ? `<w:b/><w:bCs/>` : ''
  let jc = ''
  if (opts?.right) jc = `<w:jc w:val="right"/>`
  else if (opts?.justify) jc = `<w:jc w:val="both"/>`
  const shd = opts?.shade
    ? `<w:shd w:val="clear" w:color="auto" w:fill="${opts.shade}"/>`
    : ''
  const size = opts?.size ?? 16
  const va = opts?.vAlign === 'center' ? `<w:vAlign w:val="center"/>` : ''
  return `<w:tc>
    <w:tcPr>
      <w:tcW w:w="${opts?.width ?? 1200}" w:type="dxa"/>
      ${shd}${va}
      <w:tcBorders>
        <w:top w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>
        <w:left w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>
        <w:bottom w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>
        <w:right w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>
      </w:tcBorders>
    </w:tcPr>
    <w:p>
      <w:pPr>${jc}<w:spacing w:before="40" w:after="40"/></w:pPr>
      <w:r>
        <w:rPr>${bold}<w:sz w:val="${size}"/><w:szCs w:val="${size}"/><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr>
        <w:t xml:space="preserve">${escXml(text)}</w:t>
      </w:r>
    </w:p>
  </w:tc>`
}

/** Tabel key–value 2 kolom (label | nilai) */
function kvTable(rows: [string, string][]): string {
  const wLabel = 2800
  const wValue = CONTENT_W - wLabel
  const body = rows.map(([label, value], i) => {
    const shade = i % 2 === 0 ? 'F5F7FA' : undefined
    return `<w:tr>
      ${tc(label, { bold: true, width: wLabel, shade, size: 17 })}
      ${tc(value || '—', { width: wValue, shade, size: 17, justify: true })}
    </w:tr>`
  }).join('')
  return `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="${CONTENT_W}" w:type="dxa"/>
      <w:tblLayout w:type="fixed"/>
    </w:tblPr>
    <w:tblGrid>
      <w:gridCol w:w="${wLabel}"/>
      <w:gridCol w:w="${wValue}"/>
    </w:tblGrid>
    ${body}
  </w:tbl>`
}

function dataTable(
  headers: string[],
  rows: string[][],
  colWidths: number[],
  rightCols: Set<number>,
  totalRow?: string[],
): string {
  const totalW = colWidths.reduce((s, w) => s + w, 0)
  const headerXml = `<w:tr>${headers.map((h, i) =>
    tc(h, { bold: true, width: colWidths[i], shade: '1B4F72', size: 14, right: rightCols.has(i) }),
  ).join('')}</w:tr>`.replace(
    /w:fill="1B4F72"/g,
    'w:fill="1B4F72"',
  )
  // white text on dark header — Word still readable with dark fill; keep bold
  const headerWithWhite = `<w:tr>${headers.map((h, i) => {
    const w = colWidths[i]
    const jc = rightCols.has(i) ? `<w:jc w:val="right"/>` : ''
    return `<w:tc>
      <w:tcPr>
        <w:tcW w:w="${w}" w:type="dxa"/>
        <w:shd w:val="clear" w:color="auto" w:fill="1B4F72"/>
        <w:tcBorders>
          <w:top w:val="single" w:sz="4" w:space="0" w:color="1B4F72"/>
          <w:left w:val="single" w:sz="4" w:space="0" w:color="1B4F72"/>
          <w:bottom w:val="single" w:sz="4" w:space="0" w:color="1B4F72"/>
          <w:right w:val="single" w:sz="4" w:space="0" w:color="1B4F72"/>
        </w:tcBorders>
      </w:tcPr>
      <w:p><w:pPr>${jc}<w:spacing w:before="40" w:after="40"/></w:pPr>
        <w:r><w:rPr><w:b/><w:color w:val="FFFFFF"/><w:sz w:val="14"/><w:szCs w:val="14"/>
        <w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/></w:rPr>
        <w:t xml:space="preserve">${escXml(h)}</w:t></w:r>
      </w:p>
    </w:tc>`
  }).join('')}</w:tr>`

  void headerXml

  const body = rows.map((row, ri) => {
    const shade = ri % 2 === 1 ? 'F8FAFC' : undefined
    return `<w:tr>${row.map((cell, i) =>
      tc(cell, {
        width: colWidths[i],
        right: rightCols.has(i),
        shade,
        size: 14,
      }),
    ).join('')}</w:tr>`
  }).join('')

  const totalXml = totalRow
    ? `<w:tr>${totalRow.map((cell, i) =>
        tc(cell, {
          bold: true,
          width: colWidths[i],
          right: rightCols.has(i),
          shade: 'E8EEF4',
          size: 14,
        }),
      ).join('')}</w:tr>`
    : ''

  const grid = colWidths.map(w => `<w:gridCol w:w="${w}"/>`).join('')
  return `<w:tbl>
    <w:tblPr>
      <w:tblW w:w="${totalW}" w:type="dxa"/>
      <w:tblLayout w:type="fixed"/>
    </w:tblPr>
    <w:tblGrid>${grid}</w:tblGrid>
    ${headerWithWhite}${body}${totalXml}
  </w:tbl>`
}

// ─── Domain helpers ──────────────────────────────────────────────────────────

function statusKsLabel(status: string): string {
  const map: Record<string, string> = {
    aktif: 'Aktif',
    sp1: 'SP1 — Surat Peringatan 1',
    sp2: 'SP2 — Surat Peringatan 2',
    sp3: 'SP3 — Surat Peringatan 3',
    putus: 'Putus',
    selesai: 'Selesai',
  }
  return map[status] ?? status ?? '—'
}

function dash(v: string | null | undefined): string {
  const s = (v ?? '').trim()
  return s || '—'
}

function monthsBetween(start: string, end: string): string {
  try {
    const a = new Date(start)
    const b = new Date(end)
    const months = Math.max(
      0,
      (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()),
    )
    if (months >= 12) {
      const y = Math.floor(months / 12)
      const m = months % 12
      return m > 0 ? `${y} tahun ${m} bulan` : `${y} tahun`
    }
    return `${months} bulan`
  } catch {
    return '—'
  }
}

function avgHariTelat(rows: MonitoringDetailRow[]): number {
  if (!rows.length) return 0
  return Math.round(rows.reduce((s, r) => s + r.hariTerlambat, 0) / rows.length)
}

async function fetchProspek(prospekId: string | null | undefined): Promise<ProspekMitra | null> {
  if (!prospekId) return null
  try {
    const { data, error } = await supabase
      .from('prospek_mitra')
      .select('*')
      .eq('id', prospekId)
      .maybeSingle()
    if (error || !data) return null
    return data as ProspekMitra
  } catch {
    return null
  }
}

// ─── Section builders ────────────────────────────────────────────────────────

function buildHeader(tahun: number, asOfLabel: string): string {
  return [
    p('PT PERKEBUNAN NUSANTARA I', { bold: true, center: true, size: 18, spaceAfter: 20, color: '1B4F72', justify: false }),
    p('REGIONAL 8', { bold: true, center: true, size: 16, spaceAfter: 40, color: '1B4F72', justify: false }),
    hLine(),
    p('LAPORAN MONITORING KOMPENSASI SEWA', {
      bold: true,
      center: true,
      size: 26,
      spaceAfter: 40,
      justify: false,
    }),
    p(`Tahun Jatuh Tempo ${tahun}`, { center: true, size: 18, spaceAfter: 20, justify: false }),
    p(`Dicetak: ${asOfLabel}`, { center: true, size: 16, spaceAfter: 200, italic: true, color: '666666', justify: false }),
  ].join('')
}

function buildSectionI(
  group: MonitoringGroup,
  ks: KerjaSama | undefined,
  prospek: ProspekMitra | null,
): string {
  const aset = ks?.aset as Aset | undefined
  const tglMulai = ks?.tgl_mulai ? formatTanggal(ks.tgl_mulai) : '—'
  const tglSelesai = ks?.tgl_selesai ? formatTanggal(ks.tgl_selesai) : '—'
  const durasi =
    ks?.tgl_mulai && ks?.tgl_selesai
      ? monthsBetween(ks.tgl_mulai, ks.tgl_selesai)
      : '—'

  const rows: [string, string][] = [
    ['No. Perjanjian', dash(group.noPerjanjian !== '-' ? group.noPerjanjian : ks?.no_perjanjian)],
    ['No. Kontrak SAP', dash(ks?.no_kontrak_sap)],
    ['Masa berlaku perjanjian', `${tglMulai} s.d. ${tglSelesai}`],
    ['Durasi perjanjian', durasi],
    ['Nama mitra', dash(group.namaMitra)],
    ['Status kerja sama', statusKsLabel(group.statusKs || ks?.status || '')],
    ['Kontak WA mitra', dash(ks?.no_wa_mitra)],
    [
      'Alamat objek sewa (aset)',
      dash(aset?.alamat ?? null),
    ],
  ]

  // Profil: keterangan KS
  const profilParts: string[] = []
  if (ks?.keterangan?.trim()) profilParts.push(ks.keterangan.trim())
  if (prospek?.catatan?.trim()) profilParts.push(`Catatan prospek: ${prospek.catatan.trim()}`)
  rows.push([
    'Profil / keterangan mitra',
    profilParts.length ? profilParts.join(' | ') : 'Tidak tersedia di sistem',
  ])

  if (prospek) {
    rows.push(['PIC (dari prospek)', dash(prospek.kontak_pic)])
    rows.push(['Telepon PIC', dash(prospek.no_telepon)])
  }

  return [
    sectionTitle('I', 'DATA PERJANJIAN DAN MITRA'),
    p(
      'Bagian ini memuat identitas perjanjian sewa dan data mitra secara runut.',
      { size: 16, italic: true, color: '666666', spaceAfter: 100 },
    ),
    kvTable(rows),
    emptyLine(120),
  ].join('')
}

function buildSectionII(group: MonitoringGroup, ks: KerjaSama | undefined): string {
  const aset = ks?.aset as Aset | undefined
  const ksa = ks?.kerja_sama_aset?.[0]
  const rows: [string, string][] = [
    ['Nama aset', dash(group.namaAset || aset?.nama_aset)],
    ['Kode aset', dash(aset?.kode_aset)],
    ['ID Monika / Proker', dash(group.monikaId ? `${group.monikaId} — ${group.namaProker}` : group.namaProker)],
    ['Sertifikat', dash(aset?.sertifikat)],
    [
      'Luas tanah (KS)',
      ksa?.luas_tanah_ks != null ? `${ksa.luas_tanah_ks.toLocaleString('id-ID')} m²` : '—',
    ],
    [
      'Luas bangunan (KS)',
      ksa?.luas_bangunan_ks != null ? `${ksa.luas_bangunan_ks.toLocaleString('id-ID')} m²` : '—',
    ],
  ]
  return [
    sectionTitle('II', 'OBJEK ASET DAN PROGRAM'),
    kvTable(rows),
    emptyLine(120),
  ].join('')
}

function buildSectionIII(group: MonitoringGroup, tahun: number): string {
  const rows: [string, string][] = [
    ['Jumlah tahap tagihan', String(group.nTagihan)],
    [
      'Lunas / Terlambat / Sebagian / Belum bayar',
      `${group.nLunas} / ${group.nTerlambat} / ${group.nSebagian} / ${group.nBelumBayar}`,
    ],
    ['Total nilai tagihan', formatRupiah(group.totalTagihan)],
    ['Total cash in (diterima)', formatRupiah(group.cashIn)],
    ['Outstanding (sisa)', formatRupiah(group.outstanding)],
    ['Total estimasi denda', formatRupiah(group.totalDenda)],
    [
      'Persentase tertagih',
      group.pctTertagih != null ? `${group.pctTertagih.toFixed(1)}%` : '—',
    ],
    ['Rata-rata hari keterlambatan', `${avgHariTelat(group.rows)} hari`],
  ]
  return [
    sectionTitle('III', `RINGKASAN KINERJA COLLECTION TAHUN ${tahun}`),
    kvTable(rows),
    emptyLine(120),
  ].join('')
}

function buildSectionIV(group: MonitoringGroup): string {
  // Portrait-friendly columns
  const colW = [450, 1200, 1400, 1100, 1100, 1300, 1300, 900, 900]
  // sum = 10650 slightly over — trim
  const widths = [420, 1100, 1350, 1050, 1050, 1250, 1250, 850, 900] // = 9220
  const headers = [
    'No',
    'Periode',
    'No. Invoice',
    'Tgl Terbit',
    'Jatuh Tempo',
    'Tagihan',
    'Dibayar',
    'Status',
    'Telat',
  ]
  const rightCols = new Set([5, 6, 8])
  const dataRows = group.rows.map((r, i) => [
    String(i + 1),
    r.periodeLabel,
    r.noInvoice ?? '(belum)',
    r.tglTerbit ? formatTanggal(r.tglTerbit) : '—',
    formatTanggal(r.tglJatuhTempo),
    formatRupiah(r.totalTagihan),
    formatRupiah(r.cashIn),
    MONITORING_STATUS_LABEL[r.statusBayar],
    r.hariTerlambat > 0 ? `${r.hariTerlambat}h` : '0',
  ])
  const total = [
    '',
    'TOTAL',
    '',
    '',
    '',
    formatRupiah(group.totalTagihan),
    formatRupiah(group.cashIn),
    '',
    '',
  ]

  // second small table for sisa + denda
  const dendaRows = group.rows
    .filter(r => r.sisa > 0.5 || r.nominalDenda > 0.5)
    .map((r, i) => [
      String(i + 1),
      r.periodeLabel,
      formatRupiah(r.sisa),
      r.nominalDenda > 0.5 ? formatRupiah(r.nominalDenda) : '—',
      r.hariTerlambat > 0 ? `${r.hariTerlambat} hari` : '0',
    ])

  const parts = [
    sectionTitle('IV', 'REKAPITULASI TAGIHAN'),
    p(
      'Rekap setiap tahap kompensasi: penerbitan, jatuh tempo, realisasi pembayaran, dan status.',
      { size: 16, italic: true, color: '666666', spaceAfter: 100 },
    ),
    dataTable(headers, dataRows, widths, rightCols, total),
    emptyLine(100),
  ]

  if (dendaRows.length > 0) {
    const dw = [500, 2200, 2000, 2200, 2200]
    parts.push(
      p('Rincian outstanding & denda per tahap', {
        bold: true,
        size: 17,
        spaceAfter: 80,
      }),
      dataTable(
        ['No', 'Periode', 'Sisa tagihan', 'Estimasi denda', 'Keterlambatan'],
        dendaRows,
        dw,
        new Set([2, 3]),
      ),
      emptyLine(100),
    )
  }

  return parts.join('')
}

function buildSectionV(group: MonitoringGroup): string {
  const blocks: string[] = [
    sectionTitle('V', 'RIWAYAT PEMBAYARAN (HISTORIKAL)'),
    p(
      'Urutan kronologis pembayaran per tahap tagihan.',
      { size: 16, italic: true, color: '666666', spaceAfter: 100 },
    ),
  ]

  if (group.rows.length === 0) {
    blocks.push(p('Tidak ada tagihan pada periode laporan.', { size: 17 }))
    return blocks.join('')
  }

  group.rows.forEach((r, idx) => {
    blocks.push(
      p(
        `${idx + 1}) ${r.periodeLabel}  ·  Invoice: ${r.noInvoice ?? 'belum terbit'}  ·  JT: ${formatTanggal(r.tglJatuhTempo)}`,
        { bold: true, size: 17, spaceBefore: 80, spaceAfter: 40 },
      ),
      p(
        `   Tagihan ${formatRupiah(r.totalTagihan)}  ·  Diterima ${formatRupiah(r.cashIn)}  ·  Sisa ${formatRupiah(r.sisa)}  ·  ${MONITORING_STATUS_LABEL[r.statusBayar]}` +
        (r.hariTerlambat > 0 ? `  ·  Telat ${r.hariTerlambat} hari` : '') +
        (r.nominalDenda > 0.5 ? `  ·  Denda ${formatRupiah(r.nominalDenda)}` : ''),
        { size: 15, spaceAfter: 40, color: '444444' },
      ),
    )

    if (r.pembayaranDetail.length === 0) {
      blocks.push(
        p('   Pembayaran: belum tercatat di sistem.', {
          size: 15,
          italic: true,
          spaceAfter: 60,
          color: '888888',
        }),
      )
    } else {
      const payW = [600, 2200, 2800, 2800]
      const payRows = r.pembayaranDetail.map((pay, j) => [
        String(j + 1),
        formatTanggal(pay.tgl),
        formatRupiah(pay.nominal),
        pay.noPembayaran ?? '—',
      ])
      blocks.push(
        dataTable(
          ['No', 'Tanggal bayar', 'Nominal', 'No. pembayaran'],
          payRows,
          payW,
          new Set([2]),
        ),
        emptyLine(60),
      )
    }
  })

  return blocks.join('')
}

function buildSectionVI(group: MonitoringGroup): string {
  const outstanding = group.rows.filter(r => r.sisa > 0.5)
  const terlambat = group.rows.filter(r => r.hariTerlambat > 0 || r.statusBayar === 'terlambat')
  const denda = group.rows.filter(r => r.nominalDenda > 0.5)
  const notes: string[] = []

  if (outstanding.length > 0) {
    notes.push(
      `Terdapat ${outstanding.length} tahap dengan outstanding total ${formatRupiah(group.outstanding)}. Perlu penagihan dan monitoring jatuh tempo.`,
    )
  } else if (group.nTagihan > 0) {
    notes.push('Seluruh tagihan pada periode laporan telah lunas; tidak ada outstanding.')
  }

  if (terlambat.length > 0) {
    const maxTelat = Math.max(...terlambat.map(r => r.hariTerlambat))
    notes.push(
      `Terdapat ${terlambat.length} tahap dengan riwayat/status keterlambatan (maksimal ${maxTelat} hari). Evaluasi kedisiplinan pembayaran mitra.`,
    )
  } else if (group.nTagihan > 0) {
    notes.push('Tidak tercatat keterlambatan material pada tahap-tahap periode ini.')
  }

  if (denda.length > 0) {
    notes.push(
      `Estimasi denda terakumulasi ${formatRupiah(group.totalDenda)} pada ${denda.length} tahap (sesuai tarif denda & grace period masing-masing tagihan).`,
    )
  }

  if (group.rows.some(r => !r.noInvoice)) {
    notes.push(
      'Sebagian tahap belum memiliki nomor invoice resmi di sistem; lengkapi penerbitan invoice untuk kelengkapan administrasi.',
    )
  }

  if (notes.length === 0) {
    notes.push('Tidak ada catatan monitoring khusus untuk mitra ini pada periode laporan.')
  }

  return [
    sectionTitle('VI', 'ANALISIS DAN CATATAN MONITORING'),
    ...notes.map((n, i) =>
      p(`${i + 1}. ${n}`, { size: 17, spaceAfter: 80 }),
    ),
    emptyLine(80),
    p(
      'Catatan metodologi: denda untuk tagihan outstanding dihitung sampai tanggal cetak; ' +
      'untuk tagihan lunas dihitung sampai tanggal pelunasan. Dokumen ini bersifat internal untuk keperluan monitoring collection Optimalisasi Aset.',
      { size: 14, italic: true, color: '666666', spaceAfter: 40 },
    ),
    emptyLine(120),
    p('— Akhir laporan mitra —', {
      center: true,
      size: 14,
      italic: true,
      color: '999999',
      spaceAfter: 40,
      justify: false,
    }),
  ].join('')
}

function buildMitraSectionXml(
  group: MonitoringGroup,
  tahun: number,
  ks: KerjaSama | undefined,
  prospek: ProspekMitra | null,
  asOfLabel: string,
): string {
  return [
    buildHeader(tahun, asOfLabel),
    buildSectionI(group, ks, prospek),
    buildSectionII(group, ks),
    buildSectionIII(group, tahun),
    buildSectionIV(group),
    buildSectionV(group),
    buildSectionVI(group),
  ].join('')
}

function wrapDocument(bodyInner: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
  xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    ${bodyInner}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"
        w:header="0" w:footer="0" w:gutter="0"/>
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

/** Unduh laporan Word 1 mitra (A4 portrait, terstruktur) */
export async function downloadLaporanMitraDocx(opts: {
  group: MonitoringGroup
  tahun: number
  ks?: KerjaSama
}): Promise<void> {
  const asOfLabel = formatTanggal(new Date().toISOString().slice(0, 10))
  const prospek = await fetchProspek(opts.ks?.prospek_id)
  const body = buildMitraSectionXml(opts.group, opts.tahun, opts.ks, prospek, asOfLabel)
  const blob = await blobFromDocumentXml(wrapDocument(body))
  triggerDownload(
    blob,
    `Monitoring_Kompensasi_${safeFilePart(opts.group.namaMitra)}_${opts.tahun}.docx`,
  )
}

/** Unduh laporan Word multi-mitra (page break antar mitra) */
export async function downloadLaporanSemuaMitraDocx(opts: {
  groups: MonitoringGroup[]
  tahun: number
  ksById: Map<string, KerjaSama>
}): Promise<void> {
  const asOfLabel = formatTanggal(new Date().toISOString().slice(0, 10))
  const sections: string[] = []
  for (let i = 0; i < opts.groups.length; i++) {
    const g = opts.groups[i]
    const ks = opts.ksById.get(g.key)
    const prospek = await fetchProspek(ks?.prospek_id)
    sections.push(buildMitraSectionXml(g, opts.tahun, ks, prospek, asOfLabel))
    if (i < opts.groups.length - 1) sections.push(pageBreak())
  }
  const blob = await blobFromDocumentXml(wrapDocument(sections.join('')))
  triggerDownload(blob, `Monitoring_Kompensasi_Semua_Mitra_${opts.tahun}.docx`)
}
