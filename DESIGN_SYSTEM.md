# Design System & Architecture Reference

Panduan pola desain, arsitektur, dan konvensi kode yang bisa diadopsi untuk aplikasi React + TypeScript.

---

## 1. Tech Stack Inti

| Layer | Pilihan | Alasan |
|-------|---------|--------|
| Framework | React 18 + Vite | Cepat, DX baik, HMR instant |
| Language | TypeScript strict | Type safety penuh, deteksi bug lebih awal |
| Styling | Tailwind CSS + CSS Variables | Utility-first + theming via HSL custom properties |
| UI Primitives | shadcn/ui (Radix UI) | Headless, accessible, fully customizable |
| Routing | react-router-dom v6 | Layout route pattern, nested routes |
| State | Zustand | Minimal boilerplate, tanpa Provider, langsung via hook |
| Forms | react-hook-form + Zod | Performant + type-safe validation |
| Backend | Supabase (PostgreSQL) | Managed DB + auto REST API + real-time |
| Charts | Recharts | Declarative, React-native, composable |
| PDF | jsPDF + jsPDF-AutoTable | Client-side PDF generation |
| Icons | Lucide React | Tree-shakable, consistent style, ukuran kecil |

---

## 2. Struktur Direktori

```
src/
  main.tsx                         # Entry point — BrowserRouter > App
  App.tsx                          # Semua route dalam satu file
  index.css                        # Tailwind directives + CSS variables + @media queries
  vite-env.d.ts                    # Env type declarations

  types/index.ts                   # SEMUA interface — single source of truth

  lib/
    client.ts                      # API / DB client singleton
    utils.ts                       # Generic helpers — cn(), formatters, dll.

  store/                           # Zustand — satu store per entitas
    productStore.ts
    orderStore.ts
    ...

  pages/                           # Satu file per halaman — default export
    Dashboard.tsx
    moduleA/
    moduleB/
    master/

  components/
    layout/                        # AppLayout, Sidebar, Header
    common/                        # Shared — EmptyState, StatusBadge, SlideOver, ConfirmDialog
    ui/                            # shadcn/ui primitives — button, card, dialog, select, dll.
    feature/                       # Domain-specific components

  utils/                           # Pure business logic functions
    pricingUtils.ts
    taxUtils.ts
    ...

  services/                        # External API integration
    notificationService.ts

  data/                            # Static seed data & constants
```

**Prinsip:** Grouping per *jenis* (pages, store, components, utils), bukan per domain/modul. Cocok untuk aplikasi 10-30 halaman. Tidak perlu folder `features/` atau `modules/` sampai skala memaksa.

---

## 3. Design Tokens — CSS Variables via HSL

Semua warna didefinisikan sebagai HSL custom properties, dikonsumsi Tailwind via `hsl(var(--token))`:

```css
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222 47% 11%;
    --card: 0 0% 100%;
    --card-foreground: 222 47% 11%;
    --primary: 210 61% 28%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96%;
    --secondary-foreground: 222 47% 11%;
    --muted: 210 40% 96%;
    --muted-foreground: 215 16% 47%;
    --accent: 210 40% 96%;
    --accent-foreground: 222 47% 11%;
    --destructive: 0 84% 60%;
    --destructive-foreground: 210 40% 98%;
    --border: 214 32% 91%;
    --input: 214 32% 91%;
    --ring: 210 61% 28%;
    --radius: 0.5rem;
  }
}
```

**Pola:**
- Semua token warna pakai HSL (bukan hex/rgb) — mudah di-adjust lightness/saturation
- `--primary` adalah warna brand utama
- `--radius` mengontrol border-radius global
- Variabel dikonsumsi Tailwind lewat config: `colors: { primary: { DEFAULT: 'hsl(var(--primary))' } }`
- Dark mode: tambahkan `.dark` selector dengan nilai HSL yang disesuaikan

### Warna Semantik

| Makna | Warna | Contoh penggunaan |
|-------|-------|-------------------|
| Sukses / Positif | Green (`#117A65`) | Status lunas, target tercapai |
| Warning | Amber / Orange (`#D97706`) | Mendekati deadline, perlu perhatian |
| Error / Masalah | Red (`#DC2626`) | Jatuh tempo, gagal, ditolak |
| Informasi | Blue | Status dalam proses |
| Netral | Gray scale | Default, tidak ada status khusus |
| Brand accent | Sesuai brand | Sidebar, judul section, CTA utama |

