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
import { BULAN_LABELS_HO, buildLaporanHO } from '@/utils/laporanHOUtils'
import { exportEvaluasiKinerjaExcel } from '@/utils/evaluasiKinerjaExport'
import { PROGNOSA_BASIS_LABEL, buildPrognosaEvaluasi, type JadwalPerKode, type NonaktifBulanPerKind, type PrognosaBasis, type PrognosaKind } from '@/utils/prognosaUtils'

const ALL_MONTHS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

interface Props {
  tahun: number
  endMonth: number
  basis: PrognosaBasis
  jadwal: Record<PrognosaKind, JadwalPerKode>
  manualCash: Record<string, Array<number | null>>
  manualPendapatan: Record<string, Array<number | null>>
  nonaktifCashIn: Set<string>
  nonaktifPsak: Set<string>
  nonaktifBulan: NonaktifBulanPerKind
}

export function ExportEvaluasiKinerjaButton({ tahun, endMonth, basis, jadwal, manualCash, manualPendapatan, nonaktifCashIn, nonaktifPsak, nonaktifBulan }: Props) {
  const { allKompensasi, fetchAllKompensasi } = useKompensasiStore()
  const { daftarKS, fetchKS } = useKerjaSamaStore()
  const { daftarPDDM, allPengakuan, fetchAll: fetchPDDM } = usePendapatanStore()
  const { rows: rkapRows } = useRKAPStore()
  const { daftarAset, fetchAset } = useAsetStore()
  const { allPBB, fetchAllPBB } = usePBBStore()
  const { allCashIn, fetchAllCashIn } = useCashInStore()

  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    fetchAllKompensasi()
    fetchKS()
    fetchPDDM()
    fetchAset()
    fetchAllPBB()
    fetchAllCashIn()
  }, [])

  const rows = useMemo(
    () => buildLaporanHO({
      tahun, rkapRows, daftarAset, daftarKS, allKompensasi, allCashIn, allPBB, daftarPDDM, allPengakuan, months: ALL_MONTHS,
    }),
    [tahun, rkapRows, daftarAset, daftarKS, allKompensasi, allCashIn, allPBB, daftarPDDM, allPengakuan],
  )

  const handleExport = async () => {
    setExporting(true)
    try {
      const prognosa = buildPrognosaEvaluasi({ rows, endMonth, basis, jadwal, manualCash, manualPendapatan, nonaktifCashIn, nonaktifPsak, nonaktifBulan })
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
      <Button
        size="sm"
        variant="outline"
        className="border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white"
        onClick={handleExport}
        disabled={exporting || rows.length === 0 || endMonth < 0}
        title={`Unduh Excel template Evaluasi Kinerja s.d. ${BULAN_LABELS_HO[Math.max(endMonth, 0)]} ${tahun} · prognosa: ${PROGNOSA_BASIS_LABEL[basis]} · Rp Juta`}
      >
        {exporting ? <Loader2 size={14} className="animate-spin" /> : <FileDown size={14} />}
        Evaluasi Kinerja
      </Button>
    </div>
  )
}
