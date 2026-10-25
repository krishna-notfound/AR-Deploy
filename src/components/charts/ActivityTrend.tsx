import { Table2 } from 'lucide-react'
import { useState } from 'react'
import type { DailyPoint } from '@/domain/types'
import { formatNumber } from '@/lib/format'
import { Button } from '../ui/Button'
import { SERIES, SeriesTable, TrendChart } from './Charts'

/** Views and AR launch attempts as two aligned small multiples, with a table view. */
export function ActivityTrend({ data, compact }: { data: DailyPoint[]; compact?: boolean }) {
  const [showTable, setShowTable] = useState(false)
  const views = data.reduce((s, d) => s + d.views, 0)
  const ar = data.reduce((s, d) => s + d.arActivations, 0)
  const h = compact ? 120 : 160
  return (
    <div>
      {showTable ? (
        <SeriesTable data={data} />
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          {(['views', 'ar'] as const).map((k) => (
            <div key={k}>
              <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                <span className="inline-block h-0.5 w-4 shrink-0" style={{ background: SERIES[k].color }} aria-hidden />
                <span className="font-medium text-ink">{SERIES[k].label}</span>
                <span className="text-ink-muted tabular-nums">{formatNumber(k === 'views' ? views : ar)} in 30 days</span>
              </div>
              <TrendChart data={data} series={k} height={h} />
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex justify-end">
        <Button size="sm" variant="ghost" icon={<Table2 className="size-4" aria-hidden />} onClick={() => setShowTable((v) => !v)} aria-pressed={showTable}>
          {showTable ? 'Show charts' : 'Show as table'}
        </Button>
      </div>
    </div>
  )
}
