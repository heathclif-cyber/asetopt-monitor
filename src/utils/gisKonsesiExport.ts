import type ExcelJS from 'exceljs'
import type { GISAssetSummary } from '@/types/gis'
import { addTemplatedSheet, downloadWorkbook, EXCEL_BRAND, newWorkbook, todayKey, type ExcelColumn } from '@/utils/excelTemplate'

const HA_FMT = '#,##0.00'
const DISCLAIMER = 'DRAF — Data diolah dari poligon KML/peta GIS dan belum diverifikasi. Bukan dokumen resmi dan tidak dapat dijadikan dasar keputusan legal tanpa konfirmasi dokumen alas hak asli.'

const RIGHTS_LABEL: Record<GISAssetSummary['rights_status'], string> = {
  berlaku: 'Berlaku', berakhir: 'Berakhir', belum_beralas_hak: 'Belum beralas hak',
  belum_lengkap: 'Data alas hak belum lengkap', belum_berlaku: 'Belum berlaku', belum_diketahui: 'Belum diketahui',
}
const LAYER_LABEL: Record<string, string> = {
  konsesi: 'konsesi', tanaman: 'tanaman', hutan: 'kawasan hutan', opset: 'kerja sama', okupasi: 'okupasi',
}
const HA_KEYS = ['konsesi', 'tanaman', 'hutan', 'okupasi', 'kerjaSama', 'tersedia'] as const

function date(value: string | null) {
  return value ? new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
}

// The shared template writes meta lines in muted grey; the draft notice must
// stand out on every sheet, so restyle that row after the sheet is built.
function emphasizeDisclaimer(ws: ExcelJS.Worksheet, rowIndex: number) {
  const cell = ws.getCell(rowIndex, 1)
  cell.font = { name: 'Calibri', size: 10, bold: true, color: { argb: EXCEL_BRAND.danger } }
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } }
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1, wrapText: true }
  ws.getRow(rowIndex).height = 32
}

function formatHectareColumns(ws: ExcelJS.Worksheet, columns: ExcelColumn[]) {
  columns.forEach((column, index) => {
    if (!(HA_KEYS as readonly string[]).includes(column.key)) return
    ws.getColumn(index + 1).eachCell(cell => { if (typeof cell.value === 'number') cell.numFmt = HA_FMT })
  })
}

