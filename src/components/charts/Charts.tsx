// Chart components in the Sanctus palette (ADR-0023): views in obsidian #1D1C1A, AR launch attempts in bronze #8A765C.
// The two differ strongly in lightness, so they stay apart for colour-blind readers too; each chart also has a text
// label and a table view, so colour is never the only cue.
// Views and AR launch attempts have different magnitudes, so they never share a dual axis: the analytics page draws
// them as two small multiples, and the overview's combined chart lets people hide a series so the other rescales.
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { DailyPoint, Lang } from '@/domain/types'
import { useI18n } from '@/i18n/LanguageProvider'
import { localeOf } from '@/i18n/locale'
import { type DatePrefs, formatDate } from '@/lib/format'
import { useFormat } from '@/lib/useFormat'

export const SERIES = {
  // The views series counts product page views plus embed views (R-W5-3): its label says so.
  views: { color: '#1D1C1A', label: 'Page and embed views', labelKey: 'ui.chart.views' },
  ar: { color: '#8A765C', label: 'AR launch attempts', labelKey: 'ui.chart.ar' },
} as const

// Axis ticks follow the dashboard floor: 12px in the muted ink (#5A5148), never smaller.
const AXIS = { stroke: '#d9d3c7', fontSize: 12, tick: { fill: '#5a5148', fontSize: 12 } }

function shortDate(iso: string, lang: Lang) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString(localeOf(lang), { month: 'short', day: 'numeric' })
}

/**
 * A series day in the person's date format: `formatDate(iso, lang, prefs)`. The day is already a local date in their
 * zone (R-W5-2), and formatDate reads it as UTC midnight, so it is formatted in UTC to keep the same date.
 */
export function dayLabel(day: string, prefs?: DatePrefs, lang: Lang = 'en'): string {
  return prefs ? formatDate(day, lang, { ...prefs, timezone: 'UTC' }) : shortDate(day, lang)
}

interface TooltipPayload {
  value?: number | string
  payload?: DailyPoint
}

export function TrendTooltip({ active, payload, label, seriesLabel, prefs }: { active?: boolean; payload?: readonly TooltipPayload[]; label?: string; seriesLabel: string; prefs?: DatePrefs }) {
  const f = useFormat()
  if (!active || !payload?.length || !label) return null
  return (
    <div className="rounded-[var(--radius-control)] bg-surface px-3 py-2 text-xs shadow-[var(--shadow-pop)]">
      <p className="text-ink-muted">{dayLabel(label, prefs, f.lang)}</p>
      <p className="mt-0.5 font-medium text-ink tabular-nums">
        {f.number(Number(payload[0]?.value ?? 0))} {seriesLabel.toLowerCase()}
      </p>
    </div>
  )
}

