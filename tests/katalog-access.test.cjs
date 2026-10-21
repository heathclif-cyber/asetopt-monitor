const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')

const moduleExports = {}
const js = ts.transpileModule(fs.readFileSync('src/components/katalog/canva-layout.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText
new Function('exports', js)(moduleExports)
const { makeAccessFormItems, isRoadAccess, accessRows } = moduleExports

const saved = [
  { label: 'N:', nilai: '', keterangan: 'Jalan Utara', urutan: 0 },
  { label: 'W:', nilai: '', keterangan: 'Fasilitas Barat', urutan: 1 },
  { label: 'E:', nilai: '', keterangan: 'Pertokoan Jl. Sam Ratulangi', urutan: 2 },
  { label: 'S:', nilai: '', keterangan: 'Jl. A.M. Sangaji', urutan: 3 },
  { label: 'Radius', nilai: '0,4', keterangan: '', urutan: 4 },
  { label: 'Pelabuhan Yos Soedarso Ambon', nilai: '2,0', keterangan: 'Km - Dari Pusat Kota Ambon', urutan: 5 },
]
const reloaded = makeAccessFormItems(JSON.parse(JSON.stringify(saved)))
assert.deepEqual(reloaded.toll, { name: saved[5].label, distance: '2,0', time: saved[5].keterangan })
assert.equal(reloaded.radius, '0,4')
assert.deepEqual(reloaded.cards.map(card => card.keterangan), saved.slice(0, 4).map(item => item.keterangan))
const factsheet = { accessibility: saved.map(item => ({ label: item.label, value: item.nilai, sub: item.keterangan, urutan: item.urutan })) }
assert.equal(factsheet.accessibility.find(isRoadAccess).label, saved[5].label)
assert.deepEqual(accessRows(factsheet).map(card => card.text), saved.slice(0, 4).map(item => item.keterangan))
assert.equal(isRoadAccess({ label: 'N: Jalan Utara', urutan: 0 }), false)
assert.equal(isRoadAccess({ label: 'Jalan Tol Lama' }), true)
assert.equal(isRoadAccess({ label: 'Bandara', urutan: 5 }), true)
assert.equal(makeAccessFormItems([]).toll.name, '')
console.log('PASS: road name, comma distance, time, radius and compass cards survive save/reload, including legacy roads and arbitrary destination names.')