export async function exportKonsesiExcel(items: GISAssetSummary[], filterText: string, regionLabel = '') {
  const wb = newWorkbook()
  const printed = new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' })
  const scope = [
    regionLabel && `Wilayah: ${regionLabel} (luas dihitung hanya di dalam wilayah)`,
    filterText ? `Filter pencarian: "${filterText}" · ${items.length} konsesi` : `${regionLabel ? 'Konsesi di wilayah ini' : 'Seluruh konsesi'} · ${items.length} konsesi`,
  ].filter(Boolean).join(' · ')
  const sum = (select: (item: GISAssetSummary) => number | null) => items.reduce((total, item) => total + (select(item) ?? 0), 0)
  const drafts = items.filter(item => item.record_state === 'draf').length

  const summaryColumns: ExcelColumn[] = [
    { header: 'Uraian', key: 'label', width: 44 },
    { header: 'Nilai', key: 'value', width: 22, type: 'number' },
    { header: 'Satuan', key: 'unit', width: 12, align: 'center' },
  ]
  const summary = addTemplatedSheet(wb, {
    sheetName: 'Ringkasan',
    title: 'Ringkasan GIS Konsesi (DRAF)',
    subtitle: 'Akumulasi penggunaan areal berdasarkan basis KML, bukan konsesi resmi',
    metaLines: [DISCLAIMER, scope, `Dicetak: ${printed}`],
    columns: summaryColumns,
    rows: [
      { label: 'Jumlah konsesi', value: items.length, unit: 'poligon' },
      { label: 'Konsesi berstatus draf', value: drafts, unit: 'poligon' },
      { label: 'Luas konsesi (peta GIS)', value: sum(item => item.konsesi_area_ha), unit: 'ha' },
      { label: 'Kawasan hutan', value: sum(item => item.hutan_area_ha), unit: 'ha' },
      { label: 'Tanaman', value: sum(item => item.tanaman_area_ha), unit: 'ha' },
      { label: 'Okupasi', value: sum(item => item.okupasi_area_ha), unit: 'ha' },
      { label: 'Kerja sama', value: sum(item => item.kerja_sama_area_ha), unit: 'ha' },
      { label: 'Estimasi dapat dimanfaatkan', value: sum(item => item.dapat_dimanfaatkan_area_ha), unit: 'ha' },
    ],
  })
  emphasizeDisclaimer(summary, 4)
  summary.getColumn(2).eachCell((cell, rowNumber) => {
    if (typeof cell.value === 'number') cell.numFmt = summary.getCell(rowNumber, 3).value === 'ha' ? HA_FMT : '#,##0'
  })

  const columns: ExcelColumn[] = [
    { header: 'No', key: 'no', width: 6, type: 'int', align: 'center' },
    { header: 'Kode / Nomor', key: 'kode', width: 22 },
    { header: 'Nama Konsesi', key: 'nama', width: 36 },
    { header: 'Lokasi / Kebun', key: 'lokasi', width: 22 },
    { header: 'Status Data', key: 'status', width: 11, align: 'center' },
    { header: 'Konsesi (ha)', key: 'konsesi', width: 14, type: 'number' },
    { header: 'Tanaman (ha)', key: 'tanaman', width: 14, type: 'number' },
    { header: 'Kawasan Hutan (ha)', key: 'hutan', width: 14, type: 'number' },
    { header: 'Okupasi (ha)', key: 'okupasi', width: 13, type: 'number' },
    { header: 'Kerja Sama (ha)', key: 'kerjaSama', width: 13, type: 'number' },
    { header: 'Estimasi Dapat Dimanfaatkan (ha)', key: 'tersedia', width: 17, type: 'number' },
    { header: 'Status Analisis', key: 'analisis', width: 30 },
    { header: 'Layer Belum Ada', key: 'missing', width: 26 },
    { header: 'Status Alas Hak', key: 'rights', width: 20 },
    { header: 'Jenis Alas Hak', key: 'jenisHak', width: 16 },
    { header: 'Nomor Alas Hak', key: 'nomorHak', width: 18 },
    { header: 'Pemegang Hak', key: 'pemegang', width: 22 },
    { header: 'Tanggal Terbit', key: 'terbit', width: 16, type: 'date' },
    { header: 'Tanggal Berakhir', key: 'berakhir', width: 16, type: 'date' },
    { header: 'Lintang', key: 'lat', width: 12, type: 'number' },
    { header: 'Bujur', key: 'lng', width: 12, type: 'number' },
    { header: 'Sumber Dokumen', key: 'sumber', width: 22 },
    { header: 'Catatan', key: 'catatan', width: 30 },
  ]
  const detail = addTemplatedSheet(wb, {
    sheetName: 'Tabel Konsesi',
    title: 'Tabel Konsesi dan Penggunaan Areal (DRAF)',
    subtitle: 'Satu baris berasal dari satu poligon konsesi KML · luas dihitung secara geometris dari peta GIS',
    metaLines: [DISCLAIMER, scope, `Dicetak: ${printed}`],
    columns,
    rows: items.map((item, index) => ({
      no: index + 1,
      kode: item.kode_aset,
      nama: item.nama_aset,
      lokasi: item.lokasi,
      status: item.record_state === 'draf' ? 'Draf' : 'Terbit',
      konsesi: item.konsesi_area_ha,
      tanaman: item.tanaman_area_ha,
      hutan: item.hutan_area_ha,
      okupasi: item.okupasi_area_ha,
      kerjaSama: item.kerja_sama_area_ha,
      tersedia: item.dapat_dimanfaatkan_area_ha,
      analisis: item.analysis_status,
      missing: item.missing_layers.map(kind => LAYER_LABEL[kind] ?? kind).join(', '),
      rights: RIGHTS_LABEL[item.rights_status],
      jenisHak: item.jenis_alas_hak,
      nomorHak: item.nomor_alas_hak,
      pemegang: item.pemegang_hak,
      terbit: date(item.tanggal_terbit),
      berakhir: item.expiry_mode === 'indefinite' ? 'Tidak terbatas' : date(item.tanggal_berakhir),
      lat: item.center_lat,
      lng: item.center_lng,
      sumber: item.sumber_dokumen,
      catatan: item.catatan,
    })),
    totalKeys: [...HA_KEYS],
    totalLabel: 'TOTAL',
    totalLabelCol: 2,
  })
  emphasizeDisclaimer(detail, 4)
  formatHectareColumns(detail, columns)
  for (const key of ['lat', 'lng']) {
    detail.getColumn(columns.findIndex(column => column.key === key) + 1).eachCell(cell => { if (typeof cell.value === 'number') cell.numFmt = '0.000000' })
  }
  detail.pageSetup = { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 }

  await downloadWorkbook(wb, `DRAF_Tabel_Konsesi_GIS_${todayKey()}.xlsx`)
}
