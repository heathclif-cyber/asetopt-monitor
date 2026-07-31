# Agent lokal Superman

Railway sering **tidak bisa** membuka portal `superman.ptpn1.co.id` (timeout datacenter).  
Agent ini menjalankan Playwright **di PC Anda** (jaringan kantor/VPN), sementara data & UI tetap di Railway.

## Persiapan (sekali)

```powershell
cd D:\Apps-Dev\asetopt-monitor
pip install -r api\requirements.txt
python -m playwright install chromium
```

Isi credential **portal Superman** di `api\.env` (atau environment Windows):

```
SUPERMAN_USER=...
SUPERMAN_PASSWORD=...
SUPERMAN_URL=https://superman.ptpn1.co.id/
```

## Menjalankan

**Cara mudah:** double-click `Mulai-Superman-Agent.bat`  
Masukkan username/password **app AsetOpt** (admin), biarkan jendela terbuka.

**Atau:**

```powershell
python scripts\superman\commands\agent.py watch `
  --api https://monitoringpemasaran-production.up.railway.app `
  --username <user_app> `
  --password <pass_app>
```

Opsional env: `ASETOPT_API_URL`, `ASETOPT_USER`, `ASETOPT_PASSWORD`.

## Alur kerja

1. Jalankan agent di PC (jendela tetap terbuka).
2. Di web: **Cash In / Input Pembayaran** → pastikan dokumen lengkap & lunas.
3. Klik **Kirim ke Superman**.
4. Progress di UI diisi oleh agent; captcha (jika perlu) muncul di browser di PC.
5. Nomor SPPn/SPPb disimpan ke kompensasi di server.

## Cek status

```powershell
python scripts\superman\commands\agent.py status `
  --api https://monitoringpemasaran-production.up.railway.app `
  --username <user> --password <pass>
```

Lihat `agent_online`, `superman_reachable`, `needs_local_agent`.

## Catatan

- Session captcha disimpan di `scripts/superman/.superman_state.json` (PC lokal).
- Jika auto-OCR captcha gagal, agent membuka browser untuk login manual sekali.
- Tanpa agent online + Railway tidak reach Superman → tombol kirim akan menampilkan pesan bantuan ini.
- **Penting:** job & heartbeat agent disimpan di memori proses API. Service API di Railway sebaiknya **1 replica** agar job yang diantrekan dan heartbeat agent berada di instance yang sama.
- Setelah deploy API baru, restart agent jika token/endpoint berubah.
