// Chart components in the Sanctus palette (ADR-0023): views in obsidian #1D1C1A, AR launch attempts in bronze #8A765C.
// The two differ strongly in lightness, so they stay apart for colour-blind readers too; each chart also has a text
// label and a table view, so colour is never the only cue.
// Views and AR launch attempts have different magnitudes, so they are drawn as two small
// multiples sharing the x-axis, never on a dual axis.
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DailyPoint } from '@/domain/types'
import { formatCompact, formatNumber } from '@/lib/format'

export const SERIES = {
  views: { color: '#1D1C1A', label: 'Product views' },
  ar: { color: '#8A765C', label: 'AR launch attempts' },
} as const

const AXIS = { stroke: '#d9d3c7', fontSize: 11, tick: { fill: '#6e6559' } }

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
    <div className="rounded-[var(--radius-control)] bg-surface px-3 py-2 text-xs shadow-[var(--shadow-pop)]">
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
  return (
    <div style={{ height }} role="img" aria-label={`${s.label}, last 30 days`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke="#ece7dd" strokeDasharray="2 4" />
          <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={28} tickLine={false} axisLine={false} {...AXIS} />
          <YAxis tickFormatter={(v: number) => formatCompact(v)} tickLine={false} axisLine={false} width={44} allowDecimals={false} {...AXIS} />
          <Tooltip
            cursor={{ stroke: '#8a8073', strokeWidth: 1, strokeDasharray: '3 3' }}
            content={(props) => <TrendTooltip active={props.active} payload={props.payload as readonly TooltipPayload[] | undefined} label={props.label as string | undefined} seriesLabel={s.label} />}
          />
          <Area
            type="monotone"
            dataKey={key}
            stroke={s.color}
            strokeWidth={1.5}
            fill={s.color}
            fillOpacity={0.05}
            dot={false}
            activeDot={{ r: 3.5, strokeWidth: 2, stroke: '#faf8f3', fill: s.color }}
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
          <YAxis type="category" dataKey="label" width={150} tickLine={false} axisLine={false} {...AXIS} tick={{ fill: '#1d1c1a', fontSize: 12 }} />
          <Tooltip
            cursor={{ fill: '#ece7dd' }}
            content={(props) => {
              const p = props.payload?.[0] as { value?: number; payload?: BarDatum } | undefined
              if (!props.active || !p?.payload) return null
              return (
                <div className="rounded-[var(--radius-control)] bg-surface px-3 py-2 text-xs shadow-[var(--shadow-pop)]">
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
            radius={[0, 1, 1, 0]}
            maxBarSize={22}
            isAnimationActive={false}
            label={{ position: 'right', fill: '#5a5148', fontSize: 11, formatter: (v: unknown) => formatCompact(Number(v)) }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Accessible table alternative for a daily series. */
export function SeriesTable({ data }: { data: DailyPoint[] }) {
  return (
    <div className="max-h-64 overflow-auto rounded-[var(--radius-control)] border border-line">
      <table className="w-full text-xs">
        <caption className="sr-only">Daily product views and AR launch attempts</caption>
        <thead className="sticky top-0 bg-surface">
          <tr className="text-left text-[10.5px] tracking-[0.14em] text-ink-muted uppercase">
            <th scope="col" className="px-3 py-2 font-medium">
              Date
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Views
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              AR launch attempts
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
