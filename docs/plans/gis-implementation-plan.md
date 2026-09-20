# Rencana implementasi GIS AsetOpt — handoff Astra → GPT Terra

Status: **rencana saja; belum diimplementasikan atau diuji**. Disusun 19 September 2026 berdasarkan diskusi pengguna dan inspeksi source lokal. Eksekusi bertahap pada branch fitur, bukan `main`. Dokumen pendamping: [gis-terra-handoff.md](gis-terra-handoff.md).

## 1. Hasil akhir dan batas pekerjaan

Pengguna membuka peta konsesi tanah, menyalakan lapisan tanaman, kawasan hutan, area OPSET yang dikerjasamakan, okupasi, dan batas administrasi. Klik area menampilkan atribut, alas hak/konsesi terkait, aset dan kerja sama yang terkait, luas, sumber, versi, serta hasil irisan. Geometri diunggah; tidak ada menggambar atau mengedit titik batas di browser.

Keputusan pengguna yang sudah final:

- Konsesi tanah adalah data dasar legal; tanaman, kawasan hutan, OPSET, dan okupasi ditampilkan sebagai lapisan di atasnya.
- OPSET tetap mengunggah batas **area yang dikerjasamakan**, terhubung ke data kerja sama dan aset aplikasi.
- Okupasi dikelola **Legal**. Admin teknis tetap dapat membantu dengan jejak audit.
- Batas administrasi dan kawasan hutan bisa diperbarui, dengan riwayat versi.
- Tumpang tindih menghasilkan **peringatan**, tidak menghalangi penyimpanan geometri yang valid.
- PostgreSQL + PostGIS; mendukung format selain KML.
- Plan oleh Astra, implementasi selanjutnya oleh GPT Terra. Tidak ada izin deploy, merge, atau push dari permintaan plan ini.

Default implementasi yang ditetapkan plan, dapat disesuaikan bila bukti source/data nyata mengharuskan:

- KML, KMZ, GeoJSON pada pengiriman pertama; Shapefile ZIP dan GeoPackage pada fase lanjutan yang tetap termasuk target lengkap.
- Geometri bisnis berbentuk Polygon/MultiPolygon. Titik/garis pada file campuran dilaporkan, dapat dikecualikan secara eksplisit di preview; tidak dihitung sebagai luas.
- Hak baca GIS mengikuti hak baca aplikasi saat ini. Hak tulis dibatasi bidang Legal, Tanaman, OPSET, Referensi; tidak membangun pembatasan per kebun/organisasi yang belum diminta.
- Satu konsesi mewakili satu objek alas hak, dapat memiliki beberapa bagian terpisah. Pembaruan alas hak yang mengubah identitas legal dibuat sebagai objek baru dan dihubungkan melalui catatan pendahulu, bukan menimpa nomor historis.
- Satu area OPSET terhubung ke satu `kerja_sama`; satu kerja sama boleh mempunyai beberapa area. Kerja sama lintas aset memakai relasi aset yang sudah ada.
- Kebutuhan awal adalah cakupan wilayah operasional. Impor data referensi nasional harus lolos uji ukuran/performa; peta browser tidak mengunduh seluruh geometri nasional.

Di luar scope: digitasi, vertex editing, penetapan hak secara otomatis, integrasi sinkron otomatis portal pemerintah, SSO baru, aplikasi mobile native, analisis raster/citra, perubahan perhitungan finansial, serta klasifikasi tunggal eksklusif seluruh tanah.

## 2. Kondisi repository dan konsekuensi integrasi

Inspeksi menunjukkan aplikasi React 18/Vite/TypeScript, Leaflet sudah ditambahkan pada prototipe, FastAPI/SQLAlchemy/PostgreSQL, JWT aplikasi, serta volume upload lokal. `src/lib/supabase.ts` adalah jalur kompatibilitas REST aplikasi; jangan mengartikan namanya sebagai izin akses database anonim. `agent.md` bagian Quick Reference tentang tanpa autentikasi sudah tidak sesuai source saat ini; `LAYER_ZERO.md` dan `api/services/auth_deps.py` menjadi rujukan.

| Titik source | Implikasi untuk Terra |
|---|---|
| `src/types/index.ts`, `src/store/kerjaSamaStore.ts`, `src/pages/jalurB/KerjaSama.tsx` | `kerja_sama.nama_mitra`, `tgl_mulai`, `tgl_selesai` sudah ada. `skema_kerja_sama` belum ada; tambahkan ke entitas ini. Form kini berpusat pada `aset_id`, sementara `kerja_sama_aset` mendukung multi-aset. |
| `src/lib/apiClient.ts` | Pakai token otomatis yang sudah ada. Tambahkan dukungan abort/raw binary secara terbatas untuk peta, jangan buat token auth kedua. |
| `api/services/auth_deps.py` | Role nyata: `admin`, `staf`, `viewer`, `integrasi`. `require_write` sendiri belum membatasi Legal/Tanaman/OPSET. |
| `api/services/rest_query.py` | Prototipe menambahkan `aset_gis` ke allowlist. Tabel baru GIS tidak masuk generic REST; semua operasi melalui router GIS dengan pemeriksaan bidang. |
| `api/services/storage.py` | Helper dokumen menimpa basename dan memiliki fallback absolute path; buat penyimpanan GIS UUID yang terisolasi, jangan memakai fallback itu untuk file GIS. |
| `api/_migrate.py` | Runner lama melewati `001`, mengulang migrasi lain, dan menghapus SQL RLS dengan regex. Jangan jalankan buta pada DB baru/production untuk GIS. |
| `docker-compose.yml` | DB `postgres:18-alpine`, volume `/var/lib/postgresql`; ganti image hanya setelah verifikasi kompatibilitas major/path/extension. Untuk lokal gunakan volume GIS baru. |
| `src/components/layout/Header.tsx`, `Sidebar.tsx`, `src/App.tsx` | Rute prototipe `/gis` sudah ada; breadcrumb `/gis` perlu diselaraskan. |

Saat plan dibuat branch adalah `feature/gis-kml` dan worktree kotor. Prototipe belum final: `GISMap.tsx`, `components/gis/AsetMap.tsx`, `utils/kml.ts`, tipe GIS dalam `types/index.ts`, migration `028_aset_gis.sql` (GeoJSON JSONB per aset), perubahan dependensi/rute/menu/master aset/allowlist. Ada pula perubahan `authStore.ts` untuk bypass development dan `supabase/.temp/`. **Pertahankan semuanya saat fase plan; saat implementasi lakukan diff terarah, jangan reset/clean.**

Rekonsiliasi saat implementasi:

1. Catat `git status`, diff, HEAD, dan daftar file tracked/untracked sebagai baseline sebelum mengedit.
2. Reuse Leaflet dan rute `/gis`; ganti model satu KML per aset dengan domain pada plan ini. KML parser browser lama boleh dipensiunkan setelah semua pemanggil dialihkan, bukan dijadikan validator utama.
3. Jangan otomatis mengubah isi `aset_gis` menjadi konsesi: data itu belum punya makna legal yang pasti. Jika tabel berisi data, sediakan daftar kandidat impor dan pilihan domain/relasi oleh pengguna; semua geometri lama tetap tersedia sampai pemetaan terverifikasi.
4. Jangan mengedit atau menghapus migrasi `028` sebelum tahu apakah sudah diterapkan. Biarkan sebagai legacy selama transisi. Nomor baru mulai `029` hanya jika masih kosong ketika eksekusi.
5. Perubahan bypass lokal tidak masuk patch GIS dan tidak menjadi akses tulis backend. Uji GIS nyata menggunakan login JWT lokal; beritahu pengguna bahwa mode bypass hanya cukup untuk tampilan/fixture, bukan otorisasi server.

