import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_KEY, AccountProvider } from '@/auth/AccountProvider'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import type { Business, Product } from '@/domain/types'
import { service } from '@/services'
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
