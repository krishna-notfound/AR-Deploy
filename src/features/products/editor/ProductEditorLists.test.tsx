// ADR-0055: the product editor's category and currency pickers read the managed lists.
import { render, screen, waitFor } from '@testing-library/react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import type { Business } from '@/domain/types'
import { service } from '@/services'
import { resetListsCache } from '@/services/listsHooks'
import { mockListsService as lists } from '@/services/mock/mockLists'
import { store } from '@/services/mock/store'
import { ProductEditorForm } from './ProductEditorForm'

vi.mock('./ModelRequestPanel', () => ({ ModelRequestPanel: () => <div /> }))
vi.mock('@/auth/usePermission', async (orig) => ({ ...(await orig<typeof import('@/auth/usePermission')>()), useCan: () => () => true }))

let business: Business

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin', platformRole: 'owner' }))
  resetListsCache()
  await service.resetDemoData()
  const res = await service.getBusinessById('biz_nord')
  if (!res.ok) throw new Error('seed business missing')
  business = res.data
})

function renderForm(product: Parameters<typeof ProductEditorForm>[0]['product'] = null) {
  const router = createMemoryRouter(
    [{ path: '/dashboard/products/new', element: <ProductEditorForm scope="business" product={product} currentStatus="draft" businesses={[business]} fixedBusiness={business} breadcrumbs={[]} /> }],
    { initialEntries: ['/dashboard/products/new'] },
  )
  render(
    <ToastProvider>
      <ConfirmProvider>
        <RouterProvider router={router} />
      </ConfirmProvider>
    </ToastProvider>,
  )
}

const options = (select: HTMLElement) => Array.from(select.querySelectorAll('option')).map((o) => o.textContent)
const categorySelect = () => screen.getByLabelText('Category') as HTMLSelectElement
const currencySelect = () => screen.getByLabelText('Currency') as HTMLSelectElement

describe('category picker', () => {
  it('starts with the seeded categories, Other last', async () => {
    renderForm()
    await waitFor(() => expect(options(categorySelect())).toEqual(['Sofa', 'Chair', 'Table', 'Bed', 'Storage', 'Lighting', 'Decor', 'Other']))
  })

  it('offers a category added in the admin console and leaves out a hidden one', async () => {
    await lists.saveCategory({ labelEn: 'Rugs', labelPt: 'Tapetes' })
    await lists.saveCategory({ slug: 'bed', labelEn: 'Bed', labelPt: 'Cama', active: false })
    renderForm()
    await waitFor(() => expect(options(categorySelect())).toContain('Rugs'))
    expect(options(categorySelect())).not.toContain('Bed')
    expect(options(categorySelect()).at(-1)).toBe('Other')
  })

  it('a new product starts on a category that is still offered when the default one was deleted', async () => {
    await lists.deleteCategory('sofa')
    renderForm()
    await waitFor(() => expect(categorySelect()).toHaveValue('chair'))
    expect(options(categorySelect())).not.toContain('Sofa')
  })

  it('an existing product keeps its own category in the picker even when it is hidden', async () => {
    const res = await service.getProductById(firstProductIn('chair'))
    if (!res.ok) throw new Error('seed product missing')
    await lists.saveCategory({ slug: 'chair', labelEn: 'Chair', labelPt: 'Cadeira', active: false })
    renderForm(res.data)
    await waitFor(() => expect(categorySelect()).toHaveValue('chair'))
    expect(options(categorySelect())).toContain('Chair')
  })
})

describe('currency picker', () => {
  it('offers the enabled currencies only', async () => {
    renderForm()
    await waitFor(() => expect(options(currencySelect())).toEqual(['EUR', 'BRL', 'USD']))
  })

  it('offers a newly enabled currency and drops a switched-off one', async () => {
    await lists.setCurrencyEnabled('GBP', true)
    await lists.setCurrencyEnabled('BRL', false)
    renderForm()
    await waitFor(() => expect(options(currencySelect())).toContain('GBP'))
    expect(options(currencySelect())).not.toContain('BRL')
  })
})

function firstProductIn(category: string): string {
  const p = store.get().products.find((x) => x.category === category && x.businessId === 'biz_nord') ?? store.get().products.find((x) => x.category === category)
  if (!p) throw new Error(`no seed product in ${category}`)
  return p.id
}