### Tipografi

- **Font utama:** Sans-serif (Inter, system default)
- **Ukuran base body:** `14px` — sedikit lebih kecil dari default browser (16px)
- **Skala:** `text-[10px]` (label mikro) s.d. `text-2xl` (stat cards besar)
- **Headings:** `text-lg font-bold` untuk judul halaman, `text-base font-semibold` untuk judul card/section

### Spacing

- Layout utama: sidebar fixed width (224px) + header fixed height (56px)
- Konten: `p-5` (20px) padding konsisten
- Gap antar section: `space-y-6` (24px)
- Padding dalam card/panel: `p-5` atau `px-5 py-4`

---

## 4. Komponen Layout — Fixed Sidebar + Header

Pola three-section fixed:

```
┌──────────┬──────────────────────────────────────┐
│ Sidebar  │ Header (fixed)                       │
│ (fixed)  │                                      │
│          │ <Outlet/> — area scrollable           │
│          │                                      │
│ bg-brand │ bg-white                             │
└──────────┴──────────────────────────────────────┘
```

```tsx
export function AppLayout() {
  return (
    <div className="min-h-screen bg-gray-50/80">
      <Sidebar />
      <Header />
      <main className="ml-56 pt-[56px] min-h-screen">
        <div className="p-5">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
```

**Sidebar:**
- Background: gradient warna brand
- Tiga section vertikal: logo → navigasi → footer
- Nav item support nested children yang bisa collapse/expand
- Active state: background putih semi-transparan + left border

**Header:**
- Background putih, border bottom tipis
- Breadcrumbs otomatis dari map berdasarkan current path
- Area kanan: notifikasi + user avatar

---

## 5. Pattern: Sidebar — Navigasi sebagai Data

Navigasi dideklarasikan sebagai array of objects, bukan JSX hardcoded:

```tsx
interface NavItem {
  label: string
  to?: string
  icon?: React.ReactNode
  children?: NavItem[]
}

const navItems: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: <LayoutDashboard size={15} /> },
  {
    label: 'Module A',
    icon: <Package size={15} />,
    children: [
      { label: 'Sub Page 1', to: '/module-a/page-1' },
      { label: 'Sub Page 2', to: '/module-a/page-2' },
    ],
  },
  { label: 'Settings', to: '/settings', icon: <Settings size={15} /> },
]
```

- Leaf items → `<NavLink>` dengan class active/inactive
- Parent items → button toggle collapse/expand
- Ikon ukuran `size={15}` konsisten di semua item

---

## 6. Pattern: Route Declaration

Semua route dalam satu file, gunakan layout route pattern:

```tsx
function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>        {/* Layout wrapper */}
        <Route path="/" element={<Dashboard />} />
        <Route path="/module-a/page-1" element={<PageOne />} />
        <Route path="/module-a/page-2" element={<PageTwo />} />
        <Route path="/master/items" element={<MasterItems />} />
      </Route>
    </Routes>
  )
}
```

**Konvensi path URL:**
- `/` — Dashboard
- `/module/*` — Grouping per modul bisnis
- `/master/*` — Master data (CRUD reference tables)
- Gunakan kebab-case: `/sales-order`, bukan `/salesOrder`

---

## 7. Pattern: Type System — Single File

Semua interface dan type dalam SATU file `types/index.ts`:

```ts
// types/index.ts

// Union types untuk status/enum
export type OrderStatus = 'pending' | 'processing' | 'shipped' | 'completed' | 'cancelled'

// Entity interfaces — satu per tabel/koleksi
export interface Product {
  id: string
  code: string
  name: string
  price: number
  status: ProductStatus
  created_at: string
  updated_at: string
}

export interface Order {
  id: string
  product_id: string
  quantity: number
  total: number
  status: OrderStatus
  created_at: string
  // Relasi joined
  product?: Product
  items?: OrderItem[]
}

// Computed / UI-only types
export interface OrderWithStatus extends Order {
  remaining: number
  isOverdue: boolean
}
```

**Kapan split:** Jika file sudah >400 baris, baru pertimbangkan split per domain (`types/product.ts`, `types/order.ts`).

---

## 8. Pattern: Zustand Store — Template CRUD

Setiap entitas database punya satu store:

