import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DailyPoint } from '@/domain/types'
import { ActivityTrend } from './ActivityTrend'

const days = (f: (i: number) => Pick<DailyPoint, 'views' | 'arActivations'>): DailyPoint[] =>
  Array.from({ length: 30 }, (_, i) => ({ date: `2026-09-${String(i + 1).padStart(2, '0')}`, ...f(i) }))
const data = days((i) => ({ views: 100 + i, arActivations: 20 + i }))

describe('ActivityTrend', () => {
  it('compact (overview): one combined chart with a series toggle above it', async () => {
    const user = userEvent.setup()
    render(<ActivityTrend data={data} compact />)
    expect(screen.getAllByRole('img')).toHaveLength(1)
    expect(screen.getByRole('img')).toHaveAccessibleName('Page and embed views and AR launch attempts, last 30 days')

    const views = screen.getByRole('button', { name: 'Page and embed views' })
    const ar = screen.getByRole('button', { name: 'AR launch attempts' })
    expect(views).toHaveAttribute('aria-pressed', 'true')
    expect(ar).toHaveAttribute('aria-pressed', 'true')
    // 44px touch target on phones.
    expect(views.className).toMatch(/(^|\s)max-sm:h-11(\s|$)/)

    // Hiding views lets the AR line fill the chart; the last visible series cannot be hidden.
    await user.click(views)
    expect(views).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('img')).toHaveAccessibleName('AR launch attempts, last 30 days')
    // It stays focusable and says why it does nothing, instead of being a disabled (unreachable) button.
    expect(ar).toBeEnabled()
    expect(ar).toHaveAttribute('aria-disabled', 'true')
    expect(ar).toHaveAccessibleDescription('At least one series stays visible')
    await user.click(ar)
    expect(ar).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('img')).toHaveAccessibleName('AR launch attempts, last 30 days')

    await user.click(views)
    expect(ar).not.toHaveAttribute('aria-disabled')
    expect(ar).not.toHaveAttribute('aria-describedby')

    // The table view stays available.
    await user.click(screen.getByRole('button', { name: 'Show as table' }))
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('full size (analytics): two small multiples, as before', () => {
    render(<ActivityTrend data={data} />)
    expect(screen.getAllByRole('img')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Page and embed views' })).toBeNull()
  })

  it('the table header is sentence case with no letter-spacing', async () => {
    const user = userEvent.setup()
    render(<ActivityTrend data={data} compact />)
    await user.click(screen.getByRole('button', { name: 'Show as table' }))
    const head = screen.getByRole('columnheader', { name: 'Date' }).closest('tr')
    expect(head?.className).not.toMatch(/uppercase|tracking-/)
  })

  describe('no activity in 30 days', () => {
    const zero = days(() => ({ views: 0, arActivations: 0 }))
    it('takes the empty-state body from the caller (the platform overview is not "your catalog")', () => {
      render(<ActivityTrend data={zero} compact emptyBody="Views and AR opens will appear here once people visit published catalogs." />)
      expect(screen.getByText('Views and AR opens will appear here once people visit published catalogs.')).toBeInTheDocument()
    })
    for (const [layout, compact] of [['overview (compact)', true], ['analytics (full size)', false]] as const) {
      for (const [what, rows] of [['all-zero data', zero], ['no data points', [] as DailyPoint[]]] as const) {
        it(`${layout}, ${what}: shows the empty state instead of empty axes`, () => {
          const { container } = render(<ActivityTrend data={rows} compact={compact} />)
          expect(screen.getByRole('heading', { name: 'No activity in the last 30 days' })).toBeInTheDocument()
          expect(screen.getByText('Views and AR opens will appear here once people visit your catalog.')).toBeInTheDocument()
          expect(screen.queryByRole('img')).toBeNull()
          expect(screen.queryByRole('group', { name: 'Series shown in the chart' })).toBeNull()
          expect(screen.queryByRole('button', { name: 'Show as table' })).toBeNull()
          expect(container.innerHTML).not.toMatch(/NaN|Infinity/)
        })
      }
    }
  })

  describe('with a measured container (the chart draws its axes)', () => {
    beforeEach(() => {
      // jsdom has no layout: give recharts' ResponsiveContainer a real size so the SVG and its ticks render.
      vi.stubGlobal(
        'ResizeObserver',
        class {
          observe() {}
          unobserve() {}
          disconnect() {}
        },
      )
      // The container is 600x220; every other box (recharts measures tick text with a span) is a short label.
      const box = (width: number, height: number) => ({ x: 0, y: 0, top: 0, left: 0, right: width, bottom: height, width, height, toJSON: () => ({}) }) as DOMRect
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        return this.classList.contains('recharts-responsive-container') ? box(600, 220) : box(24, 14)
      })
    })
    afterEach(() => {
      vi.unstubAllGlobals()
      vi.restoreAllMocks()
    })

    it('a single visit in 30 days still draws the chart on a labelled axis, with no NaN', async () => {
      const { container } = render(<ActivityTrend data={days((i) => ({ views: i === 29 ? 1 : 0, arActivations: 0 }))} compact />)
      expect(screen.getAllByRole('img')).toHaveLength(1)
      await waitFor(() => expect(container.querySelectorAll('.recharts-line-curve').length).toBe(2))
      const ticks = Array.from(container.querySelectorAll('.recharts-yAxis-tick-labels text')).map((t) => t.textContent)
      expect(ticks.length).toBeGreaterThan(1)
      expect(ticks).toContain('0')
      expect(container.querySelectorAll('.recharts-xAxis-tick-labels text').length).toBeGreaterThan(0)
      expect(container.innerHTML).not.toMatch(/NaN|Infinity/)
    })
  })
})