## 3. Model produk dan informasi

Hubungan spasial berupa irisan, tidak selalu hubungan induk-anak. Forest/admin adalah coverage referensi independen; tidak wajib berada di dalam konsesi dan tidak dipotong permanen saat disimpan. Tanaman/OPSET/okupasi dapat beririsan beberapa konsesi. Hubungan aset-ke-konsesi yang dikonfirmasi manusia dipisahkan dari kandidat hasil irisan.

| Jenis | Atribut minimum | Pengelola | Identitas domain |
|---|---|---|---|
| Konsesi | nomor alas hak, jenis alas hak, luas dokumen, tanggal terbit, tanggal berakhir | Legal | Satu objek alas hak; multi-bagian boleh |
| Tanaman | unit/kebun, komoditas, tahun tanam, luas dokumen | Tanaman | Satu blok dengan kode/nama blok |
| Kawasan hutan | fungsi/status sumber asli + klasifikasi normal, sumber, tahun | Referensi/Legal dengan grant | Satu poligon penetapan/referensi |
| OPSET | mitra, skema, mulai, berakhir kerja sama | OPSET | Area pada `kerja_sama`, bukan tabel aset baru |
| Okupasi | pihak pengokupasi, luas dokumen, catatan | Legal | Satu area kasus okupasi |
| Administrasi | tingkat, kode, nama, kode induk, sumber, tahun | Referensi | Provinsi/kabupaten-kota/kecamatan/desa-kelurahan |

Setiap fitur memiliki UUID stabil, nama/kode, geometri versi, sumber/file asal, timestamp, pembuat, luas hasil geometri m²; hektare hanya konversi tampilan. Form menerima satuan eksplisit m²/ha lalu menyimpan nilai dalam m². Luas dokumen tidak ditimpa hasil hitung.

Untuk alas hak tanpa tanggal akhir, simpan `expiry_mode = fixed | indefinite | unknown`; `tanggal_berakhir` wajib hanya untuk `fixed`. Draft boleh belum lengkap; publikasi mensyaratkan atribut minimum atau `unknown` eksplisit dengan alasan pada informasi dokumen yang memang tidak tersedia. Nilai unknown bukan tanggal buatan/nol. Tanggal akhir tidak boleh mendahului tanggal mulai. Tahun tanam bisa unknown eksplisit; jangan jadikan 0.

Hutan lindung/produksi/konservasi dan kategori lain memakai mapping yang mempertahankan **nilai asli** sumber. Jangan memaksa kategori tak dikenal menjadi “bukan kawasan hutan”. Wilayah tidak tercakup data berarti “belum ada data referensi”. Data referensi bisa tumpang tindih atau memuat batas indikatif; tampilkan sumber/statusnya.

`kerja_sama.skema_kerja_sama` ditambahkan nullable untuk record legacy; form kerja sama menyediakan field ini. OPSET membaca mitra/tanggal/skema dari `kerja_sama`, tidak menduplikasi nilai otoritatif ke form GIS. Snapshot analisis menyimpan nilai yang dibaca saat analisis agar laporan historis tidak berubah. Publikasi area OPSET meminta skema dilengkapi; jangan memaksa update massal seluruh record lama.

Link aset yang ditampilkan pada OPSET adalah union `kerja_sama.aset_id` dan `kerja_sama_aset.aset_id`, deduplikasi ID. Jangan mengubah rumus finansial, luas kontrak, atau status aset otomatis karena hasil GIS.

## 4. Arsitektur yang dipilih

```text
React + Leaflet
  → /api/gis/* (JWT, pembatasan bidang, kontrak khusus)
      → PostgreSQL + PostGIS: identitas, versi, geometri, audit, pekerjaan
      → penyimpanan privat: file asli immutable + staging sementara
GIS worker (image Python yang sama, proses terpisah)
  → ambil pekerjaan DB → parser GDAL terisolasi → validasi → staging/analisis
```

Tidak menambah Redis/Celery/GeoServer pada pengiriman awal. Worker membaca antrean `gis_jobs` dengan claim transaksi `FOR UPDATE SKIP LOCKED`, lease, heartbeat, attempt limit, dan recovery restart. Proses GIS memakai koneksi DB sendiri, tidak menahan request HTTP sepanjang impor. API tetap memberikan status meskipun worker offline.

GDAL/OGR dan utilitas proses dipasang di image Linux khusus GIS/API yang kompatibel; pengembangan Windows memakai Docker. Parsing dijalankan worker melalui subprocess dengan argumen list, deadline dan resource limit. Process parser tidak menerima URL, koneksi DB, atau kredensial. Output normalisasi lokal dibaca worker lalu diinsert dengan parameter/bulk COPY terkontrol. Jika memakai Python GDAL, verifikasi kecocokan versi libgdal dan binding pada build; jangan asal memasang versi wheel berbeda.

Leaflet cukup untuk basis aplikasi saat ini. GeoJSON terbatasi untuk preview dan fitur terpilih; layer produksi yang padat menggunakan MVT dari PostGIS dan renderer vector-grid compatible Leaflet. Pin versi paket setelah smoke test, satu library renderer saja. Tidak perlu migrasi keseluruhan UI ke framework peta lain.

## 5. Skema database dan invariannya

Semua nama berikut merupakan kontrak target. UUID `gen_random_uuid()`, timestamp UTC `timestamptz`, tanggal bisnis `date`. Foreign key ke tabel yang sudah ada harus dicek tipe aktualnya sebelum migration. Field relasi tidak disimpan sebagai string lepas dalam JSON.

