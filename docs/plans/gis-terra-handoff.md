# Handoff singkat untuk GPT Terra — GIS AsetOpt

Status: **implementasi awal F0–F6 sudah dibuat pada branch `feature/gis-kml`; verifikasi Docker/PostGIS masih pending.**
Disusun Astra, 19 September 2026. Detail tunggal: [gis-implementation-plan.md](gis-implementation-plan.md).

## Prompt eksekusi yang dapat ditempel

> Implementasikan rencana `docs/plans/gis-implementation-plan.md` bertahap F0–F6 di branch fitur, bukan main. Mulai dari `agent.md`, handoff ini, lalu baca section dan source yang diperlukan untuk fase aktif saja. Pertahankan perubahan lokal yang sudah ada; pisahkan prototipe GIS lama dari `authStore.ts`/`supabase/.temp/` yang di luar scope. Jangan reset/clean atau menghapus data legacy. Pekerjaan meliputi GIS view-only, PostGIS, upload 5 format bertahap, konsesi/alas hak, tanaman, kawasan hutan, area kerja sama OPSET, okupasi Legal, batas administrasi, immutable versions, domain grants, peringatan irisan, dan update referensi. Jangan deploy, push, merge, atau menyentuh DB remote tanpa instruksi terpisah. Implementasikan dan verifikasi fase demi fase, perbarui checklist/hasil nyata di handoff ini agar sesi berikutnya tidak mengulang investigasi. Laporkan blocker yang terbukti dan lanjutkan pekerjaan independen yang aman.

## Invarian produk yang tidak boleh berubah

- Konsesi baseline legal. Forest/admin adalah referensi independen yang dapat diupdate, bukan anak wajib di dalam konsesi.
- OPSET wajib dapat mengunggah area kerja sama, link `kerja_sama`; mitra/skema/tanggal berasal dari entitas kontrak. Okupasi dikelola Legal.
- Overlap memperingatkan, tidak memblokir publikasi valid. Invalid geometry/security/atribut wajib tetap dapat memblokir.
- Simpan file asli privat dan geometri PostGIS, luas dokumen terpisah dari luas geodesik; tidak ada editing titik/drawing.
- Semua backend tetap JWT. Local frontend bypass tidak mengizinkan API writes. Tabel GIS tidak lewat generic REST.
- Versi published immutable; publish/rollback atomik; analisis menyimpan IDs versi dan union areas agar tidak hitung ganda.

## Routing baca hemat token

| Fase | Baca plan | Source awal | Gate utama |
|---|---|---|---|
| F0 | §§1–2,12,16 | agent.md, LAYER_ZERO, Docker/auth/migrator | baseline worktree + PostGIS lokal terisolasi |
| F1 | §§3–6,12–13 | migrations relevan, auth_deps/r_users | schema/izin/storage/fixture nyata |
| F2 | §§6–8 | API/worker baru, apiClient, kml prototype | KML/KMZ/GeoJSON → preview → publish/rollback |
| F3 | §§8,10,13 | layout/routes, GIS prototype, Aset/KerjaSama/AdminUsers | UI dan API role checks + viewport loading |
| F4 | §9,15 | analysis service/panels | version snapshots + unique area warnings |
| F5 | §§7,10–11,15 | importer, GDAL docs, source metadata | SHP/GPKG + updated reference + scale |
| F6 | §§14–16 | affected code/tests/runbook | E2E/build/tes + review diff |

Jangan membaca semua store/DESIGN_SYSTEM/percakapan lagi. Dokumen desain dibaca hanya section komponen yang diubah. Repo source mengungguli dokumentasi yang stale; laporkan penyimpangan plan bila material.

## Risiko repo yang sudah ditemukan

- Branch saat plan: `feature/gis-kml`, dirty prototype satu GeoJSON per aset dalam `028_aset_gis.sql`; ini bukan model akhir. Jangan otomatis memigrasikan isinya menjadi konsesi.
- `api/_migrate.py` replays migrasi lama/strips RLS/skips baseline. Plan menggunakan GIS ledger runner + dev bootstrap terpisah; jangan blind replay.
- `docker-compose.yml`: PostgreSQL 18, volume `/var/lib/postgresql`; pin PostGIS image compatible dan gunakan volume baru untuk lokal.
- `kerja_sama` belum punya `skema_kerja_sama`; tambah nullable legacy, perbaiki form/type secara terbatas.
- `storage.py` bukan storage GIS aman/immutable. Gunakan UUID keys dan containment baru, tanpa fallback absolute paths.
- `agent.md` Quick Reference auth stale. Backend memiliki admin/staf/viewer/integrasi; tambah grants Legal/Tanaman/OPSET/Referensi.
- Frontend `apiClient` saat ini hanya JSON; tiles perlu authenticated binary/abort, token tidak ditaruh di query URL.

## Ledger progres — hasil implementasi

- [~] F0: `docker-compose.gis-dev.yml`, image GDAL/PostGIS, bootstrap volume lokal, dan `.env` contoh dibuat. Docker Desktop tidak ada di mesin ini, jadi stack belum dijalankan.
- [~] F1: migrasi 029–032 membuat PostGIS, dataset/versi/fitur/detail terketik, grants domain, storage privat, audit, dan trigger immutable published. Belum diuji terhadap DB hidup.
- [~] F2: router khusus `/api/gis`, worker lease, KML/KMZ/GeoJSON serta GDAL untuk ZIP Shapefile/GPKG, draf→atribut minimum→publish/rollback sudah dibuat. Fixture/API test belum dibuat.
- [~] F3: `/gis` memakai Leaflet layer view-only, viewport GeoJSON, upload/review draf, form domain, link konsesi→aset, dan OPSET→kerja sama. `npx tsc --noEmit` dan `npm run build` lulus 19 Sep 2026.
- [~] F4: overlap PostGIS menjalankan worker setelah publish dan mengembalikan warning panel; belum diuji dengan poligon nyata/union kompleks.
- [~] F5: form metadata sumber/tahun, reference update via versi, ekstensi KML/KMZ/GeoJSON/ZIP/GPKG tersedia. Batas resource GDAL dan source official belum dibenchmark.
- [~] F6: `git diff --check`, TypeScript check, dan Vite production build lulus. Backend syntax, migrasi, worker, dan E2E terhalang karena Python/Docker tidak tersedia lokal.

Pada akhir setiap fase, tulis maksimal 8 baris: file utama; migrations applied di DB mana (tanpa secret); command+hasil; keputusan berbeda dari plan; blocker; langkah berikutnya. Jangan mengisi “lulus” tanpa hasil tes. `npm run test:gis`, `test:e2e:gis`, compose GIS, dan pytest GIS belum ada saat plan ditulis; buat sebelum menjalankan perintah target.

## Asumsi yang diperiksa saat eksekusi, bukan ditanyakan ulang sekarang

Format awal KML/KMZ/GeoJSON kemudian SHP ZIP/GPKG; hak baca seluruh aplikasi dan tulis berbasis bidang; reference coverage wilayah operasional; sumber resmi diimpor manual. Jika data pemerintah belum dapat diunduh, uji dengan synthetic berlabel contoh dan laporkan acquisition pending. Link/sumber serta acceptance detail ada di plan. Implementasi lokal tidak menunggu tersedianya seluruh data konsesi nyata.
