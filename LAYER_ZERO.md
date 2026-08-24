# Layer Zero — AsetOpt Monitor

Repository ini berpartisipasi dalam Layer Zero PTPN I Regional 8. Standar
resmi, katalog pemilik data, kontrak API, dan desain lintas aplikasi tersedia
di repository pusat: [Monitoring Pemasaran / docs/platform](https://github.com/heathclif-cyber/Monitoringpemasaran/tree/main/docs/platform).

## Peran AsetOpt

- Pemilik data aset, kerja sama aset, kompensasi, cash-in aset, dan pendapatan
  akrual kerja sama aset.
- Menyediakan `GET /api/integrasi/v1/revenue` untuk aplikasi internal seperti
  Keuangan.
- Pendapatan yang dikirim hanya baris pengakuan berstatus `diakui`, dengan basis
  `akrual_psak_73`.
- Akun teknis role `integrasi` hanya boleh memanggil endpoint Layer Zero;
  akun tersebut tidak bisa memakai REST aplikasi atau mengubah data.

Pemasaran dan AsetOpt tidak mengakses database satu sama lain. Keuangan memakai
API masing-masing sumber dan menyimpan ID referensi sumber pada jurnal atau
rekonsiliasinya.