| Tabel | Kolom inti / aturan |
|---|---|
| `gis_datasets` | `id, kind, name, scope_key, reference_level, active_version_id, revision, archived_at, created_by, created_at`. Kind: konsesi/tanaman/hutan/opset/okupasi/administrasi. Reference level hanya untuk administrasi. Scope menjelaskan cakupan, bukan aturan kepemilikan spasial. |
| `gis_dataset_versions` | `id, dataset_id, version_no, state, based_on_version_id, source_name, source_url, source_year, effective_date, coverage_note, validation_note, change_note, created_by, created_at, published_at`. Unique `(dataset_id, version_no)`. Metadata sumber boleh ditambah per fitur. |
| `gis_features` | `id, dataset_id, external_key, created_at`. Unique `(dataset_id, external_key)` untuk menjaga identitas antar versi. External key dibentuk pemetaan pengguna; nama saja bukan kunci terpercaya. |
| `gis_feature_versions` | `id, dataset_version_id, feature_id, name, geom geometry(MultiPolygon,4326), computed_area_m2, original_properties jsonb`. Unique `(dataset_version_id, feature_id)`. CHECK SRID/type/valid/not empty; computed_area server-side. |
| `gis_konsesi_details` | PK/FK `feature_version_id`; `nomor_alas_hak, jenis_alas_hak, declared_area_m2, tanggal_terbit, expiry_mode, tanggal_berakhir, incomplete_reason`. |
| `gis_tanaman_details` | PK/FK `feature_version_id`; `kode_blok, unit_kebun, komoditas, tahun_tanam, declared_area_m2, incomplete_reason`. |
| `gis_hutan_details` | PK/FK `feature_version_id`; `fungsi_asli, fungsi_normalized, sumber, tahun, nomor_sk, tanggal_sk, scale_denominator, status_validasi`. SK/scale opsional jika tidak tersedia. |
| `gis_opset_details` | PK/FK `feature_version_id`; `kerja_sama_id` FK wajib. Tidak menyimpan salinan mitra/tanggal/skema sebagai master. |
| `gis_okupasi_details` | PK/FK `feature_version_id`; `pihak_pengokupasi, declared_area_m2, catatan, incomplete_reason`. |
| `gis_administrasi_details` | PK/FK `feature_version_id`; `level, region_code, region_name, parent_code, code_system, sumber, tahun, status_batas`. Kode selalu teks untuk menjaga nol depan. |
| `gis_konsesi_aset` | `konsesi_feature_version_id, aset_id, link_note, linked_by`; composite PK. Hubungan manual versi, bukan keputusan otomatis dari overlap. |
| `gis_source_files` | `id, version_id, original_name, storage_key, sha256, bytes, detected_format, uploaded_by, uploaded_at`. Banyak file per versi didukung; nama asli hanya metadata. |
| `gis_imports` | `id, dataset_id, candidate_version_id, requested_by, state, mapping jsonb, crs_decision jsonb, validation_report jsonb, warning_ack jsonb, expires_at`. Staging geometry berada dalam candidate version. |
| `gis_jobs` | `id, job_type, subject_id, state, attempts, lease_token, lease_until, heartbeat_at, progress, error_code, error_summary, created_at, finished_at`. Payload internal hanya ID, bukan executable/query. |
| `gis_request_keys` | `actor_id, operation, idempotency_key, request_hash, result_id, response_status, created_at`; unique `(actor_id, operation, idempotency_key)`. Key reuse dengan hash berbeda →409; retry identik mengembalikan job/version semula. |
| `gis_domain_grants` | `user_id` FK app_users, `domain` legal/tanaman/opset/referensi; composite PK. Admin mengelola. |
| `gis_analysis_runs` | `id, subject_version_id, selection_snapshot jsonb, business_snapshot jsonb, algorithm_version, tolerance_m2, state, totals jsonb, started_at, finished_at`. Snapshot mencatat dataset/version IDs dan cakupan lengkap. |
| `gis_analysis_items` | `run_id, subject_feature_version_id, target_feature_version_id, relation_kind, intersection_area_m2, subject_percent, warning_code`. Index run/subject/target; bagian di luar konsesi dapat target null. |
| `gis_audit_events` | `id, actor_id, event_type, dataset_id, version_id, details jsonb, created_at`. Append-only; publish/rollback/archive/grants/unduh file dicatat. |
| `gis_schema_migrations` | `filename` PK, `checksum, applied_at`; hanya migrasi GIS yang dikelola runner tambahan. |

Menggunakan tabel detail bertipe untuk atribut domain memudahkan constraint/query; `original_properties` hanya melestarikan atribut input, bukan otoritas bisnis. Service memastikan tepat satu detail sesuai kind; tambahkan deferred constraint trigger untuk mencegah subtype salah/lebih dari satu ketika transaksi selesai. Konsistensi feature↔version↔dataset, active version↔dataset, dan link konsesi wajib juga dijaga FK komposit/trigger, bukan hanya UI. Revoke akses tabel GIS dari PUBLIC dan role anon/authenticated jika role itu ada; endpoint berjalan sebagai role backend terkontrol. Jangan menambah policy anon full access. Published metadata/geometri/relasi dicegah UPDATE/DELETE oleh trigger; aktivitas audit dan state job berada di tabel terpisah yang boleh bergerak.

Dataset bisnis default: satu dataset per konsesi, satu per kebun untuk blok tanaman, satu per kerja sama untuk area OPSET, satu per kelompok kasus Legal untuk okupasi. Dataset OPSET dapat menyimpan beberapa feature area dengan `kerja_sama_id` yang sama; service menolak kontrak berbeda dalam satu dataset default ini. Tidak menciptakan satu dataset raksasa semua aset.

Dataset referensi default: satu dataset operasional kawasan hutan dan satu dataset untuk masing-masing tingkat administrasi (empat dataset). Satu versi dapat berisi file dari beberapa kabupaten/provinsi. Unique `scope_key` aktif untuk kind+level mencegah dua edisi coverage yang sama dihitung sekaligus. Menambah coverage baru dilakukan dengan membentuk versi lengkap dari cakupan lama + berkas baru, bukan menghilangkan bagian lama tanpa pemberitahuan. Dukungan banyak edisi referensi simultan lintas cakupan ditunda sampai dibutuhkan.

Versi adalah snapshot **seluruh dataset**, bukan patch file. Wizard menyediakan “Ganti seluruh dataset” dan “Tambahkan/perbarui fitur terpilih”; pilihan kedua menyalin feature versions yang tidak diubah ke candidate baru. Preview wajib menampilkan jumlah ditambah/diubah/tidak berubah/dihilangkan. Konflik external key harus dipetakan; jangan mencocokkan hanya nama secara diam-diam. Konsesi baru default external key UUID; impor ulang memilih objek yang sama.

Index wajib: GiST `geom`, B-tree setiap FK dan `dataset_version_id`, active pointer, jobs `(state, lease_until)`, imports `(requested_by,state)`. Area dihitung `ST_Area(geom::geography)` dalam m²; tidak menggunakan degree² atau luas Web Mercator. Geometri sumber penuh dipertahankan; simplifikasi hanya untuk rendering.

## 6. Versioning, publikasi, dan rollback

State candidate: `draft → validating → ready → published`; gagal menjadi `failed`, batal `cancelled`. Versi yang pernah diterbitkan immutable, termasuk detail/relasi/source metadata. `active_version_id` menentukan edisi saat ini; versi published lama tidak perlu diubah menjadi mutable/ditimpa. Dataset archived tidak tampil default, histori tetap tersedia.

Publikasi dilakukan satu transaksi: periksa grant dan readiness → lock dataset → bandingkan `expected_active_version_id`/revision → cek subtype/link/atribut → pastikan warning acknowledgment cocok report terkini → tetapkan published → ganti pointer → audit → enqueue analisis. Jika snapshot referensi berubah selama preview, hasil preview dilabeli stale dan diperbarui; publikasi tetap boleh dengan acknowledgment baru dan analisis pending. UI tidak boleh mengklaim “tidak tumpang tindih” selama pending.

Rollback hanya memindah active pointer ke versi published milik dataset yang sama dengan expected revision, lalu audit/enqueue analisis. Tidak menghapus file, tidak menulis ulang masa lalu. Identitas pihak/tanggal kerja sama terkini tetap berasal dari tabel bisnis; laporan analisis lama memakai business snapshot-nya.

Original file disimpan sebelum commit versi, dengan UUID/hash. Jika transaksi gagal, file orphan masuk daftar GC yang hanya membersihkan staging tak terreferensi lewat job terjadwal, bukan menghapus berkas published. Candidate kedaluwarsa default 7 hari; audit asli impor gagal minimal 30 hari dengan rincian error, tanpa menyimpan payload berbahaya di log. Tidak ada auto-delete published originals pada fase ini.

