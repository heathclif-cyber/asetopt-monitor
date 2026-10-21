import { create } from 'zustand'
import { api } from '@/lib/apiClient'
import type { ReportConfig } from '@/utils/reportBuilder'

export interface ReportFormat {
  id: string
  nama: string
  dataset: 'tagihan'
  config: Partial<ReportConfig>
  is_shared: boolean
  owner_username: string
  mine: boolean
  updated_at: string
}

interface ReportFormatStore {
  formats: ReportFormat[]
  isLoading: boolean
  fetchFormats: () => Promise<void>
  saveFormat: (input: { id?: string; nama: string; config: ReportConfig; is_shared: boolean }) => Promise<ReportFormat>
  deleteFormat: (id: string) => Promise<void>
}

export const useReportFormatStore = create<ReportFormatStore>((set, get) => ({
  formats: [],
  isLoading: false,

  fetchFormats: async () => {
    set({ isLoading: true })
    try {
      set({ formats: await api.get<ReportFormat[]>('/api/report-formats') })
    } catch (error) {
      console.error('[reportFormatStore] fetchFormats', error)
    } finally {
      set({ isLoading: false })
    }
  },

  saveFormat: async ({ id, nama, config, is_shared }) => {
    const body = { nama, dataset: 'tagihan', config, is_shared }
    const saved = id
      ? await api.patch<ReportFormat>(`/api/report-formats/${id}`, body)
      : await api.post<ReportFormat>('/api/report-formats', body)
    await get().fetchFormats()
    return saved
  },

  deleteFormat: async (id) => {
    await api.delete(`/api/report-formats/${id}`)
    await get().fetchFormats()
  },
}))
