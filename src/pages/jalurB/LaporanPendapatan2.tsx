import { useEffect, useState, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useKompensasiStore } from '@/store/kompensasiStore'
import { useKerjaSamaStore } from '@/store/kerjaSamaStore'
import { usePendapatanStore } from '@/store/pendapatanStore'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { formatTanggal, formatRupiah, cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { ChevronUp, ChevronDown, ChevronsUpDown, Filter } from 'lucide-react'
import { hitungDenda } from '@/utils/taxUtils'

type SortKey = 'namaMitra' | 'namaAset' | 'periodeLabel' | 'totalTagihan' | 'cashIn' | 'sisa' | 'status'
type SortDir = 'asc' | 'desc'
type StatusFilter = 'all' | 'lunas' | 'belum_lunas'
type PeriodeMode = 'semua' | 'terbaru' | 'terdekat'

const STATUS_LABEL: Record<string, string> = {
  lunas: 'Lunas',
  sebagian: 'Belum Lunas',
  belum_bayar: 'Belum Lunas',
  terlambat: 'Belum Lunas',
}

const STATUS_COLOR: Record<string, string> = {
  lunas: 'bg-green-100 text-green-700',
  sebagian: 'bg-amber-100 text-amber-700',
  belum_bayar: 'bg-gray-100 text-gray-600',
  terlambat: 'bg-red-100 text-red-700',
}

function parseTglParts(dateStr: string): { year: number; month: number } {
  const [y, m] = dateStr.slice(0, 10).split('-').map(Number)
  return { year: y, month: m - 1 }
}

function resolveStatus(totalDibayar: number, efektifTagihan: number, hariTerlambat: number): string {
  if (totalDibayar >= efektifTagihan && efektifTagihan > 0) return 'lunas'
  if (totalDibayar > 0) return hariTerlambat > 0 ? 'terlambat' : 'sebagian'
  if (hariTerlambat > 0) return 'terlambat'
  return 'belum_bayar'
}

export default function LaporanPendapatan() {
  const location = useLocation()
  const { allKompensasi, fetchAllKompensasi } = useKompensasiStore()
  const { daftarKS, fetchKS } = useKerjaSamaStore()
  const { daftarPDDM, allPengakuan, fetchAll: fetchPDDM } = usePendapatanStore()

  const [editing, setEditing] = useState<{ id: string; field: string; value: string } | null>(null)
  const [saving, setSaving] = useState(false)

  // ── Filters ───────────────────────────────────────────────────────────────
  const tahunList = useMemo(() => {
    const years = new Set(allKompensasi.map(k => parseTglParts(k.tgl_jatuh_tempo).year))
    return Array.from(years).sort((a, b) => b - a)
  }, [allKompensasi])

  const [tahun, setTahun] = useState(new Date().getFullYear())
  const [filterMitra, setFilterMitra] = useState('all')
  const [filterStatus, setFilterStatus] = useState<StatusFilter>('all')
  const [periodeMode, setPeriodeMode] = useState<PeriodeMode>('semua')
  const [selectedMonths, setSelectedMonths] = useState<number[]>([0,1,2,3,4,5,6,7,8,9,10,11])

  // ── Sort ─────────────────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<SortKey>('periodeLabel')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  useEffect(() => {
    fetchAllKompensasi()
    fetchKS()
    fetchPDDM()
  }, [location.key])

  // Keep tahun in sync when kompensasi loads
  useEffect(() => {
    if (tahunList.length && !tahunList.includes(tahun)) setTahun(tahunList[0])
  }, [tahunList])

  // ── Build rows ────────────────────────────────────────────────────────────
  const allRows = useMemo(() => {
    return allKompensasi
      .filter(k => parseTglParts(k.tgl_jatuh_tempo).year === tahun)
      .map(k => {
        const ks = daftarKS.find(x => x.id === k.ks_id) ?? k.kerja_sama
        const totalDibayar = (k.pembayaran ?? []).reduce((s, p) => s + p.nominal_bayar, 0)
        const efektifTagihan = Math.max(0, (k.total_tagihan ?? 0) - (k.pengurang ?? 0))
        const sisa = Math.max(0, efektifTagihan - totalDibayar)
        const denda = hitungDenda({
          nominal: k.nominal,
          tglJatuhTempo: k.tgl_jatuh_tempo,
          tglHariIni: new Date(),
          persenDendaPerHari: (k.persen_denda_per_hari ?? 0) / 100,
          maksHariBayar: k.maks_hari_bayar ?? 30,
        })
        const status = resolveStatus(totalDibayar, efektifTagihan, denda.hariTerlambat)

        const pddm = daftarPDDM.find(p => p.ks_id === k.ks_id && p.status === 'aktif')
        const jtTime = new Date(k.tgl_jatuh_tempo).getTime()
        const match = pddm ? allPengakuan.find(pp => pp.pddm_id === pddm.id && new Date(pp.tgl_awal).getTime() === jtTime) : null

        return {
          id: k.id,
          ksId: k.ks_id,
          namaMitra: ks?.nama_mitra ?? '-',
          namaAset: (ks?.aset as any)?.nama_aset ?? '-',
          periodeLabel: k.periode_label ?? formatTanggal(k.tgl_jatuh_tempo),
          tglJatuhTempo: k.tgl_jatuh_tempo,
          tglBilling: k.tgl_jatuh_tempo,
          noPerjanjian: ks?.no_perjanjian ?? '-',
          noKontrakSAP: ks?.no_kontrak_sap ?? '-',
          noInvoice: k.no_invoice_sap ?? '-',
          noBilling: k.no_billing_sap ?? '-',
          totalTagihan: k.total_tagihan ?? 0,
          cashIn: totalDibayar,
          pendapatanAkrual: match?.nominal ?? k.nominal ?? 0,
          sisa,
          status,
        }
      })
  }, [allKompensasi, daftarKS, daftarPDDM, allPengakuan, tahun])

  // ── Mitra list for dropdown ───────────────────────────────────────────────
  const mitraList = useMemo(() => {
    const seen = new Map<string, string>()
    allRows.forEach(r => { if (r.ksId) seen.set(r.ksId, r.namaMitra) })
    return Array.from(seen.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [allRows])

  // ── Apply filters + sort ──────────────────────────────────────────────────
  const rows = useMemo(() => {
    let data = allRows

    if (filterMitra !== 'all') data = data.filter(r => r.ksId === filterMitra)
    if (filterStatus === 'lunas') data = data.filter(r => r.status === 'lunas')
    else if (filterStatus === 'belum_lunas') data = data.filter(r => r.status !== 'lunas')
    if (selectedMonths.length < 12) {
      data = data.filter(r => selectedMonths.includes(parseTglParts(r.tglJatuhTempo).month))
    }

    if (periodeMode === 'terbaru') {
      const latestByKs = new Map<string, string>()
      data.forEach(r => {
        const cur = latestByKs.get(r.ksId)
        if (!cur || r.tglJatuhTempo > cur) latestByKs.set(r.ksId, r.tglJatuhTempo)
      })
      data = data.filter(r => latestByKs.get(r.ksId) === r.tglJatuhTempo)
    }

    if (periodeMode === 'terdekat') {
      const todayTs = new Date().getTime()
      const nearestByKs = new Map<string, string>()
      data.forEach(r => {
        const cur = nearestByKs.get(r.ksId)
        if (!cur) { nearestByKs.set(r.ksId, r.tglJatuhTempo); return }
        const curDiff = Math.abs(new Date(cur).getTime() - todayTs)
        const newDiff = Math.abs(new Date(r.tglJatuhTempo).getTime() - todayTs)
        if (newDiff < curDiff) nearestByKs.set(r.ksId, r.tglJatuhTempo)
      })
      data = data.filter(r => nearestByKs.get(r.ksId) === r.tglJatuhTempo)
    }

    const dir = sortDir === 'asc' ? 1 : -1
    // Sort: saat mode terdekat, selalu urutkan by tglJatuhTempo terdekat dulu
    const effectiveSortKey = periodeMode === 'terdekat' ? 'tglJatuhTempo' : sortKey
    const effectiveSortDir = periodeMode === 'terdekat' ? 'asc' : sortDir
    const effectiveDir = effectiveSortDir === 'asc' ? 1 : -1
    data = [...data].sort((a, b) => {
      if (effectiveSortKey === 'totalTagihan') return (a.totalTagihan - b.totalTagihan) * effectiveDir
      if (effectiveSortKey === 'cashIn') return (a.cashIn - b.cashIn) * effectiveDir
      if (effectiveSortKey === 'sisa') return (a.sisa - b.sisa) * effectiveDir
      if (effectiveSortKey === 'tglJatuhTempo') {
        return (new Date(a.tglJatuhTempo).getTime() - new Date(b.tglJatuhTempo).getTime()) * effectiveDir
      }
      const av = a[effectiveSortKey as keyof typeof a] as string
      const bv = b[effectiveSortKey as keyof typeof b] as string
      return av.localeCompare(bv) * effectiveDir
    })

    return data
  }, [allRows, filterMitra, filterStatus, selectedMonths, periodeMode, sortKey, sortDir])

  // ── Summary ───────────────────────────────────────────────────────────────
  const totalTagihan = rows.reduce((s, r) => s + r.totalTagihan, 0)
  const totalCashIn = rows.reduce((s, r) => s + r.cashIn, 0)
  const totalSisa = rows.reduce((s, r) => s + r.sisa, 0)
  const totalAkrual = rows.reduce((s, r) => s + r.pendapatanAkrual, 0)
  const pctTertagih = totalTagihan > 0 ? (totalCashIn / totalTagihan) * 100 : 0

  // ── Sort toggle ───────────────────────────────────────────────────────────
  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
  }

  // ── Inline edit ───────────────────────────────────────────────────────────
  const startEdit = (id: string, field: string, current: string) =>
    setEditing({ id, field, value: current === '-' ? '' : current })
  const cancelEdit = () => setEditing(null)

  const saveEdit = async () => {
    if (!editing) return
    setSaving(true)
    try {
      if (editing.field === 'no_invoice_sap' || editing.field === 'no_billing_sap') {
        await supabase.from('kompensasi').update({ [editing.field]: editing.value || null }).eq('id', editing.id)
        await fetchAllKompensasi()
      } else if (editing.field === 'no_kontrak_sap') {
        const row = rows.find(r => r.id === editing.id)
        if (row) {
          await supabase.from('kerja_sama').update({ no_kontrak_sap: editing.value || null }).eq('id', row.ksId)
          await fetchKS()
        }
      }
    } catch (e: any) {
      console.error('[LaporanPendapatan2] Gagal simpan:', e)
    }
    setEditing(null)
    setSaving(false)
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-800">Laporan Pendapatan — {tahun}</h1>
        <p className="text-xs text-gray-500 mt-1">
          Satu baris = satu tahap kompensasi dari menu Kompensasi · Cash In dari pembayaran · Kolom SAP diisi manual setelah posting
        </p>
      </div>

      {/* ── Filter bar ───────────────────────────────────────────────────── */}
      <div className="bg-white border rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
        <Filter size={14} className="text-gray-400 shrink-0" />

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500 whitespace-nowrap">Tahun</label>
          <select
            value={tahun}
            onChange={e => setTahun(Number(e.target.value))}
            className="text-xs border rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#1B4F72]"
          >
            {tahunList.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500 whitespace-nowrap">Mitra</label>
          <select
            value={filterMitra}
            onChange={e => setFilterMitra(e.target.value)}
            className="text-xs border rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#1B4F72] max-w-[180px]"
          >
            <option value="all">Semua Mitra</option>
            {mitraList.map(([id, nama]) => <option key={id} value={id}>{nama}</option>)}
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500 whitespace-nowrap">Status</label>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as StatusFilter)}
            className="text-xs border rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#1B4F72]"
          >
            <option value="all">Semua</option>
            <option value="belum_lunas">Belum Lunas</option>
            <option value="lunas">Lunas</option>
          </select>
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-gray-500 whitespace-nowrap">Periode</label>
          <select
            value={periodeMode}
            onChange={e => setPeriodeMode(e.target.value as PeriodeMode)}
            className="text-xs border rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-[#1B4F72]"
          >
            <option value="semua">Semua Periode</option>
            <option value="terbaru">Periode Terbaru</option>
            <option value="terdekat">Tagihan Terdekat</option>
          </select>
        </div>

        <span className="ml-auto text-xs text-gray-400">{rows.length} baris</span>
      </div>

      {/* ── Month filter ──────────────────────────────────────────────────── */}
      <div className="bg-white border rounded-xl px-4 py-2.5 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-gray-500 font-medium mr-1">Bulan:</span>
        {['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'].map((label, idx) => {
          const active = selectedMonths.includes(idx)
          return (
            <button
              key={idx}
              onClick={() => {
                setSelectedMonths(prev => {
                  if (prev.length === 12) return [idx]
                  if (active) {
                    if (prev.length === 1) return prev
                    return prev.filter(m => m !== idx)
                  }
                  return [...prev, idx].sort((a, b) => a - b)
                })
              }}
              className={cn(
                'px-2 py-0.5 text-xs rounded-md border transition-colors select-none',
                active
                  ? 'bg-[#1B4F72] text-white border-[#1B4F72] font-medium'
                  : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
              )}
            >
              {label}
            </button>
          )
        })}
        {selectedMonths.length < 12 && (
          <button
            onClick={() => setSelectedMonths([0,1,2,3,4,5,6,7,8,9,10,11])}
            className="ml-1 text-[10px] text-blue-600 hover:underline"
          >
            Reset
          </button>
        )}
      </div>

      {/* ── Summary cards ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Total Tagihan" value={totalTagihan} color="text-gray-800" />
        <SummaryCard label="Cash In" value={totalCashIn} color="text-green-700" />
        <SummaryCard label="Outstanding" value={totalSisa} color="text-red-600" />
        <div className="bg-white rounded-xl border px-4 py-3">
          <p className="text-xs text-gray-500">% Tertagih</p>
          <p className="text-lg font-bold text-[#1B4F72] mt-0.5">{pctTertagih.toFixed(1)}%</p>
          <p className="text-[11px] text-gray-400">Akrual: {formatRupiah(totalAkrual)}</p>
        </div>
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-auto max-h-[70vh]">
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50 text-gray-500 uppercase shadow-[0_1px_0_#e5e7eb]">
                <th className="text-left px-3 py-2.5 w-6">#</th>
                <SortTh label="Mitra" col="namaMitra" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh label="Aset" col="namaAset" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortTh label="Periode" col="periodeLabel" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th className="text-left px-3 py-2.5">No Perjanjian</th>
                <SortTh label="Status" col="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <th className="text-left px-3 py-2.5">Tgl Billing</th>
                <th className="text-left px-3 py-2.5">No Kontrak SAP</th>
                <th className="text-left px-3 py-2.5">No Invoice SAP</th>
                <th className="text-left px-3 py-2.5">No Billing SAP</th>
                <SortTh label="Total Tagihan" col="totalTagihan" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                <SortTh label="Cash In" col="cashIn" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
                <th className="text-right px-3 py-2.5 font-semibold text-gray-500">Pendapatan Akrual</th>
                <SortTh label="Sisa" col="sisa" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={14} className="px-4 py-8 text-center text-gray-400">
                    Tidak ada data untuk filter yang dipilih
                  </td>
                </tr>
              )}
              {rows.map((row, i) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                  <td className="px-3 py-2 font-medium">{row.namaMitra}</td>
                  <td className="px-3 py-2 text-gray-600">{row.namaAset}</td>
                  <td className="px-3 py-2 text-gray-600">{row.periodeLabel}</td>
                  <td className="px-3 py-2 text-gray-500">{row.noPerjanjian}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_COLOR[row.status]}`}>
                      {STATUS_LABEL[row.status]}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{formatTanggal(row.tglBilling)}</td>

                  <td className="px-3 py-2">
                    <EditableCell
                      value={row.noKontrakSAP}
                      isEditing={editing?.id === row.id && editing?.field === 'no_kontrak_sap'}
                      editValue={editing?.value ?? ''}
                      onStartEdit={() => startEdit(row.id, 'no_kontrak_sap', row.noKontrakSAP)}
                      onChange={v => setEditing(e => e ? { ...e, value: v } : null)}
                      onSave={saveEdit}
                      onCancel={cancelEdit}
                      saving={saving}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <EditableCell
                      value={row.noInvoice}
                      isEditing={editing?.id === row.id && editing?.field === 'no_invoice_sap'}
                      editValue={editing?.value ?? ''}
                      onStartEdit={() => startEdit(row.id, 'no_invoice_sap', row.noInvoice)}
                      onChange={v => setEditing(e => e ? { ...e, value: v } : null)}
                      onSave={saveEdit}
                      onCancel={cancelEdit}
                      saving={saving}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <EditableCell
                      value={row.noBilling}
                      isEditing={editing?.id === row.id && editing?.field === 'no_billing_sap'}
                      editValue={editing?.value ?? ''}
                      onStartEdit={() => startEdit(row.id, 'no_billing_sap', row.noBilling)}
                      onChange={v => setEditing(e => e ? { ...e, value: v } : null)}
                      onSave={saveEdit}
                      onCancel={cancelEdit}
                      saving={saving}
                    />
                  </td>

                  <td className="px-3 py-2 text-right">
                    <CurrencyDisplay value={row.totalTagihan} size="sm" />
                  </td>
                  <td className="px-3 py-2 text-right text-green-700">
                    <CurrencyDisplay value={row.cashIn} size="sm" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <CurrencyDisplay value={row.pendapatanAkrual} size="sm" className="text-[#5B2C6F]" />
                  </td>
                  <td className="px-3 py-2 text-right">
                    <CurrencyDisplay value={row.sisa} size="sm" className={row.sisa > 0 ? 'text-red-600' : 'text-gray-400'} />
                  </td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 bg-gray-50 font-semibold text-xs">
                  <td colSpan={11} className="px-3 py-2.5 text-gray-700">Total ({rows.length} tagihan)</td>
                  <td className="px-3 py-2.5 text-right"><CurrencyDisplay value={totalTagihan} size="sm" /></td>
                  <td className="px-3 py-2.5 text-right text-green-700"><CurrencyDisplay value={totalCashIn} size="sm" /></td>
                  <td className="px-3 py-2.5 text-right text-red-600"><CurrencyDisplay value={totalSisa} size="sm" /></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Summary Card ─────────────────────────────────────────────────────────────

function SummaryCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-white rounded-xl border px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-lg font-bold ${color} mt-0.5`}>{formatRupiah(value)}</p>
    </div>
  )
}

// ─── Sortable TH ─────────────────────────────────────────────────────────────

function SortTh({ label, col, sortKey, sortDir, onSort, align = 'left' }: {
  label: string; col: SortKey; sortKey: SortKey; sortDir: SortDir
  onSort: (k: SortKey) => void; align?: 'left' | 'right'
}) {
  const active = sortKey === col
  return (
    <th
      className={`px-3 py-2.5 cursor-pointer select-none whitespace-nowrap ${align === 'right' ? 'text-right' : 'text-left'}`}
      onClick={() => onSort(col)}
    >
      <span className={`inline-flex items-center gap-1 ${active ? 'text-[#1B4F72]' : ''}`}>
        {label}
        {active
          ? sortDir === 'asc' ? <ChevronUp size={11} /> : <ChevronDown size={11} />
          : <ChevronsUpDown size={11} className="opacity-30" />}
      </span>
    </th>
  )
}

// ─── Inline editable cell ─────────────────────────────────────────────────────

function EditableCell({ value, isEditing, editValue, onStartEdit, onChange, onSave, onCancel, saving }: {
  value: string; isEditing: boolean; editValue: string
  onStartEdit: () => void; onChange: (v: string) => void
  onSave: () => void; onCancel: () => void; saving: boolean
}) {
  return (
    <div
      className={`cursor-pointer py-0.5 px-1 -mx-1 rounded text-xs ${isEditing ? 'ring-1 ring-[#1B4F72] bg-white' : 'hover:bg-gray-100'}`}
      onClick={() => !isEditing && onStartEdit()}
      title="Klik untuk edit"
    >
      {isEditing ? (
        <input
          autoFocus
          value={editValue}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') onCancel() }}
          onBlur={onSave}
          className="w-full outline-none bg-transparent text-xs text-gray-700"
          disabled={saving}
          style={{ minWidth: '80px' }}
        />
      ) : (
        <span className={value === '-' ? 'text-gray-300' : 'text-gray-700'}>{value}</span>
      )}
    </div>
  )
}
