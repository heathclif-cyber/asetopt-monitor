# Menjalankan GIS di lokal

Prasyarat: Docker Desktop dan Node.js. Stack ini memakai volume PostGIS baru, sehingga tidak menyentuh database remote atau volume aplikasi utama.

1. Salin `.env.gis.example` menjadi `.env.gis`, lalu ganti `GIS_POSTGRES_PASSWORD` dan `AUTH_SECRET`.
2. Salin `.env.local.example` menjadi `.env.local` untuk membuka UI lokal tanpa layar login. Flag ini hanya dipakai Vite development dan API container yang memakai `.env.gis`.
3. Jalankan `docker compose --env-file .env.gis -f docker-compose.gis-dev.yml up --build`.
4. Di terminal lain, jalankan `npm run dev`, lalu buka `/gis`.

Service `gis-bootstrap` membuat schema aplikasi pada volume kosong, membuat akun admin lokal, lalu menerapkan migrasi GIS 029–032. Untuk database aplikasi yang sudah ada, jangan jalankan bootstrap: terapkan `python scripts/migrate_gis.py` dari image/API yang memiliki `DATABASE_URL` database tersebut setelah backup dan review migrasi.

Format unggah: KML, KMZ, GeoJSON, Shapefile ZIP, dan GeoPackage. Gunakan data contoh terlebih dahulu; batas administratif dan kawasan hutan resmi harus diunggah sebagai layer referensi berikut metadata sumber/tahun.