Setiap claim/reclaim job menaikkan `lease_token` monotonik. Heartbeat, progress, insert hasil, dan final state memakai compare-and-set token aktif; worker lama yang kembali setelah timeout tidak boleh menulis. Cancel/expiry membatalkan lease dan import readiness dalam transaksi; publish selalu mengecek import belum cancelled/expired dan candidate report revision terkini. Worker tidak pernah auto-publish. Unique request key + unique job work unit mencegah retry menghasilkan versi/analysis items ganda.

## 7. Pipeline impor dan batas operasional

Alur: pilih layer/dataset → unggah → identifikasi format/layer/CRS → pilih fitur/pemetaan atribut → validasi + preview → tinjau peringatan/delta → terbitkan → analisis latar belakang.

Defaults yang harus menjadi konfigurasi dan ditampilkan dalam UI: file mentah 50 MiB; uncompressed archive maksimal 250 MiB; 1.000 entry; compression ratio 100:1; 50.000 fitur; 2 juta vertex total; 100.000 vertex per fitur; 5 MiB per properties aggregate file; parse deadline 120 detik; analysis deadline per unit pekerjaan 180 detik; satu impor berjalan per pengguna dan worker concurrency 1 saat awal. Limit adalah batas awal terukur, dapat dinaikkan admin deployment setelah benchmark. Di luar limit berikan instruksi membagi cakupan atau jalur impor admin batch, bukan memuat paksa seluruh file di memory API.

- API membaca UploadFile bertahap, menghitung hash/limit, tidak `.read()` tanpa batas. Extension dan isi wajib cocok.
- KML: XML tanpa DTD/entity expansion; NetworkLink, remote icon, link dokumen, HTML descriptions tidak di-fetch/dieksekusi. KMZ: inventaris archive aman, `doc.kml` atau pilih dokumen eksplisit jika lebih dari satu; unsupported embedded resources dilaporkan. Tidak ada nested archive extraction.
- ZIP Shapefile: paket `.shp/.shx/.dbf` wajib; `.prj` untuk CRS atau pengguna memilih CRS dari daftar tepercaya; `.cpg` bila ada. Pilih layer jika beberapa nama dasar. Cegah path traversal, absolute/drive paths, symlink, zip bomb, duplicate normalized names.
- GeoJSON: finite numeric coordinates, lon/lat WGS84; validasi struktur/geometry depth dan property length. CRS legacy bukan ditebak dari besar angka: pengguna menyatakan sumber saat format memang ambiguous dan keputusan disimpan.
- GPKG: OGR driver allowlist `GPKG` read-only; tolak raster-only, remote virtual paths dan file eksternal. Inventaris vector layers, pilih layer eksplisit, resource-limit proses SQLite/GDAL. Jangan jalankan SQL dari file/atribut.
- OGR driver allowlist hanya format yang didukung, input path di direktori staging tervalidasi; disable network/virtual filesystem fetching. Parser subprocess tidak memakai shell. Container/process hard limit memory (awal 1 GiB parser) dan jaringan tertutup pada tahap parser. Uji batas proses Linux di Docker, jangan mengandalkan timeout HTTP.
- Reproject dengan CRS eksplisit ke EPSG:4326, axis order longitude/latitude. Polygon→MultiPolygon, flatten Z/M dengan catatan, ring holes dipertahankan. Bounds lintas antimeridian/outside supported working extent dilaporkan untuk penanganan admin, tidak dipindah otomatis.
- Validasi `ST_IsValid`, nonempty, finite/range coordinates, area positif. Jangan diam-diam menjalankan `ST_MakeValid` dan mengubah batas legal. Bila perbaikan otomatis ditawarkan kemudian, harus preview perubahan + konfirmasi + provenance; v1 meminta file diperbaiki di sumber.
- Fitur invalid memblokir kandidat tersebut, bukan dicampur dengan peringatan overlap. Pengguna boleh memilih subset valid secara eksplisit; daftar fitur yang dikeluarkan dicatat. Tidak ada silently skipped features.
- Property KML/GeoJSON dianggap teks tidak tepercaya. Render React text; tidak `innerHTML`/popup HTML dari input. Batasi panjang teks dan escape ekspor CSV bila fitur ekspor ditambahkan.

Semua lima format harus melewati pipeline server yang sama. Parser browser lama tidak menjadi jalan alternatif melewati validasi backend.

## 8. Kontrak API

Prefix `/api/gis`. JSON biasa; koleksi `{data, next_cursor}`; IDs string UUID; date ISO; datetime UTC. Errors `{detail: "pesan Indonesia", code: "STABLE_CODE", fields?: {...}}` agar kompatibel `apiClient`. Authorization menggunakan bearer aplikasi. Jangan membuat endpoint GIS lewat `/api/integrasi/v1` tanpa kebutuhan integrasi terpisah.

| Method/path | Request inti | Response / perilaku |
|---|---|---|
| `GET /capabilities` | — | read/write domains, supported formats, limits, worker/db readiness |
| `GET /datasets` | kind, q, cursor, limit≤100 | metadata+active version, tanpa geometry |
| `POST /datasets` | kind, name, scope_key | 201 dataset draft; grant sesuai domain |
| `PATCH /datasets/{id}` | name, expected_revision | metadata identitas; 409 jika stale |
| `POST /datasets/{id}/archive` | reason, expected_revision | archive soft, audit; tidak delete |
| `POST /datasets/{id}/imports` | multipart file(s), mode, expected_active_version_id | 202 `{import_id, job_id, state}`; menerima Idempotency-Key |
| `GET /imports/{id}` | — | progress, field/layer inventory, validation counts, errors, warnings, bounds |
| `PATCH /imports/{id}/mapping` | selected layers/features, property mapping, source CRS, typed metadata overrides, identity mapping, linked_asset_ids untuk konsesi, kerja_sama_id untuk OPSET | 202 revalidate; invalidates previous readiness/report hash |
| `GET /imports/{id}/preview` | bbox, zoom, cursor/limit | capped simplified GeoJSON + totals/truncated; no persistent edits |
| `POST /imports/{id}/cancel` | — | request cancel; worker cooperates, no publish |
| `POST /imports/{id}/publish` | expected_active_version_id, expected_revision, report_hash, acknowledged_warning_codes, note | published version + pending analysis; 409 stale, 422 invalid |
| `GET /datasets/{id}/versions` | cursor | versi + sumber + actor + change summary |
| `POST /datasets/{id}/rollback` | target_version_id, expected_revision, reason | pointer changed, new audit/analysis |
| `GET /features/{id}` | version_id opsional; default active | exact attributes, business links, full geometry only when requested/bounded, analysis state |
| `GET /features` | bbox wajib, dataset_version_ids, zoom, limit≤500, cursor | selected/small business GeoJSON + `truncated`; no uncapped dump |
| `GET /tiles/{version_id}/{z}/{x}/{y}.mvt` | z 0..22, x/y validated | authenticated MVT, immutable version key, feature IDs + styling fields only |
| `POST /analyses` | subject_version_id, selected_target_version_ids opsional | 202 run_id; server verifies all IDs/read permissions |
| `GET /analyses/{id}` | — | snapshot, totals, pending/complete/failed/stale, explanation |
| `GET /analyses/{id}/items` | subject_feature_id, warning_code, cursor | paginated intersections/warnings |
| `GET /files/{id}/download` | — | authorized attachment stream by UUID, no arbitrary storage path |
| `GET /audit` | dataset_id, cursor | permitted audit read, no secrets |
| `GET/PATCH /users/{id}/grants` | domains on PATCH | admin only, grant audit; API integration in AdminUsers |

