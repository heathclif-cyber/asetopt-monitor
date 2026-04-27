# AsetOpt Monitor

## Stack
- React + Vite + TypeScript
- Tailwind CSS + shadcn/ui
- Zustand (state management)
- Supabase (database + auth)
- Recharts (grafik)
- React Hook Form + Zod (form & validasi)
- Fonnte API (notifikasi WhatsApp)

## Commands
- `npm run dev` — start dev server (port 5173)
- `npm run build` — production build
- `npm run lint` — ESLint check

## Arsitektur Utama
- Dua jalur aset: Jalur A (pipeline, belum mitra) dan Jalur B (kerja sama aktif)
- Aset berpindah dari Jalur A → B saat prospek mitra berhasil dikonversi
- Semua kalkulasi otomatis: potensi NJOP, denda, PBB proporsional, status SP

## Aturan Bisnis Kritis
- Tarif kompensasi tanah: NJOP/m² × luas × 3,33%
- Tarif kompensasi bangunan: NJOP/m² × luas × 6,64%
- Denda ≥ 5% dari nominal → SP1 → +14 hari SP2 → +14 hari SP3 → +14 hari Pemutusan
- PBB dihitung proporsional per hari kalender sesuai periode KS

## Konvensi Kode
- Semua angka Rupiah: format `Rp X.XXX.XXX`
- Semua tanggal: format Indonesia `DD MMMM YYYY`
- Komponen dalam Bahasa Indonesia untuk label UI
- Nama file/variabel dalam Bahasa Inggris (camelCase)