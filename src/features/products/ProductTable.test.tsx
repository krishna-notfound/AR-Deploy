import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_KEY, AccountProvider } from '@/auth/AccountProvider'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { LANG_KEY, LanguageProvider } from '@/i18n/LanguageProvider'
import type { ProductRequestState } from '@/domain/modelRequests'
import type { Business, Product } from '@/domain/types'
import { service } from '@/services'
import { ProductFilterBar, applyProductFilters, useProductFilterParams } from './ProductFilters'
import { AR_READINESS_LABEL, productArReadiness } from './productReadiness'
import { ProductTable } from './ProductTable'

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'business_admin', businessId: 'biz_nord' }))
  await service.resetDemoData()
})

afterEach(() => vi.restoreAllMocks())

async function openMenuFor(business: Business, product: Product) {
  const user = userEvent.setup()
  render(
    <MemoryRouter>
      <AccountProvider>
        <ToastProvider>
          <ConfirmProvider>
            <ProductTable products={[product]} businesses={new Map([[business.id, business]])} stats={new Map()} scope="business" empty={<p>None</p>} />
          </ConfirmProvider>
        </ToastProvider>
      </AccountProvider>
    </MemoryRouter>,
  )
  const triggers = await screen.findAllByRole('button', { name: `Actions for ${product.name.en}` })
  await user.click(triggers[0]!)
  return user
}

async function load() {
  const b = await service.getBusinessById('biz_nord')
  const ps = await service.getProductsByBusiness('biz_nord')
  if (!b.ok || !ps.ok) throw new Error('seed missing')
  const published = ps.data.find((p) => p.status === 'published')!
  return { business: b.data, published }
}

describe('ProductTable: open product page', () => {
  it("'Open product page' for a published product in a draft business links with ?preview", async () => {
    const { business, published } = await load()
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const user = await openMenuFor({ ...business, status: 'draft' }, published)
    await user.click(await screen.findByRole('menuitem', { name: 'Open product page' }))
    expect(open).toHaveBeenCalledWith(`/products/${business.slug}/${published.slug}?preview=1`, '_blank', 'noopener')
  })

  it('opens a published product in an active business without ?preview', async () => {
    const { business, published } = await load()
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    const user = await openMenuFor({ ...business, status: 'active' }, published)
    await user.click(await screen.findByRole('menuitem', { name: 'Open product page' }))
    expect(open).toHaveBeenCalledWith(`/products/${business.slug}/${published.slug}`, '_blank', 'noopener')
  })
})

describe('ProductTable: 3D request badges and filter (S4 R-S4-9)', () => {
  async function renderList(states: Record<string, ProductRequestState>) {
    const b = await service.getBusinessById('biz_nord')
    const ps = await service.getProductsByBusiness('biz_nord')
    if (!b.ok || !ps.ok) throw new Error('seed missing')
    const [p1, p2, p3, p4] = ps.data
    render(
      <MemoryRouter>
        <AccountProvider>
          <ToastProvider>
            <ConfirmProvider>
              <ProductTable
                products={[p1!, p2!, p3!, p4!]}
                businesses={new Map([[b.data.id, b.data]])}
                stats={new Map()}
                scope="business"
                requestStates={{ [p1!.id]: states.a!, [p2!.id]: states.b!, [p3!.id]: states.c!, [p4!.id]: states.d! }}
                empty={<p>None</p>}
              />
            </ConfirmProvider>
          </ToastProvider>
        </AccountProvider>
      </MemoryRouter>,
    )
    return [p1!, p2!, p3!, p4!]
  }

  it('the three badges render next to the AR readiness label, whose text is unchanged', async () => {
    const ps = await renderList({ a: { open: 'requested' }, b: { open: 'in_progress' }, c: { latestClosed: 'rejected' }, d: { latestClosed: 'delivered' } })
    const table = await screen.findByRole('table')
    for (const label of ['3D requested', '3D in progress']) expect(within(table).getByText(label)).toBeInTheDocument()
    // A declined badge shows only for a photos-only product; delivered shows nothing.
    const declined = within(table).queryAllByText('3D declined').length
    expect(declined).toBe(productArReadiness(ps[2]!) === 'photos-only' ? 1 : 0)
    expect(within(table).queryByText('3D delivered')).toBeNull()
    for (const p of ps) expect(within(table).getAllByText(AR_READINESS_LABEL[productArReadiness(p)]).length).toBeGreaterThan(0)
  })

  it("the filter '3D requests: open' keeps only products with an open request and writes ?model=open", () => {
    const f = { q: '', business: '', status: '', category: '', ar: '', model: 'open', page: 1 } as const
    const products = [{ id: 'a', name: { en: 'A' }, slug: 'a', models: {}, variants: [] }, { id: 'b', name: { en: 'B' }, slug: 'b', models: {}, variants: [] }] as unknown as Product[]
    const states: Record<string, ProductRequestState> = { a: { open: 'in_progress' }, b: { latestClosed: 'delivered' } }
    expect(applyProductFilters(products, f, states).map((p) => p.id)).toEqual(['a'])
    expect(applyProductFilters(products, { ...f, model: '' }, states)).toHaveLength(2)
  })

  it('choosing the filter writes ?model=open to the URL', async () => {
    const user = userEvent.setup()
    function Probe() {
      const [filters, update] = useProductFilterParams()
      return (
        <>
          <ProductFilterBar state={filters} update={update} requestFilter />
          <output data-testid="model">{filters.model}</output>
        </>
      )
    }
    render(
      <MemoryRouter>
        <Probe />
      </MemoryRouter>,
    )
    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by 3D requests' }), '3D requests: open')
    expect(screen.getByTestId('model')).toHaveTextContent('open')
  })
})

describe('T6: product table in Portuguese', () => {
  afterEach(() => localStorage.removeItem(LANG_KEY))

  it('shows Portuguese column headers and the row menu', async () => {
    localStorage.setItem(LANG_KEY, 'pt')
    const { business, published } = await load()
    const user = userEvent.setup()
    render(
      <LanguageProvider>
        <MemoryRouter>
          <AccountProvider>
            <ToastProvider>
              <ConfirmProvider>
                <ProductTable products={[published]} businesses={new Map([[business.id, business]])} stats={new Map()} scope="business" empty={<p>None</p>} />
              </ConfirmProvider>
            </ToastProvider>
          </AccountProvider>
        </MemoryRouter>
      </LanguageProvider>,
    )
    const table = await screen.findByRole('table')
    expect(within(table).getByRole('columnheader', { name: /Produto/ })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: /Preço/ })).toBeInTheDocument()
    await user.click((await screen.findAllByRole('button', { name: `Ações para ${published.name.en}` }))[0]!)
    expect(await screen.findByRole('menuitem', { name: 'Abrir página do produto' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Anular publicação' })).toBeInTheDocument()
  })
})