```ts
import { create } from 'zustand'
import { client } from '@/lib/client'

interface ProductStore {
  data: Product[]
  isLoading: boolean
  fetch: () => Promise<void>
  add: (input: ProductInput) => Promise<void>
  update: (id: string, input: Partial<Product>) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useProductStore = create<ProductStore>((set, get) => ({
  data: [],
  isLoading: false,

  fetch: async () => {
    set({ isLoading: true })
    const { data, error } = await client.from('products').select('*').order('created_at', { ascending: false })
    if (error) console.error('[productStore.fetch]', error)
    if (data) set({ data })
    set({ isLoading: false })
  },

  add: async (input) => {
    await client.from('products').insert(input)
    await get().fetch()
  },

  update: async (id, input) => {
    // Strip kolom yang tidak boleh di-update
    const { id: _, created_at, updated_at, ...payload } = input as any
    await client.from('products').update(payload).eq('id', id)
    await get().fetch()
  },

  remove: async (id) => {
    await client.from('products').delete().eq('id', id)
    await get().fetch()
  },
}))
```

**Pola penting:**
- Mutasi → **re-fetch** (bukan optimistic update). Simpel dan selalu sinkron.
- Error handling: `console.error()` — tidak throw, UI tetap responsif
- Nama method konsisten: `fetch`, `add`, `update`, `remove`
- Export sebagai named export: `export const useProductStore`
- Generated/computed columns di-strip sebelum update
- Store yang related (child dari parent) menggunakan `Record<string, T[]>` dipetakan ke parent ID

---

## 9. Pattern: shadcn/ui Component

Setiap komponen UI mengikuti konvensi:

1. **Import dari Radix primitive** untuk komponen interaktif (dialog, select, dropdown)
2. **Gunakan `cn()`** untuk merge Tailwind classes
3. **Gunakan `forwardRef`** agar komponen bisa di-pass ref
4. **Compound component pattern** untuk komponen kompleks (Card, Dialog, Select)

### Contoh — Compound Component (Card):

```tsx
const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('rounded-lg border bg-white shadow-sm', className)} {...props} />
  )
)
Card.displayName = 'Card'

const CardHeader = React.forwardRef<...>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('flex flex-col space-y-1 px-5 py-4', className)} {...props} />
))

// Usage:
<Card>
  <CardHeader>
    <CardTitle>Judul</CardTitle>
  </CardHeader>
  <CardContent>...</CardContent>
</Card>
```

### Contoh — CVA untuk Varian (Button, Badge):

```tsx
const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        destructive: 'bg-destructive text-white hover:bg-destructive/90',
        outline: 'border border-input bg-white hover:bg-gray-50',
        ghost: 'hover:bg-gray-100',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 px-3 text-xs',
        lg: 'h-10 px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)
```

### Custom Badge Variants

Tambahkan varian semantik langsung di `badgeVariants`:

```tsx
variant: {
  default:    'bg-primary text-primary-foreground',
  success:    'bg-green-100 text-green-800',
  warning:    'bg-yellow-100 text-yellow-800',
  destructive:'bg-red-100 text-red-800',
  info:       'bg-blue-100 text-blue-800',
  // Tambahkan sesuai kebutuhan tanpa pecah sistem
}
```

---

## 10. Pattern: Status Badge System

Pakai lookup table untuk mapping status → label + warna:

```tsx
const statusMap: Record<Status, { label: string; variant: string }> = {
  pending:    { label: 'Pending',    variant: 'secondary' },
  processing: { label: 'Processing', variant: 'info' },
  shipped:    { label: 'Shipped',    variant: 'warning' },
  completed:  { label: 'Completed',  variant: 'success' },
  cancelled:  { label: 'Cancelled',  variant: 'destructive' },
}

export function StatusBadge({ type, value }: { type: string; value: string }) {
  let label = value
  let variant = 'secondary'

  if (type === 'order' && value in orderStatusMap) {
    const m = orderStatusMap[value]
    label = m.label; variant = m.variant
  }

  return <Badge variant={variant}>{label}</Badge>
}
```

---

## 11. Pattern: Form — react-hook-form + Zod

