import { useEffect, useMemo, useState } from 'react'
import { useKompensasiStore } from '@/store/kompensasiStore'
import { useCashInStore } from '@/store/cashInStore'
import { usePendapatanStore } from '@/store/pendapatanStore'
import { useRKAPStore, rowToRKAPItem } from '@/store/rkapStore'
import { useAsetStore } from '@/store/asetStore'
import { PROGNOSA_COLS, usePrognosaStore, type PrognosaRow } from '@/store/prognosaStore'
import { usePBBStore } from '@/store/pbbStore'
import { useKerjaSamaStore } from '@/store/kerjaSamaStore'
import { aggregateManualPrognosa, hitungRKAP } from '@/utils/rkapUtils'
import { TANPA_PROKER, buildLaporanHO } from '@/utils/laporanHOUtils'
import { getJadwalPerKode, type NonaktifBulanPerKind } from '@/utils/prognosaUtils'

const CURRENT_YEAR = new Date().getFullYear()
const CURRENT_MONTH = new Date().getMonth()

type ManualMap = Record<string, Array<number | null>>
const manualMap = (rows: PrognosaRow[], prefix: 'cash' | 'pendapatan'): ManualMap => {
  const result: ManualMap = {}
  rows.forEach(row => {
    result[row.kode] = [
      null, null, null, null, null, null,
      ...PROGNOSA_COLS.map(col => row[`${prefix}_${col}` as keyof PrognosaRow] as number),
    ]
  })
  return result
}

/**
 * Satu sumber perhitungan prognosa RKAP (Cash In dan Pendapatan PSAK 73) untuk semua halaman.
 * Target RKAP tidak pernah berubah oleh prognosa; penonaktifan hanya menyentuh prognosa.
 * Halaman pemakai bertugas memuat data dasar (kompensasi, cash in, pengakuan, aset, RKAP).
 */
