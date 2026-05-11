# AsetOpt Monitor — Project Reference

## Stack
React 18 · Vite · TypeScript · Tailwind CSS · shadcn/ui (Radix UI) · Zustand · Supabase · Recharts · React Hook Form + Zod · Lucide Icons · jsPDF

## Commands
| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server (port 5173) |
| `npm run build` | Production build (`tsc && vite build`) |
| `npm run lint` | ESLint |

---

## File Map — where everything lives

```
src/
  main.tsx                    # Entry: BrowserRouter > App
  App.tsx                     # All routes (wrapped in AppLayout)
  index.css                   # Tailwind directives + @media print for katalog
  vite-env.d.ts               # ImportMetaEnv (VITE_SUPABASE_URL, etc.)

  types/index.ts              # ALL TypeScript interfaces — single source of truth

  lib/
    supabase.ts               # Supabase client (anon key from .env)
    utils.ts                   # formatRupiah, formatTanggal, formatAngka, hitungSisaHari, cn()

  store/                      # Zustand stores — one per DB entity
    asetStore.ts              # aset CRUD
    njopStore.ts              # njop CRUD + getNJOPTerbaru() + hitungPotensiAset()
    kjppStore.ts              # penilaian_kjpp CRUD + getKJPPTerbaru()
    timelineStore.ts          # timeline_program + prospek_mitra
    kerjaSamaStore.ts         # kerja_sama (joins aset)
    kompensasiStore.ts        # kompensasi + pembayaran
    pbbStore.ts               # pbb (grouped by aset)
    cashInStore.ts            # cash_in
    notifikasiStore.ts        # surat_peringatan + log_notifikasi
    rkapStore.ts              # rkap_target
    katalogStore.ts           # katalog_aset + child tables + upload foto (base64)

  pages/
    Dashboard.tsx             # / — stats, charts, summary all entities
    RKAPMonitor.tsx           # /rkap — RKAP target management
    KatalogAset.tsx           # /katalog/factsheet — A4 factsheet builder (form + 3 variasi)
    jalurA/
      TimelineProgram.tsx     # /jalur-a/timeline — pipeline timeline
      PotensiPendapatan.tsx   # /jalur-a/potensi — NJOP/KJPP potensi calculation
    jalurB/
      KerjaSama.tsx           # /jalur-b/kerja-sama — active partnerships
      Kompensasi.tsx          # /jalur-b/kompensasi — invoices, payments + auto PSAK 73 accrual
      PembayaranPBB.tsx       # /jalur-b/pbb — PBB proportional calculation
      NotifikasiSP.tsx        # /jalur-b/notifikasi — SP management & WhatsApp
      LaporanPendapatan.tsx   # /jalur-b/laporan — revenue report + SAP fields
    katalog/
      KatalogAset.tsx         # /katalog — portfolio view (aggregates all stores)
    master/
      DataAset.tsx            # /master/aset — asset master data
      DataNJOP.tsx            # /master/njop — NJOP per aset per tahun
      PenilaianKJPP.tsx       # /master/kjpp — KJPP appraisal records

  components/
    layout/
      AppLayout.tsx           # Sidebar (fixed left) + Header (fixed top) + <Outlet/>
      Sidebar.tsx             # Collapsible nav groups with icons
      Header.tsx              # Breadcrumbs + notification bell + user avatar
    common/
      StatusBadge.tsx         # Colored badge for all status types
      CurrencyDisplay.tsx     # Formatted Rupiah (sm/md/lg/xl)
      CurrencyInput.tsx       # Input with Rp prefix
      EmptyState.tsx          # Centered empty placeholder with action
      LoadingSkeleton.tsx     # Table/Card skeleton loaders
      ConfirmDialog.tsx       # Wraps Dialog for delete confirmations
      SlideOver.tsx           # Right-side slide panel
      InvoicePBBDialog.tsx    # PBB invoice PDF generation (jsPDF)
    katalog/
      factsheet-shared.tsx     # Shared: BrandMark, PhotoSlot, SpecRow, StatTile,
                               #   SectionHead, MiniMap, PageFooter, CompassRose,
                               #   singkatSertifikat(), VARS (colors), font constants
      FactsheetEditorial.tsx  # Variasi 01 — Full-bleed cover A4
      FactsheetModular.tsx    # Variasi 02 — Grid magazine A4
      FactsheetCompact.tsx    # Variasi 03 — Dense datasheet A4
      KatalogPreview.tsx      # Zoom, density toggle, variation toggle, print button
      KatalogForm.tsx         # Full form: aset selector + all fields + dynamic sub-forms
      KatalogCard.tsx         # Portfolio card (used by /katalog portfolio)
      KatalogCardSections.tsx # 8 detail sections inside portfolio card
    ui/                       # shadcn/ui primitives (button, card, dialog, select, etc.)

  utils/
    potensiUtils.ts           # hitungPotensiNJOP() — tarif 3.33% tanah, 6.64% bangunan
    taxUtils.ts               # PPN/PPH computation
    pbbUtils.ts               # PBB proportional (multi-objek, area + time)
    rkapUtils.ts              # RKAP period helpers
    akrualUtils.ts            # PSAK 73 straight-line amortization
    notifikasiUtils.ts        # SP thresholds, WA message templates
    terbilang.ts              # Number-to-words (Indonesian)

  data/
    rkap2026.ts               # RKAP seed data + BULAN_LABELS

  services/
    waService.ts              # Fonnte WhatsApp API
```

