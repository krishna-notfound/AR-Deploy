// Chart components. Palette validated with the dataviz validator (light mode):
// views #2E8B6A, AR #D07A1F — lightness, chroma, CVD (ΔE 8.7), normal-vision and contrast all PASS.
// Views and AR activations have different magnitudes, so they are drawn as two small
// multiples sharing the x-axis, never on a dual axis.
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DailyPoint } from '@/domain/types'
import { formatCompact, formatNumber } from '@/lib/format'

export const SERIES = {
  views: { color: '#2E8B6A', label: 'Product views' },
  ar: { color: '#D07A1F', label: 'AR activations' },
} as const

const AXIS = { stroke: '#cfccc5', fontSize: 11, tick: { fill: '#6e6a63' } }

function shortDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

interface TooltipPayload {
  value?: number | string
  payload?: DailyPoint
}

function TrendTooltip({ active, payload, label, seriesLabel }: { active?: boolean; payload?: readonly TooltipPayload[]; label?: string; seriesLabel: string }) {
  if (!active || !payload?.length || !label) return null
  return (
    <div className="rounded-lg bg-surface px-3 py-2 text-xs shadow-[var(--shadow-pop)]">
      <p className="text-ink-muted">{shortDate(label)}</p>
      <p className="mt-0.5 font-medium text-ink tabular-nums">
        {formatNumber(Number(payload[0]?.value ?? 0))} {seriesLabel.toLowerCase()}
      </p>
    </div>
  )
}

/** One series over time. Crosshair + tooltip on hover. */
export function TrendChart({ data, series, height = 160 }: { data: DailyPoint[]; series: keyof typeof SERIES; height?: number }) {
  const s = SERIES[series]
  const key = series === 'views' ? 'views' : 'arActivations'
  const gradId = `grad-${series}`
  return (
    <div style={{ height }} role="img" aria-label={`${s.label}, last 30 days`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity={0.16} />
              <stop offset="100%" stopColor={s.color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="#efede8" />
          <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={28} tickLine={false} axisLine={false} {...AXIS} />
          <YAxis tickFormatter={(v: number) => formatCompact(v)} tickLine={false} axisLine={false} width={44} allowDecimals={false} {...AXIS} />
          <Tooltip
            cursor={{ stroke: '#9a958c', strokeWidth: 1, strokeDasharray: '3 3' }}
            content={(props) => <TrendTooltip active={props.active} payload={props.payload as readonly TooltipPayload[] | undefined} label={props.label as string | undefined} seriesLabel={s.label} />}
          />
          <Area
            type="monotone"
            dataKey={key}
            stroke={s.color}
            strokeWidth={2}
            fill={`url(#${gradId})`}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: '#ffffff', fill: s.color }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export interface BarDatum {
  label: string
  value: number
}

/** Horizontal bars for comparing magnitude across a few named items. */
export function HorizontalBars({ data, series, valueLabel }: { data: BarDatum[]; series: keyof typeof SERIES; valueLabel: string }) {
  const s = SERIES[series]
  const height = Math.max(120, data.length * 44 + 24)
  return (
    <div style={{ height }} role="img" aria-label={`${valueLabel} by business`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 48, bottom: 0, left: 0 }} barCategoryGap={10}>
          <XAxis type="number" hide />
          <YAxis type="category" dataKey="label" width={150} tickLine={false} axisLine={false} {...AXIS} tick={{ fill: '#23221f', fontSize: 12 }} />
          <Tooltip
            cursor={{ fill: '#efede8' }}
            content={(props) => {
              const p = props.payload?.[0] as { value?: number; payload?: BarDatum } | undefined
              if (!props.active || !p?.payload) return null
              return (
                <div className="rounded-lg bg-surface px-3 py-2 text-xs shadow-[var(--shadow-pop)]">
                  <p className="text-ink-muted">{p.payload.label}</p>
                  <p className="mt-0.5 font-medium text-ink tabular-nums">
                    {formatNumber(p.payload.value)} {valueLabel.toLowerCase()}
                  </p>
                </div>
              )
            }}
          />
          <Bar
            dataKey="value"
            fill={s.color}
            radius={[0, 4, 4, 0]}
            maxBarSize={22}
            isAnimationActive={false}
            label={{ position: 'right', fill: '#6e6a63', fontSize: 11, formatter: (v: unknown) => formatCompact(Number(v)) }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Accessible table alternative for a daily series. */
export function SeriesTable({ data }: { data: DailyPoint[] }) {
  return (
    <div className="max-h-64 overflow-auto rounded-lg border border-line">
      <table className="w-full text-xs">
        <caption className="sr-only">Daily product views and AR activations</caption>
        <thead className="sticky top-0 bg-surface">
          <tr className="text-left text-ink-muted">
            <th scope="col" className="px-3 py-2 font-medium">
              Date
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Views
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              AR activations
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line tabular-nums">
          {[...data].reverse().map((d) => (
            <tr key={d.date}>
              <td className="px-3 py-1.5">{shortDate(d.date)}</td>
              <td className="px-3 py-1.5 text-right">{formatNumber(d.views)}</td>
              <td className="px-3 py-1.5 text-right">{formatNumber(d.arActivations)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
