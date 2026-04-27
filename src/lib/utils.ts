import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRupiah(value: number | null | undefined): string {
  if (value == null) return 'Rp 0'
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatTanggal(dateStr: string | null | undefined): string {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function formatAngka(value: number | null | undefined): string {
  if (value == null) return '0'
  return new Intl.NumberFormat('id-ID').format(value)
}

export function hitungSisaHari(tglSelesai: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const selesai = new Date(tglSelesai)
  selesai.setHours(0, 0, 0, 0)
  return Math.ceil((selesai.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
}
