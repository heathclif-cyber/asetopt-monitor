import { formatRupiah } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface CurrencyDisplayProps {
  value: number | null | undefined
  className?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

export function CurrencyDisplay({ value, className, size = 'md' }: CurrencyDisplayProps) {
  const sizeClass = {
    sm: 'text-sm',
    md: 'text-base',
    lg: 'text-xl font-semibold',
    xl: 'text-2xl font-bold',
  }[size]

  return (
    <span className={cn(sizeClass, className)}>{formatRupiah(value)}</span>
  )
}
