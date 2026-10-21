import { useEffect, useMemo, useState } from 'react'
import { FileDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useKompensasiStore } from '@/store/kompensasiStore'
import { useKerjaSamaStore } from '@/store/kerjaSamaStore'
import { usePendapatanStore } from '@/store/pendapatanStore'
import { useRKAPStore } from '@/store/rkapStore'
import { useAsetStore } from '@/store/asetStore'
import { usePBBStore } from '@/store/pbbStore'
import { useCashInStore } from '@/store/cashInStore'
import { supabase } from '@/lib/supabase'
import { BULAN_LABELS_HO, buildLaporanHO } from '@/utils/laporanHOUtils'
import { exportEvaluasiKinerjaExcel, type PrognosaEvaluasi } from '@/utils/evaluasiKinerjaExport'

const ALL_MONTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
const PROGNOSA_BULAN = ['jul', 'agu', 'sep', 'okt', 'nov', 'des']

export function ExportEvaluasiKinerjaButton({ tahun }: { tahun: number }) {
  const { allKompensasi, fetchAllKompensasi } = useKompensasiStore()
  const { daftarKS, fetchKS } = useKerjaSamaStore()
  const { daftarPDDM, allPengakuan, fetchAll: fetchPDDM } = usePendapatanStore()
  const { rows: rkapRows } = useRKAPStore()
  const { daftarAset, fetchAset } = useAsetStore()
  const { allPBB, fetchAllPBB } = usePBBStore()
  const { allCashIn, fetchAllCashIn } = useCashInStore()

  const [prognosa, setPrognosa] = useState<PrognosaEvaluasi[]>([])
  const [bulan, setBulan] = useState<number | null>(null)
  const [bulanTouched, setBulanTouched] = useState(false)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    fetchAllKompensasi()
    fetchKS()
    fetchPDDM()
    fetchAset()
    fetchAllPBB()
    fetchAllCashIn()
  }, [])

  useEffect(() => {
    supabase.from('rkap_prognosa').select('*').eq('tahun', tahun).then(({ data, error }) => {
      if (error) console.error('[fetch prognosa evaluasi]', error)
      setPrognosa((data ?? []).map((row: any) => ({
        kode: row.kode,
        cash: Array.from({ length: 12 }, (_, month) => month < 6 ? 0 : Number(row[`cash_${PROGNOSA_BULAN[month - 6]}`] ?? 0)),
        pendapatan: Array.from({ length: 12 }, (_, month) => month < 6 ? 0 : Number(row[`pendapatan_${PROGNOSA_BULAN[month - 6]}`] ?? 0)),
      })))
    })
  }, [tahun])

  const rows = useMemo(
    () => buildLaporanHO({
      tahun, rkapRows, daftarAset, daftarKS, allKompensasi, allCashIn, allPBB, daftarPDDM, allPengakuan, months: ALL_MONTHS,
    }),
    [tahun, rkapRows, daftarAset, daftarKS, allKompensasi, allCashIn, allPBB, daftarPDDM, allPengakuan],
  )

  useEffect(() => {
    if (bulanTouched) return
    let best = new Date().getMonth()
    for (let m = 11; m >= 0; m--) {
      if (rows.some(r => Math.abs(r.pendapatanByMonth[m]?.total ?? 0) > 0.5 || Math.abs(r.pendapatanByMonth[m]?.pendapatan ?? 0) > 0.5)) {
        best = m
        break
      }
    }
    setBulan(best)
  }, [rows, bulanTouched])

  const endMonth = bulan ?? new Date().getMonth()

  const handleExport = async () => {
    setExporting(true)
    try {
      await exportEvaluasiKinerjaExcel(rows, { tahun, endMonth, prognosa })
    } catch (error) {
      console.error('[export evaluasi kinerja]', error)
      window.alert(`Excel Evaluasi Kinerja belum dapat dibuat: ${error instanceof Error ? error.message : 'terjadi kesalahan tidak dikenal'}`)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="inline-flex items-center gap-1.5">
      <select
        aria-label="Periode Evaluasi Kinerja s.d. bulan"
        value={endMonth}
        onChange={e => { setBulanTouched(true); setBulan(Number(e.target.value)) }}
        className="h-8 rounded-md border border-white/30 bg-white/10 px-2 text-xs text-white focus:outline-none"
        title="Evaluasi Kinerja dihitung s.d. bulan ini"
      >
        {BULAN_LABELS_HO.map((label, month) => (
          <option key={label} value={month} className="text-gray-800">s.d. {label}</option>
        ))}
      </select>
      <Button
        size="sm"
        variant="outline"
        className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
        onClick={handleExport}
        disabled={exporting || rows.length === 0}
        title="Unduh Excel format template Evaluasi Kinerja (Opset Cash, Opset Pendapatan, Piutang) · Rp Juta"
      >
        {exporting ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
        Evaluasi Kinerja
      </Button>
    </div>
  )
}
