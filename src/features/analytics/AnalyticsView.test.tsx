import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TrendTooltip, dayLabel } from '@/components/charts/Charts'
import type { AnalyticsSummary, Product, ProductAnalytics } from '@/domain/types'
import { type DatePrefs, formatDate } from '@/lib/format'
import { service } from '@/services'
import { EMBED_VIEWS_SINCE } from '@/services/analytics'
import type { Result } from '@/services/catalogService'
import { createSeed } from '@/services/mock/seed'
import { AnalyticsView, BusinessBars } from './AnalyticsView'
import { MostViewedList, mostViewed } from './MostViewedList'

describe('Views by business bars', () => {
  it('lists businesses with views in descending order, one row each, and folds zero-view ones into one muted line', () => {
    render(
      <BusinessBars
        rows={[
          { label: 'Quiet One', value: 0 },
          { label: 'Small Co', value: 5 },
          { label: 'Big Co', value: 40 },
          { label: 'Quiet Two', value: 0 },
        ]}
      />,
    )
    const list = screen.getByRole('list', { name: 'Views by business' })
    const items = within(list).getAllByRole('listitem') as [HTMLElement, HTMLElement]
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Big Co')
    expect(items[0]).toHaveTextContent('40')
    expect(items[1]).toHaveTextContent('Small Co')
    // Label, track and value share one row; the value is tabular and right-aligned.
    expect(items[0].className).toContain('flex')
    expect(within(items[0]).getByText('40').className).toContain('tabular-nums')
    expect(screen.getByText('2 businesses with no views')).toBeInTheDocument()
    expect(screen.queryByText('Quiet One')).toBeNull()
  })

  it('uses the singular for one zero-view business and omits the line when every business has views', () => {
    const { rerender } = render(<BusinessBars rows={[{ label: 'A', value: 3 }, { label: 'B', value: 0 }]} />)
    expect(screen.getByText('1 business with no views')).toBeInTheDocument()
    rerender(<BusinessBars rows={[{ label: 'A', value: 3 }]} />)
    expect(screen.queryByText(/with no views/)).toBeNull()
  })

  it('says so when no business has any views', () => {
    render(<BusinessBars rows={[{ label: 'A', value: 0 }, { label: 'B', value: 0 }]} />)
    expect(screen.getByText('2 businesses with no views')).toBeInTheDocument()
  })

  it('shows a muted "No views yet" line when there are no rows at all', () => {
    render(<BusinessBars rows={[]} />)
    expect(screen.getByText('No views yet')).toBeInTheDocument()
  })
})

// ---- S1.5 Task 7: analytics data (R-W5-2, R-W5-3, R-W5-4, R-W5-7) ----
const prefsNow: { current: DatePrefs | undefined } = { current: undefined }
vi.mock('@/lib/preferences', async (original) => ({ ...(await original<typeof import('@/lib/preferences')>()), usePreferences: () => prefsNow.current }))

const seedProducts = createSeed().products.slice(0, 2) as [Product, Product]
const [P1, P2] = seedProducts
const pa = (productId: string, views: number, embedViews: number, arActivations: number): ProductAnalytics => ({
  productId,
  businessId: P1.businessId,
  views,
  embedViews,
  arActivations,
  modelInteractions: 0,
  arRate: views + embedViews ? arActivations / (views + embedViews) : 0,
})
const summaryOf = (over: Partial<AnalyticsSummary> = {}): AnalyticsSummary => ({
  totals: { businesses: 1, products: 2, published: 2, drafts: 0, views: 90, embedViews: 10, arActivations: 12, modelInteractions: 3 },
  series: [
    { date: '2026-10-25', views: 60, arActivations: 8 },
    { date: '2026-10-26', views: 50, arActivations: 4 },
  ],
  byProduct: [pa(P1.id, 80, 10, 9), pa(P2.id, 0, 0, 0)],
  byBusiness: [{ businessId: P1.businessId, views: 110, arActivations: 12, products: 2 }],
  deletedProducts: { views: 10, embedViews: 0, arActivations: 3, modelInteractions: 0 },
  isSample: false,
  ...over,
})

function renderView(summary: Promise<Result<AnalyticsSummary>>, products: Product[] = seedProducts) {
  vi.spyOn(service, 'getBusinessAnalytics').mockReturnValue(summary)
  vi.spyOn(service, 'getProducts').mockResolvedValue({ ok: true, data: products })
  return render(
    <MemoryRouter>
      <AnalyticsView businessId={P1.businessId} editBase="/dashboard/products" />
    </MemoryRouter>,
  )
}

