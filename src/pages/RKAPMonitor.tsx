import { useEffect, useMemo } from 'react'
import { useKompensasiStore } from '@/store/kompensasiStore'
import { RKAP_2026, BULAN_LABELS, TOTAL_TARGET_2026 } from '@/data/rkap2026'
import { hitungRKAP, getCashInPerBulan2026 } from '@/utils/rkapUtils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CurrencyDisplay } from '@/components/common/CurrencyDisplay'
import { formatRupiah } from '@/lib/utils'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts'
import { Target, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'

const CURRENT_MONTH = new Date().getMonth() // 0-indexed

function pctColor(pct: number) {
  if (pct >= 100) return 'text-green-700'
  if (pct >= 80) return 'text-yellow-600'
  return 'text-red-600'
}

export function RKAPMonitor() {
  const { allKompensasi, fetchAllKompensasi } = useKompensasiStore()

  useEffect(() => { fetchAllKompensasi() }, [])

  const cashInPerBulan = useMemo(() => getCashInPerBulan2026(allKompensasi), [allKompensasi])
  const rkapData = useMemo(() => hitungRKAP(cashInPerBulan), [cashInPerBulan])

  const ytdTargetOri = rkapData
    .slice(0, CURRENT_MONTH + 1)
    .reduce((s, m) => s + m.targetOriginal, 0)

  const ytdRealisasi = cashInPerBulan
    .slice(0, CURRENT_MONTH + 1)
    .reduce((s, v) => s + v, 0)

  const ytdAchievement = ytdTargetOri > 0 ? (ytdRealisasi / ytdTargetOri) * 100 : 0

  const currentMonthData = rkapData[CURRENT_MONTH]

  const chartData = rkapData.map(m => ({
    bulan: m.label,
    'Target Adj': Math.round(m.targetAdjusted / 1_000_000),
    'Realisasi': Math.round(m.realisasi / 1_000_000),
  }))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-bold text-gray-900">RKAP Monitor 2026</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Target RKAP vs Realisasi Penerimaan — defisit bulan lalu otomatis masuk ke bulan berikutnya
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] text-gray-500 font-medium">Total Target 2026</p>
                <CurrencyDisplay value={TOTAL_TARGET_2026} size="lg" className="text-[#1B4F72] mt-1 block" />
              </div>
              <Target size={18} className="text-[#1B4F72] mt-0.5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] text-gray-500 font-medium">YTD Target (s.d. {BULAN_LABELS[CURRENT_MONTH]})</p>
                <CurrencyDisplay value={ytdTargetOri} size="lg" className="text-gray-800 mt-1 block" />
              </div>
              <Target size={18} className="text-gray-500 mt-0.5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] text-gray-500 font-medium">YTD Realisasi</p>
                <CurrencyDisplay value={ytdRealisasi} size="lg" className="text-[#117A65] mt-1 block" />
              </div>
              <TrendingUp size={18} className="text-[#117A65] mt-0.5" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] text-gray-500 font-medium">Achievement YTD</p>
                <p className={cn('text-2xl font-bold mt-1', pctColor(ytdAchievement))}>
                  {ytdAchievement.toFixed(1)}%
                </p>
              </div>
              {ytdAchievement >= 100
                ? <CheckCircle size={18} className="text-green-600 mt-0.5" />
                : <AlertTriangle size={18} className="text-red-500 mt-0.5" />
              }
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Carry-over alert bulan ini */}
      {currentMonthData.carryOver > 0 && (
        <div className="flex items-start gap-3 bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 text-sm">
          <AlertTriangle size={16} className="text-orange-500 mt-0.5 flex-shrink-0" />
          <div>
            <span className="font-semibold text-orange-800">Carry-over aktif: </span>
            <span className="text-orange-700">
              Defisit {formatRupiah(currentMonthData.carryOver)} dari {BULAN_LABELS[CURRENT_MONTH - 1] ?? 'bulan lalu'} ditambahkan ke target {BULAN_LABELS[CURRENT_MONTH]}.
              Target bulan ini menjadi {formatRupiah(currentMonthData.targetAdjusted)}.
            </span>
          </div>
        </div>
      )}

      {/* Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Target (+ Carry-over) vs Realisasi per Bulan (Juta Rp)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="bulan" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}jt`} />
              <Tooltip formatter={(v: number) => `Rp ${v.toLocaleString('id-ID')}jt`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Target Adj" fill="#94a3b8" radius={[4,4,0,0]} />
              <Bar dataKey="Realisasi" fill="#117A65" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Tabel bulanan dengan carry-over */}
      <Card>
        <CardHeader>
          <CardTitle>Rincian Bulanan + Carry-over</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="px-3 py-2 text-left font-semibold text-gray-600">Bulan</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600">Target Ori</th>
                  <th className="px-3 py-2 text-right font-semibold text-orange-600">Carry-over</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-800">Target Adj</th>
                  <th className="px-3 py-2 text-right font-semibold text-green-700">Realisasi</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600">Selisih</th>
                  <th className="px-3 py-2 text-right font-semibold text-gray-600">%</th>
                </tr>
              </thead>
              <tbody>
                {rkapData.map((m, i) => {
                  const isFuture = i > CURRENT_MONTH
                  return (
                    <tr key={i} className={cn('border-b', isFuture ? 'text-gray-400' : '', i === CURRENT_MONTH ? 'bg-blue-50/50' : 'hover:bg-gray-50/60')}>
                      <td className="px-3 py-2 font-semibold">
                        {m.label}
                        {i === CURRENT_MONTH && <span className="ml-1.5 text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">Sekarang</span>}
                      </td>
                      <td className="px-3 py-2 text-right">{m.targetOriginal > 0 ? formatRupiah(m.targetOriginal) : '-'}</td>
                      <td className="px-3 py-2 text-right text-orange-600 font-medium">
                        {m.carryOver > 0 ? `+${formatRupiah(m.carryOver)}` : '-'}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">{m.targetAdjusted > 0 ? formatRupiah(m.targetAdjusted) : '-'}</td>
                      <td className="px-3 py-2 text-right text-green-700">{m.realisasi > 0 ? formatRupiah(m.realisasi) : '-'}</td>
                      <td className={cn('px-3 py-2 text-right font-semibold', m.selisih >= 0 ? 'text-green-700' : 'text-red-600')}>
                        {m.targetAdjusted === 0 && m.realisasi === 0 ? '-' : (m.selisih >= 0 ? '+' : '') + formatRupiah(m.selisih)}
                      </td>
                      <td className={cn('px-3 py-2 text-right font-bold', isFuture ? 'text-gray-400' : pctColor(m.achievement))}>
                        {m.targetAdjusted > 0 ? `${m.achievement.toFixed(0)}%` : '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-gray-50 font-semibold">
                  <td className="px-3 py-2 text-gray-800">Total 2026</td>
                  <td className="px-3 py-2 text-right">{formatRupiah(TOTAL_TARGET_2026)}</td>
                  <td className="px-3 py-2 text-right text-orange-600">—</td>
                  <td className="px-3 py-2 text-right">{formatRupiah(TOTAL_TARGET_2026)}</td>
                  <td className="px-3 py-2 text-right text-green-700">{formatRupiah(cashInPerBulan.reduce((s, v) => s + v, 0))}</td>
                  <td className="px-3 py-2 text-right"></td>
                  <td className="px-3 py-2 text-right"></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Tabel per obyek */}
      <Card>
        <CardHeader>
          <CardTitle>Target per Obyek Kerjasama 2026 (Juta Rp)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="text-xs" style={{ minWidth: 900 }}>
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="px-2 py-2 text-left font-semibold text-gray-500 w-8">No</th>
                  <th className="px-2 py-2 text-left font-semibold text-gray-600 min-w-[200px]">Obyek Kerjasama</th>
                  {BULAN_LABELS.map(b => (
                    <th key={b} className="px-2 py-2 text-right font-semibold text-gray-600 w-16">{b}</th>
                  ))}
                  <th className="px-2 py-2 text-right font-semibold text-[#1B4F72] w-20">Total</th>
                </tr>
              </thead>
              <tbody>
                {RKAP_2026.map(item => (
                  <tr key={item.no} className="border-b hover:bg-gray-50/60">
                    <td className="px-2 py-1.5 text-gray-400">{item.no}</td>
                    <td className="px-2 py-1.5 text-gray-700 font-medium">{item.nama}</td>
                    {item.bulan.map((v, i) => (
                      <td key={i} className={cn('px-2 py-1.5 text-right', v > 0 ? 'text-gray-700' : 'text-gray-300')}>
                        {v > 0 ? (v / 1_000_000).toFixed(2) : '—'}
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-right font-semibold text-[#1B4F72]">
                      {item.total > 0 ? (item.total / 1_000_000).toFixed(2) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-gray-50 font-bold">
                  <td></td>
                  <td className="px-2 py-2 text-gray-800">TOTAL</td>
                  {BULAN_LABELS.map((_, i) => {
                    const tot = RKAP_2026.reduce((s, r) => s + r.bulan[i], 0)
                    return (
                      <td key={i} className={cn('px-2 py-2 text-right', tot > 0 ? 'text-[#1B4F72]' : 'text-gray-300')}>
                        {tot > 0 ? (tot / 1_000_000).toFixed(2) : '—'}
                      </td>
                    )
                  })}
                  <td className="px-2 py-2 text-right text-[#1B4F72]">
                    {(TOTAL_TARGET_2026 / 1_000_000).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
