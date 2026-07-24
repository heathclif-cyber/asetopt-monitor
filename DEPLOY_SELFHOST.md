# Deploy Self-Host — AsetOpt Monitor (Windows)

Panduan menjalankan AsetOpt di **komputer Windows** (bukan Railway): database, API (Playwright/Superman), dan frontend.

| Metode | Kapan dipakai |
|--------|----------------|
| **A. Docker Desktop** (disarankan) | Install cepat, isolasi, mirip production |
| **B. Native Windows** | Tanpa Docker; Node + Python + Postgres terpisah |

---

## Arsitektur

```
Browser  →  http://localhost:3001  (Express: static dist + proxy /api)
                │
                └──→  http://api:8000  (FastAPI + Playwright Superman)
                            │
                            └──→  PostgreSQL :5432
```

| Service | Port host default | Fungsi |
|---------|-------------------|--------|
| `web` | **3001** | UI React (build) + proxy `/api` |
| `api` | **8000** | REST, upload, otomasi Superman |
| `db` | **5432** | PostgreSQL 16 |

Data persisten (Docker volume):

- `asetopt_pgdata` — database  
- `asetopt_uploads` — file kontrak/invoice/upload  
- `asetopt_superman` — session Playwright Superman  

---

## Prasyarat Windows

1. **Windows 10/11** 64-bit, virtualisasi aktif (BIOS).
2. **Docker Desktop for Windows**  
   - Install: https://www.docker.com/products/docker-desktop/  
   - Backend **WSL 2** disarankan.  
   - Pastikan status **Running** (ikon whale di system tray).
3. **Git** (clone repo).
4. RAM disarankan **≥ 8 GB** (Playwright/Chromium butuh memori).
5. Disk bebas **≥ 10 GB** (image Playwright cukup besar).

Opsional native (metode B):

- Node.js 20 LTS  
- Python 3.11+  
- PostgreSQL 16  

---

## A. Docker Desktop (disarankan)

### 1. Clone & siapkan env

Buka **PowerShell**:

```powershell
cd D:\Apps-Dev\asetopt-monitor   # atau path clone Anda
.\scripts\selfhost.ps1 init
notepad .env.selfhost
```

Isi minimal:

| Variabel | Contoh |
|----------|--------|
| `POSTGRES_PASSWORD` | password kuat |
| `SUPERMAN_USER` | user Superman |
| `SUPERMAN_PASSWORD` | password Superman |

Jangan commit file `.env.selfhost`.

### 2. Build & jalankan

```powershell
.\scripts\selfhost.ps1 up
```

Setara:

```powershell
docker compose --env-file .env.selfhost up -d --build
```

### 3. Migration skema (DB kosong)

```powershell
.\scripts\selfhost.ps1 migrate
```

Ini menjalankan `api/_migrate.py` atas file di `supabase/migrations/`  
(melewati `001_*` dan `003_*` RLS Supabase; memakai `002_railway.sql` + migrasi berikutnya).

### 4. Buka aplikasi

| URL | Keterangan |
|-----|------------|
| http://localhost:3001 | **App utama** |
| http://localhost:8000/health | Health API |
| http://localhost:8000/docs | Swagger FastAPI |

### 5. Perintah harian

```powershell
.\scripts\selfhost.ps1 status
.\scripts\selfhost.ps1 logs
.\scripts\selfhost.ps1 down          # stop (data volume tetap)
.\scripts\selfhost.ps1 backup-db     # dump SQL ke .\backups\
```

Update kode dari Git:

```powershell
git pull
.\scripts\selfhost.ps1 up
.\scripts\selfhost.ps1 migrate   # jika ada migrasi SQL baru
```

---

## B. Native Windows (tanpa Docker)

### 1. PostgreSQL

- Install PostgreSQL 16, buat database `asetopt` + user.
- Set di `api\.env`:

```env
DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/asetopt
UPLOAD_DIR=./uploads
SUPERMAN_STATE_PATH=./.superman_state.json
SUPERMAN_HEADLESS=true
SUPERMAN_USER=...
SUPERMAN_PASSWORD=...
```

Migration:

```powershell
cd api
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python _migrate.py
python scripts\setup_playwright.py
```

### 2. API

```powershell
cd api
.\.venv\Scripts\Activate.ps1
python -m uvicorn main:app --host 0.0.0.0 --port 8000
```

### 3. Frontend

Root repo — `.env` (dev) atau production:

```env
VITE_API_URL=
VITE_SUPABASE_ANON_KEY=railway-internal
```

```powershell
npm install
npm run build
$env:API_PROXY_URL = "http://127.0.0.1:8000"
$env:PORT = "3001"
npm start
```

Buka http://localhost:3001

Dev mode (hot reload):

```powershell
# Terminal 1 — API
npm run dev:api

# Terminal 2 — Vite (proxy /api → :8000)
npm run dev
# → http://localhost:5173
```

---

## Pindah data dari Railway

### Database

Dari mesin yang bisa akses **public URL** Postgres Railway:

```powershell
# Install client: https://www.postgresql.org/download/windows/
# Atau pakai container:
docker run --rm postgres:16-alpine pg_dump "postgresql://..." > railway-dump.sql
```

