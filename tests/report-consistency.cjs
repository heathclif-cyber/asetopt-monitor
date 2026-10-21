const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const cache = new Map()
function load(file) {
  file = path.resolve(file)
  if (cache.has(file)) return cache.get(file).exports
  const module = { exports: {} }
  cache.set(file, module)
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText
  new Function('require', 'exports', 'module', js)(name => name === '@/store/rkapStore' ? { BULAN_COLS: ['jan', 'feb', 'mar', 'apr', 'mei', 'jun', 'jul', 'agu', 'sep', 'okt', 'nov', 'des'] } : name.startsWith('@/') ? load(`src/${name.slice(2)}.ts`) : require(name), module.exports, module)
  return module.exports
}
const { buildLaporanHO, toRp000 } = load('src/utils/laporanHOUtils.ts')
const { getPendapatanPerKode, aggregateManualPrognosa } = load('src/utils/rkapUtils.ts')
const { hitungSisaPokok } = load('src/utils/accountingTerms.ts')
const forecastItems = [{ kode: 'A', bulan: Array(12).fill(100) }, { kode: 'B', bulan: Array(12).fill(200) }]
assert.equal(aggregateManualPrognosa(forecastItems, {}, {}, 5)[6], null, 'Missing forecasts must retain the RKAP fallback')
assert.equal(aggregateManualPrognosa(forecastItems, { A: Array(12).fill(0) }, {}, 5)[6], 200, 'Explicit zero must coexist with unentered program targets')
const asset = { id: 'asset', kode_aset: 'M1', nama_aset: 'Asset' }
const contracts = ['s1', 's2'].map(id => ({ id, aset_id: asset.id, aset: asset, nama_mitra: id }))
const invoices = contracts.map((contract, index) => ({ id: `k${index}`, ks_id: contract.id, kerja_sama: contract, rkap_kode: 'M1', tgl_jatuh_tempo: '2026-01-01', nominal: index ? 5000000 : 12000000, total_tagihan: index ? 5000000 : 12000000, pembayaran: [] }))
const pddm = [{ id: 'p1', ks_id: 's1' }]
const recognition = [0, 1].map(month => ({ id: `r${month}`, pddm_id: 'p1', tgl_awal: `2026-0${month + 1}-01`, nominal: 1000000, status: 'diakui' }))
const rows = buildLaporanHO({ tahun: 2026, rkapRows: [], daftarAset: [asset], daftarKS: contracts, allKompensasi: invoices, daftarPDDM: pddm, allPengakuan: recognition })
assert.equal(rows[0].pendapatanByMonth[0].total, 6000000, 'Accrual must not replace another contract sharing a program')
assert.equal(rows[0].pendapatanByMonth[1].total, 1000000)
assert.deepEqual(getPendapatanPerKode(recognition, pddm, invoices, 2026).M1.slice(0, 2), [1000000, 1000000], 'Months without matching invoices must retain recognized revenue')
const sameContractInvoice = { ...invoices[1], id: 'k3', ks_id: 's1', kerja_sama: contracts[0] }
const linkedRecognition = recognition.map(entry => ({ ...entry, kompensasi_id: invoices[0].id }))
const linkedRows = buildLaporanHO({ tahun: 2026, rkapRows: [], daftarAset: [asset], daftarKS: contracts, allKompensasi: [invoices[0], sameContractInvoice], daftarPDDM: pddm, allPengakuan: linkedRecognition })
assert.equal(linkedRows[0].pendapatanByMonth[0].total, 6000000, 'Explicit invoice linkage must preserve other invoices of the same contract')
const zeroRows = buildLaporanHO({ tahun: 2026, rkapRows: [], daftarAset: [asset], daftarKS: contracts, allKompensasi: [invoices[0]], daftarPDDM: pddm, allPengakuan: [{ ...linkedRecognition[0], nominal: 0 }] })
assert.equal(zeroRows[0].pendapatanByMonth[0].total, 0, 'An acknowledged zero must not fall back to the invoice')
const invoice = { nominal: 1000, nominal_ppn: 110, nominal_pph: 0, pph_mode: 'none', total_tagihan: 1110, pengurang: 200 }
assert.equal(hitungSisaPokok(invoice, [{ nominal_bayar: 455, tgl_bayar: '2026-01-02' }]), 400)
assert.equal(hitungSisaPokok(invoice, [{ nominal_bayar: 455, tgl_bayar: '2026-01-02' }], '2026-01-01'), 800)
assert.equal(hitungSisaPokok(invoice, [{ nominal_bayar: 910, tgl_bayar: '2026-01-02' }]), 0, 'A settled discounted invoice must have no phantom principal')
assert.equal(toRp000(1499) + toRp000(1499), toRp000(2998), 'HO scaling must remain additive')
const { newWorkbook, addTemplatedSheet, addReportMatrixSheet } = load('src/utils/excelTemplate.ts')
const wb = newWorkbook()
const sheet = addTemplatedSheet(wb, { sheetName: 'Test', title: 'Test', columns: [{ header: 'Tanggal', key: 'date', type: 'date' }, { header: 'Capaian', key: 'percent', type: 'percent' }], rows: [{ date: '2026-01-01', percent: 75 }] })
let foundDate = false, foundPct = false
sheet.eachRow(row => row.eachCell(cell => { if (cell.value instanceof Date) foundDate = true; if (cell.numFmt === '0.0%' && cell.value === .75) foundPct = true }))
assert.ok(foundDate)
assert.ok(foundPct)
const matrix = addReportMatrixSheet(wb, 'RKAP', [['Title'], ['Date'], [], ['Name', 'Achievement (%)'], ['January', 75]], [20, 20])
assert.equal(matrix.getCell('B5').value, .75)
assert.equal(matrix.getCell('B5').numFmt, '0.0%')
console.log('Report consistency checks passed')
async function checkEvaluation() {
  const ExcelJS = require('exceljs')
  const { exportEvaluasiKinerjaExcel } = load('src/utils/evaluasiKinerjaExport.ts')
  let output
  global.fetch = async () => ({ ok: true, arrayBuffer: async () => fs.readFileSync('public/templates/Worksheet in Template Evaluasi Kinerja 2026_Rev.xlsx') })
  global.document = { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } }
  global.window = { setTimeout() {} }
  URL.createObjectURL = blob => { output = blob; return 'test:download' }
  const largeRows = Array.from({ length: 28 }, (_, index) => ({ ...rows[0], no: index + 1, kodeMonika: `M${index}`, bidangUsaha: 'Properti', piutangByMonth: rows[0].piutangByMonth.map(month => ({ ...month, saldo: 1000000 })) }))
  const prognosa = largeRows.map(row => ({ kode: row.kodeMonika, cash: Array(12).fill(1000000), pendapatan: Array(12).fill(1000000) }))
  await exportEvaluasiKinerjaExcel(largeRows, { tahun: 2026, endMonth: 0, prognosa })
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await output.arrayBuffer())
  assert.equal(workbook.getWorksheet('Opset Cash per Proker').getCell('B32').value, 28)
  assert.equal(workbook.getWorksheet('Opset Cash per Proker').getCell('G33').formula, 'SUM(G5:G32)')
  assert.equal(workbook.getWorksheet('Piutang').getCell('B33').value, 28)
  assert.equal(workbook.getWorksheet('Piutang').getCell('D34').formula, 'SUM(D6:D33)')
  assert.equal(workbook.getWorksheet('Opset Cash per Proker').getCell('P5').value, 11)
  assert.ok(workbook.getWorksheet('Prognosa Sisa Tahun'))
  assert.equal(workbook.getWorksheet('Divest').getCell('E6').value, '')
  assert.equal(workbook.getWorksheet('Divest').getCell('M16').value, '')
  assert.equal(workbook.getWorksheet('Divest').getCell('B1').value, 'Belum tersedia data divestasi aplikasi; isi manual')
  assert.equal(workbook.getWorksheet('Divest').getCell('G6').formula, 'IFERROR(E6/F6,"")')
  console.log('Evaluation overflow and annual forecast checks passed')
}
checkEvaluation().catch(error => { console.error(error); process.exitCode = 1 })
