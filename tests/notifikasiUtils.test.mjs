import assert from 'node:assert/strict'
import test from 'node:test'
import { build } from 'esbuild'

const { outputFiles } = await build({ entryPoints: ['src/utils/notifikasiUtils.ts'], bundle: true, platform: 'node', format: 'esm', write: false })
const { getSPEligibility } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)
const invoice = (overrides = {}) => ({ id: 'invoice-1', ks_id: 'ks-1', nominal: 1000, total_tagihan: 1000, pengurang: 0, tgl_jatuh_tempo: '2026-01-01', persen_denda_per_hari: 0.1, maks_hari_bayar: 14, pembayaran: [], ...overrides })
const sp = (overrides = {}) => ({ id: 'sp-1', ks_id: 'ks-1', kompensasi_id: 'invoice-1', jenis: 'SP1', tgl_terbit: '2026-03-01', tgl_deadline: '2026-03-15', status: 'aktif', created_at: '2026-03-01T08:00:00Z', ...overrides })
const at = value => new Date(`${value}T00:00:00`)

test('SP1 respects configured tariff and the exact 5% boundary without applying stored grace', () => {
  assert.equal(getSPEligibility([invoice()], [], at('2026-02-19')).eligible, false)
  const result = getSPEligibility([invoice()], [], at('2026-02-20'))
  assert.equal(result.eligible, true)
  assert.equal(result.jenis, 'SP1')
  assert.equal(result.persenDenda, 5)
  assert.equal(getSPEligibility([invoice({ persen_denda_per_hari: 0.2 })], [], at('2026-01-26')).eligible, true)
})

test('long overdue debt cannot skip issuance of SP1', () => {
  const result = getSPEligibility([invoice()], [], at('2026-10-13'))
  assert.equal(result.eligible, true)
  assert.equal(result.jenis, 'SP1')
})

test('SP2 follows actual issuance rather than projected dates from the original due date', () => {
  assert.equal(getSPEligibility([invoice()], [sp()], at('2026-03-14')).eligible, false)
  const result = getSPEligibility([invoice()], [sp()], at('2026-03-15'))
  assert.equal(result.eligible, true)
  assert.equal(result.jenis, 'SP2')
})

test('a later deadline postpones escalation and an early deadline cannot shorten 14 days', () => {
  assert.equal(getSPEligibility([invoice()], [sp({ tgl_deadline: '2026-03-20' })], at('2026-03-19')).eligible, false)
  assert.equal(getSPEligibility([invoice()], [sp({ tgl_deadline: '2026-03-20' })], at('2026-03-20')).eligible, true)
  assert.equal(getSPEligibility([invoice()], [sp({ tgl_deadline: '2026-03-03' })], at('2026-03-14')).eligible, false)
})

test('settled invoices, deductions, and zero tariff do not create an SP1 candidate', () => {
  assert.equal(getSPEligibility([invoice({ pembayaran: [{ nominal_bayar: 1000 }] })], [], at('2026-10-13')).eligible, false)
  assert.equal(getSPEligibility([invoice({ pengurang: 1000 })], [], at('2026-10-13')).eligible, false)
  assert.equal(getSPEligibility([invoice({ persen_denda_per_hari: 0 })], [], at('2026-10-13')).eligible, false)
})

test('unordered history selects the latest active SP and stops after PUTUS', () => {
  const history = [sp({ id: 'sp-2', jenis: 'SP2', tgl_terbit: '2026-03-15', tgl_deadline: '2026-03-29', created_at: '2026-03-15T08:00:00Z' }), sp({ status: 'tidak_aktif' })]
  assert.equal(getSPEligibility([invoice()], history, at('2026-03-29')).jenis, 'SP3')
  assert.equal(getSPEligibility([invoice()], [sp({ jenis: 'SP3' })], at('2026-03-15')).jenis, 'PUTUS')
  assert.equal(getSPEligibility([invoice()], [sp({ jenis: 'PUTUS' })], at('2026-10-13')).eligible, false)
})
