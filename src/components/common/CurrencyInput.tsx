import { forwardRef, useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'

interface CurrencyInputProps {
  value?: number
  onChange?: (value: number) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

export const CurrencyInput = forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ value, onChange, placeholder = '0', className, disabled }, ref) => {
    const [display, setDisplay] = useState('')

    useEffect(() => {
      if (value != null && value !== 0) {
        setDisplay(new Intl.NumberFormat('id-ID').format(value))
      } else if (value === 0) {
        setDisplay('')
      }
    }, [value])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value.replace(/\D/g, '')
      const num = raw ? parseInt(raw, 10) : 0
      setDisplay(raw ? new Intl.NumberFormat('id-ID').format(num) : '')
      onChange?.(num)
    }

    return (
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">Rp</span>
        <Input
          ref={ref}
          value={display}
          onChange={handleChange}
          placeholder={placeholder}
          className={`pl-9 ${className}`}
          disabled={disabled}
        />
      </div>
    )
  }
)
CurrencyInput.displayName = 'CurrencyInput'