```tsx
const schema = z.object({
  name: z.string().min(1, 'Required'),
  price: z.number().min(0, 'Must be positive'),
  status: z.enum(['active', 'inactive']),
})

type FormData = z.infer<typeof schema>

const { register, handleSubmit, reset, setValue, formState: { errors } } = useForm<FormData>({
  resolver: zodResolver(schema),
  defaultValues: { name: '', price: 0, status: 'active' },
})

// Auto-populate dari data yang sudah ada
useEffect(() => {
  if (selected) {
    setValue('name', selected.name)
    setValue('price', selected.price)
  }
}, [selected])

const onSubmit = async (data: FormData) => {
  await store.add(data)
  reset()
}
```

**Pola:**
- Schema Zod di luar komponen
- Form dalam Dialog untuk add/edit; atau inline untuk form sederhana
- Dynamic arrays: state array manual dengan tombol add/remove (hindari `useFieldArray` kecuali benar-benar kompleks)
- Save flow: onSubmit → store.add/update → re-fetch → tutup dialog

---

## 12. Pattern: Confirm Dialog

Wrapper di atas Dialog untuk konfirmasi aksi destruktif:

```tsx
<ConfirmDialog
  open={showConfirm}
  onOpenChange={setShowConfirm}
  title="Delete Item"
  description="This action cannot be undone."
  onConfirm={() => store.remove(id)}
  confirmLabel="Delete"
  isDestructive
/>
```

**Anatomi internal:**
- Judul + deskripsi di header
- Footer: tombol "Cancel" (outline, kiri) + tombol konfirmasi (kanan)
- `isDestructive` → tombol konfirmasi jadi varian merah

---

## 13. Pattern: SlideOver — Right Panel

Panel detail yang slide dari kanan, tanpa meninggalkan halaman:

```tsx
<SlideOver open={!!selected} onClose={() => setSelected(null)} title="Detail" width="max-w-2xl">
  {/* Konten detail di sini */}
</SlideOver>
```

Implementasi: `fixed right-0 top-0 h-full` + `translate-x` transition + overlay hitam semi-transparan.

---

## 14. Pattern: Dashboard — Client-Side Aggregation

Dashboard menghitung agregasi dari multiple stores via `useMemo`:

```tsx
const stats = useMemo(() => {
  const totalItems = products.length
  const activeItems = products.filter(p => p.status === 'active').length
  const totalValue = orders
    .filter(o => o.status === 'completed')
    .reduce((sum, o) => sum + o.total, 0)
  return { totalItems, activeItems, totalValue }
}, [products, orders])
```

**Prinsip:** Fetch semua data → hitung di client. Tidak perlu endpoint API khusus dashboard. Ini cukup untuk skala data yang muat di memori (ribuan record).

---

## 15. Pattern: Data Fetching Strategy

```tsx
useEffect(() => {
  productStore.fetch()
  orderStore.fetchAll()
}, [location.key])
```

- Fetch semua data saat mount pertama
- Gunakan `location.key` (berubah tiap navigasi) sebagai trigger re-fetch
- Tidak ada caching layer atau dedup — simplicity over premature optimization
- Loading state via `isLoading` di setiap store

---

## 16. Pattern: Pure Utility Functions

Fungsi bisnis adalah pure functions — tanpa akses store, API, atau side effect:

```ts
// utils/pricingUtils.ts
const TAX_RATE = 0.11

interface PricingInput {
  basePrice: number
  quantity: number
  discountPercent: number
}

interface PricingResult {
  subtotal: number
  discount: number
  tax: number
  total: number
}

export function calculatePricing(input: PricingInput): PricingResult {
  const subtotal = input.basePrice * input.quantity
  const discount = subtotal * (input.discountPercent / 100)
  const taxableAmount = subtotal - discount
  const tax = taxableAmount * TAX_RATE
  return { subtotal, discount, tax, total: taxableAmount + tax }
}
```

Konstanta bisnis (tarif, threshold, persentase) disimpan di level atas file utility.

---

## 17. Pattern: Generic Helpers — `lib/utils.ts`

```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

// Classname merge (selalu pakai ini, bukan string interpolation)
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// Gunakan Intl API untuk formatting — jangan library eksternal
export function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '-'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR',
    minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(value)
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric',
  })
}

export function formatNumber(value: number | null | undefined): string {
  if (value == null) return '0'
  return new Intl.NumberFormat('id-ID').format(value)
}
```

---

## 18. Pattern: Recharts Chart

