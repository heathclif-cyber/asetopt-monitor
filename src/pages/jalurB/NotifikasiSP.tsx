import { useEffect, useState } from 'react'
import { useKompensasiStore } from '@/store/kompensasiStore'
import { useKerjaSamaStore } from '@/store/kerjaSamaStore'
import { useNotifikasiStore } from '@/store/notifikasiStore'
import { Kompensasi, Pembayaran, SuratPeringatan } from '@/types'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { EmptyState } from '@/components/common/EmptyState'
import { TableSkeleton } from '@/components/common/LoadingSkeleton'
import { formatTanggal, hitungSisaHari, formatRupiah } from '@/lib/utils'
import { buatPesanWA } from '@/utils/notifikasiUtils'
import { hitungDenda, tentukanStatusSP } from '@/utils/taxUtils'
import { MessageSquare, FileWarning, CheckCircle, Clock } from 'lucide-react'

export function NotifikasiSP() {
  const { allKompensasi, fetchAllKompensasi, getKompensasiWithStatus } = useKompensasiStore()
  const { daftarKS, fetchKS } = useKerjaSamaStore()
  const { jatuhTempoH14, spAktif, logNotifikasi, checkJatuhTempo, fetchSPAktif, fetchLog, terbitkanSP, kirimNotifWA, fetchAllSP } = useNotifikasiStore()
  const [allSP, setAllSP] = useState<SuratPeringatan[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      await Promise.all([fetchAllKompensasi(), fetchKS(), fetchSPAktif(), fetchLog()])
      const sp = await fetchAllSP()
      setAllSP(sp)
      setIsLoading(false)
    }
    load()
  }, [])

  useEffect(() => { checkJatuhTempo(allKompensasi) }, [allKompensasi])

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
      const sp2 = await fetchAllSP()
      setAllSP(sp2)
      await fetchSPAktif()
    }
  }

  const getSPBadgeVariant = (jenis: string) => {
    return { SP1: 'sp1', SP2: 'sp2', SP3: 'sp3', PUTUS: 'putus' }[jenis] ?? 'secondary'
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Notifikasi & Surat Peringatan</h1>
        <p className="text-sm text-gray-500">Monitoring jatuh tempo, SP aktif, dan histori notifikasi WA</p>
      </div>

      <Tabs defaultValue="jatuh_tempo">
        <TabsList>
          <TabsTrigger value="jatuh_tempo" className="relative">
            Akan Jatuh Tempo
            {jatuhTempoH14.length > 0 && (
              <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">{jatuhTempoH14.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="sp_aktif">
            SP Aktif
            {spAktif.length > 0 && (
              <span className="ml-1.5 bg-orange-500 text-white text-xs rounded-full px-1.5 py-0.5">{spAktif.length}</span>
            )}
          </TabsTrigger>
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
          {isLoading ? (
            <div className="bg-white rounded-xl border p-6"><TableSkeleton rows={3} /></div>
          ) : jatuhTempoH14.length === 0 ? (
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

        {/* Tab SP Aktif */}
        <TabsContent value="sp_aktif" className="mt-4">
          {isLoading ? (
            <div className="bg-white rounded-xl border p-6"><TableSkeleton rows={3} /></div>
          ) : spAktif.length === 0 ? (
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
                            {sp.jenis !== 'SP3' && (
                              <Button size="sm" variant="outline" className="text-orange-700 border-orange-300" onClick={() => handleTerbitkanSPBerikutnya(sp)}>
                                <FileWarning size={13} /> SP Berikutnya
                              </Button>
                            )}
                            {sp.jenis === 'SP3' && (
                              <Button size="sm" variant="outline" className="text-red-700 border-red-300" onClick={() => handleTerbitkanSPBerikutnya(sp)}>
                                Lakukan Pemutusan
                              </Button>
                            )}
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

        {/* Tab Histori */}
        <TabsContent value="histori" className="mt-4">
          {isLoading ? (
            <div className="bg-white rounded-xl border p-6"><TableSkeleton rows={5} /></div>
          ) : logNotifikasi.length === 0 ? (
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
