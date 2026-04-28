import { useEffect, useMemo } from 'react'
import { useKompensasiStore } from '@/store/kompensasiStore'
import { useKerjaSamaStore } from '@/store/kerjaSamaStore'
import { useNotifikasiStore } from '@/store/notifikasiStore'
import { Kompensasi, SuratPeringatan } from '@/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { EmptyState } from '@/components/common/EmptyState'
import { TableSkeleton } from '@/components/common/LoadingSkeleton'
import { formatTanggal, hitungSisaHari, formatRupiah } from '@/lib/utils'
import { buatPesanWA } from '@/utils/notifikasiUtils'
import { hitungDenda } from '@/utils/taxUtils'
import { MessageSquare, FileWarning, CheckCircle, Trash2, AlertTriangle, Bot } from 'lucide-react'

// Helper: tambah hari ke date string
function addDays(dateStr: string, days: number): Date {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d
}

function fmtDate(d: Date) {
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' })
}

// SP1 diterbitkan saat denda mencapai 5%: denda = 1/1000 per hari × 50 hari = 5%
// SP1: grace period + 50 hari; SP2: +14; SP3: +28; PUTUS: +42
const HARI_DENDA_SP1 = 50  // 50 × 1‰ = 5%

function hitungAutoSP(tglJatuhTempo: string, maksHariBayar: number) {
  const tglSP1   = addDays(tglJatuhTempo, maksHariBayar + HARI_DENDA_SP1)
  const tglSP2   = addDays(tglJatuhTempo, maksHariBayar + HARI_DENDA_SP1 + 14)
  const tglSP3   = addDays(tglJatuhTempo, maksHariBayar + HARI_DENDA_SP1 + 28)
  const tglPutus = addDays(tglJatuhTempo, maksHariBayar + HARI_DENDA_SP1 + 42)
  const today = new Date(); today.setHours(0,0,0,0)

  let level: 'BELUM' | 'SP1' | 'SP2' | 'SP3' | 'PUTUS' = 'BELUM'
  let tglLevel = tglSP1
  if (today >= tglPutus) { level = 'PUTUS'; tglLevel = tglPutus }
  else if (today >= tglSP3) { level = 'SP3'; tglLevel = tglSP3 }
  else if (today >= tglSP2) { level = 'SP2'; tglLevel = tglSP2 }
  else if (today >= tglSP1) { level = 'SP1'; tglLevel = tglSP1 }

  return { level, tglLevel, tglSP1, tglSP2, tglSP3, tglPutus }
}