Restore ke self-host Docker:

```powershell
# Pastikan stack jalan, lalu:
Get-Content .\railway-dump.sql | docker compose --env-file .env.selfhost exec -T db psql -U asetopt -d asetopt
```

**Catatan:**

- Jika restore dump penuh, biasanya **tidak perlu** `migrate` lagi (skema sudah ada).
- Jika tabrakan objek, restore ke DB kosong:  
  `docker compose down -v` lalu `up` + restore (hati-hati: hapus volume lokal).

### File upload

Salin folder upload Railway/API lama ke volume `uploads` (atau `api/uploads` native).  
Di Docker, volume bernama `asetopt_uploads`.

### Session Superman

Session captcha tersimpan di volume `asetopt_superman` (`SUPERMAN_STATE_PATH`).  
Setelah pindah mesin, biasanya **login captcha ulang** lewat UI Input Pembayaran.

---

## Superman di Windows

1. Credential benar di `.env.selfhost`.
2. Session valid: panel **Otomasi Superman** → captcha jika diminta.
3. Jika progress pernah macet di To Do List tetapi draft sudah di Superman: tombol **Pulihkan nomor Superman**.
4. Image API memakai base **Playwright** (Chromium sudah termasuk di Docker).

Headless default `true` (cocok server). Headed (lihat browser) hanya untuk native + display.

---

## Akses dari PC lain di LAN

1. Firewall Windows: izinkan inbound port **3001** (dan 8000 jika perlu langsung).
2. Di PC server, cek IP: `ipconfig` → mis. `192.168.1.50`.
3. Di PC klien: http://192.168.1.50:3001  

Proxy Express mengarahkan `/api` ke service `api` di jaringan Docker — **dari browser cukup port 3001**.

Untuk internet publik: gunakan VPN, reverse proxy (Caddy/Nginx) + HTTPS, dan **jangan** biarkan tool internal terbuka tanpa proteksi (saat ini RLS anon full access).

---

## Autostart saat Windows boot

### Docker Desktop

1. Docker Desktop → Settings → **Start Docker Desktop when you sign in**.
2. Compose sudah `restart: unless-stopped` — setelah Docker hidup, container ikut start.

Opsional Task Scheduler: jalankan  
`docker compose --env-file D:\path\.env.selfhost up -d` saat logon.

### Native

Buat Windows Service / NSSM untuk `uvicorn` dan `node server/index.js`, atau Task Scheduler.

---

## Troubleshooting

| Gejala | Cek |
|--------|-----|
| `docker: command not found` | Install/start Docker Desktop |
| Port already allocated | Ubah `WEB_PORT` / `API_PORT` / `POSTGRES_PORT` di `.env.selfhost` |
| API unhealthy | `.\scripts\selfhost.ps1 logs` — sering `DATABASE_URL` / migrasi belum |
| UI kosong / 502 API | `API_PROXY_URL` di container web = `http://api:8000` (sudah di compose) |
| Migration FAIL | Lihat error SQL; DB mungkin sudah partial — restore dump bersih atau perbaiki manual |
| Superman captcha | Session habis — verifikasi captcha di UI |
| Image build lambat | Normal (Playwright base besar); satu kali download |
| WSL error | Update WSL: `wsl --update`; restart PC |

Health manual:

```powershell
curl http://localhost:8000/health
curl http://localhost:3001/health
```

---

## File terkait di repo

| File | Isi |
|------|-----|
| `docker-compose.yml` | db + api + web + migrate |
| `docker/api.Dockerfile` | FastAPI + Playwright |
| `docker/web.Dockerfile` | Vite build + Express |
| `.env.selfhost.example` | Template env |
| `scripts/selfhost.ps1` | Helper PowerShell Windows |
| `api/_migrate.py` | Terapkan SQL migrasi (tanpa RLS Supabase) |
| `supabase/migrations/` | Skema database |
| `server/index.js` | Static + proxy `/api` |

---

## Keamanan (internal tool)

- Ganti `POSTGRES_PASSWORD` default.
- Jangan push `.env.selfhost` ke Git.
- Tool ini historis **tanpa auth user** (akses penuh via API) — batasi ke LAN/VPN.
- Backup berkala: `.\scripts\selfhost.ps1 backup-db` + salin volume uploads.

---

## Checklist cutover Railway → PC Windows

1. [ ] Docker Desktop running  
2. [ ] `.\scripts\selfhost.ps1 init` + edit env  
3. [ ] `.\scripts\selfhost.ps1 up`  
4. [ ] Backup Railway DB (`pg_dump`)  
5. [ ] Restore ke Postgres lokal **atau** `migrate` untuk DB kosong  
6. [ ] Salin uploads jika perlu  
7. [ ] Buka http://localhost:3001 — uji login data, cash in, Superman  
8. [ ] Captcha Superman sekali  
9. [ ] Matikan / biarkan Railway standby setelah yakin  
10. [ ] Jadwalkan backup  

Selesai. Untuk pertanyaan operasional harian, lihat ringkasan perintah di `.\scripts\selfhost.ps1 help`.