Missing JWT→401; wrong role/domain→403; unknown/inaccessible ID→404 where appropriate; stale edit→409; too large→413; invalid inputs→422; jobs saturated→429; missing PostGIS/worker prerequisites→503 with actionable status. Duplicate publish with same key returns same result, not extra version. Limit requests/rate by authenticated user on upload/analysis; cancellation cannot affect another user's import without authorized domain/admin.

Endpoints feature/detail/history must not expose draft or original files to unrelated users. Published GIS read follows `require_app_read`; drafts accessible by creator, domain editor, admin. Original files: editor/admin only by default; viewers see published data/source metadata. `integrasi` denied every GIS endpoint. Service role cannot be elevated by choosing a kind in the body. Check dataset kind from DB on all IDs and jobs.

Perubahan atribut/relasi tanpa mengunggah geometri baru memakai `POST /datasets/{id}/imports/from-version` dengan `source_version_id` dan expected revision untuk menyalin versi aktif menjadi draft; selanjutnya mapping typed overrides dan publikasi yang sama. Tombol “Ubah informasi” membuka alur ini. Source file versi sebelumnya direferensikan kembali sebagai asal (metadata file boleh direferensikan beberapa versi; storage key tetap immutable). Tidak menyediakan PATCH langsung pada published feature. Tambahkan paginated `GET /lookups/aset` dan `/lookups/kerja-sama` dengan `q, cursor, limit≤50` untuk pilihan link bila endpoint lookup existing tidak ada; gunakan query tabel aplikasi, bukan fetch seluruh store.

Untuk edit formulir satu objek gunakan `PATCH /imports/{id}/features/{feature_id}` dengan discriminated typed body `{kind, attributes, linked_asset_ids?, expected_draft_revision}`; konsesi saja menerima link aset, OPSET hanya link kontrak, body tidak menerima geometri edited di browser. Service memastikan feature milik candidate tersebut, grant cocok, lalu menaikkan draft revision dan menandai preview/report perlu validasi ulang. Create/import/mapping/publish/rollback menggunakan Idempotency-Key tersimpan; jangan hanya cache respons dalam memory proses.

## 9. Analisis irisan dan peringatan

Run captures exact active dataset version IDs in one transaction, then processes immutable features. Reference update marks affected latest results stale and queues recalculation; old results remain queryable. Store algorithm version, tolerance, coverage, source year, and business snapshot. Failure/pending/stale are visible, never represented as zero area.

Analysis targets:

1. Konsesi→tanaman, OPSET, okupasi, hutan, administrasi: luas tertanam/dikerjasamakan/okupasi/irisan hutan per konsesi.
2. OPSET→konsesi, tanaman, okupasi, hutan, administrasi; area OPSET terhadap OPSET lain untuk konflik kontrak.
3. Tanaman/okupasi→konsesi dan antarjenis; konsesi→konsesi untuk indikasi batas legal bertumpang tindih.
4. Batas administrasi digunakan untuk lokasi dan distribusi luas, bukan kategori konflik. Tanaman dalam konsesi adalah relasi yang diharapkan, bukan otomatis peringatan merah.

Query menggunakan version filters + bbox/GiST kandidat → `ST_Intersects` → `ST_Intersection`; ambil komponen polygon nonempty lalu area geography. Boundary-touch dengan luas nol tidak menghasilkan peringatan luas. Area di luar konsesi = `ST_Difference(subject, union(selected_consessions))`. Jika cakupan konsesi/reference belum lengkap, gunakan label “di luar konsesi yang telah dimuat”, bukan klaim di luar seluruh hak perusahaan.

Toleransi sliver default 1 m² untuk peringatan, dicatat pada run. Tetap simpan raw area; toleransi hanya menentukan penonjolan warning. Persentase memakai computed full subject area, bukan luas dokumen. Peringatan minimum: di luar konsesi yang dimuat; OPSET beririsan hutan; OPSET beririsan okupasi; OPSET beririsan kontrak lain; OPSET beririsan tanaman; duplikasi/overlap fitur dalam satu jenis; selisih luas dokumen vs geometri (default >5% **dan** >100 m², editable config). Semua deskriptif, bukan keputusan legal otomatis.

Hindari hitung ganda: total per kategori memakai luas irisan subject dengan **union** seluruh target kategori; jangan SUM pasangan. Tabel pasangan boleh menjumlah lebih besar dari total unik dan UI menjelaskan perbedaannya. Tertanam, kerja sama, okupasi, kawasan hutan adalah label yang dapat beririsan; persentasenya tidak harus berjumlah 100%. Luas “belum ada penggunaan tercatat” memakai difference terhadap union tanaman+OPSET+okupasi, dengan catatan kelengkapan data; hutan bukan pemakaian bisnis.

Referensi admin/hutan yang overlap harus menghasilkan quality warning tersendiri. Persentase administratif yang melewati 100% menandakan sumber overlapping, bukan dibulatkan diam-diam. Konsesi overlapping diperingatkan; aggregate perusahaan memakai union untuk luas unik. Jangan mengaitkan aset secara pasti hanya karena titik pusat berada dalam konsesi.

Worker memecah analisis per subject feature untuk batas waktu, menyimpan item idempotent. MVT/simplified render geometry **tidak** dipakai analisis. Jika ukuran geometri membutuhkan `ST_Subdivide`, deduplikasi fragmen dan union sebelum perhitungan final.

## 10. Pengalaman pengguna dan performa peta

- Menu `Peta GIS` pada `/gis`: sidebar layer dengan toggle/opacity/legend; peta tengah; panel detail saat klik; filter konsesi/kebun/mitra/jenis/status kerja sama/wilayah; search nama/nomor alas hak.
- Konsesi sebagai outline dasar; tanaman hijau, OPSET biru, okupasi merah, hutan pola/warna berbeda, admin garis tipis. Tambahkan label/legend, bukan warna saja. Overlay tidak menutupi identitas konsesi.
- “Kelola Data GIS” `/gis/data`: tab Konsesi, Tanaman, OPSET, Okupasi, Referensi; daftar dataset, versi aktif, sumber/tahun, data belum lengkap, job status, tombol impor/histori/rollback sesuai hak.
- `/gis?aset=<id>` tetap menjadi deep link dari Data Aset; menyorot konsesi terhubung dan area kontrak terkait. Tambahkan `/gis?kerja_sama=<id>` dari detail kerja sama. Jangan mengasumsikan aset selalu memiliki poligon sendiri.
- Detail konsesi menampilkan alas hak + luas dokumen vs peta + aset tertaut + distribusi kategori. Detail OPSET menampilkan mitra/skema/tanggal dari kerja sama dan link halaman kontrak. Semua feature menunjukkan versi/sumber serta state analisis.
- Wizard impor harus dapat ditinggal dan dilanjutkan dari job ID, menampilkan progress yang benar, pemetaan atribut, CRS, preview/pilihan fitur, delta versi, peringatan, lalu terbitkan. Tidak ada auto-publish saat memilih file.
- Histori menampilkan daftar versi dan metadata; perbandingan overlay dua versi boleh sederhana toggle sebelum/sesudah. Rollback meminta alasan dan konfirmasi konkret versi tujuan; tidak membutuhkan approval workflow berlapis.
- Mode baca viewer tidak menampilkan tombol edit/upload. Empty, API offline, worker unavailable, 401/403, no reference coverage, data stale, dan basemap offline memiliki pesan yang berbeda.

