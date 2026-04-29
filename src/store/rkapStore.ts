import { create } from 'zustand'
import { supabase } from '@/lib/supabase'
import { RKAPItem } from '@/data/rkap2026'

export const BULAN_COLS = ['jan','feb','mar','apr','mei','jun','jul','agu','sep','okt','nov','des'] as const
export type BulanCol = typeof BULAN_COLS[number]

export interface RKAPTargetRow {
  id: string
  tahun: number
  no: number
  kode?: string
  nama: string
  total: number
  jan: number; feb: number; mar: number; apr: number
  mei: number; jun: number; jul: number; agu: number
  sep: number; okt: number; nov: number; des: number
  created_at?: string
}

export function rowToRKAPItem(row: RKAPTargetRow): RKAPItem {
  return {
    no: row.no,
    kode: row.kode ?? '',
    nama: row.nama,
    total: row.total,
    bulan: BULAN_COLS.map(col => row[col] ?? 0),
  }
}

// Data RKAP 2026 — dipakai hanya untuk auto-seed pertama kali jika DB kosong
const k = 1_000
const RKAP_2026_SEED = [
  { no:  1, kode:'R800027-0015', nama:'Aset Pabrik Gula (Non Spinoff SGN)',       total:4523144*k, jan:0,       feb:0,       mar:0,       apr:0,       mei:0,       jun:4523144*k, jul:0,        agu:0,       sep:0, okt:0, nov:0,        des:0        },
  { no:  2, kode:'R800038-0029', nama:'Lahan Takalar - Gapoktan',                 total:600000*k,  jan:0,       feb:0,       mar:0,       apr:0,       mei:0,       jun:0,         jul:0,        agu:0,       sep:0, okt:0, nov:0,        des:600000*k },
  { no:  3, kode:'R800009-0031', nama:'Lahan Tinanggea (Stockpile)',               total:406000*k,  jan:0,       feb:0,       mar:0,       apr:0,       mei:0,       jun:0,         jul:0,        agu:0,       sep:0, okt:0, nov:0,        des:406000*k },
  { no:  4, kode:'R800031-0026', nama:'Lahan Tinanggea (Jalan Tambang)',           total:0,         jan:0,       feb:0,       mar:0,       apr:0,       mei:0,       jun:0,         jul:0,        agu:0,       sep:0, okt:0, nov:0,        des:0        },
  { no:  5, kode:'R800001-0002', nama:'Bangunan Jalan Boulevard Makassar',         total:585000*k,  jan:0,       feb:0,       mar:0,       apr:0,       mei:0,       jun:0,         jul:585000*k, agu:0,       sep:0, okt:0, nov:0,        des:0        },
  { no:  6, kode:'R800021-0016', nama:'Lahan Sidrap',                             total:300000*k,  jan:0,       feb:0,       mar:0,       apr:0,       mei:0,       jun:0,         jul:0,        agu:0,       sep:0, okt:0, nov:300000*k, des:0        },
  { no:  7, kode:'R800011-0017', nama:'Lahan Jalan Alauddin Makassar',             total:275000*k,  jan:0,       feb:0,       mar:0,       apr:0,       mei:0,       jun:0,         jul:0,        agu:0,       sep:0, okt:0, nov:275000*k, des:0        },
  { no:  8, kode:'R800012-0018', nama:'Lahan Kebun Marinsow',                      total:275000*k,  jan:0,       feb:0,       mar:0,       apr:0,       mei:0,       jun:0,         jul:0,        agu:0,       sep:0, okt:0, nov:275000*k, des:0        },
  { no:  9, kode:'R800013-0019', nama:'Lahan Jl Masjid Raya & Kangkung',          total:294000*k,  jan:0,       feb:0,       mar:0,       apr:0,       mei:0,       jun:147000*k,  jul:0,        agu:0,       sep:0, okt:0, nov:0,        des:147000*k },
  { no: 10, kode:'R800002-0032', nama:'Bangunan Jl Slamet Riyadi Makassar',        total:395800*k,  jan:0,       feb:0,       mar:0,       apr:0,       mei:0,       jun:0,         jul:0,        agu:0,       sep:0, okt:0, nov:395800*k, des:0        },
  { no: 11, kode:'R800014-0020', nama:'Lahan Jalan Biru Bone',                     total:108000*k,  jan:0,       feb:0,       mar:0,       apr:0,       mei:0,       jun:0,         jul:0,        agu:0,       sep:0, okt:0, nov:108000*k, des:0        },
  { no: 12, kode:'R800015-0012', nama:'Bangunan Mess Jl Masjid Raya',              total:370000*k,  jan:0,       feb:0,       mar:0,       apr:0,       mei:0,       jun:0,         jul:0,        agu:0,       sep:0, okt:0, nov:370000*k, des:0        },
  { no: 13, kode:'R800039-0033', nama:'Lahan Desa Galung',                         total:100000*k,  jan:0,       feb:0,       mar:0,       apr:0,       mei:0,       jun:0,         jul:0,        agu:0,       sep:0, okt:0, nov:100000*k, des:0        },
  { no: 14, kode:'R800019-0023', nama:'Lahan Jl Kemakmuran & Samudra Soppeng',     total:50000*k,   jan:0,       feb:0,       mar:0,       apr:0,       mei:0,       jun:0,         jul:0,        agu:0,       sep:0, okt:0, nov:50000*k,  des:0        },
  { no: 15, kode:'R800003-0004', nama:'Bangunan Ruko Jl Pengayoman',               total:90000*k,   jan:7500*k,  feb:7500*k,  mar:7500*k,  apr:7500*k,  mei:7500*k,  jun:7500*k,    jul:7500*k,   agu:7500*k,  sep:7500*k, okt:7500*k, nov:7500*k, des:7500*k },
  { no: 16, kode:'R800017-0025', nama:'Bangunan Eks LO Ambon',                     total:75000*k,   jan:0,       feb:0,       mar:0,       apr:0,       mei:0,       jun:0,         jul:0,        agu:0,       sep:0, okt:0, nov:75000*k,  des:0        },
  { no: 17, kode:'R800006-0007', nama:'Lahan Eks Pabrik Kapas (Mini Soccer)',       total:25500*k,   jan:0,       feb:0,       mar:0,       apr:0,       mei:0,       jun:0,         jul:0,        agu:0,       sep:0, okt:0, nov:25500*k,  des:0        },
  { no: 18, kode:'R800033-0028', nama:'Lahan Eks Pabrik Kapas (Studio Foto)',       total:14500*k,   jan:0,       feb:7250*k,  mar:0,       apr:0,       mei:0,       jun:0,         jul:0,        agu:7250*k,  sep:0, okt:0, nov:0,        des:0        },
  { no: 19, kode:'R800010-0010', nama:'Lahan Eks Pabrik Kapas (Papan Iklan)',       total:2100*k,    jan:0,       feb:2100*k,  mar:0,       apr:0,       mei:0,       jun:0,         jul:0,        agu:0,       sep:0, okt:0, nov:0,        des:0        },
  { no: 20, kode:'R800004-0005', nama:'Bangunan Kantor Direksi - Gedung Timur',    total:47000*k,   jan:0,       feb:0,       mar:0,       apr:0,       mei:0,       jun:0,         jul:0,        agu:0,       sep:0, okt:0, nov:47000*k,  des:0        },
  { no: 21, kode:'R800032-0027', nama:'Bangunan Kantor Direksi - Pelayanan 13',    total:24000*k,   jan:0,       feb:0,       mar:0,       apr:0,       mei:0,       jun:0,         jul:24000*k,  agu:0,       sep:0, okt:0, nov:0,        des:0        },
  { no: 22, kode:'R800005-0006', nama:'Bangunan Jalan Bambapuang Makassar',        total:27000*k,   jan:0,       feb:27000*k, mar:0,       apr:0,       mei:0,       jun:0,         jul:0,        agu:0,       sep:0, okt:0, nov:0,        des:0        },
  { no: 23, kode:'R800007-0008', nama:'Lahan Unit Kabaru',                         total:259091*k,  jan:0,       feb:0,       mar:0,       apr:0,       mei:0,       jun:0,         jul:0,        agu:0,       sep:0, okt:0, nov:259091*k, des:0        },
]

