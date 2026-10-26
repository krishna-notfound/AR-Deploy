import { Table2 } from 'lucide-react'
import { useId, useState } from 'react'
import type { DailyPoint } from '@/domain/types'
import { type DatePrefs, formatNumber } from '@/lib/format'
import { Button } from '../ui/Button'
import { EmptyState } from '../ui/States'
import { CombinedTrendChart, SERIES, type SeriesKey, SeriesTable, TrendChart } from './Charts'

const KEYS = Object.keys(SERIES) as SeriesKey[]

/**
 * Views and AR launch attempts with a table view. `compact` (the overview cards, Stitch A-a-overview) draws one combined
 * chart with a series toggle above it; the analytics page keeps two aligned small multiples.
 */
export function ActivityTrend({
  data,
  compact,
  emptyBody = 'Views and AR opens will appear here once people visit your catalog.',
  prefs,
}: {
  data: DailyPoint[]
  compact?: boolean
  /** The person's date settings (`usePreferences()`): the axis, tooltip and table show days in their format. */
  prefs?: DatePrefs
  /** The zero-activity body; the default speaks to one business, platform pages pass their own. */
  emptyBody?: string
}) {
  const [showTable, setShowTable] = useState(false)
  const [show, setShow] = useState<Record<SeriesKey, boolean>>({ views: true, ar: true })
  const lockedHint = useId()
  const views = data.reduce((s, d) => s + d.views, 0)
  const ar = data.reduce((s, d) => s + d.arActivations, 0)
  const tableToggle = (
    <Button size="sm" variant="ghost" icon={<Table2 className="size-4" aria-hidden />} onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
      {showTable ? 'Show charts' : 'Show as table'}
    </Button>
  )

  // Nothing to plot: a month of zeros would only draw empty axes, so say so the way the other cards do.
  if (views + ar === 0) return <EmptyState title="No activity in the last 30 days" body={emptyBody} />

  if (compact) {
    const visible = KEYS.filter((k) => show[k]).length
    return (
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          {!showTable && (
            <div role="group" aria-label="Series shown in the chart" className="-ml-2 flex flex-wrap items-center gap-x-1 gap-y-1">
              {KEYS.map((k) => {
                // The chart is never empty: the last visible series stays on. It stays focusable and says why.
                const locked = show[k] && visible === 1
                return (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={show[k]}
                    aria-disabled={locked || undefined}
                    aria-describedby={locked ? lockedHint : undefined}
                    onClick={() => {
                      if (!locked) setShow((s) => ({ ...s, [k]: !s[k] }))
                    }}
                    className="inline-flex h-8 items-center gap-2 rounded-[var(--radius-control)] px-2 text-[length:var(--text-ui-small)] text-ink-muted transition-colors hover:bg-subtle hover:text-ink aria-disabled:cursor-default aria-disabled:hover:bg-transparent aria-[pressed=false]:text-ink-faint max-sm:h-11"
                  >
                    <span
                      className="size-2 shrink-0 rounded-full border-[1.5px]"
                      style={{ borderColor: SERIES[k].color, background: show[k] ? SERIES[k].color : 'transparent' }}
                      aria-hidden
                    />
                    {SERIES[k].label}
                  </button>
                )
              })}
              <span id={lockedHint} className="sr-only">
                At least one series stays visible
              </span>
            </div>
          )}
          <div className="ml-auto">{tableToggle}</div>
        </div>
        {showTable ? <SeriesTable data={data} prefs={prefs} /> : <CombinedTrendChart data={data} show={show} height={220} prefs={prefs} />}
      </div>
    )
  }

  return (
    <div>
      {showTable ? (
        <SeriesTable data={data} prefs={prefs} />
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          {KEYS.map((k) => (
            <div key={k}>
              <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                <span className="inline-block h-0.5 w-4 shrink-0" style={{ background: SERIES[k].color }} aria-hidden />
                <span className="font-medium text-ink">{SERIES[k].label}</span>
                <span className="text-ink-muted tabular-nums">{formatNumber(k === 'views' ? views : ar)} in 30 days</span>
              </div>
              <TrendChart data={data} series={k} height={160} prefs={prefs} />
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex justify-end">{tableToggle}</div>
    </div>
  )
}