/** One series over time. Crosshair + tooltip on hover. */
export function TrendChart({ data, series, height = 160, prefs }: { data: DailyPoint[]; series: keyof typeof SERIES; height?: number; prefs?: DatePrefs }) {
  const s = SERIES[series]
  const f = useFormat()
  const { t } = useI18n()
  const key = series === 'views' ? 'views' : 'arActivations'
  return (
    <div style={{ height }} role="img" aria-label={t('ui.chart.last30', { label: t(s.labelKey) })}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke="#ece7dd" strokeDasharray="2 4" />
          <XAxis dataKey="date" tickFormatter={(d: string) => dayLabel(d, prefs, f.lang)} minTickGap={28} tickLine={false} axisLine={false} {...AXIS} />
          <YAxis tickFormatter={(v: number) => f.compact(v)} tickLine={false} axisLine={false} width={44} allowDecimals={false} {...AXIS} />
          <Tooltip
            cursor={{ stroke: '#8a8073', strokeWidth: 1, strokeDasharray: '3 3' }}
            content={(props) => <TrendTooltip active={props.active} payload={props.payload as readonly TooltipPayload[] | undefined} label={props.label as string | undefined} seriesLabel={s.label} prefs={prefs} />}
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

export type SeriesKey = keyof typeof SERIES

/** Both series on one axis, as on the overview screens. `show` hides a series so the other rescales to fill the chart. */
export function CombinedTrendChart({ data, show, height = 220, prefs }: { data: DailyPoint[]; show: Record<SeriesKey, boolean>; height?: number; prefs?: DatePrefs }) {
  const f = useFormat()
  const { t } = useI18n()
  const shown = (Object.keys(SERIES) as SeriesKey[]).filter((k) => show[k])
  return (
    <div style={{ height }} role="img" aria-label={t('ui.chart.last30', { label: shown.map((k) => t(SERIES[k].labelKey)).join(t('ui.chart.and')) })}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke="#ece7dd" />
          <XAxis dataKey="date" tickFormatter={(d: string) => dayLabel(d, prefs, f.lang)} minTickGap={56} tickLine={false} axisLine={false} {...AXIS} />
          <YAxis tickFormatter={(v: number) => f.compact(v)} tickLine={false} axisLine={false} width={44} allowDecimals={false} {...AXIS} />
          <Tooltip
            cursor={{ stroke: '#8a8073', strokeWidth: 1, strokeDasharray: '3 3' }}
            content={(props) => {
              const point = (props.payload?.[0] as TooltipPayload | undefined)?.payload
              if (!props.active || !point) return null
              return (
                <div className="rounded-[var(--radius-control)] bg-surface px-3 py-2 text-xs shadow-[var(--shadow-pop)]">
                  <p className="text-ink-muted">{dayLabel(point.date, prefs, f.lang)}</p>
                  {shown.map((k) => (
                    <p key={k} className="mt-0.5 font-medium text-ink tabular-nums">
                      {f.number(k === 'views' ? point.views : point.arActivations)} {t(SERIES[k].labelKey).toLowerCase()}
                    </p>
                  ))}
                </div>
              )
            }}
          />
          {(Object.keys(SERIES) as SeriesKey[]).map((k) => (
            <Line
              key={k}
              type="linear"
              dataKey={k === 'views' ? 'views' : 'arActivations'}
              name={t(SERIES[k].labelKey)}
              hide={!show[k]}
              stroke={SERIES[k].color}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3.5, strokeWidth: 2, stroke: '#faf8f3', fill: SERIES[k].color }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
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
  const f = useFormat()
  const { t } = useI18n()
  const height = Math.max(120, data.length * 44 + 24)
  return (
    <div style={{ height }} role="img" aria-label={t('ui.chart.byBusiness', { label: valueLabel })}>
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
                    {f.number(p.payload.value)} {valueLabel.toLowerCase()}
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
            label={{ position: 'right', fill: '#5a5148', fontSize: 12, formatter: (v: unknown) => f.compact(Number(v)) }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

/** Accessible table alternative for a daily series. */
export function SeriesTable({ data, prefs }: { data: DailyPoint[]; prefs?: DatePrefs }) {
  const f = useFormat()
  const { t } = useI18n()
  return (
    <div className="max-h-64 overflow-auto rounded-[var(--radius-control)] border border-line">
      <table className="w-full text-[length:var(--text-ui-small)]">
        <caption className="sr-only">{t('ui.chart.tableCaption')}</caption>
        <thead className="sticky top-0 bg-surface">
          <tr className="text-left text-ink-muted">
            <th scope="col" className="px-3 py-2 font-medium">
              {t('ui.chart.date')}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              {t(SERIES.views.labelKey)}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              {t(SERIES.ar.labelKey)}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line tabular-nums">
          {[...data].reverse().map((d) => (
            <tr key={d.date}>
              <td className="px-3 py-1.5">{dayLabel(d.date, prefs, f.lang)}</td>
              <td className="px-3 py-1.5 text-right">{f.number(d.views)}</td>
              <td className="px-3 py-1.5 text-right">{f.number(d.arActivations)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