interface RKAPStore {
  rows: RKAPTargetRow[]
  tahunAktif: number
  isLoading: boolean
  fetchRKAP: (tahun: number) => Promise<void>
  upsertRow: (data: Omit<RKAPTargetRow, 'id' | 'created_at'>) => Promise<void>
  deleteRow: (id: string, tahun: number) => Promise<void>
  bulkImport: (tahun: number, items: Array<Omit<RKAPTargetRow, 'id' | 'created_at'>>) => Promise<void>
  setTahunAktif: (tahun: number) => void
}

export const useRKAPStore = create<RKAPStore>((set, get) => ({
  rows: [],
  tahunAktif: new Date().getFullYear(),
  isLoading: false,

  fetchRKAP: async (tahun) => {
    set({ isLoading: true })
    const { data, error } = await supabase
      .from('rkap_target')
      .select('*')
      .eq('tahun', tahun)
      .order('no', { ascending: true })
    if (error) console.error('[fetchRKAP]', error)

    if (data && data.length === 0 && tahun === 2026) {
      // Auto-seed data 2026 pertama kali jika DB masih kosong
      const seedRows = RKAP_2026_SEED.map(r => ({
        ...r, tahun: 2026, updated_at: new Date().toISOString(),
      }))
      const { error: seedErr } = await supabase.from('rkap_target').insert(seedRows)
      if (seedErr) console.error('[fetchRKAP seed]', seedErr)
      const { data: seeded } = await supabase
        .from('rkap_target').select('*').eq('tahun', 2026).order('no', { ascending: true })
      if (seeded) set({ rows: seeded as RKAPTargetRow[], tahunAktif: tahun })
    } else if (data) {
      set({ rows: data as RKAPTargetRow[], tahunAktif: tahun })
    }
    set({ isLoading: false })
  },

  upsertRow: async (data) => {
    const payload = data as any
    if (payload.id) {
      const { id, ...rest } = payload
      const { error } = await supabase
        .from('rkap_target')
        .update({ ...rest, updated_at: new Date().toISOString() })
        .eq('id', id)
      if (error) console.error('[updateRow]', error)
    } else {
      const { error } = await supabase
        .from('rkap_target')
        .upsert({ ...payload, updated_at: new Date().toISOString() }, { onConflict: 'tahun,no' })
      if (error) console.error('[insertRow]', error)
    }
    await get().fetchRKAP(payload.tahun)
  },

  deleteRow: async (id, tahun) => {
    await supabase.from('rkap_target').delete().eq('id', id)
    await get().fetchRKAP(tahun)
  },

  bulkImport: async (tahun, items) => {
    set({ isLoading: true })
    await supabase.from('rkap_target').delete().eq('tahun', tahun)
    if (items.length > 0) {
      const { error } = await supabase.from('rkap_target').insert(
        items.map(r => ({ ...r, tahun, updated_at: new Date().toISOString() }))
      )
      if (error) console.error('[bulkImport]', error)
    }
    await get().fetchRKAP(tahun)
  },

  setTahunAktif: (tahun) => set({ tahunAktif: tahun }),
}))
