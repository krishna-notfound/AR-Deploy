import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import type { Product } from '@/domain/types'
import { service } from '@/services'
import { ok } from '@/services/catalogService'

// Client feedback 2026-11-05, piece 1: a product with cta.hidden shows neither its link button nor "Contact the store".
// Share stays. (The embed page has no such button; see embed.test.tsx.)
vi.mock('@google/model-viewer', () => ({}))

const open = (path: string) => {
  window.history.replaceState(null, '', path)
  return render(<App />)
}

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  localStorage.clear()
  sessionStorage.clear()
  await service.resetDemoData()
})
afterEach(() => {
  vi.restoreAllMocks()
})

const LINK = 'https://shop.example/contact'
/** The public product with its call to action replaced. */
function withCta(cta: Product['cta']) {
  const real = service.getPublicProduct.bind(service)
  vi.spyOn(service, 'getPublicProduct').mockImplementation(async (...args) => {
    const r = await real(...args)
    return r.ok ? ok({ ...r.data, product: { ...r.data.product, cta } }) : r
  })
}
const shareButton = () => screen.getByRole('button', { name: /share/i })

describe('business product page', { timeout: 30_000 }, () => {
  const page = async () => {
    open('/products/casa-lisboa/glam-velvet-sofa')
    await screen.findByRole('heading', { name: 'Glam Velvet Sofa', level: 1 }, { timeout: 10_000 })
  }

  it('shows the link button when the product has a link and is not hidden', async () => {
    withCta({ label: { en: 'Visit the maker' }, url: LINK })
    await page()
    expect(await screen.findByRole('link', { name: 'Visit the maker' })).toHaveAttribute('href', LINK)
  })

  it('shows "Contact the store" when there is no link, the store has contact details and the product is not hidden', async () => {
    withCta({ label: { en: 'Contact seller' } })
    await page()
    expect(await screen.findByRole('button', { name: 'Contact the store' })).toBeInTheDocument()
  })

  it('hidden with a link: no link button, no "Contact the store"; Share stays', async () => {
    withCta({ label: { en: 'Visit the maker' }, url: LINK, hidden: true })
    await page()
    expect(shareButton()).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Visit the maker' })).toBeNull()
    expect(document.querySelector('[data-product-link]')).toBeNull()
    expect(screen.queryByText('Contact the store')).toBeNull()
  })

  it('hidden without a link: no "Contact the store" either; Share stays', async () => {
    withCta({ label: { en: 'Contact seller' }, hidden: true })
    await page()
    expect(shareButton()).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Contact the store' })).toBeNull())
    expect(screen.queryByText('Contact the store')).toBeNull()
  })
})

describe('showcase product page', { timeout: 30_000 }, () => {
  async function page() {
    const res = await service.getShowcase()
    if (!res.ok || !res.data.products[0]) throw new Error('showcase')
    const first = res.data.products[0]
    open(`/showcase/${first.slug}`)
    await screen.findByRole('heading', { level: 1, name: first.name.en }, { timeout: 8000 })
  }

  it('shows the link button when it is not hidden', async () => {
    withCta({ label: { en: 'Visit the maker' }, url: LINK })
    await page()
    expect(await screen.findByRole('link', { name: 'Visit the maker' })).toHaveAttribute('href', LINK)
  })

  it('hidden: no link button; Share stays', async () => {
    withCta({ label: { en: 'Visit the maker' }, url: LINK, hidden: true })
    await page()
    expect(shareButton()).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Visit the maker' })).toBeNull()
    expect(document.querySelector('[data-product-link]')).toBeNull()
    expect(screen.queryByText('Contact the store')).toBeNull()
  })
})