export function NotifikasiSP() {
  const { allKompensasi, fetchAllKompensasi } = useKompensasiStore()
  const { daftarKS, fetchKS } = useKerjaSamaStore()
  const {
    jatuhTempoH14, spAktif, allSP, logNotifikasi,
    checkJatuhTempo, fetchSPAktif, fetchLog, fetchAllSP,
    terbitkanSP, kirimNotifWA, deleteSP,
  } = useNotifikasiStore()

  useEffect(() => {
    const load = async () => {
      await Promise.all([fetchAllKompensasi(), fetchKS(), fetchSPAktif(), fetchLog(), fetchAllSP()])
    }
    load()
  }, [])

  useEffect(() => { checkJatuhTempo(allKompensasi) }, [allKompensasi])

  // Hitung status SP otomatis per KS
  const autoSPList = useMemo(() => {
    // Kelompokkan kompensasi belum lunas per KS
    const byKS: Record<string, { ks_id: string; tglJT: string; maksHari: number; namaAset: string; namaMitra: string; totalSisa: number }> = {}

    allKompensasi.forEach(k => {
      const totalDibayar = (k.pembayaran ?? []).reduce((s, p) => s + p.nominal_bayar, 0)
      const sisa = (k.total_tagihan ?? 0) - totalDibayar
      if (sisa <= 0) return   // sudah lunas, skip
      const today = new Date(); today.setHours(0,0,0,0)
      const graceEnd = addDays(k.tgl_jatuh_tempo, k.maks_hari_bayar ?? 0)
      if (graceEnd > today) return   // masih dalam grace period

      const ks = daftarKS.find(x => x.id === k.ks_id)
      if (!byKS[k.ks_id] || new Date(k.tgl_jatuh_tempo) < new Date(byKS[k.ks_id].tglJT)) {
        byKS[k.ks_id] = {
          ks_id: k.ks_id,
          tglJT: k.tgl_jatuh_tempo,
          maksHari: k.maks_hari_bayar ?? 0,
          namaAset: (ks?.aset as any)?.nama_aset ?? '-',
          namaMitra: ks?.nama_mitra ?? '-',
          totalSisa: 0,
        }
      }
      byKS[k.ks_id].totalSisa += sisa
    })

    return Object.values(byKS).map(item => ({
      ...item,
      ...hitungAutoSP(item.tglJT, item.maksHari),
    })).filter(x => x.level !== 'BELUM')
      .sort((a, b) => {
      const order: Record<string, number> = { PUTUS: 0, SP3: 1, SP2: 2, SP1: 3, BELUM: 9 }
        return (order[a.level] ?? 9) - (order[b.level] ?? 9)
      })
  }, [allKompensasi, daftarKS])

  const handleKirimWA = async (k: Kompensasi, jenis: string) => {
    const ks = daftarKS.find(x => x.id === k.ks_id)
    if (!ks?.no_wa_mitra) { alert('No. WA mitra belum diisi'); return }
    const pesan = buatPesanWA({
      namaAset: (ks.aset as any)?.nama_aset ?? '',
      namaMitra: ks.nama_mitra,
      nominal: k.total_tagihan,
      tglJatuhTempo: k.tgl_jatuh_tempo,
      jenisPesan: jenis,
    })
    const ok = await kirimNotifWA({ noWA: ks.no_wa_mitra, pesan, ksId: ks.id, jenis })
    alert(ok ? 'WA terkirim!' : 'Gagal kirim WA')
  }

  const handleKirimSemua = async () => {
    for (const k of jatuhTempoH14) {
      const ks = daftarKS.find(x => x.id === k.ks_id)
      if (ks?.no_wa_mitra) await handleKirimWA(k, 'jatuh_tempo_h14')
    }
    alert('Selesai mengirim semua notifikasi')
  }

  const handleTerbitkanSPBerikutnya = async (sp: SuratPeringatan) => {
    const nextMap: Record<string, string> = { SP1: 'SP2', SP2: 'SP3', SP3: 'PUTUS' }
    const jenis = nextMap[sp.jenis]
    if (!jenis) return
    if (confirm(`Terbitkan ${jenis} untuk kerja sama ini?`)) {
      await terbitkanSP(sp.ks_id, sp.kompensasi_id, jenis as any)
    }
  }

  const handleDeleteSP = async (sp: SuratPeringatan) => {
    const mitra = (sp.kerja_sama as any)?.nama_mitra ?? 'ini'
    if (confirm(`Hapus ${sp.jenis} untuk ${mitra}? Data tidak dapat dikembalikan.`)) {
      await deleteSP(sp.id)
    }
  }

  const getSPBadgeVariant = (jenis: string) =>
    ({ SP1: 'sp1', SP2: 'sp2', SP3: 'sp3', PUTUS: 'putus' }[jenis] ?? 'secondary')

  const levelColor = (level: string) => ({
    SP1: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    SP2: 'bg-orange-100 text-orange-800 border-orange-300',
    SP3: 'bg-red-100 text-red-800 border-red-300',
    PUTUS: 'bg-gray-900 text-white border-gray-700',
  }[level] ?? '')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Notifikasi & Surat Peringatan</h1>
        <p className="text-sm text-gray-500">Monitoring jatuh tempo, SP aktif, status otomatis, dan histori notifikasi WA</p>
      </div>

      <Tabs defaultValue="jatuh_tempo">
        <TabsList>
          <TabsTrigger value="jatuh_tempo" className="relative">
            Akan Jatuh Tempo
            {jatuhTempoH14.length > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">{jatuhTempoH14.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="sp_auto" className="relative">
            <Bot size={13} className="mr-1" />
            Status SP Otomatis
            {autoSPList.length > 0 && (
              <span className="ml-1.5 bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5">{autoSPList.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="sp_aktif">
            SP Aktif
            {spAktif.length > 0 && (
              <span className="ml-1.5 bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5">{spAktif.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="histori_sp">Histori SP</TabsTrigger>
          <TabsTrigger value="histori">Histori Notifikasi</TabsTrigger>
        </TabsList>

        {/* Tab Jatuh Tempo */}
        <TabsContent value="jatuh_tempo" className="mt-4">
          {jatuhTempoH14.length > 0 && (
            <div className="flex justify-end mb-3">
              <Button size="sm" onClick={handleKirimSemua} className="bg-green-700">
                <MessageSquare size={14} /> Kirim Semua WA
              </Button>
            </div>
          )}
          {jatuhTempoH14.length === 0 ? (
            <EmptyState title="Tidak ada jatuh tempo dalam 14 hari" description="Semua kompensasi masih dalam batas aman." />
          ) : (
            <div className="bg-white rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                    <th className="text-left px-4 py-3">Mitra / Aset</th>
                    <th className="text-left px-4 py-3">Periode</th>
                    <th className="text-right px-4 py-3">Total Tagihan</th>
                    <th className="text-left px-4 py-3">Jatuh Tempo</th>
                    <th className="text-right px-4 py-3">Sisa Hari</th>
                    <th className="text-right px-4 py-3">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {jatuhTempoH14.map(k => {
                    const ks = daftarKS.find(x => x.id === k.ks_id)
                    const sisa = hitungSisaHari(k.tgl_jatuh_tempo)
                    return (
                      <tr key={k.id} className={`hover:bg-gray-50 ${sisa <= 3 ? 'bg-red-50' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="font-medium">{ks?.nama_mitra ?? '-'}</div>
                          <div className="text-xs text-gray-500">{(ks?.aset as any)?.nama_aset ?? '-'}</div>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{k.periode_label ?? '-'}</td>
                        <td className="px-4 py-3 text-right font-semibold"><CurrencyDisplay value={k.total_tagihan} size="sm" /></td>
                        <td className="px-4 py-3">{formatTanggal(k.tgl_jatuh_tempo)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-bold ${sisa <= 3 ? 'text-red-600' : sisa <= 7 ? 'text-orange-600' : 'text-gray-700'}`}>
                            {sisa} hari
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button size="sm" variant="outline" onClick={() => handleKirimWA(k, 'jatuh_tempo_h14')}>
                            <MessageSquare size={13} /> Kirim WA
                          </Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Tab Status SP Otomatis */}
        <TabsContent value="sp_auto" className="mt-4">
          <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
            <strong>Keterangan:</strong> SP1 diterbitkan saat denda keterlambatan mencapai 5% (50 hari × 1‰/hari setelah grace period).
            SP2 setelah +14 hari dari SP1, SP3 setelah +14 hari dari SP2, PUTUS setelah +14 hari dari SP3.
          </div>
          {autoSPList.length === 0 ? (
            <EmptyState title="Tidak ada KS yang memerlukan SP" description="Semua kompensasi masih dalam batas toleransi." />
          ) : (
            <div className="space-y-3">
              {autoSPList.map(item => (
                <div key={item.ks_id} className={`rounded-xl border p-4 ${
                  item.level === 'PUTUS' ? 'bg-gray-900 border-gray-700' :
                  item.level === 'SP3'  ? 'bg-red-50 border-red-200' :
                  item.level === 'SP2'  ? 'bg-orange-50 border-orange-200' :
                                          'bg-yellow-50 border-yellow-200'
                }`}>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle size={15} className={item.level === 'PUTUS' ? 'text-gray-300' : 'text-orange-500'} />
                        <span className={`font-bold text-sm ${item.level === 'PUTUS' ? 'text-white' : 'text-gray-900'}`}>
                          {item.namaMitra}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${levelColor(item.level)}`}>
                          {item.level}
                        </span>
                      </div>
                      <p className={`text-xs mb-2 ${item.level === 'PUTUS' ? 'text-gray-400' : 'text-gray-500'}`}>
                        {item.namaAset}
                      </p>
                      <p className={`text-sm font-medium ${item.level === 'PUTUS' ? 'text-gray-200' : 'text-gray-800'}`}>
                        Berdasarkan jangka waktu keterlambatan, <strong>{item.namaMitra}</strong> seharusnya
                        telah mendapat <strong>{item.level}</strong> pada <strong>{fmtDate(item.tglLevel)}</strong>
                      </p>
                      <p className={`text-xs mt-1 ${item.level === 'PUTUS' ? 'text-gray-400' : 'text-gray-500'}`}>
                        Total piutang belum lunas: {formatRupiah(item.totalSisa)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-[10px] space-y-0.5">
                        <div className={
                          item.level === 'PUTUS' ? 'font-semibold text-yellow-400' :
                          (item.level === 'SP1' || item.level === 'SP2' || item.level === 'SP3') ? 'font-semibold text-yellow-700' :
                          'text-gray-400'
                        }>
                          SP1: {fmtDate(item.tglSP1)}
                        </div>
                        <div className={
                          item.level === 'PUTUS' ? 'font-semibold text-orange-400' :
                          (item.level === 'SP2' || item.level === 'SP3') ? 'font-semibold text-orange-600' :
                          'text-gray-400'
                        }>
                          SP2: {fmtDate(item.tglSP2)}
                        </div>
                        <div className={
                          item.level === 'PUTUS' ? 'font-semibold text-red-400' :
                          item.level === 'SP3' ? 'font-semibold text-red-600' :
                          'text-gray-400'
                        }>
                          SP3: {fmtDate(item.tglSP3)}
                        </div>
                        <div className={item.level === 'PUTUS' ? 'font-semibold text-white' : 'text-gray-400'}>
                          PUTUS: {fmtDate(item.tglPutus)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Tab SP Aktif */}
        <TabsContent value="sp_aktif" className="mt-4">
          {spAktif.length === 0 ? (
            <EmptyState title="Tidak ada SP aktif" description="Tidak ada surat peringatan aktif saat ini." />
          ) : (
            <div className="bg-white rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                    <th className="text-left px-4 py-3">Mitra / Aset</th>
                    <th className="text-center px-4 py-3">Jenis SP</th>
                    <th className="text-left px-4 py-3">Terbit</th>
                    <th className="text-left px-4 py-3">Deadline</th>
                    <th className="text-right px-4 py-3">Sisa Hari</th>
                    <th className="text-right px-4 py-3">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {spAktif.map(sp => {
                    const sisa = hitungSisaHari(sp.tgl_deadline)
                    return (
                      <tr key={sp.id} className={`hover:bg-gray-50 ${sisa <= 3 ? 'bg-red-50' : ''}`}>
                        <td className="px-4 py-3">
                          <div className="font-medium">{(sp.kerja_sama as any)?.nama_mitra ?? '-'}</div>
                          <div className="text-xs text-gray-500">{(sp.kerja_sama as any)?.aset?.nama_aset ?? '-'}</div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={getSPBadgeVariant(sp.jenis) as any}>{sp.jenis}</Badge>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{formatTanggal(sp.tgl_terbit)}</td>
                        <td className="px-4 py-3 text-gray-600">{formatTanggal(sp.tgl_deadline)}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-bold ${sisa <= 3 ? 'text-red-600' : sisa <= 7 ? 'text-orange-600' : 'text-gray-700'}`}>
                            {sisa > 0 ? `${sisa} hari` : 'Terlewat'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {sp.jenis !== 'SP3' && sp.jenis !== 'PUTUS' && (
                              <Button size="sm" variant="outline" className="text-orange-700 border-orange-300" onClick={() => handleTerbitkanSPBerikutnya(sp)}>
                                <FileWarning size={13} /> SP Berikutnya
                              </Button>
                            )}
                            {sp.jenis === 'SP3' && (
                              <Button size="sm" variant="outline" className="text-red-700 border-red-300" onClick={() => handleTerbitkanSPBerikutnya(sp)}>
                                Lakukan Pemutusan
                              </Button>
                            )}
                            <Button size="sm" variant="outline" className="text-gray-400 border-gray-200 hover:text-red-600 hover:border-red-300" onClick={() => handleDeleteSP(sp)}>
                              <Trash2 size={13} />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Tab Histori SP */}
        <TabsContent value="histori_sp" className="mt-4">
          {allSP.length === 0 ? (
            <EmptyState title="Belum ada histori SP" description="Semua surat peringatan yang pernah diterbitkan akan muncul di sini." />
          ) : (
            <div className="bg-white rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                    <th className="text-left px-4 py-3">Mitra / Aset</th>
                    <th className="text-center px-4 py-3">Jenis</th>
                    <th className="text-left px-4 py-3">Terbit</th>
                    <th className="text-left px-4 py-3">Deadline</th>
                    <th className="text-center px-4 py-3">Status</th>
                    <th className="text-right px-4 py-3">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {allSP.map(sp => (
                    <tr key={sp.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <div className="font-medium">{(sp.kerja_sama as any)?.nama_mitra ?? '-'}</div>
                        <div className="text-xs text-gray-500">{(sp.kerja_sama as any)?.aset?.nama_aset ?? '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <Badge variant={getSPBadgeVariant(sp.jenis) as any}>{sp.jenis}</Badge>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{formatTanggal(sp.tgl_terbit)}</td>
                      <td className="px-4 py-3 text-gray-600">{formatTanggal(sp.tgl_deadline)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${sp.status === 'aktif' ? 'bg-orange-100 text-orange-700' : 'bg-gray-100 text-gray-500'}`}>
                          {sp.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm" variant="outline"
                          className="text-gray-400 border-gray-200 hover:text-red-600 hover:border-red-300"
                          onClick={() => handleDeleteSP(sp)}
                        >
                          <Trash2 size={13} />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>

        {/* Tab Histori Notifikasi WA */}
        <TabsContent value="histori" className="mt-4">
          {logNotifikasi.length === 0 ? (
            <EmptyState title="Belum ada histori notifikasi" description="Log notifikasi WA yang dikirim akan muncul di sini." />
          ) : (
            <div className="bg-white rounded-xl border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-xs uppercase text-gray-500">
                    <th className="text-left px-4 py-3">Tanggal Kirim</th>
                    <th className="text-left px-4 py-3">Mitra / Aset</th>
                    <th className="text-left px-4 py-3">Jenis</th>
                    <th className="text-left px-4 py-3">No. WA</th>
                    <th className="text-center px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {logNotifikasi.map(log => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-gray-600">{formatTanggal(log.tgl_kirim)}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium">{(log.kerja_sama as any)?.nama_mitra ?? '-'}</div>
                        <div className="text-xs text-gray-500">{(log.kerja_sama as any)?.aset?.nama_aset ?? '-'}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{log.jenis ?? '-'}</td>
                      <td className="px-4 py-3 text-gray-500">{log.no_wa ?? '-'}</td>
                      <td className="px-4 py-3 text-center">
                        {log.status_kirim === 'terkirim'
                          ? <Badge variant="success"><CheckCircle size={11} className="mr-1" /> Terkirim</Badge>
                          : <Badge variant="destructive">Gagal</Badge>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
