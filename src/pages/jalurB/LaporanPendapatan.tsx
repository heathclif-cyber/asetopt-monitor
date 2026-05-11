import { useEffect, useState, useMemo } from 'react'
import { useKompensasiStore } from '@/store/kompensasiStore'
import { useKerjaSamaStore } from '@/store/kerjaSamaStore'
import { usePendapatanStore } from '@/store/pendapatanStore'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { formatTanggal, formatRupiah } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

export default function LaporanPendapatan() {
  const { allKompensasi, fetchAllKompensasi } = useKompensasiStore()
  const { daftarKS, fetchKS } = useKerjaSamaStore()
  const { daftarPDDM, allPengakuan, fetchAll: fetchPDDM } = usePendapatanStore()

  const [editing, setEditing] = useState<{ id: string; field: string; value: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchAllKompensasi(); fetchKS(); fetchPDDM()
  }, [])

  const rows = useMemo(() => {
    const tahun = new Date().getFullYear()
    return allKompensasi
      .filter(k => new Date(k.tgl_jatuh_tempo).getFullYear() === tahun)
      .map(k => {
        const ks = daftarKS.find(x => x.id === k.ks_id)
        const totalDibayar = (k.pembayaran ?? []).reduce((s, p) => s + p.nominal_bayar, 0)
        // Cari pendapatan akrual dari PDDM
        const pddm = daftarPDDM.find(p => p.ks_id === k.ks_id && p.status === 'aktif')
        const jtTime = new Date(k.tgl_jatuh_tempo).getTime()
        const match = pddm ? allPengakuan.find(pp => pp.pddm_id === pddm.id && new Date(pp.tgl_awal).getTime() === jtTime) : null
        return {
          id: k.id,
          ksId: k.ks_id,
          namaMitra: ks?.nama_mitra ?? '-',
          namaAset: (ks?.aset as any)?.nama_aset ?? '-',
          periodeLabel: k.periode_label ?? formatTanggal(k.tgl_jatuh_tempo),
          noPerjanjian: ks?.no_perjanjian ?? '-',
          noKontrakSAP: ks?.no_kontrak_sap ?? '-',
          noInvoice: k.no_invoice_sap ?? '-',
          noBilling: k.no_billing_sap ?? '-',
          totalTagihan: k.total_tagihan ?? 0,
          cashIn: totalDibayar,
          pendapatanAkrual: match?.nominal ?? k.nominal ?? 0,
        }
      })
      .sort((a, b) => a.namaMitra.localeCompare(b.namaMitra) || a.periodeLabel.localeCompare(b.periodeLabel))
  }, [allKompensasi, daftarKS, daftarPDDM, allPengakuan])

  const startEdit = (id: string, field: string, current: string) => {
    setEditing({ id, field, value: current === '-' ? '' : current })
  }

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
      console.error('Gagal simpan:', e)
    }
    setEditing(null)
    setSaving(false)
  }

  const totalTagihan = rows.reduce((s, r) => s + r.totalTagihan, 0)
  const totalCashIn = rows.reduce((s, r) => s + r.cashIn, 0)
  const totalAkrual = rows.reduce((s, r) => s + r.pendapatanAkrual, 0)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-gray-800">Laporan Pendapatan {new Date().getFullYear()}</h1>
        <p className="text-xs text-gray-500 mt-1">Gabungan Cash In & Pendapatan Akrual (PSAK 73) — lengkap dengan referensi SAP</p>
      </div>

      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-500 uppercase">
                <th className="text-left px-3 py-2.5 w-6">#</th>
                <th className="text-left px-3 py-2.5">Mitra</th>
                <th className="text-left px-3 py-2.5">Aset</th>
                <th className="text-left px-3 py-2.5">Periode</th>
                <th className="text-left px-3 py-2.5">No Perjanjian</th>
                <th className="text-left px-3 py-2.5">No Kontrak SAP</th>
                <th className="text-left px-3 py-2.5">No Invoice SAP</th>
                <th className="text-left px-3 py-2.5">No Billing SAP</th>
                <th className="text-right px-3 py-2.5">Total Tagihan</th>
                <th className="text-right px-3 py-2.5">Cash In</th>
                <th className="text-right px-3 py-2.5">Pendapatan Akrual</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((row, i) => (
                <tr key={row.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                  <td className="px-3 py-2 font-medium">{row.namaMitra}</td>
                  <td className="px-3 py-2 text-gray-600">{row.namaAset}</td>
                  <td className="px-3 py-2 text-gray-600">{row.periodeLabel}</td>

                  {/* No Perjanjian (read-only) */}
                  <td className="px-3 py-2 text-gray-500">{row.noPerjanjian}</td>

                  {/* No Kontrak SAP */}
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

                  {/* No Invoice SAP */}
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

                  {/* No Billing SAP */}
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

                  <td className="px-3 py-2 text-right"><CurrencyDisplay value={row.totalTagihan} size="sm" /></td>
                  <td className="px-3 py-2 text-right text-green-700"><CurrencyDisplay value={row.cashIn} size="sm" /></td>
                  <td className="px-3 py-2 text-right">
                    <CurrencyDisplay value={row.pendapatanAkrual} size="sm" className="text-[#5B2C6F]" />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 bg-gray-50 font-semibold text-xs">
                <td colSpan={8} className="px-3 py-2.5 text-gray-700">Total</td>
                <td className="px-3 py-2.5 text-right"><CurrencyDisplay value={totalTagihan} size="sm" /></td>
                <td className="px-3 py-2.5 text-right text-green-700"><CurrencyDisplay value={totalCashIn} size="sm" /></td>
                <td className="px-3 py-2.5 text-right text-[#5B2C6F]"><CurrencyDisplay value={totalAkrual} size="sm" /></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Inline editable cell ─────────────────────────────────────────────────

function EditableCell({
  value, isEditing, editValue, onStartEdit, onChange, onSave, onCancel, saving,
}: {
  value: string; isEditing: boolean; editValue: string
  onStartEdit: () => void; onChange: (v: string) => void
  onSave: () => void; onCancel: () => void; saving: boolean
}) {
  return (
    <div
      className={`cursor-pointer py-0.5 px-1 -mx-1 rounded text-xs ${isEditing ? 'ring-1 ring-[#5B2C6F] bg-white' : 'hover:bg-gray-100'}`}
      onClick={() => !isEditing && onStartEdit()}
      title="Klik untuk edit"
    >
      {isEditing ? (
        <input
          autoFocus
          value={editValue}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.currentTarget.blur() }; if (e.key === 'Escape') { onCancel() } }}
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