```tsx
<ResponsiveContainer width="100%" height={220}>
  <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
    <YAxis tick={{ fontSize: 11 }} />
    <Tooltip />
    <Legend wrapperStyle={{ fontSize: 11 }} />
    <Bar dataKey="value" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
  </BarChart>
</ResponsiveContainer>
```

**Konvensi:**
- Selalu bungkus dengan `ResponsiveContainer`
- Font size kecil (10-11px) untuk axis/legend
- Grid: dash array `"3 3"`, warna `#f0f0f0`
- Bar radius: `[3, 3, 0, 0]` (rounded top)
- Konversi nilai besar ke satuan lebih kecil (juta, miliar) untuk legibility

---

## 19. Pattern: Stat Card

```tsx
<Card>
  <CardContent className="p-5">
    <div className="flex items-start justify-between">
      <div>
        <p className="text-xs text-gray-500 font-medium">Total Revenue</p>
        <p className="text-2xl font-bold text-gray-900 mt-1">{formatCurrency(stats.revenue)}</p>
      </div>
      <DollarSign className="text-brand" size={22} />
    </div>
  </CardContent>
</Card>
```

**Anatomi:** Label kecil abu-abu di atas → angka besar di bawah → ikon di kanan atas.

Untuk card yang interaktif (klik untuk drill-down):
```
className="cursor-pointer hover:shadow-md transition-shadow"
```

---

## 20. Pattern: Table Styling

```tsx
<table className="w-full text-sm">
  <thead>
    <tr className="border-b bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
      <th className="text-left px-3 py-2">Name</th>
      <th className="text-right px-3 py-2">Amount</th>
      <th className="text-center px-3 py-2">Status</th>
    </tr>
  </thead>
  <tbody className="divide-y">
    {items.map(item => (
      <tr key={item.id} className="hover:bg-gray-50 transition-colors">
        <td className="px-3 py-2.5 font-medium">{item.name}</td>
        <td className="px-3 py-2.5 text-right">{formatCurrency(item.amount)}</td>
        <td className="px-3 py-2.5 text-center"><StatusBadge ... /></td>
      </tr>
    ))}
  </tbody>
  <tfoot>
    <tr className="border-t-2 bg-gray-50 font-semibold">
      <td className="px-3 py-2">Total</td>
      <td className="px-3 py-2 text-right">{formatCurrency(total)}</td>
      <td />
    </tr>
  </tfoot>
</table>
```

**Konvensi:**
- Header: `uppercase text-xs text-gray-500 bg-gray-50`
- Cell padding: `px-3 py-2.5`
- Row hover: `hover:bg-gray-50 transition-colors`
- Row dengan kondisi khusus: `bg-red-50/40` untuk item bermasalah
- Footer total: `border-t-2` (lebih tebal dari divider biasa)
- Kolom numerik: align right; teks: align left; status: align center

---

## 21. Pattern: Section Header with Drill-Down Link

```tsx
<div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
  <div className="flex items-center gap-2">
    <Icon size={15} className="text-brand" />
    <span className="text-sm font-semibold text-gray-800">Section Title</span>
    <span className="text-xs text-gray-400">optional subtitle</span>
  </div>
  <button
    onClick={() => navigate('/detail')}
    className="flex items-center gap-1 text-xs text-brand hover:underline font-medium"
  >
    View All <ChevronRight size={13} />
  </button>
</div>
```

---

## 22. Pattern: Print Styles

Untuk export halaman ke PDF/A4:

```css
@media print {
  body * { visibility: hidden; }

  .print-area, .print-area * { visibility: visible; }

  .print-area {
    position: absolute; left: 0; top: 0;
    width: 210mm !important;      /* A4 */
    height: 297mm !important;
    box-shadow: none !important;
    background: white !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  @page { size: A4; margin: 0; }
}
```

Gunakan class `.print-area` pada elemen yang ingin dicetak. Semua UI chrome otomatis tersembunyi.

---

## 23. Konvensi Penamaan

| Hal | Konvensi | Contoh |
|-----|----------|--------|
| Variabel / fungsi | camelCase | `totalAmount`, `calculateTax()` |
| Komponen React | PascalCase | `ProductList`, `StatusBadge` |
| File komponen | PascalCase.tsx | `ProductList.tsx` |
| File store/util | camelCase.ts | `productStore.ts`, `pricingUtils.ts` |
| Store hooks | `use[Name]Store` | `useProductStore` |
| Interface / Type | PascalCase | `Product`, `OrderStatus` |
| Route paths | kebab-case | `/sales-orders`, `/master/products` |
| Database kolom | snake_case | `created_at`, `total_amount` |

