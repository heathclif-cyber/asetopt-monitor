import { useState } from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { formatRupiah, formatTanggal } from '@/lib/utils'
import { terbilang } from '@/utils/terbilang'
import { KerjaSama, PBBProporsionalResult } from '@/types'

interface InvoicePBBDialogProps {
  open: boolean
  onClose: () => void
  ks: KerjaSama
  hasil: { detail: PBBProporsionalResult[]; totalPBBDitanggung: number }
}

function buildInvoiceHTML(params: {
  ks: KerjaSama
  hasil: { detail: PBBProporsionalResult[]; totalPBBDitanggung: number }
  nomorSurat: string
  tanggalSurat: string
  jabatanMitra: string
  alamatMitra: string
}): string {
  const { ks, hasil, nomorSurat, tanggalSurat, jabatanMitra, alamatMitra } = params
  const namaAset = (ks.aset as any)?.nama_aset ?? '-'
  const alamatAset = (ks.aset as any)?.alamat ?? '-'
  const tanggalFormatted = formatTanggal(tanggalSurat)
  const tglMulaiFormatted = formatTanggal(ks.tgl_mulai)
  const total = hasil.totalPBBDitanggung

  const rowsPBB = hasil.detail
    .map(
      (r) => `
      <tr>
        <td>Pajak Bumi dan Bangunan (PBB) Tahun ${r.tahun}</td>
        <td style="text-align:right">${formatRupiah(r.pbbProporsional)}</td>
      </tr>`
    )
    .join('')

  const kepada = [
    jabatanMitra ? `<div>${jabatanMitra}</div>` : '',
    `<div>${ks.nama_mitra}</div>`,
    alamatMitra ? `<div>${alamatMitra}</div>` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <title>Tagihan PBB – ${ks.nama_mitra}</title>
  <style>
    @page { size: A4 portrait; margin: 2.5cm 2.5cm 2.5cm 3cm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Times New Roman', Times, serif;
      font-size: 12pt;
      line-height: 1.6;
      color: #000;
    }
    .letterhead {
      text-align: center;
      border-bottom: 3px double #000;
      padding-bottom: 8pt;
      margin-bottom: 14pt;
    }
    .letterhead .company {
      font-size: 14pt;
      font-weight: bold;
      letter-spacing: 0.5pt;
    }
    .letterhead .sub {
      font-size: 10pt;
    }
    .meta-date {
      text-align: right;
      margin-bottom: 10pt;
    }
    .meta-table {
      width: 100%;
      margin-bottom: 18pt;
    }
    .meta-table td {
      vertical-align: top;
      padding: 1pt 0;
    }
    .meta-table td:first-child { width: 90pt; }
    .meta-table td:nth-child(2) { width: 10pt; }
    .kepada {
      margin-bottom: 18pt;
      line-height: 1.5;
    }
    .body-text {
      text-align: justify;
      margin-bottom: 10pt;
    }
    .detail-table {
      width: 100%;
      border-collapse: collapse;
      margin: 14pt 0;
    }
    .detail-table th,
    .detail-table td {
      border: 1px solid #000;
      padding: 5pt 8pt;
    }
    .detail-table thead tr {
      background: #f0f0f0;
      text-align: center;
      font-weight: bold;
    }
    .detail-table tfoot tr td {
      font-weight: bold;
    }
    .bank-table {
      margin: 10pt 0 16pt 20pt;
    }
    .bank-table td {
      vertical-align: top;
      padding: 1pt 0;
    }
    .bank-table td:first-child { width: 110pt; }
    .bank-table td:nth-child(2) { width: 10pt; }
    .closing { margin-bottom: 30pt; }
    .ttd {
      display: flex;
      justify-content: flex-end;
    }
    .ttd-block {
      text-align: center;
      width: 220pt;
    }
    .ttd-block .space { height: 60pt; }
    .ttd-block .nama { border-top: 1px solid #000; padding-top: 4pt; }
  </style>
</head>
<body>
  <div class="letterhead">
    <div class="company">PT PERKEBUNAN NUSANTARA I</div>
    <div class="sub">REGIONAL 8</div>
  </div>

  <div class="meta-date">Makassar, ${tanggalFormatted}</div>

  <table class="meta-table">
    <tr>
      <td>Nomor</td>
      <td>:</td>
      <td>${nomorSurat || '...........'}</td>
    </tr>
    <tr>
      <td>Lampiran</td>
      <td>:</td>
      <td>-</td>
    </tr>
    <tr>
      <td>Perihal</td>
      <td>:</td>
      <td><strong>Penagihan Pembayaran Pajak Bumi dan Bangunan (PBB) ${namaAset}</strong></td>
    </tr>
  </table>

  <div class="kepada">
    Kepada Yth.<br>
    ${kepada}
  </div>

  <p class="body-text">Dengan hormat,</p>

  <p class="body-text">
    Menunjuk Perjanjian Kerja Sama Sewa No. <strong>${ks.no_perjanjian ?? '...........'}</strong>
    tanggal ${tglMulaiFormatted} tentang Pemanfaatan Aset yang berlokasi di ${alamatAset},
    dengan ini kami sampaikan tagihan pembayaran Pajak Bumi dan Bangunan (PBB), dengan rincian sebagai berikut:
  </p>

  <table class="detail-table">
    <thead>
      <tr>
        <th style="text-align:left">Keterangan</th>
        <th style="width:160pt">Nilai (Rp)</th>
      </tr>
    </thead>
    <tbody>
      ${rowsPBB}
    </tbody>
    <tfoot>
      <tr>
        <td><strong>Total</strong></td>
        <td style="text-align:right"><strong>${formatRupiah(total)}</strong></td>
      </tr>
    </tfoot>
  </table>

  <p class="body-text">
    Tagihan PBB sebesar <strong>${formatRupiah(total)}</strong>
    (<em>${terbilang(total)}</em>) sebagaimana di atas, dapat segera dibayarkan melalui:
  </p>

  <table class="bank-table">
    <tr>
      <td>Atas Nama</td>
      <td>:</td>
      <td>PT Perkebunan Nusantara I Regional 8</td>
    </tr>
    <tr>
      <td>Nama Bank</td>
      <td>:</td>
      <td>Bank Rakyat Indonesia Cabang Ahmad Yani</td>
    </tr>
    <tr>
      <td>Nomor Rekening</td>
      <td>:</td>
      <td>0050-01-005356-30-0</td>
    </tr>
  </table>

  <p class="closing">
    Demikian kami sampaikan, atas perhatian dan kerja sama yang baik diucapkan terima kasih.
  </p>

  <div class="ttd">
    <div class="ttd-block">
      <p>Makassar, ${tanggalFormatted}</p>
      <p>Kepala Bagian/Manager</p>
      <p>PT Perkebunan Nusantara I Regional 8</p>
      <div class="space"></div>
      <div class="nama">( _________________________________ )</div>
    </div>
  </div>
</body>
</html>`
}

export function InvoicePBBDialog({ open, onClose, ks, hasil }: InvoicePBBDialogProps) {
  const today = new Date().toISOString().split('T')[0]
  const [nomorSurat, setNomorSurat] = useState('')
  const [tanggalSurat, setTanggalSurat] = useState(today)
  const [jabatanMitra, setJabatanMitra] = useState('')
  const [alamatMitra, setAlamatMitra] = useState('')

  const handleCetak = () => {
    const html = buildInvoiceHTML({ ks, hasil, nomorSurat, tanggalSurat, jabatanMitra, alamatMitra })
    const win = window.open('', '_blank', 'width=850,height=1100')
    if (!win) return
    win.document.write(html)
    win.document.close()
    win.focus()
    setTimeout(() => win.print(), 400)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Cetak Invoice Tagihan PBB</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          <div className="bg-gray-50 rounded-lg p-3 text-xs text-gray-700 space-y-1">
            <div className="flex justify-between">
              <span className="text-gray-500">Mitra</span>
              <span className="font-medium">{ks.nama_mitra}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Objek Aset</span>
              <span className="font-medium">{(ks.aset as any)?.nama_aset ?? '-'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">No. PKS</span>
              <span className="font-medium font-mono">{ks.no_perjanjian ?? '—'}</span>
            </div>
            <div className="flex justify-between border-t border-gray-200 pt-1 mt-1">
              <span className="text-gray-500">Total PBB Ditanggung</span>
              <span className="font-bold text-[#1B4F72]">{formatRupiah(hasil.totalPBBDitanggung)}</span>
            </div>
            {hasil.detail.map((r) => (
              <div key={r.tahun} className="flex justify-between pl-3 text-gray-500">
                <span>↳ Tahun {r.tahun}</span>
                <span>{formatRupiah(r.pbbProporsional)}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Nomor Surat</Label>
              <Input
                value={nomorSurat}
                onChange={(e) => setNomorSurat(e.target.value)}
                placeholder="Nomor/..."
                className="mt-1 text-sm"
              />
            </div>
            <div>
              <Label className="text-xs">Tanggal Surat</Label>
              <Input
                type="date"
                value={tanggalSurat}
                onChange={(e) => setTanggalSurat(e.target.value)}
                className="mt-1 text-sm"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">
              Jabatan Pimpinan Mitra{' '}
              <span className="text-gray-400 font-normal">(kosongkan jika perorangan)</span>
            </Label>
            <Input
              value={jabatanMitra}
              onChange={(e) => setJabatanMitra(e.target.value)}
              placeholder="Direktur Utama / Pimpinan..."
              className="mt-1 text-sm"
            />
          </div>

          <div>
            <Label className="text-xs">Alamat Mitra</Label>
            <Input
              value={alamatMitra}
              onChange={(e) => setAlamatMitra(e.target.value)}
              placeholder="Jl. ..."
              className="mt-1 text-sm"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button className="bg-[#1B4F72] gap-1.5" onClick={handleCetak}>
            <Printer size={15} /> Cetak Invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
