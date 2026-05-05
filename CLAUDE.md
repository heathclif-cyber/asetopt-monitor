# AsetOpt Monitor - Project Context & Guidelines

## 🚀 Tech Stack
- **Frontend**: React 18, Vite, TypeScript
- **Styling**: Tailwind CSS, shadcn/ui (Radix UI), Lucide Icons
- **State Management**: Zustand (modular stores per entity)
- **Database & Auth**: Supabase
- **Charts & Visualization**: Recharts
- **Forms & Validation**: React Hook Form, Zod
- **External API**: Fonnte API (WhatsApp Notifications)

## 📁 Struktur Direktori Utama
- `/src/components`: UI components reusable (termasuk shadcn/ui di `/ui`).
- `/src/pages`: Komponen halaman utama (Jalur A, Jalur B, PBB, Timeline, dll).
- `/src/store`: Zustand stores (`asetStore`, `kompensasiStore`, `kerjaSamaStore`, `pbbStore`, `cashInStore`, dll).
- `/src/types`: Definisi interface TypeScript (`index.ts` adalah central source of truth untuk schema).
- `/src/lib`: Utilities pihak ketiga (misal konfigurasi Supabase).
- `/src/utils`: Helper functions (format rupiah, format tanggal, kalkulasi proporsional).
- `/supabase/migrations`: File SQL untuk migrasi database.

## 🗄️ Database & Entity Schema (Supabase)
Sistem memiliki dua jalur utama manajemen aset:
1. **Jalur A (Pipeline/Prospek)**: Aset yang belum dimitrakerjakan (Tabel `aset`, `prospek_mitra`, `timeline_program`, `njop`, `penilaian_kjpp`).
2. **Jalur B (Kerja Sama Aktif)**: Aset yang sudah menjadi kontrak kerja sama (Tabel `kerja_sama`, `kompensasi`, `pembayaran`, `surat_peringatan`, `pbb`, `cash_in`).

### Tabel & Entitas Kritis:
- **Kompensasi**: Pencatatan tagihan. Mendukung mode PPh (`bukti_potong` atau `none`), PPN, denda keterlambatan, dan fitur `pengurang` (untuk potongan kompensasi). Terhubung dengan `rkap_kode` untuk tracking RKAP.
- **PBB**: Memiliki perhitungan proporsional berdasarkan waktu (hari Kerja Sama vs hari dalam setahun) dan luasan objek (Luas Tanah/Bangunan SPPT vs KS).
- **Cash In**: Penerimaan di luar kompensasi rutin (seperti `denda` atau penerimaan `lainnya`), dilacak secara terpisah namun terhubung ke `kerja_sama`.
- **Surat Peringatan (SP)**: Dibuat otomatis atau manual (SP1, SP2, SP3, PUTUS) untuk memonitor kepatuhan bayar mitra.
- **RKAP Target & Kode**: Referensi target anggaran tahunan.

## 🧮 Aturan Bisnis & Kalkulasi
1. **Potensi Kompensasi Dasar**: 
   - Tanah: `NJOP/m² × luas × 3,33%`
   - Bangunan: `NJOP/m² × luas × 6,64%`
2. **Kalkulasi PBB Proporsional**:
   - Dihitung per hari kalender sesuai periode KS dalam tahun berjalan.
   - Menggunakan perbandingan luasan area (Objek Bumi & Bangunan) jika mitra tidak menyewa keseluruhan aset.
3. **Denda & SP**:
   - Jika pembayaran kompensasi melewati jatuh tempo, denda otomatis berjalan (persentase denda dihitung per hari terlambat).
   - Apabila keterlambatan atau denda mencapai treshold (≥ 5% nominal), peringatan akan ter-trigger (SP1 → +14 hari SP2 → +14 hari SP3 → Pemutusan).

## ✍️ Konvensi Kode
- **Penamaan**: Gunakan *camelCase* untuk variabel/fungsi, *PascalCase* untuk komponen React.
- **Bahasa**: 
  - UI Labels, Notifikasi, dan Konten Presentasi menggunakan **Bahasa Indonesia**.
  - Variabel kode, interface, dan fungsi tetap mempertahankan nama dalam Bahasa Inggris atau representasi sistem (misal: `tgl_jatuh_tempo`, `cashInStore`).
- **Format Data**:
  - Mata uang: `Rp X.XXX.XXX` (selalu gunakan utility formatter).
  - Tanggal: Format Indonesia `DD MMMM YYYY`.
- **State Management**: Gunakan pola pemisahan logic pengambilan data Supabase di dalam masing-masing slice file Zustand di `src/store/`. Hindari meletakkan logika fetching langsung di komponen jika state akan dipakai global.

## 💻 Commands
- `npm run dev` : Menjalankan dev server (port 5173).
- `npm run build` : Membuat production build.
- `npm run lint` : Menjalankan ESLint.