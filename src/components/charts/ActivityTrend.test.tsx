import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { DailyPoint } from '@/domain/types'
import { ActivityTrend } from './ActivityTrend'

const data: DailyPoint[] = Array.from({ length: 30 }, (_, i) => ({
  date: `2026-09-${String(i + 1).padStart(2, '0')}`,
  views: 100 + i,
  arActivations: 20 + i,
}))

describe('ActivityTrend', () => {
  it('compact (overview): one combined chart with a series toggle above it', async () => {
    const user = userEvent.setup()
    render(<ActivityTrend data={data} compact />)
    expect(screen.getAllByRole('img')).toHaveLength(1)
    expect(screen.getByRole('img')).toHaveAccessibleName('Product views and AR launch attempts, last 30 days')

    const views = screen.getByRole('button', { name: 'Product views' })
    const ar = screen.getByRole('button', { name: 'AR launch attempts' })
    expect(views).toHaveAttribute('aria-pressed', 'true')
    expect(ar).toHaveAttribute('aria-pressed', 'true')

    // Hiding views lets the AR line fill the chart; the last visible series cannot be hidden.
    await user.click(views)
    expect(views).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('img')).toHaveAccessibleName('AR launch attempts, last 30 days')
    expect(ar).toBeDisabled()
    await user.click(views)
    expect(ar).toBeEnabled()

    // The table view stays available.
    await user.click(screen.getByRole('button', { name: 'Show as table' }))
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.queryByRole('img')).toBeNull()
  })

  it('full size (analytics): two small multiples, as before', () => {
    render(<ActivityTrend data={data} />)
    expect(screen.getAllByRole('img')).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Product views' })).toBeNull()
  })

  it('the table header is sentence case with no letter-spacing', async () => {
    const user = userEvent.setup()
    render(<ActivityTrend data={data} compact />)
    await user.click(screen.getByRole('button', { name: 'Show as table' }))
    const head = screen.getByRole('columnheader', { name: 'Date' }).closest('tr')
    expect(head?.className).not.toMatch(/uppercase|tracking-/)
  })
})
