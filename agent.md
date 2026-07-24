# Agent Instructions — AsetOpt Monitor

Panduan operasional untuk AI agent. File ini **ringan** (~2 KB). Jangan baca semua dokumen proyek di awal — gunakan routing di bawah.

---

## 1. Hierarki Dokumen

| Prioritas | File | Ukuran | Kapan dibaca |
|-----------|------|--------|--------------|
| 1 | `agent.md` | kecil | **Selalu** — routing & hemat token |
| 2 | `Claude.md` | ~290 baris | Konteks proyek: file map, DB, business rules, konvensi |
| 3 | `DESIGN_SYSTEM.md` | ~900 baris | **Hanya** UI/layout/styling/pola komponen — baca section tertentu, jangan full file |
| 4 | `DEPLOY_SELFHOST.md` | self-host | Deploy Windows/Docker, pindah dari Railway |
| 5 | `src/types/index.ts` | referensi tipe | Saat butuh interface/type pasti |
| 6 | Source code | per file | Saat implementasi/debug — baca file relevan saja |

**Aturan emas:** `Claude.md` = *apa & di mana*. `DESIGN_SYSTEM.md` = *bagaimana tampil & pola UI*. Source code = *implementasi aktual*.

---

## 2. Routing Tugas → Dokumen

Baca **hanya** yang diperlukan untuk tugas saat ini:

| Tugas user | Baca dulu | Jangan baca |
|------------|-----------|-------------|
| Bug fix di halaman tertentu | File page + store terkait | DESIGN_SYSTEM.md penuh |
| Fitur baru di jalur B | `Claude.md` → Business Rules + DB | Semua store |
| UI/styling/komponen baru | `DESIGN_SYSTEM.md` §3–§13, §19–§22 | Claude.md (sudah cukup dari memori) |
| Migration / tabel baru | `Claude.md` → How to Add a New Table + DB | DESIGN_SYSTEM.md |
| Katalog / factsheet | `Claude.md` → Katalog System | DESIGN_SYSTEM.md |
| Refactor store | `Claude.md` → Zustand Store Patterns + 1 store contoh | File map lengkap |
| Laporan / util bisnis | `Claude.md` → Business Rules + file utils terkait | DESIGN_SYSTEM.md |
| Self-host / Docker / pindah Railway | `DEPLOY_SELFHOST.md` + `docker-compose.yml` | DESIGN_SYSTEM.md |

---

## 3. Indeks `Claude.md` — baca section spesifik

| Section | Isi | Trigger baca |
|---------|-----|--------------|
| Stack & Commands | npm scripts, tech stack | Setup, build, lint |
| File Map | Struktur `src/` | Cari lokasi file |
| Routes | Path → page mapping | Routing, breadcrumb, sidebar |
| Database | ERD, kolom, RLS, migration | DB/schema/store baru |
| Business Rules | Tarif, PBB, SP, PSAK 73 | Logika bisnis |
| Zustand Store Patterns | Template CRUD store | Store baru/refactor |
| Katalog System | Portfolio + factsheet flow | Fitur katalog |
| Form Patterns | react-hook-form + Zod | Form/dialog baru |
| How to Add * | Page, table, utility | Scaffold fitur |
| Coding Conventions | Naming, formatters, bahasa UI | Semua coding task |

---

## 4. Indeks `DESIGN_SYSTEM.md` — baca on-demand

File besar. **Gunakan offset/limit atau grep heading** — jangan load 900 baris sekaligus.

| § | Topik | Trigger baca |
|---|-------|--------------|
| 1–2 | Stack & direktori | Arsitektur umum (overlap Claude.md — skip jika sudah tahu) |
| 3 | Design tokens HSL | Warna, tema, CSS variables |
| 4–6 | Layout, sidebar, routes | Layout/sidebar/header |
| 7–8 | Types & Zustand | Overlap Claude.md — prefer Claude.md |
| 9–13 | shadcn, badge, form, dialog, slideover | Komponen UI baru |
| 14–16 | Dashboard, fetching, utils | Pola agregasi data |
| 17–22 | Helpers, charts, table, print | Format tampilan |
| 23–30 | Konvensi & filosofi | Konsistensi kode |

---

## 5. Strategi Hemat Token

### Sebelum membaca file
1. **Cek konteks yang sudah ada** — `Claude.md` mungkin sudah di-inject sebagai workspace rule. Jangan baca ulang section yang sama.
2. **Tanya diri sendiri:** "Apakah 1 file source code cukup tanpa buka dokumen?"
3. **Grep dulu, baca belakangan** — cari simbol/fungsi dengan grep, baru `Read` file target dengan `offset`/`limit`.

### Saat membaca
- **Maks 1–3 file** per langkah investigasi awal
- **Maks ~150 baris** per `Read` — perluas hanya jika stuck
- **Jangan** baca `DESIGN_SYSTEM.md` full — selalu section-based
- **Jangan** baca semua store — hanya store yang terhubung ke tugas
- **Jangan** explore codebase luas tanpa target — mulai dari route/page yang disebut user

### Saat menulis kode
- Edit **minimal** — hanya file yang task butuhkan
- **Reuse** fungsi/komponen existing — grep `utils/`, `components/common/`
- **Jangan** buat markdown/docs baru kecuali diminta user
- **Jangan** refactor di luar scope

### Saat merespons user
- Jawaban **ringkas**, tanpa mengulang isi dokumen
- Code citation format: `startLine:endLine:filepath` — jangan paste file utuh
- Selesaikan sendiri (jalankan command, jangan hanya instruksi ke user)

---

## 6. Workflow Standar

```
1. Parse intent user → tentukan domain (jalur A/B, master, katalog, UI, DB)
2. Cek agent.md routing table (§2)
3. Baca section Claude.md yang relevan (§3) — skip jika sudah di context
4. Grep simbol/file target → Read scoped (offset/limit)
5. Implementasi minimal → npm run build/lint jika perlu verifikasi
6. Respon singkat: apa diubah, mengapa, file mana
```

---

## 7. Quick Reference (tanpa buka file lain)

```
Stack:     React 18 · Vite · TS · Tailwind · shadcn · Zustand · Supabase
Dev:       npm run dev (5173) · build · lint
Types:     src/types/index.ts
Stores:    src/store/*Store.ts
Utils:     src/utils/*Utils.ts
Pages:     src/pages/
Auth:      Tidak ada — RLS anon full access (internal tool)
Alias:     @/ → src/
UI label:  Bahasa Indonesia · kode: English
```

---

## 8. Perluas Dokumentasi

Jika menambah `.md` baru di root proyek, update **§1 Hierarki** dan **§2 Routing** di file ini agar agent berikutnya tetap efisien.