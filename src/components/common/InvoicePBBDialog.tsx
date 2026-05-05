import { useState } from 'react'
import { FileDown } from 'lucide-react'
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

function buildPrintHTML(params: {
  ks: KerjaSama
  hasil: { detail: PBBProporsionalResult[]; totalPBBDitanggung: number }
  nomorSurat: string
  tanggalSurat: string
  jabatanMitra: string
  alamatMitra: string
  baseUrl: string
}): string {
  const { ks, hasil, nomorSurat, tanggalSurat, jabatanMitra, alamatMitra, baseUrl } = params
  const namaAset       = (ks.aset as any)?.nama_aset ?? '-'
  const alamatAset     = (ks.aset as any)?.alamat    ?? '-'
  const total          = hasil.totalPBBDitanggung
  const tanggalFmt     = formatTanggal(tanggalSurat)
  const tglMulaiFmt    = formatTanggal(ks.tgl_mulai)

  const pbbRows = hasil.detail.map((r) => `
    <tr>
      <td>Pajak Bumi dan Bangunan (PBB) Tahun ${r.tahun}</td>
      <td class="col-nilai">${formatRupiah(r.pbbProporsional)}</td>
    </tr>`).join('')

  const kepadaLines = [
    jabatanMitra ? `<div>${jabatanMitra}</div>` : '',
    `<div>${ks.nama_mitra}</div>`,
    alamatMitra  ? `<div>${alamatMitra}</div>`  : '',
  ].filter(Boolean).join('')

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8">
  <title>Tagihan PBB – ${ks.nama_mitra}</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: Aptos, Calibri, 'Segoe UI', Arial, sans-serif;
      font-size: 12pt;
      color: #000;
      background: #fff;
    }

    .page {
      width: 210mm;
      min-height: 297mm;
      padding: 0 2.5cm 2cm 3cm;
      display: flex;
      flex-direction: column;
    }

    /* ── HEADER ── */
    .header { padding-top: 0.7cm; }
    .header-top {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .header-logo { height: 58px; width: auto; }
    .header-info { text-align: right; font-size: 9.5pt; line-height: 1.45; }
    .header-info .regional { font-size: 13pt; font-weight: bold; }
    .header-line { width: 100%; margin-top: 5px; display: block; }

    /* ── BODY ── */
    .body { flex: 1; padding-top: 14pt; line-height: 1.5; }

    .tanggal { text-align: right; margin-bottom: 12pt; }

    /* Nomor / Lampiran / Perihal menggunakan table agar kolom lurus */
    .meta { border-collapse: collapse; margin-bottom: 14pt; }
    .meta td { vertical-align: top; padding: 1pt 0; }
    .meta .lbl { width: 75pt; }
    .meta .sep { width: 8pt; }

    .kepada { margin-bottom: 14pt; line-height: 1.6; }
    .salam   { margin-bottom: 8pt; }
    .isi     { text-align: justify; margin-bottom: 10pt; line-height: 1.6; }

    /* ── TABEL PBB ── */
    .tabel {
      width: 100%;
      border-collapse: collapse;
      margin: 12pt 0;
    }
    .tabel th, .tabel td {
      border: 1px solid #000;
      padding: 5pt 8pt;
    }
    .tabel thead th {
      background: #d9d9d9;
      font-weight: bold;
      text-align: center;
    }
    .col-nilai { width: 150pt; text-align: right; white-space: nowrap; }
    .tabel tfoot td { font-weight: bold; }

    /* ── BANK INFO ── */
    .bank { border-collapse: collapse; margin: 8pt 0 14pt 14pt; }
    .bank td { padding: 2pt 0; vertical-align: top; }
    .bank .lbl { width: 110pt; }
    .bank .sep { width: 10pt; }

    /* ── TTD ── */
    .penutup { margin-bottom: 28pt; }
    .ttd-wrap { display: flex; justify-content: flex-end; }
    .ttd { text-align: center; width: 195pt; line-height: 1.6; }
    .ttd-space { height: 54pt; }
    .ttd-garis { border-top: 1px solid #000; padding-top: 3pt; }

    /* ── FOOTER ── */
    .footer { margin-top: auto; padding-top: 8pt; }
    .footer-line { width: 100%; display: block; margin-bottom: 3pt; }
    .footer-body {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      font-size: 8pt;
      line-height: 1.5;
      color: #444;
    }
    .footer-tagline { font-style: italic; color: #666; text-align: right; }

    @media print {
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
<div class="page">

  <!-- HEADER -->
  <div class="header">
    <div class="header-top">
      <img class="header-logo" src="${baseUrl}/invoice/logo-ptpn1.png" alt="PTPN1">
      <div class="header-info">
        <div class="regional">REGIONAL 8</div>
        <div>Alamat: Jalan Urip Sumoharjo No 72-76, Makassar, Sulawesi Selatan</div>
        <div>Telp : 0411-444830 &nbsp;&nbsp; Email: skrh_reg8@ptpn1.co.id</div>
      </div>
    </div>
    <img class="header-line" src="${baseUrl}/invoice/header-line.png" alt="">
  </div>

  <!-- BODY -->
  <div class="body">

    <div class="tanggal">Makassar, ${tanggalFmt}</div>

    <table class="meta">
      <tr>
        <td class="lbl">Nomor</td>
        <td class="sep">:</td>
        <td>${nomorSurat || ''}</td>
      </tr>
      <tr>
        <td class="lbl">Lampiran</td>
        <td class="sep">:</td>
        <td>-</td>
      </tr>
      <tr>
        <td class="lbl">Perihal</td>
        <td class="sep">:</td>
        <td><strong>Penagihan Pembayaran Pajak Bumi dan Bangunan (PBB) ${namaAset}</strong></td>
      </tr>
    </table>

    <div class="kepada">
      Kepada Yth.<br>
      ${kepadaLines}
    </div>

    <p class="salam">Dengan hormat,</p>

    <p class="isi">
      Menunjuk Perjanjian Kerja Sama Sewa No. <strong>${ks.no_perjanjian ?? '............'}</strong>
      tanggal ${tglMulaiFmt} tentang Pemanfaatan Aset yang berlokasi di ${alamatAset},
      dengan ini kami sampaikan tagihan pembayaran Pajak Bumi dan Bangunan (PBB),
      dengan rincian sebagai berikut:
    </p>

    <table class="tabel">
      <thead>
        <tr>
          <th style="text-align:left">Keterangan</th>
          <th class="col-nilai">Nilai (Rp)</th>
        </tr>
      </thead>
      <tbody>${pbbRows}</tbody>
      <tfoot>
        <tr>
          <td>Total</td>
          <td class="col-nilai">${formatRupiah(total)}</td>
        </tr>
      </tfoot>
    </table>

    <p class="isi">
      Tagihan PBB sebesar <strong>${formatRupiah(total)}</strong>
      (<em>${terbilang(total)}</em>) sebagaimana diatas, dapat segera dibayarkan melalui:
    </p>

    <table class="bank">
      <tr>
        <td class="lbl">Atas Nama</td>
        <td class="sep">:</td>
        <td>PT Perkebunan Nusantara I Regional 8</td>
      </tr>
      <tr>
        <td class="lbl">Nama Bank</td>
        <td class="sep">:</td>
        <td>Bank Rakyat Indonesia Cabang Ahmad Yani</td>
      </tr>
      <tr>
        <td class="lbl">Nomor Rekening</td>
        <td class="sep">:</td>
        <td>0050-01-005356-30-0</td>
      </tr>
    </table>

    <p class="penutup">
      Demikian kami sampaikan, atas perhatian dan kerja sama yang baik diucapkan terima kasih.
    </p>

    <div class="ttd-wrap">
      <div class="ttd">
        <p>Makassar, ${tanggalFmt}</p>
        <p>Kepala Bagian/Manager</p>
        <p>PT Perkebunan Nusantara I Regional 8</p>
        <div class="ttd-space"></div>
        <div class="ttd-garis">( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )</div>
      </div>
    </div>

  </div>

  <!-- FOOTER -->
  <div class="footer">
    <img class="footer-line" src="${baseUrl}/invoice/footer-line.png" alt="">
    <div class="footer-body">
      <div>
        <strong>PT PERKEBUNAN NUSANTARA I (PERSERO)</strong><br>
        Gedung Agro Plaza Lantai 14, Jl. H. R. Rasuna Said Kav X2 &ndash; 1, Jakarta 12950<br>
        Email: corcom@ptpn1.co.id
      </div>
      <div class="footer-tagline">
        AKHLAK &ndash; Amanah, Kompeten, Harmonis,<br>Loyal, Adaptif, Kolaboratif
      </div>
    </div>
  </div>

</div>
<script>
  window.addEventListener('load', function () {
    setTimeout(function () { window.print(); }, 350);
  });
</script>
</body>
</html>`
}

export function InvoicePBBDialog({ open, onClose, ks, hasil }: InvoicePBBDialogProps) {
  const today = new Date().toISOString().split('T')[0]
  const [nomorSurat,   setNomorSurat]   = useState('')
  const [tanggalSurat, setTanggalSurat] = useState(today)
  const [jabatanMitra, setJabatanMitra] = useState('')
  const [alamatMitra,  setAlamatMitra]  = useState('')

  const handleCetak = () => {
    const baseUrl = window.location.origin
    const html = buildPrintHTML({ ks, hasil, nomorSurat, tanggalSurat, jabatanMitra, alamatMitra, baseUrl })
    const win  = window.open('', '_blank', 'width=870,height=1100')
    if (!win) return
    win.document.write(html)
    win.document.close()
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Invoice Tagihan PBB</DialogTitle>
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
            <FileDown size={15} /> Print Preview
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
