import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { ACCOUNT_KEY } from '@/auth/AccountProvider'
import { service } from '@/services'
import { fail } from '@/services/catalogService'
import { scaleNoteKeys } from './ProductPage'

/** Renders the whole app (real router, providers and lazy routes) at `url`, as a visitor opening that link. */
function openApp(url: string) {
  window.history.replaceState(null, '', url)
  return render(<App />)
}

/** Records whether `text` is ever painted while the page loads (a one-frame flash would be missed by a final assertion). */
function watchForText(text: string) {
  let seen = document.body.textContent?.includes(text) ?? false
  const observer = new MutationObserver(() => {
    if (document.body.textContent?.includes(text)) seen = true
  })
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })
  return {
    seen: () => seen,
    stop: () => observer.disconnect(),
  }
}

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {}) // jsdom has no scrolling; ScrollRestoration calls it
  localStorage.clear()
  sessionStorage.clear()
  await service.resetDemoData()
})

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('catalogue product count (COR-08)', () => {
  it('shows no "0 products" while the products load or after they fail', async () => {
    vi.spyOn(service, 'getProducts').mockResolvedValue(fail('UNKNOWN', 'offline'))
    const watch = watchForText('0 products')
    openApp('/catalog/nordhaus')
    await screen.findByRole('heading', { name: 'Nordhaus Living', level: 1 })
    await screen.findByRole('button', { name: 'Try again' })
    watch.stop()
    expect(watch.seen()).toBe(false)
    expect(screen.queryByText(/products?$/i)).toBeNull()
  })

  it('shows the count once the products have loaded', async () => {
    openApp('/catalog/nordhaus')
    expect(await screen.findByText(/^\d+ products$/)).toBeInTheDocument()
  })

  it('offers a way out of "Catalog not found"', async () => {
    openApp('/catalog/no-such-store')
    await screen.findByRole('heading', { name: 'Catalog not found' })
    expect(screen.getByRole('link', { name: 'Go to Sanctus' })).toHaveAttribute('href', '/')
  })
})

describe('draft preview (COR-09)', () => {
  it('waits for the account instead of first answering "Product not available"', async () => {
    // A business admin of Nordhaus opens the preview of its draft "Oslo Bar Stool" in a new tab: the account loads first.
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'business_admin', businessId: 'biz_nord' }))
    // The account resolves after the page has mounted (Supabase: a session check over the network).
    const getBusinessById = service.getBusinessById.bind(service)
    vi.spyOn(service, 'getBusinessById').mockImplementation(async (id) => {
      await new Promise((r) => setTimeout(r, 300))
      return getBusinessById(id)
    })
    const spy = vi.spyOn(service, 'getPublicProduct')
    const watch = watchForText('Product not available')
    openApp('/products/nordhaus/oslo-bar-stool?preview=1')
    await screen.findByRole('heading', { name: 'Oslo Bar Stool', level: 1 }, { timeout: 4000 })
    watch.stop()
    expect(watch.seen()).toBe(false)
    expect(spy).toHaveBeenCalled()
    for (const call of spy.mock.calls) expect(call[2]).toEqual({ allowDraft: true })
  })

  it('still answers "Product not available" for a signed-out visitor asking for a draft', async () => {
    openApp('/products/nordhaus/oslo-bar-stool?preview=1')
    expect(await screen.findByRole('heading', { name: 'Product not available' })).toBeInTheDocument()
  })
})

describe('scale note copy (COR-10)', () => {
  it('claims real size in AR only when no separate, unmeasured USDZ is used for iPhone', () => {
    expect(scaleNoteKeys(true, false)).toEqual({ title: 'ar.scaleVerified', help: 'ar.scaleVerifiedHelp' })
    expect(scaleNoteKeys(true, true)).toEqual({ title: 'ar.scaleVerifiedModel', help: 'ar.scaleVerifiedUsdzHelp' })
    expect(scaleNoteKeys(false, true)).toEqual({ title: 'ar.scaleUnverified', help: 'ar.scaleUnverifiedHelp' })
  })
})

describe('public 404 (UX-03)', () => {
  it('follows ?lang=pt and keeps the Sanctus header', async () => {
    openApp('/no-such-page?lang=pt')
    expect(await screen.findByRole('heading', { name: 'Página não encontrada', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir para a página inicial' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('radiogroup', { name: 'Idioma' })).toBeInTheDocument()
    await waitFor(() => expect(document.documentElement.lang).toBe('pt-PT'))
    expect(document.title).toContain('Página não encontrada')
  })

  it('is English by default', async () => {
    openApp('/no-such-page')
    expect(await screen.findByRole('heading', { name: 'Page not found', level: 1 })).toBeInTheDocument()
  })
})