Perbarui `src/lib/auth.ts` (`canAccessPath`/daftar route viewer) agar viewer benar-benar dapat membuka **exact path** `/gis`. Helper existing memakai prefix children; jangan sekadar menambah `/gis` ke prefix whitelist sehingga `/gis/data` ikut terbuka. Guard `/gis/data` mengikuti capabilities editor/admin; viewer dapat melihat riwayat published melalui panel peta tetapi tidak masuk halaman mutasi. Kelola grants tetap admin-only. Menambahkan menu saja tidak cukup jika route whitelist existing masih menolak viewer. Hak tombol mengikuti capabilities API; server tetap pemeriksa akhir.

Peta meminta data berdasarkan viewport, debounce 250–400 ms, abort request viewport lama, lazy-load modul GIS pada route. MVT version-keyed dapat di-cache privat; tidak menyisipkan JWT ke URL. Renderer memakai fetch authenticated/custom tile loader dengan AbortController, kemudian dekode blob; cache memory dibersihkan saat logout. Object IDs digunakan untuk detail fetch, bukan menaruh semua atribut personal pada tile.

Render table virtual/paginated, jangan download seluruh aset/konsesi untuk selector. Pada zoom kecil tampilkan batas ringkas; detail memerlukan zoom. MVT `ST_AsMVTGeom` menggunakan EPSG:3857 untuk tampilan saja, buffer dan clipping; query memakai bbox spatial index pada data asli. Batas tile awal 512 KiB, timeout query 3 detik; jika terlalu padat gunakan simplifikasi level zoom/precomputed render geometry dan petunjuk zoom, jangan mengirim tile terpotong tanpa tanda.

Target pengujian lokal representatif (catat CPU/RAM/dataset, bukan jaminan SLA): detail <1 s, tile p95 <1 s setelah warm cache, pan tidak memblokir UI, preview pertama <5 s setelah job ready. Uji 10.000 poligon sintetis serta satu sample pemerintah yang sah. Angka target baru dinyatakan tercapai setelah diukur.

Basemap provider terpisah dari data referensi. Konfigurasi URL/attribution; verifikasi terms provider dan kapasitas sebelum produksi. Jika tile internet gagal, geometri aset tetap tampil di background polos. Tidak mengunduh/cache nasional OpenStreetMap untuk offline tanpa izin layanan.

## 11. Sumber pemerintah dan pembaruan referensi

Sumber awal untuk diverifikasi saat akuisisi:

