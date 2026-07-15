import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronsUpDown, Search, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface SearchableOption {
  value: string
  label: string
  /** Teks tambahan untuk pencarian (kode, mitra, dll.) */
  searchText?: string
  /** Label sekunder di bawah baris utama */
  description?: string
  disabled?: boolean
}

interface SearchableSelectProps {
  options: SearchableOption[]
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  className?: string
  /** Izinkan clear ke value kosong */
  allowClear?: boolean
  clearLabel?: string
  /** Value yang mewakili "kosong" jika allowClear (default '') */
  emptyValue?: string
}

function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

export function SearchableSelect({
  options,
  value = '',
  onValueChange,
  placeholder = 'Pilih...',
  searchPlaceholder = 'Cari kata kunci...',
  emptyText = 'Tidak ada hasil',
  disabled = false,
  className,
  allowClear = false,
  clearLabel = '— Kosongkan —',
  emptyValue = '',
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = useMemo(
    () => options.find(o => o.value === value),
    [options, value],
  )

  const filtered = useMemo(() => {
    const q = normalize(query.trim())
    if (!q) return options
    return options.filter(o => {
      const hay = normalize(`${o.label} ${o.searchText ?? ''} ${o.description ?? ''} ${o.value}`)
      return q.split(/\s+/).every(token => hay.includes(token))
    })
  }, [options, query])

  useEffect(() => {
    if (open) {
      setQuery('')
      // Fokus ke search setelah popover terbuka
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const pick = (v: string) => {
    onValueChange(v)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className={cn(
            'flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
            'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            !selected && 'text-muted-foreground',
            className,
          )}
          aria-expanded={open}
        >
          <span className="truncate text-left flex-1">
            {selected?.label ?? placeholder}
          </span>
          <span className="flex items-center gap-1 shrink-0 ml-2 text-muted-foreground">
            {allowClear && value && value !== emptyValue && !disabled && (
              <span
                role="button"
                tabIndex={-1}
                className="rounded p-0.5 hover:bg-muted hover:text-foreground"
                onClick={e => {
                  e.preventDefault()
                  e.stopPropagation()
                  onValueChange(emptyValue)
                }}
                title="Hapus pilihan"
              >
                <X size={14} />
              </span>
            )}
            <ChevronsUpDown size={14} className="opacity-50" />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] min-w-[240px] max-w-[420px] p-0"
        align="start"
        onOpenAutoFocus={e => e.preventDefault()}
      >
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <Search size={14} className="text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={searchPlaceholder}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => setQuery('')}
            >
              <X size={14} />
            </button>
          )}
        </div>
        <div className="max-h-60 overflow-y-auto py-1">
          {allowClear && (
            <button
              type="button"
              className={cn(
                'flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-accent',
                (!value || value === emptyValue) && 'bg-accent/50',
              )}
              onClick={() => pick(emptyValue)}
            >
              <Check
                size={14}
                className={cn(
                  'shrink-0',
                  (!value || value === emptyValue) ? 'opacity-100' : 'opacity-0',
                )}
              />
              <span className="text-muted-foreground">{clearLabel}</span>
            </button>
          )}
          {filtered.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">{emptyText}</p>
          )}
          {filtered.map(opt => {
            const isSelected = opt.value === value
            return (
              <button
                key={opt.value}
                type="button"
                disabled={opt.disabled}
                className={cn(
                  'flex w-full items-start gap-2 px-3 py-2 text-sm text-left hover:bg-accent disabled:opacity-50',
                  isSelected && 'bg-accent/60',
                )}
                onClick={() => pick(opt.value)}
              >
                <Check
                  size={14}
                  className={cn('mt-0.5 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{opt.label}</span>
                  {opt.description && (
                    <span className="block text-[11px] text-muted-foreground truncate">
                      {opt.description}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
        {options.length > 8 && (
          <div className="border-t px-3 py-1.5 text-[10px] text-muted-foreground">
            {filtered.length} / {options.length} opsi
            {query ? ' (hasil pencarian)' : ''}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