describe('AnalyticsView (S1.5 Task 7)', () => {
  beforeEach(() => {
    prefsNow.current = { timezone: 'America/Sao_Paulo', dateFormat: 'yyyy-MM-dd', clock: '24h' }
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("labels 'Product page views' and 'Embed views'", async () => {
    renderView(Promise.resolve({ ok: true, data: summaryOf() }))
    const figures = await screen.findByRole('region', { name: 'Key figures' })
    await waitFor(() => expect(within(figures).getByText('Embed views').parentElement?.parentElement).toHaveTextContent('Embed views10'))
    expect(within(figures).getByText('Product page views').parentElement?.parentElement).toHaveTextContent('Product page views90')
    expect(screen.getByRole('columnheader', { name: /Product page views/ })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /Embed views/ })).toBeInTheDocument()
    // The person's time zone is passed to the service.
    expect(service.getBusinessAnalytics).toHaveBeenCalledWith(P1.businessId, { timeZone: 'America/Sao_Paulo' })
  })

  it("AR rate reads '{n.nn} AR launches per view' and never contains '%'", async () => {
    const { container } = renderView(Promise.resolve({ ok: true, data: summaryOf() }))
    const figures = await screen.findByRole('region', { name: 'Key figures' })
    // 12 launches over 90 page + 10 embed views.
    await waitFor(() => expect(figures).toHaveTextContent('0.12 AR launches per view'))
    // P1: 9 over 80 + 10.
    expect(screen.getAllByText('0.10 AR launches per view').length).toBeGreaterThan(0)
    expect(container.textContent).not.toContain('%')
  })

  it("notes 'Embed loads before {date} are counted as page views.'", async () => {
    renderView(Promise.resolve({ ok: true, data: summaryOf() }))
    expect(await screen.findByText(`Embed loads before ${EMBED_VIEWS_SINCE} are counted as page views.`)).toBeInTheDocument()
  })

  it("a 'Deleted product' row", async () => {
    renderView(Promise.resolve({ ok: true, data: summaryOf() }))
    const table = await screen.findByRole('table', { name: 'Product performance' })
    const row = (await within(table).findByText('Deleted product')).closest('tr')!
    expect(row).toHaveTextContent('10') // its page views
    expect(within(row).queryByRole('link')).toBeNull()
    // No row without deleted products.
    cleanup()
    renderView(Promise.resolve({ ok: true, data: summaryOf({ deletedProducts: null }) }))
    await screen.findByRole('table', { name: 'Product performance' })
    await waitFor(() => expect(screen.getAllByText(P1.name.en).length).toBeGreaterThan(0))
    expect(screen.queryByText('Deleted product')).toBeNull()
  })

  it("the chart axis and tooltip use formatDate(iso, 'en', prefs)", async () => {
    const user = userEvent.setup()
    renderView(Promise.resolve({ ok: true, data: summaryOf() }))
    // The table view of the chart: local dates in the person's format, never shifted by their zone (São Paulo is UTC-3).
    await user.click(await screen.findByRole('button', { name: 'Show as table' }))
    const days = within(screen.getByRole('table', { name: 'Daily product views and AR launch attempts' })).getAllByRole('row').slice(1).map((r) => r.firstElementChild?.textContent)
    expect(days).toEqual(['2026-10-26', '2026-10-25'])
    // The axis ticks and the tooltip format through the same function.
    expect(dayLabel('2026-10-25', { timezone: 'Pacific/Auckland', dateFormat: 'dd/MM/yyyy', clock: '24h' })).toBe(formatDate('2026-10-25', 'en', { timezone: 'UTC', dateFormat: 'dd/MM/yyyy', clock: '24h' }))
    render(<TrendTooltip active payload={[{ value: 3 }]} label="2026-10-25" seriesLabel="Product views" prefs={{ timezone: 'America/Sao_Paulo', dateFormat: 'dd/MM/yyyy', clock: '24h' }} />)
    expect(screen.getByText('25/10/2026')).toBeInTheDocument()
    // Without preferences (signed out, still loading): the short default.
    expect(dayLabel('2026-10-25')).toBe('Oct 25')
  })

  it('shows loading, empty and error states', async () => {
    const { container } = renderView(new Promise(() => {}))
    expect(within(await screen.findByRole('region', { name: 'Key figures' })).queryByText('90')).toBeNull()
    expect(container.querySelector('[aria-hidden].bg-subtle')).not.toBeNull()
    cleanup()
    const empty = summaryOf({
      totals: { businesses: 1, products: 0, published: 0, drafts: 0, views: 0, embedViews: 0, arActivations: 0, modelInteractions: 0 },
      series: [{ date: '2026-10-26', views: 0, arActivations: 0 }],
      byProduct: [],
      byBusiness: [],
      deletedProducts: null,
    })
    renderView(Promise.resolve({ ok: true, data: empty }), [])
    expect(await screen.findByText('No products to report on')).toBeInTheDocument()
    expect(screen.getByText('No product activity yet')).toBeInTheDocument()
    expect(screen.getByText('No activity in the last 30 days')).toBeInTheDocument()
    cleanup()
    renderView(Promise.resolve({ ok: false, error: { code: 'VALIDATION', message: "Your time zone setting isn't recognised. Choose it again in Preferences." } }))
    expect(await screen.findByText("Your time zone setting isn't recognised. Choose it again in Preferences.")).toBeInTheDocument()
  })
})

describe('MostViewedList (R-W5-7)', () => {
  it('omits products with views + embedViews = 0', () => {
    const products = new Map(seedProducts.map((p) => [p.id, p]))
    const rows = [pa(P1.id, 0, 3, 0), pa(P2.id, 0, 0, 0)]
    expect(mostViewed(rows, products)).toEqual([rows[0]])
    render(
      <MemoryRouter>
        <MostViewedList rows={rows} products={products} editBase="/dashboard/products" />
      </MemoryRouter>,
    )
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(1)
    expect(items[0]).toHaveTextContent(P1.name.en)
    expect(items[0]).toHaveTextContent('3 views')
    expect(screen.queryByText(P2.name.en)).toBeNull()
  })
})