---

## 24. Pola: Bahasa dalam Kode

- **UI labels:** Bahasa lokal (Indonesia, English, dll.)
- **Kode:** Bahasa Inggris — nama variabel, fungsi, interface, enum values
- **Pesan commit:** Bahasa Inggris atau Indonesia, konsisten

Contoh:
```tsx
// ✅ Benar — kode Inggris, UI Indonesia
<Button>Simpan Data</Button>
const totalPrice = quantity * unitPrice

// ❌ Hindari — campur
<Button>Save Data</Button>  // kalau UI-nya bahasa Indonesia
const totalHarga = qty * hargaSatuan  // kode campur bahasa
```

---

## 25. Pattern: API Client Singleton

```ts
import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_API_URL as string
const key = import.meta.env.VITE_API_KEY as string

export const client = createClient(url, key)
```

- Client diinisialisasi sekali, diexport sebagai singleton
- Environment variables: prefiks `VITE_` untuk exposure ke client-side
- Tidak ada abstraction layer di atas client — store query langsung

---

## 26. Pattern: Generated/Computed Columns

Kolom yang dihitung otomatis (di database atau backend) tidak dikirim saat update:

```ts
// Cara 1 — destruktur dan hapus
const { id: _, created_at, updated_at, computed_field, ...payload } = data as any
await client.from('table').update(payload).eq('id', id)

// Cara 2 — strip function untuk store dengan banyak generated cols
const GENERATED = ['total', 'tax_amount', 'grand_total']

function stripMeta(data: any) {
  const copy = { ...data }
  for (const col of [...GENERATED, 'id', 'created_at', 'updated_at']) {
    delete copy[col]
  }
  return copy
}
```

---

## 27. Pattern: File Upload — Base64 untuk Skala Kecil

Untuk volume kecil (<100 file), base64 data URL langsung di database mencukupi:

```ts
const toBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })

const dataUrl = await toBase64(file)
await client.from('attachments').insert({ record_id: id, data: dataUrl })
```

Untuk skala besar, gunakan object storage (S3/R2) dan simpan URL-nya.

---

## 28. Pattern: Data Transform — DB ke View Model

Transformasi data dari format DB ke format rendering dilakukan di satu tempat:

```ts
// Di store atau utility function, BUKAN inline di komponen
function toViewModel(record: DBRecord, related: RelatedData[]): ViewModel {
  return {
    id: record.id,
    name: record.name,
    statusLabel: STATUS_MAP[record.status]?.label ?? record.status,
    totalFormatted: formatCurrency(record.total),
    relatedCount: related.length,
  }
}
```

Jangan lakukan transformasi ini inline di JSX komponen.

---

## 29. Pattern: Page Component Structure

Setiap halaman mengikuti urutan ini:

1. **Import** — grouping: React → router → components → stores → utils → icons
2. **Konstanta lokal** (jika ada)
3. **Komponen utama** (default export):
   - `useState` — local UI state
   - Store hooks — `const { data, fetch } = useXxxStore()`
   - `useEffect` — data fetching (mount + location.key)
   - `useMemo` — computed/derived values
   - Return JSX: judul + deskripsi → stat cards → tabel/chart → detail sections
4. **Komponen pembantu** di bawahnya (di file yang sama, tidak diexport)

---

## 30. Ringkasan Filosofi

| Prinsip | Manifestasi |
|---------|-------------|
| **Satu file, satu tanggung jawab** | Page = 1 file, store = 1 file, util = 1 file |
| **Data di client** | Fetch semua → aggregate di client via useMemo |
| **Simplicity over abstraction** | Tanpa custom fetch hooks, tanpa cache layer, tanpa DI container |
| **Konvensi konsisten** | Semua store ikut template yang sama, semua form ikut pola yang sama |
| **Komponen kecil, composable** | Card, Badge, SlideOver, ConfirmDialog — tiap komponen satu concern |
| **Tailwind langsung** | Styling di className, hindari `@apply` kecuali untuk repeating pattern kompleks |
| **Warna semantik** | Hijau = baik, oranye = warning, merah = masalah — konsisten di seluruh app |
| **Client-state = server-state** | Tidak ada normalisasi ulang; data dari API langsung jadi state |
