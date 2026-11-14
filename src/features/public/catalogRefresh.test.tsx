// QA EF-13: a background refresh that fails while the catalogue is on screen keeps the products and says so, without blocking.
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { service } from '@/services'
import { fail } from '@/services/catalogService'
import { resetListsCache } from '@/services/listsHooks'
import { store } from '@/services/mock/store'

beforeAll(async () => {
  await import('@/features/public/CatalogPage')
}, 60_000)

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin', platformRole: 'owner' }))
  resetListsCache()
  await service.resetDemoData()
})
afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('catalogue refresh failure', () => {
  it('keeps the products on screen, shows a small notice with a retry, and drops it once a refresh works', { timeout: 30_000 }, async () => {
    const user = userEvent.setup()
    window.history.replaceState(null, '', '/catalog/nordhaus')
    render(<App />)
    await screen.findByText(/^\d+ products$/)
    const real = service.getProducts.bind(service)
    vi.spyOn(service, 'getProducts').mockResolvedValue(fail('UNKNOWN', 'down'))
    await act(async () => {
      await service.updateBusiness('biz_nord', { description: 'Changed so the store notifies its listeners.' })
    })
    expect(await screen.findByText(/could not refresh this catalogue/)).toBeInTheDocument()
    // The products that had loaded stay on screen.
    const piece = store.get().products.find((p) => p.businessId === 'biz_nord' && p.status === 'published')!
    expect(screen.getAllByRole('link', { name: new RegExp(piece.name.en) }).length).toBeGreaterThan(0)
    vi.mocked(service.getProducts).mockImplementation(real)
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.queryByText(/could not refresh this catalogue/)).toBeNull())
  })
})
