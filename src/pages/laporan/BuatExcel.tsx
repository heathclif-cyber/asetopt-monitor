import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { ArrowDown, ArrowUp, FileSpreadsheet, Loader2, Save, Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useKompensasiStore } from '@/store/kompensasiStore'
import { useKerjaSamaStore } from '@/store/kerjaSamaStore'
import { useReportFormatStore } from '@/store/reportFormatStore'
import { useAuthStore } from '@/store/authStore'
import { addTemplatedSheet, downloadWorkbook, newWorkbook, todayKey } from '@/utils/excelTemplate'
import {
  STATUS_BAYAR_LABEL,
  STATUS_SAP_LABEL,
  TAGIHAN_COLUMNS,
  applyFilters,
  buildReport,
  buildTagihanRecords,
  defaultConfig,
  normalizeConfig,
  type GroupBy,
  type ReportConfig,
  type StatusBayar,
  type StatusSap,
} from '@/utils/reportBuilder'
import { formatAngka, formatTanggal } from '@/lib/utils'

const CATEGORIES = ['Mitra & Kontrak', 'Tagihan', 'Pembayaran', 'SAP'] as const
const PREVIEW_ROWS = 15
const selectClass = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring'

export default function BuatExcel() {
  const location = useLocation()
  const user = useAuthStore(s => s.user)
  const { allKompensasi, fetchAllKompensasi } = useKompensasiStore()
  const { daftarKS, fetchKS } = useKerjaSamaStore()
  const { formats, fetchFormats, saveFormat, deleteFormat } = useReportFormatStore()

  const [config, setConfig] = useState<ReportConfig>(defaultConfig)
  const [nama, setNama] = useState('')
  const [shared, setShared] = useState(false)
  const [formatId, setFormatId] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetchAllKompensasi()
    fetchKS()
    fetchFormats()
  }, [location.key])

  const records = useMemo(() => buildTagihanRecords(allKompensasi, daftarKS), [allKompensasi, daftarKS])
  const tahunList = useMemo(
    () => Array.from(new Set(records.map(r => r.tahun).filter(Boolean))).sort((a, b) => b - a),
    [records],
  )
  const mitraList = useMemo(() => Array.from(new Set(records.map(r => r.mitra))).sort((a, b) => a.localeCompare(b)), [records])
  const filtered = useMemo(() => applyFilters(records, config.filters), [records, config.filters])
  const report = useMemo(() => buildReport(filtered, config), [filtered, config])

  const current = formats.find(f => f.id === formatId)
  const canEdit = !!current && (current.mine || user?.role === 'admin')
  const selectedKeys = new Set(config.columns.map(c => c.key))

  const patch = (partial: Partial<ReportConfig>) => setConfig(c => ({ ...c, ...partial }))
  const patchFilters = (partial: Partial<ReportConfig['filters']>) =>
    setConfig(c => ({ ...c, filters: { ...c.filters, ...partial } }))

  const toggleColumn = (key: (typeof TAGIHAN_COLUMNS)[number]['key']) => {
    const def = TAGIHAN_COLUMNS.find(c => c.key === key)!
    patch({
      columns: selectedKeys.has(key)
        ? config.columns.filter(c => c.key !== key)
        : [...config.columns, { key, label: def.label }],
    })
  }
  const moveColumn = (index: number, delta: number) => {
    const next = [...config.columns]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    patch({ columns: next })
  }
  const toggleTahun = (y: number) => {
    const set = new Set(config.filters.tahun)
    if (set.has(y)) set.delete(y)
    else set.add(y)
    patchFilters({ tahun: Array.from(set).sort((a, b) => a - b) })
  }

  const loadFormat = (id: string) => {
    setFormatId(id)
    setMessage(null)
    const f = formats.find(x => x.id === id)
    if (!f) {
      setNama('')
      setShared(false)
      setConfig(defaultConfig())
      return
    }
    setNama(f.nama)
    setShared(f.is_shared)
    setConfig(normalizeConfig(f.config))
  }

  const save = async (asNew: boolean) => {
    if (!nama.trim()) {
      setMessage({ ok: false, text: 'Isi nama format dulu.' })
      return
    }
    if (config.columns.length === 0) {
      setMessage({ ok: false, text: 'Pilih minimal satu kolom.' })
      return
    }
    setBusy(true)
    try {
      const saved = await saveFormat({
        id: !asNew && canEdit ? formatId : undefined,
        nama: nama.trim(),
        config,
        is_shared: shared,
      })
      setFormatId(saved.id)
      setMessage({ ok: true, text: `Format "${saved.nama}" tersimpan.` })
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : 'Gagal menyimpan format.' })
    } finally {
      setBusy(false)
    }
  }

  const remove = async () => {
    if (!current || !window.confirm(`Hapus format "${current.nama}"?`)) return
    setBusy(true)
    try {
      await deleteFormat(current.id)
      loadFormat('')
      setMessage({ ok: true, text: 'Format dihapus.' })
    } catch (error) {
      setMessage({ ok: false, text: error instanceof Error ? error.message : 'Gagal menghapus format.' })
    } finally {
      setBusy(false)
    }
  }

  const filterSummary = () => {
    const f = config.filters
    return [
      `Tahun JT: ${f.tahun.length ? f.tahun.join(', ') : 'semua'}`,
      `Mitra: ${f.mitra === 'all' ? 'semua' : f.mitra}`,
      `Status bayar: ${f.status === 'all' ? 'semua' : STATUS_BAYAR_LABEL[f.status]}`,
      `Status SAP: ${f.sap === 'all' ? 'semua' : STATUS_SAP_LABEL[f.sap]}`,
      `Jumlah baris: ${report.rows.length}`,
      `Diunduh: ${formatTanggal(new Date().toISOString())}`,
    ]
  }

  const download = async () => {
    setBusy(true)
    try {
      const title = nama.trim() || 'Laporan Tagihan'
      const wb = newWorkbook()
      addTemplatedSheet(wb, {
        sheetName: title.replace(/[\\/*?:[\]]/g, ' ').slice(0, 31) || 'Laporan',
        title,
        subtitle: config.groupBy === 'none' ? 'Daftar tagihan' : `Rekap per ${config.groupBy === 'mitra' ? 'mitra' : 'proker'}`,
        metaLines: filterSummary(),
        columns: report.columns,
        rows: report.rows,
        totalKeys: report.totalKeys,
      })
      await downloadWorkbook(wb, `${title.replace(/[^\w\- ]+/g, '').trim() || 'Laporan'}_${todayKey()}.xlsx`)
    } finally {
      setBusy(false)
    }
  }

  const mine = formats.filter(f => f.mine)
  const others = formats.filter(f => !f.mine)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-gray-800">Buat Excel Sendiri</h1>
        <p className="text-xs text-gray-500 mt-1 max-w-2xl">
          Pilih kolom dan filter sesuai kebutuhan, simpan sebagai format, lalu unduh kapan saja. Format hanya menyimpan susunan;
          data selalu diambil terbaru dari database.
        </p>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Format</h2>
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <label className="text-xs text-gray-500 space-y-1 block">
            Format tersimpan
            <select className={selectClass} value={formatId} onChange={e => loadFormat(e.target.value)}>
              <option value="">— Format baru —</option>
              {mine.length > 0 && <optgroup label="Milik saya">{mine.map(f => <option key={f.id} value={f.id}>{f.nama}</option>)}</optgroup>}
              {others.length > 0 && <optgroup label="Dibagikan tim">{others.map(f => <option key={f.id} value={f.id}>{f.nama} · {f.owner_username}</option>)}</optgroup>}
            </select>
          </label>
          <label className="text-xs text-gray-500 space-y-1 block">
            Nama format
            <Input value={nama} onChange={e => setNama(e.target.value)} placeholder="Contoh: Tagihan belum SAP per mitra" maxLength={80} />
          </label>
          <label className="flex items-center gap-2 text-xs text-gray-600 h-9">
            <input type="checkbox" checked={shared} onChange={e => setShared(e.target.checked)} />
            Bagikan ke semua pengguna
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => save(false)} disabled={busy || (!!current && !canEdit)}>
            <Save size={14} /> {canEdit ? 'Simpan perubahan' : 'Simpan format'}
          </Button>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={() => save(true)} disabled={busy}>Simpan sebagai baru</Button>
          )}
          {current && !canEdit && (
            <span className="text-xs text-gray-500">Format milik {current.owner_username}. Ubah nama lalu simpan untuk membuat salinan sendiri.</span>
          )}
          {canEdit && (
            <Button size="sm" variant="outline" className="text-red-600" onClick={remove} disabled={busy}>
              <Trash2 size={14} /> Hapus
            </Button>
          )}
          {message && <span className={message.ok ? 'text-xs text-green-700' : 'text-xs text-red-600'}>{message.text}</span>}
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Kolom</h2>
          {CATEGORIES.map(cat => (
            <div key={cat}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{cat}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {TAGIHAN_COLUMNS.filter(c => c.category === cat).map(c => (
                  <label key={c.key} className="flex items-center gap-1.5 text-xs text-gray-700">
                    <input type="checkbox" checked={selectedKeys.has(c.key)} onChange={() => toggleColumn(c.key)} />
                    {c.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
          {config.groupBy !== 'none' && (
            <p className="text-[11px] text-amber-700">Saat dikelompokkan, hanya kolom angka yang ikut (dijumlahkan).</p>
          )}
        </section>

        <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-gray-700">Urutan dan judul kolom</h2>
          {config.columns.length === 0 && <p className="text-xs text-gray-500">Belum ada kolom dipilih.</p>}
          <ul className="space-y-1.5">
            {config.columns.map((c, i) => (
              <li key={c.key} className="flex items-center gap-1.5">
                <span className="w-5 text-right text-[11px] text-gray-400">{i + 1}</span>
                <Input
                  className="h-8 text-xs"
                  value={c.label}
                  onChange={e => patch({ columns: config.columns.map(x => x.key === c.key ? { ...x, label: e.target.value } : x) })}
                  aria-label={`Judul kolom ${c.key}`}
                />
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => moveColumn(i, -1)} disabled={i === 0} aria-label="Naik"><ArrowUp size={14} /></Button>
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => moveColumn(i, 1)} disabled={i === config.columns.length - 1} aria-label="Turun"><ArrowDown size={14} /></Button>
                <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => toggleColumn(c.key)} aria-label="Hapus kolom"><X size={14} /></Button>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
        <h2 className="text-sm font-semibold text-gray-700">Filter dan pengelompokan</h2>
        <div>
          <p className="text-xs text-gray-500 mb-1">Tahun jatuh tempo <span className="text-gray-400">(tidak dipilih = semua tahun)</span></p>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {tahunList.map(y => (
              <label key={y} className="flex items-center gap-1.5 text-xs text-gray-700">
                <input type="checkbox" checked={config.filters.tahun.includes(y)} onChange={() => toggleTahun(y)} /> {y}
              </label>
            ))}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="text-xs text-gray-500 space-y-1 block">
            Mitra
            <select className={selectClass} value={config.filters.mitra} onChange={e => patchFilters({ mitra: e.target.value })}>
              <option value="all">Semua mitra</option>
              {mitraList.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-500 space-y-1 block">
            Status bayar
            <select className={selectClass} value={config.filters.status} onChange={e => patchFilters({ status: e.target.value as StatusBayar | 'all' })}>
              <option value="all">Semua</option>
              {(Object.keys(STATUS_BAYAR_LABEL) as StatusBayar[]).map(s => <option key={s} value={s}>{STATUS_BAYAR_LABEL[s]}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-500 space-y-1 block">
            Status SAP
            <select className={selectClass} value={config.filters.sap} onChange={e => patchFilters({ sap: e.target.value as StatusSap | 'all' })}>
              <option value="all">Semua</option>
              {(Object.keys(STATUS_SAP_LABEL) as StatusSap[]).map(s => <option key={s} value={s}>{STATUS_SAP_LABEL[s]}</option>)}
            </select>
          </label>
          <label className="text-xs text-gray-500 space-y-1 block">
            Kelompokkan
            <select className={selectClass} value={config.groupBy} onChange={e => patch({ groupBy: e.target.value as GroupBy })}>
              <option value="none">Tidak (satu baris per tagihan)</option>
              <option value="mitra">Per mitra</option>
              <option value="proker">Per proker</option>
            </select>
          </label>
        </div>
        <label className="flex items-center gap-2 text-xs text-gray-600">
          <input type="checkbox" checked={config.totalRow} onChange={e => patch({ totalRow: e.target.checked })} />
          Tambahkan baris TOTAL untuk kolom angka
        </label>
      </section>

      <section className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-700">
            Pratinjau <span className="font-normal text-gray-500">· {formatAngka(report.rows.length)} baris{report.rows.length > PREVIEW_ROWS ? `, ${PREVIEW_ROWS} pertama ditampilkan` : ''}</span>
          </h2>
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={download} disabled={busy || report.rows.length === 0 || report.columns.length === 0}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />} Unduh Excel
          </Button>
        </div>
        {report.columns.length === 0 ? (
          <p className="text-xs text-gray-500">Pilih kolom untuk melihat pratinjau.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-100">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>{report.columns.map(c => <th key={c.key} className="px-3 py-2 text-left font-semibold whitespace-nowrap">{c.header}</th>)}</tr>
              </thead>
              <tbody>
                {report.rows.slice(0, PREVIEW_ROWS).map((row, i) => (
                  <tr key={i} className="border-t border-gray-100">
                    {report.columns.map(c => {
                      const v = row[c.key]
                      const numeric = c.type === 'money' || c.type === 'int' || c.type === 'number'
                      return (
                        <td key={c.key} className={`px-3 py-1.5 whitespace-nowrap ${numeric ? 'text-right tabular-nums' : ''}`}>
                          {v === '' || v == null ? '' : c.type === 'date' ? formatTanggal(String(v)) : numeric ? formatAngka(Number(v)) : String(v)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
                {report.rows.length === 0 && (
                  <tr><td colSpan={report.columns.length} className="px-3 py-6 text-center text-gray-400">Tidak ada data untuk filter ini.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