---

## Routes (App.tsx)

| Path | Page | Description |
|------|------|-------------|
| `/` | Dashboard | Stats, charts, summaries |
| `/rkap` | RKAPMonitor | RKAP target tahunan |
| `/katalog` | katalog/KatalogAset | Portfolio view (aggregated) |
| `/katalog/factsheet` | KatalogAset (top-level) | A4 factsheet builder |
| `/jalur-a/timeline` | TimelineProgram | Pipeline + prospek |
| `/jalur-a/potensi` | PotensiPendapatan | NJOP/KJPP potensi calc |
| `/jalur-b/kerja-sama` | KerjaSama | Active KS management |
| `/jalur-b/kompensasi` | Kompensasi | Invoices, payments, auto PSAK 73 accrual |
| `/jalur-b/pbb` | PembayaranPBB | PBB proportional |
| `/jalur-b/notifikasi` | NotifikasiSP | SP letters & WA |
| `/jalur-b/laporan` | LaporanPendapatan | Revenue report + SAP fields |
| `/master/aset` | DataAset | Asset master data |
| `/master/njop` | DataNJOP | NJOP values |
| `/master/kjpp` | PenilaianKJPP | KJPP appraisals |

---

## Database — tables, columns, relationships

### Core entity flow
```
aset ──┬── njop (1:N, per tahun)
       ├── penilaian_kjpp (1:N)
       ├── timeline_program (1:N)
       ├── prospek_mitra (1:N)
       ├── kerja_sama (1:N) ──┬── kompensasi (1:N) ── pembayaran (1:N)
       │                      ├── pbb (1:N) ── pbb_objek (1:N)
       │                      ├── surat_peringatan (1:N)
       │                      ├── cash_in (1:N)
       │                      ├── pendapatan_diterima_dimuka (1:N) ── pengakuan_pendapatan (1:N)
       │                      └── kerja_sama_aset (1:N, multi-aset per KS)
       ├── katalog_aset (1:1) ──┬── katalog_aksesibilitas (1:N)
       │                        ├── katalog_lingkungan (1:N)
       │                        ├── katalog_skema (1:N)
       │                        └── katalog_foto (1:N)
       └── (rkap_target: standalone, linked via kode)
```

### Key business columns
- **aset**: kode_aset, nama_aset, alamat, luas_tanah_m2, luas_bangunan_m2, status, sertifikat, keterangan
- **njop**: aset_id, tahun, nilai_tanah_per_m2, nilai_bangunan_per_m2, sumber
- **penilaian_kjpp**: aset_id, tgl_penilaian, nama_kjpp, no_laporan, nilai_tanah, nilai_bangunan, total_nilai (GENERATED)
- **kompensasi**: ks_id, rkap_kode, nominal, ppn_persen, pph_persen, pph_mode, nominal_ppn (GENERATED), nominal_pph (GENERATED), total_tagihan (GENERATED), pengurang, maks_hari_bayar, persen_denda_per_hari, tgl_jatuh_tempo
- **pbb**: aset_id, tahun, nilai_pbb (sum of objek), tgl_jatuh_tempo, status_bayar
- **pbb_objek**: pbb_id, nama_objek, no_sppt, nilai_pbb_objek, luas_tanah_sppt, luas_tanah_ks, njop_tanah_per_m2, luas_bangunan_sppt, luas_bangunan_ks, njop_bangunan_per_m2

### Auth model
**No authentication.** All tables have RLS policies: `FOR ALL TO anon USING (true) WITH CHECK (true)`. This is an internal tool.

### Migration conventions
- Files in `supabase/migrations/` numbered sequentially: `001_`, `002_`, etc.
- Run via Supabase CLI: `npx supabase db push` (requires `supabase link` + login)
- Or paste SQL directly in Supabase Dashboard → SQL Editor

---

## Business Rules — where they live

| Rule | File | Function |
|------|------|----------|
| Potensi tanah (3.33%) | utils/potensiUtils.ts | `hitungPotensiNJOP()` |
| Potensi bangunan (6.64%) | utils/potensiUtils.ts | `hitungPotensiNJOP()` |
| PBB proporsional | utils/pbbUtils.ts | Multi-objek: area ratio + time ratio |
| Denda keterlambatan | pages/jalurB/Kompensasi.tsx | Daily % × nominal |
| SP escalation | utils/notifikasiUtils.ts | 5% threshold → SP1 → +14d SP2 → +14d SP3 → +14d Putus |
| Sertifikat abbreviation | components/katalog/factsheet-shared.tsx | `singkatSertifikat()`: "Hak Guna Usaha" → "HGU" |
| Region extraction | store/katalogStore.ts + KatalogForm | Parse "Kota X, Provinsi Y" from alamat |
| Nilai aset priority | store/katalogStore.ts + KatalogForm | KJPP total_nilai > NJOP potensi |
| PSAK 73 amortisasi | utils/akrualUtils.ts | `generateJadwalAmortisasi()` — straight-line sewa operasi |