export function usePrognosaRKAP(tahun: number, bulanPilihan: number | null = null) {
  const { allKompensasi } = useKompensasiStore()
  const { allCashIn } = useCashInStore()
  const { daftarPDDM, allPengakuan } = usePendapatanStore()
  const { rows } = useRKAPStore()
  const { daftarAset } = useAsetStore()
  const { allPBB, fetchAllPBB } = usePBBStore()
  const { daftarKS, fetchKS } = useKerjaSamaStore()
  const { basis, manualRows, nonaktifRows: semuaNonaktif, fetchPrognosa } = usePrognosaStore()
  // Penonaktifan berlaku khusus per dasar prognosa: hanya yang sesuai dasar aktif yang dipakai.
  const nonaktifRows = useMemo(() => semuaNonaktif.filter(r => r.dasar === basis), [semuaNonaktif, basis])

  useEffect(() => { fetchPrognosa(tahun) }, [tahun])
  useEffect(() => { fetchAllPBB(); fetchKS() }, [])

  const rkapItems = useMemo(() => {
    const target = rows.map(row => rowToRKAPItem(row, 'cash_in'))
    const known = new Set(target.map(item => item.kode))
    return [...target, ...manualRows.filter(row => !known.has(row.kode)).map((row, index) => ({
      no: target.length + index + 1, kode: row.kode, nama: row.nama, total: 0, bulan: Array(12).fill(0),
    }))]
  }, [rows, manualRows])
  const rkapItemsPendapatan = useMemo(() => {
    const target = rows.map(row => rowToRKAPItem(row, 'pendapatan'))
    const known = new Set(target.map(item => item.kode))
    return [...target, ...manualRows.filter(row => !known.has(row.kode)).map((row, index) => ({
      no: target.length + index + 1, kode: row.kode, nama: row.nama, total: 0, bulan: Array(12).fill(0),
    }))]
  }, [rows, manualRows])

  // Realisasi (Cash In dan Pendapatan) berasal dari satu perhitungan: baris laporan HO, yang sama
  // dengan file Evaluasi Kinerja. Realisasi tanpa proker tampil sebagai baris "(Belum terpetakan ke proker)".
  const hoRows = useMemo(() => buildLaporanHO({
    tahun, rkapRows: rows, daftarAset, daftarKS, allKompensasi, allCashIn, allPBB, daftarPDDM, allPengakuan,
    months: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  }), [tahun, rows, daftarAset, daftarKS, allKompensasi, allCashIn, allPBB, daftarPDDM, allPengakuan])
  const cashInPerNama = useMemo(() => {
    const hasil: Record<string, number[]> = {}
    hoRows.forEach(r => { hasil[r.kodeMonika] = r.cashByMonth.map(m => m.totalDiluarJaminan) })
    return hasil
  }, [hoRows])
  const pendapatanPerNama = useMemo(() => {
    const hasil: Record<string, number[]> = {}
    hoRows.forEach(r => { hasil[r.kodeMonika] = r.pendapatanByMonth.map(m => m.total) })
    return hasil
  }, [hoRows])
  const cashIn = useMemo(() => Array.from({ length: 12 }, (_, m) => hoRows.reduce((s, r) => s + (r.cashByMonth[m]?.totalDiluarJaminan ?? 0), 0)), [hoRows])
  const pendapatanPerBulan = useMemo(() => Array.from({ length: 12 }, (_, m) => hoRows.reduce((s, r) => s + (r.pendapatanByMonth[m]?.total ?? 0), 0)), [hoRows])

  const efektifBulanOtomatis = tahun < CURRENT_YEAR ? 11 : tahun === CURRENT_YEAR ? CURRENT_MONTH : -1
  const efektifBulan = efektifBulanOtomatis >= 0 && bulanPilihan != null ? bulanPilihan : efektifBulanOtomatis

  const jadwalPerKode = useMemo(() => getJadwalPerKode(allKompensasi, daftarAset, tahun), [allKompensasi, daftarAset, tahun])
  const prognosaManualCash = useMemo(() => manualMap(manualRows, 'cash'), [manualRows])
  const prognosaManualPendapatan = useMemo(() => manualMap(manualRows, 'pendapatan'), [manualRows])

  // Penonaktifan: bulan -1 = seluruh proker; 0–11 = bulan tertentu.
  const nonaktifCashIn = useMemo(() => new Set(nonaktifRows.filter(r => r.basis === 'cash_in' && r.bulan === -1).map(r => r.kode)), [nonaktifRows])
  const nonaktifPsak = useMemo(() => new Set(nonaktifRows.filter(r => r.basis === 'pendapatan' && r.bulan === -1).map(r => r.kode)), [nonaktifRows])
  const nonaktifBulan = useMemo<NonaktifBulanPerKind>(() => {
    const result: NonaktifBulanPerKind = { cash_in: {}, pendapatan: {} }
    nonaktifRows.filter(r => r.bulan >= 0).forEach(r => { (result[r.basis][r.kode] ??= []).push(r.bulan) })
    return result
  }, [nonaktifRows])
  const nonaktifEfektif = useMemo<NonaktifBulanPerKind>(() => {
    const semuaBulan = Array.from({ length: 12 }, (_, month) => month)
    const gabung = (perBulan: Record<string, number[]>, proker: Set<string>) => {
      const hasil: Record<string, number[]> = { ...perBulan }
      proker.forEach(kode => { hasil[kode] = semuaBulan })
      return hasil
    }
    return { cash_in: gabung(nonaktifBulan.cash_in, nonaktifCashIn), pendapatan: gabung(nonaktifBulan.pendapatan, nonaktifPsak) }
  }, [nonaktifBulan, nonaktifCashIn, nonaktifPsak])

  // Proker di luar RKAP (target 0) yang punya kerja sama tetap ikut prognosa dasar Jadwal.
  const prokerDiLuarRkap = useMemo(() => {
    const known = new Set([...rkapItems, ...rkapItemsPendapatan].map(item => item.kode))
    return hoRows
      .filter(r => r.kodeMonika !== TANPA_PROKER && !known.has(r.kodeMonika))
      .map((r, index) => ({ no: rkapItems.length + index + 1, kode: r.kodeMonika, nama: r.obyek, total: 0, bulan: Array(12).fill(0) }))
  }, [hoRows, rkapItems, rkapItemsPendapatan])
  const itemsPrognosaCash = useMemo(() => [...rkapItems, ...prokerDiLuarRkap], [rkapItems, prokerDiLuarRkap])
  const itemsPrognosaPendapatan = useMemo(() => [...rkapItemsPendapatan, ...prokerDiLuarRkap], [rkapItemsPendapatan, prokerDiLuarRkap])

  const rkapDataCashIn = useMemo(
    () => hitungRKAP(itemsPrognosaCash, cashIn, efektifBulan, aggregateManualPrognosa(
      itemsPrognosaCash, prognosaManualCash, cashInPerNama, efektifBulan, basis, 'cash_in', jadwalPerKode.cash_in, nonaktifEfektif.cash_in,
    )),
    [itemsPrognosaCash, cashIn, efektifBulan, prognosaManualCash, cashInPerNama, basis, jadwalPerKode, nonaktifEfektif],
  )
  const rkapDataPendapatan = useMemo(
    () => hitungRKAP(itemsPrognosaPendapatan, pendapatanPerBulan, efektifBulan, aggregateManualPrognosa(
      itemsPrognosaPendapatan, prognosaManualPendapatan, pendapatanPerNama, efektifBulan, basis, 'pendapatan', jadwalPerKode.pendapatan, nonaktifEfektif.pendapatan,
    )),
    [itemsPrognosaPendapatan, pendapatanPerBulan, efektifBulan, prognosaManualPendapatan, pendapatanPerNama, basis, jadwalPerKode, nonaktifEfektif],
  )

  return {
    basis, nonaktifRows, hoRows,
    rkapItems, rkapItemsPendapatan,
    cashIn, pendapatanPerBulan, cashInPerNama, pendapatanPerNama,
    efektifBulanOtomatis, efektifBulan,
    jadwalPerKode, prognosaManualCash, prognosaManualPendapatan,
    nonaktifCashIn, nonaktifPsak, nonaktifBulan, nonaktifEfektif,
    rkapDataCashIn, rkapDataPendapatan,
  }
}

/** Jumlah proker yang punya penonaktifan (seluruh proker atau per bulan) pada satu mode. */
export function hitungProkerNonaktif(nonaktifEfektif: Record<string, number[]>): number {
  return Object.keys(nonaktifEfektif).length
}
