const SATUAN = ['', 'satu', 'dua', 'tiga', 'empat', 'lima', 'enam', 'tujuh', 'delapan', 'sembilan']
const BELASAN = [
  'sepuluh', 'sebelas', 'dua belas', 'tiga belas', 'empat belas', 'lima belas',
  'enam belas', 'tujuh belas', 'delapan belas', 'sembilan belas',
]

function ratusan(n: number): string {
  if (n < 10) return SATUAN[n]
  if (n < 20) return BELASAN[n - 10]
  if (n < 100) {
    const tens = Math.floor(n / 10)
    const ones = n % 10
    return `${SATUAN[tens]} puluh${ones ? ' ' + SATUAN[ones] : ''}`
  }
  const hundreds = Math.floor(n / 100)
  const rest = n % 100
  const prefix = hundreds === 1 ? 'seratus' : `${SATUAN[hundreds]} ratus`
  return `${prefix}${rest ? ' ' + ratusan(rest) : ''}`
}

export function terbilang(n: number): string {
  const rounded = Math.round(n)
  if (rounded === 0) return 'Nol rupiah'

  const triliun = Math.floor(rounded / 1_000_000_000_000)
  const miliar  = Math.floor((rounded % 1_000_000_000_000) / 1_000_000_000)
  const juta    = Math.floor((rounded % 1_000_000_000) / 1_000_000)
  const ribu    = Math.floor((rounded % 1_000_000) / 1_000)
  const sisa    = rounded % 1_000

  const parts: string[] = []
  if (triliun) parts.push(`${ratusan(triliun)} triliun`)
  if (miliar)  parts.push(`${ratusan(miliar)} miliar`)
  if (juta)    parts.push(`${ratusan(juta)} juta`)
  if (ribu)    parts.push(ribu === 1 ? 'seribu' : `${ratusan(ribu)} ribu`)
  if (sisa)    parts.push(ratusan(sisa))

  const words = parts.join(' ')
  return words.charAt(0).toUpperCase() + words.slice(1) + ' rupiah'
}