- BIG: [Ina-Geoportal](https://tanahair.indonesia.go.id/portal-web/unduh), [metadata administrasi desa/kelurahan](https://tanahair.indonesia.go.id/sdi/dataset/administrasi_ar_desakel). Catat apakah batas definitif/indikatif, sumber instansi dan tahun; tersedianya peta bukan berarti semua batas sudah ditetapkan definitif.
- Kehutanan: [One Map Public](https://spatial.phl.menlhk.go.id/portal/home/item.html?id=916c7ea0797949d98abcd7165c5bf910), [SK MENLHK 398/2024](https://jdih.menlhk.go.id/kiosk/files/SK%20MENLHK_398_2024.pdf) sebagai referensi struktur IGT. Layer skala 1:250.000 tidak menjadi bukti ketelitian batas bidang/alas hak.

Ketersediaan endpoint/download, lisensi, cakupan, tanggal terbaru, kredensial, dan skala harus dicek pada saat impor; plan tidak mengklaim endpoint vector atau hak unduh tertentu sudah siap. WMS/WMTS adalah tampilan raster: dapat menjadi overlay referensi tampilan, tetapi **tidak bisa** dipakai menghitung irisan poligon tanpa vector source. Simpan sumber asli, dokumen SK bila ada, license/access note, tanggal unduh, tanggal efektif, tahun, cakupan, status validasi. Jangan scrape atau mengakali akses portal.

Rujukan teknis primer yang telah diperiksa pada penyusunan plan: [PostGIS ST_Area](https://postgis.net/docs/ST_Area.html), [ST_AsMVT](https://postgis.net/docs/ST_AsMVT.html), [ST_AsMVTGeom](https://postgis.net/docs/ST_AsMVTGeom.html), [GDAL LIBKML](https://gdal.org/en/stable/drivers/vector/libkml.html), [GeoPackage](https://gdal.org/en/stable/drivers/vector/gpkg.html), [Shapefile](https://gdal.org/en/stable/drivers/vector/shapefile.html), dan [docker-postgis resmi](https://github.com/postgis/docker-postgis). LIBKML harus tersedia pada build untuk cakupan KML/KMZ yang dipilih; uji round-trip holes/properties, jangan mengasumsikan konversi lossless. Referensi KMZ ke entry internal aman boleh di-resolve dalam archive tervalidasi; NetworkLink remote tetap ditolak. README image resmi mencantumkan kombinasi PG18/PostGIS3.6 saat diperiksa, tetapi tag/digest dan volume compatibility tetap diverifikasi F0.

Portal kebijakan [Layer Zero pusat](https://github.com/heathclif-cyber/Monitoringpemasaran/tree/main/docs/platform) gagal diambil tool web saat plan dibuat (internal fetch error; bukan bukti repo tidak ada). Gunakan `LAYER_ZERO.md` lokal untuk scope internal sekarang; verifikasi kebijakan pusat sebelum menambah integrasi eksternal atau mengubah kepemilikan data lintas aplikasi.

Workflow pembaruan: admin Referensi mendapatkan file resmi → membuat candidate version → mapping klasifikasi/kode → validasi CRS/coverage/jumlah fitur/delta luas → preview → publish → tandai analisis terkait stale → worker recalculation. Tahun lebih baru bukan alasan menghapus versi lama. Jika sumber belum tersedia, fitur tetap berjalan dengan fixture jelas berlabel contoh; status referensi “belum dimuat”, tidak digantikan data buatan yang diklaim resmi.

## 12. Migrasi, pengembangan lokal, dan deployment

Nomor sementara setelah `028` (periksa ulang sebelum membuat):

| Migration | Isi |
|---|---|
| `029_gis_core.sql` | extension PostGIS, datasets/versions/features/subtypes, indices, integrity/immutability; extension gate eksplisit |
| `030_gis_operations.sql` | source/import/jobs/grants/audit/analysis dan hak akses tabel |
| `031_kerja_sama_skema.sql` | nullable `skema_kerja_sama`; tanpa backfill spekulatif |

Buat runner `api/scripts/migrate_gis.py` khusus allowlist filename GIS dengan checksum ledger, advisory lock, transaksi per migrasi, fail-fast. Tidak melewatkan/menghapus SQL GIS dengan regex runner lama. Cek baseline tabel `aset`, `kerja_sama`, `kerja_sama_aset`, `app_users` dan extension availability; apabila belum ada, gunakan bootstrap development yang terdokumentasi. Jangan memodifikasi runner global/replay semua data import historis demi fitur ini. Untuk DB yang dikelola Supabase migration history, runner menolak mixed ownership tanpa baseline eksplisit agar tidak apply dua kali.

Bootstrap lokal: buat `api/scripts/bootstrap_gis_dev.py` (hanya URL loopback/service `db-gis`, DB name suffix `_gis_dev`/`_gis_test`, flag explicit `--allow-dev-bootstrap`). Bootstrap menyediakan subset schema aplikasi sebenarnya yang diperlukan login+aset+kerja sama, menggunakan definisi yang ditinjau dari baseline SQL, tanpa menjalankan migrasi impor RKAP/evaluasi/seed produksi. Cantumkan keterbatasan ini: fixture GIS lokal bukan simulasi seluruh dashboard keuangan. Alternatif smoke aplikasi penuh memakai salinan DB yang pengguna sediakan secara sah, bukan meminta koneksi produksi otomatis.

Buat `docker-compose.gis-dev.yml` terpisah untuk `db-gis`, `api-gis`, `gis-worker`; database/volume baru bernama jelas, port DB default 55432 dan API 8000 (deteksi konflik, tidak hentikan service tak terkait). Web Vite existing dapat dipakai dengan proxy lokal. Bind port API/DB ke 127.0.0.1. Pilih dan pin image PostGIS untuk **PostgreSQL 18** setelah mengecek tag nyata, `SHOW server_version`, `SELECT PostGIS_Full_Version()`, volume path dan restore test. Jangan mengganti PG18 menjadi PG16/17 pada volume yang sama. Jika PG18 image tidak cocok lingkungan, gunakan image kompatibel terverifikasi atau PG major lain hanya di volume GIS baru; catat delta compatibility, jangan ubah production.

GIS worker dapat memakai image API dengan entrypoint `python -m services.gis.worker`; network parser dibatasi terpisah dari proses worker yang membutuhkan DB. Volumes shared API/worker untuk originals/staging, directory immutable originals terpisah dari output parser. Environment dokumentasi: DATABASE_URL, GIS_UPLOAD_ROOT, GIS_MAX_UPLOAD_BYTES, GIS_MAX_UNCOMPRESSED_BYTES, GIS_PARSE_TIMEOUT_SECONDS, GIS_WORKER_POLL_SECONDS, GIS_ENABLED, allowed origins termasuk `127.0.0.1:5173`. Rahasia tidak masuk git. Gunakan akun fixture lokal yang dihasilkan bootstrap tanpa mencetak credential production; jangan mengubah admin production seed.

Deployment akhir harus menyediakan extension install authority, backup DB+originals, restore test, worker health/readiness, disk quotas, resource limits, migration ledger, dan rollback aplikasi. Persetujuan deployment/remote changes terpisah dari implementasi lokal. Rollback aplikasi mematikan feature flag/mengembalikan release; jangan DROP tabel/extension atau menghapus originals sebagai rollback rutin. Sediakan jalur operasional file local-volume sekarang; object storage remote hanya bila deployment membutuhkannya, dengan interface storage yang sama.

## 13. Peta file implementasi

Lokasi baru yang diusulkan; pecah hanya jika ukuran source memerlukannya:

- `api/routers/r_gis.py`: kontrak HTTP; `api/schemas_gis.py`: Pydantic typed models.
- `api/services/gis/{repository,permissions,storage,importer,validation,analysis,tiles,jobs,worker}.py`: pemisahan tugas di atas; tambah `__init__.py`.
- `api/main.py`: include router/readiness; `api/requirements.txt`, image Docker GIS: parser/test dependency terkontrol.
- `api/scripts/{migrate_gis,bootstrap_gis_dev}.py`, `docker-compose.gis-dev.yml`, `docker/gis.Dockerfile`, `.env.gis.example`.
- `src/types/gis.ts`, `src/lib/gisApi.ts`, `src/store/gisStore.ts`: types, calls, selected layer/viewport state. `src/lib/auth.ts`: penyesuaian route access GIS sesuai matriks; jangan mengubah bypass di authStore. Jangan menyimpan seluruh geometri nasional di Zustand.
- `src/pages/GISMap.tsx`, `src/pages/gis/GISData.tsx`, `src/components/gis/{GISMapCanvas,LayerPanel,FeatureDetails,ImportWizard,VersionHistory,AnalysisPanel}.tsx`.
- `src/App.tsx`, `components/layout/{Sidebar,Header}.tsx`, `pages/master/DataAset.tsx`, `pages/jalurB/KerjaSama.tsx`, `pages/AdminUsers.tsx`: integrasi minimum; route guards/token tetap pola existing.
- `src/types/index.ts`, `src/store/kerjaSamaStore.ts`, backend schema/model/REST field whitelist terkait kerja sama bila memang memakai whitelist: tambah `skema_kerja_sama` tanpa merusak payload lama.
- `api/tests/gis/`, `src/**/__tests__/*gis*`, `tests/fixtures/gis/`, `tests/e2e/gis.spec.ts`: test baru scoped; `docs/gis-local-development.md`: instruksi hasil implementasi.

Sebelum menambah file, cari helper serupa. Jangan memindah keseluruhan aplikasi atau memperbaiki semua lint unrelated. `api/services/rest_query.py` hanya perubahan minimum untuk mencabut jalur prototipe `aset_gis` dari UI baru/allowlist ketika transisi selesai, bukan menambah tabel GIS baru.

## 14. Fase pelaksanaan dan acceptance gates

Terra mengerjakan berurutan, memperbarui checklist dan handoff dengan hasil aktual. Ukuran relatif: S ≤ satu sesi fokus; M beberapa file+satu rangkaian tes; L lintas frontend/backend dan perlu checkpoint. Ini estimasi kompleksitas, bukan janji waktu/token.

### F0 — baseline dan keputusan deployment lokal (S)

Read: `agent.md`; bagian relevan `Claude.md`; `LAYER_ZERO.md`; `DEPLOY_SELFHOST.md`; `docker-compose.yml`; `.env.selfhost.example` (jangan menyalin secret); source auth/database/migrator.

- [ ] Catat worktree/branch/HEAD; identifikasi prototipe vs unrelated, cek apakah 028 sudah diterapkan dengan read-only SQL bila DB tersedia.
- [ ] Verifikasi standar Layer Zero pusat jika accessible; jangan mengarang isinya. Kontrak GIS tetap internal AsetOpt.
- [ ] Verifikasi Docker/PostGIS/GDAL package versions resmi; siapkan compose terisolasi dan `.env.gis.example`.
- [ ] Gate: database GIS disposable bisa query PostGIS; ketidaktersediaan Docker/extension dilaporkan sebagai blocker pengujian DB, pekerjaan source lain tetap dapat berjalan.

### F1 — skema, izin, storage, fixture (L)

Read: plan §§3–6,12; `supabase/migrations/001_initial_schema.sql`, `002_railway.sql`, `014_kerja_sama_aset.sql`, `021_app_users.sql`, `023_revoke_anon_data_access.sql`, `028_aset_gis.sql`; `auth_deps.py`, `r_users.py`.

- [ ] Implementasikan migrations+ledger runner+bootstrap fixture yang dibatasi dev/test.
- [ ] Implementasikan domain grants, typed validation, private immutable storage dan audit.
- [ ] Tambah skema kerja sama nonbreaking; test legacy null tetap readable.
- [ ] Gate: FK/type/immutability/publication-conflict constraints, backend auth matrix, source path containment lolos pada PostGIS sungguhan. Re-run migrations menghasilkan no-op/checksum validation.

### F2 — impor KML/KMZ/GeoJSON dan publikasi (L)

Read: plan §§6–8; worker/storage/import service yang baru, `apiClient.ts`, prototipe `utils/kml.ts` sebagai referensi kemampuan lama.

- [ ] Pipeline upload/job/inventory/mapping/CRS/preview/publish/rollback/cancel; UUID files, lease recovery.
- [ ] Mendukung holes, MultiPolygon, beberapa fitur, pemetaan stable IDs, explicit subset/drop report.
- [ ] Gate: satu fixture tiap domain dapat dipublish, reimport mempertahankan fitur yang dipilih, failed import tidak mengganti active data, stale publish ditolak 409, overlap tidak memblokir.

### F3 — peta, pengelolaan data, integrasi aset/kontrak (L)

Read: plan §§8,10; bagian `DESIGN_SYSTEM.md` layout/form/dialog/table; targeted App/Sidebar/Header/DataAset/KerjaSama/AdminUsers; source prototype GIS.

- [ ] Implementasi map canvas/layer controls/detail/import wizard/history/grants, authenticated tiles+bounded GeoJSON, lazy route.
- [ ] Deep link aset/kerja sama, read authoritative contract fields, explicit manual link konsesi-aset.
- [ ] Gate: viewer read-only, Legal upload okupasi, Tanaman tidak bisa edit okupasi lewat direct API, session expiration clears map requests, no-login bypass tidak memberikan backend writes.

### F4 — analisis dan versioned warnings (L)

Read: plan §9; PostGIS analysis service+tests; detail panels.

- [ ] Version-pinned asynchronous analyses, stale invalidation/recompute, union totals, outside loaded concessions, warning acknowledgments.
- [ ] Gate: fixture overlap/holes/adjacent edges/outside coverage/double-counting lulus; publikasi referensi baru menandai report lama stale tanpa mengubah snapshot lama.
- [ ] Checkpoint pengiriman pertama: KML/KMZ/GeoJSON end-to-end dengan semua domain, sumber/versi/izin/analisis aktif. Jangan menyebut target lengkap selesai sebelum F5/F6.

### F5 — Shapefile/GPKG, pembaruan referensi, skala (M–L)

Read: plan §§7,10–11; GDAL driver docs relevan; representative reference metadata.

- [ ] Tambah selected-layer SHP ZIP/GPKG, CRS mapping, same pipeline, sample pemerintah sah atau synthetic dengan disclaimer data.
- [ ] Uji large regional reference ingest; tile complexity/zoom and indices profiling; dokumentasikan batas terukur.
- [ ] Gate: update satu lapisan admin/hutan atomik, coverage delta jelas, versi lama dapat rollback; seluruh 5 format lulus positive/negative fixtures.

### F6 — integrasi akhir dan handoff review (M)

- [ ] E2E dari login lokal → data konsesi → layer tanaman/OPSET/okupasi/referensi → klik aset/alas hak → warnings → update/rollback.
- [ ] Remove obsolete prototype wiring secara terarah; data legacy tidak dihapus. KML parser lama boleh dihapus hanya setelah caller search kosong dan diff review.
- [ ] Build/tests/lint scoped dan full lint baseline dilaporkan; tulis local development/runbook dan daftar keterbatasan nyata.
- [ ] Catat file berubah/hasil command/migration list/prototype preservation; commit/push/PR hanya jika pengguna meminta. Branch tetap fitur.

## 15. Verifikasi yang harus dibuat dan dijalankan

Fixtures synthetic kecil dengan koordinat realistis di Indonesia: konsesi persegi A, konsesi B sebagian overlap, tanaman hole/multipolygon, dua blok saling overlap, OPSET melintas konsesi/hutan/okupasi, admin dua desa berbatasan, kawasan dengan coverage parsial. Expected relational results ditulis eksplisit. Expected area memakai geodesic oracle independen atau numeric values dengan toleransi, tidak sekadar mengulang query implementasi.

Test minimum:

- Unit parser/validator: semua format, wrong extension, corrupt archive, XXE/NetworkLink, zip traversal/bomb/symlink, GPKG layer selection, missing CRS, axis order, nonfinite coords, duplicate keys, invalid rings, holes preserved, property XSS, too-large input.
- Integration PostGIS: FK/subtype consistency, atomic publish/rollback, immutable originals/version detail, expected-revision races, migration ledger, retries idempotent, worker killed/restart, file GC tidak menghapus published originals.
- Auth API: admin all, staf+Legal konsesi/okupasi, staf+Tanaman tanaman only, staf+OPSET OPSET only, reference grant reference only, viewer read no original download, integrasi/anonymous denied; tampered IDs/dataset kind tidak bypass domain.
- Spatial: union unique totals, empty intersection, boundary-touch zero, exact hole behavior, outside coverage wording, cross-concession assets, same-contract multi-area vs different-contract warning, reference update stale, no assumption category totals=100%.
- UI/E2E: fresh load `/gis`, deep links, mapping/import errors, warning acknowledgment, cancel/reload polling, compare/rollback, zoom/layer controls, offline API vs basemap, expired JWT; no upload control for viewer.

Commands berikut adalah **target setelah file/dependency terkait dibuat**, bukan klaim sudah tersedia/lulus:

```powershell
git status --short
npm run build
npm run lint
docker compose -f docker-compose.gis-dev.yml --env-file .env.gis config
docker compose -f docker-compose.gis-dev.yml --env-file .env.gis up -d --build
docker compose -f docker-compose.gis-dev.yml --env-file .env.gis exec api-gis python scripts/migrate_gis.py --check
docker compose -f docker-compose.gis-dev.yml --env-file .env.gis exec api-gis python -m pytest tests/gis -q
npm run test:gis
npm run test:e2e:gis
```

Tambahkan test dependencies/scripts yang benar saat implementasi: pytest/httpx untuk backend, Vitest + Testing Library untuk pure UI logic, Playwright E2E hanya flow utama. Test DB `*_gis_test` terpisah dari `*_gis_dev`; failure guard mencegah destructive fixture cleanup pada database lain. Lint repo berpotensi memiliki kegagalan existing/config; rekam baseline sebelum mengklaim regresi. Tes yang belum bisa dijalankan dilabeli **belum terverifikasi**, bukan “passed”.

## 16. Stop conditions dan keluaran untuk reviewer

Terra boleh melanjutkan pekerjaan source yang tidak bergantung pada blocker. Hentikan langkah terkait jika: membutuhkan perubahan DB remote/production, image tidak kompatibel volume existing, extension tidak tersedia, data legacy tidak jelas domainnya, sumber resmi memerlukan izin yang belum ada, atau kontrak Layer Zero terverifikasi bertentangan dengan pilihan plan. Jelaskan bukti/opsi; jangan menyelesaikan dengan menghapus data, menonaktifkan auth, atau menganggap fixture sebagai data resmi.

Selesai berarti semua fase/gates target lengkap terpenuhi atau outstanding scope dinyatakan terang. Handoff reviewer memuat: branch+HEAD, diff scope, cara menjalankan lokal, akun fixture lokal, migrasi dan backup strategy, domain permissions, format+limits aktual, hasil tes, bukti peta/analisis contoh, dan blocker/deferred items. Tidak perlu menyalin ulang seluruh plan dalam balasan pengguna.