---

## Zustand Store Patterns

Every store follows this template:
```ts
interface XxxStore {
  data: ...                  // state
  isLoading: boolean
  fetchXxx: () => Promise<void>
  addXxx: (data) => Promise<void>
  updateXxx: (id, data) => Promise<void>
  deleteXxx: (id) => Promise<void>
}
```

**Key patterns:**
- Stores import `supabase` directly from `@/lib/supabase`
- `fetch*()` sets `isLoading`, queries, updates state, clears `isLoading`
- `add*()` / `update*()` calls Supabase then re-fetches
- Grouped stores (NJOP, KJPP, timeline, pbb): data is `Record<string, T[]>` keyed by parent ID
- Generated columns (`total_nilai`, `nominal_ppn`, `total_tagihan`) are stripped before update
- Error handling: `console.error()` with store prefix, does NOT throw (keeps UI resilient)

---

## Katalog System — two subsystems

### 1. Portfolio View (`/katalog`)
- Page: `src/pages/katalog/KatalogAset.tsx`
- Cards: `src/components/katalog/KatalogCard.tsx` + `KatalogCardSections.tsx`
- Pure aggregation: reads from ALL stores (aset, NJOP, KJPP, timeline, prospek, kerjaSama, PBB)
- No dedicated table — computed via `useMemo`

### 2. Factsheet Builder (`/katalog/factsheet`)
- Page: `src/pages/KatalogAset.tsx`
- Form: `src/components/katalog/KatalogForm.tsx` — react-hook-form + Zod, dynamic sub-forms
- Preview: `src/components/katalog/KatalogPreview.tsx` — zoom, density, variation toggle, print
- 3 variants: `FactsheetEditorial`, `FactsheetModular`, `FactsheetCompact` (A4: 794×1123px)
- Store: `src/store/katalogStore.ts` — CRUD for katalog_aset + child tables + upload (base64)
- Photos stored as base64 data URLs in `katalog_foto.url` (no S3 bucket needed)
- Print CSS in `src/index.css` `@media print` — hides everything except `.fs-page`

### Katalog data flow
```
User selects aset → fetch NJOP + KJPP → auto-populate sertifikat, region
  → fill katalog form → save (creates katalog_aset + child records)
  → upload photos (base64 to katalog_foto) → preview with real data
  → print/PDF via window.print() with @media print CSS
```

---

## Form Patterns

All forms use react-hook-form + zodResolver:
```ts
const schema = z.object({ field: z.string().min(1) })
type FormType = z.infer<typeof schema>
const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<FormType>({
  resolver: zodResolver(schema),
  defaultValues: { ... }
})
```

- Dialogs: shadcn `Dialog` for add/edit forms
- Dynamic arrays: manual state arrays with add/remove (not useFieldArray due to simplicity)
- Auto-populate: `setValue()` on parent selection change
- Save flow: onSubmit → store action → re-fetch → close dialog OR stay open for uploads

---

## How to Add a New Page

1. Create page component in `src/pages/<path>.tsx`
2. Add route in `src/App.tsx` inside `<Route element={<AppLayout />}>`
3. Add breadcrumb in `src/components/layout/Header.tsx` → `breadcrumbMap`
4. Add nav entry in `src/components/layout/Sidebar.tsx` → `navItems`

## How to Add a New Table

1. Create migration: `supabase/migrations/<NNN>_description.sql`
2. Add `CREATE TABLE`, RLS `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, `CREATE POLICY`
3. Add TypeScript interface in `src/types/index.ts`
4. Create Zustand store in `src/store/<name>Store.ts`
5. Run migration via Supabase CLI or dashboard SQL Editor

## How to Add a Utility Function

1. Add to relevant file in `src/utils/` (business logic) or `src/lib/utils.ts` (generic helpers)
2. Export from barrel if needed
3. Import directly: `import { myFn } from '@/utils/myUtils'`

---

## Coding Conventions

- **Language**: UI labels in Bahasa Indonesia; code/variables in English
- **Currency**: `formatRupiah(value)` → `"Rp 1.250.000"` (from `@/lib/utils`)
- **Dates**: `formatTanggal(dateStr)` → `"11 Mei 2026"` (from `@/lib/utils`)
- **Numbers**: `formatAngka(value)` → `"1.250"` (from `@/lib/utils`)
- **Naming**: camelCase variables, PascalCase components, kebab-case files
- **Components**: Default export for pages, named exports for shared components
- **Stores**: Named export `useXxxStore`, interface `XxxStore`
- **Imports**: `@/` alias for `src/`
- **No comments** unless the WHY is non-obvious (hidden constraint, workaround)
- **No half-finished implementations** — finish or don't start
- **No premature abstractions** — three similar lines > premature helper
