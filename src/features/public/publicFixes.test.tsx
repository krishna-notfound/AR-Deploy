import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { ACCOUNT_KEY } from '@/auth/AccountProvider'
import { LANG_KEY } from '@/i18n/LanguageProvider'
import { service } from '@/services'
import { fail, ok } from '@/services/catalogService'
import { LowercaseSlugs } from './LowercaseSlugs'

// The real web component needs WebGL: a plain custom tag here.
vi.mock('@google/model-viewer', () => ({}))

function openApp(url: string) {
  window.history.replaceState(null, '', url)
  return render(<App />)
}
const here = () => window.location.pathname + window.location.search + window.location.hash

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  localStorage.clear()
  sessionStorage.clear()
  await service.resetDemoData()
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('lower-case slugs (R-W4-9)', { timeout: 20_000 }, () => {
  it('/catalog/Casa-Lisboa?q=sofa lands on /catalog/casa-lisboa?q=sofa', async () => {
    openApp('/catalog/Casa-Lisboa?q=sofa')
    await screen.findByRole('heading', { name: 'Casa Lisboa Interiors', level: 1 })
    expect(here()).toBe('/catalog/casa-lisboa?q=sofa')
  })

  it('/products/Casa-Lisboa/Glam-Velvet-Sofa?variant=x lands on /products/casa-lisboa/glam-velvet-sofa?variant=x', async () => {
    openApp('/products/Casa-Lisboa/Glam-Velvet-Sofa?variant=x')
    await screen.findByRole('heading', { name: 'Glam Velvet Sofa', level: 1 }, { timeout: 10_000 })
    expect(here()).toBe('/products/casa-lisboa/glam-velvet-sofa?variant=x')
  })

  it('/embed/products/Casa-Lisboa/Glam-Velvet-Sofa lands on the lower-case embed path', async () => {
    openApp('/embed/products/Casa-Lisboa/Glam-Velvet-Sofa')
    await screen.findByRole('heading', { name: 'Glam Velvet Sofa', level: 1 }, { timeout: 10_000 })
    expect(here()).toBe('/embed/products/casa-lisboa/glam-velvet-sofa')
  })

  it('a tenant product route /products/Glam-Velvet-Sofa lands on /products/glam-velvet-sofa', async () => {
    const Where = () => <p data-testid="where">{useLocation().pathname}</p>
    render(
      <MemoryRouter initialEntries={['/products/Glam-Velvet-Sofa']}>
        <Routes>
          <Route
            path="/products/:productSlug"
            element={
              <LowercaseSlugs route="product" tenant>
                <Where />
              </LowercaseSlugs>
            }
          />
        </Routes>
      </MemoryRouter>,
    )
    await waitFor(() => expect(screen.getByTestId('where').textContent).toBe('/products/glam-velvet-sofa'))
  })
})

describe('catalog link keeps the preview flag (R-W4-11)', { timeout: 20_000 }, () => {
  it('Back to catalog from a preview product page keeps ?preview=1', async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'business_admin', businessId: 'biz_nord' }))
    openApp('/products/nordhaus/oslo-bar-stool?preview=1') // a draft
    await screen.findByRole('heading', { name: 'Oslo Bar Stool', level: 1 }, { timeout: 10_000 })
    const back = screen.getAllByRole('link').find((a) => a.getAttribute('href')?.startsWith('/catalog/nordhaus') && /catalogue/i.test(a.textContent ?? ''))
    expect(back).toHaveAttribute('href', '/catalog/nordhaus?preview=1')
  })
})

describe('CTA label fallback (R-W4-13)', { timeout: 20_000 }, () => {
  it("a product with a CTA url and an empty label shows 'Contact the store' as the link text", async () => {
    // The service now refuses this combination, so it is injected the way old data may hold it.
    const real = service.getPublicProduct.bind(service)
    vi.spyOn(service, 'getPublicProduct').mockImplementation(async (...args) => {
      const r = await real(...args)
      return r.ok ? ok({ ...r.data, product: { ...r.data.product, cta: { label: { en: '  ' }, url: 'https://shop.example/contact' } } }) : r
    })
    openApp('/products/casa-lisboa/glam-velvet-sofa')
    await screen.findByRole('heading', { name: 'Glam Velvet Sofa', level: 1 }, { timeout: 10_000 })
    const link = await screen.findByRole('link', { name: 'Contact the store' })
    expect(link).toHaveAttribute('href', 'https://shop.example/contact')
  })
})

describe("the product's own call to action (owner 2026-10-26)", { timeout: 20_000 }, () => {
  const withCta = (cta: { label: { en: string }; url?: string }) => {
    const real = service.getPublicProduct.bind(service)
    vi.spyOn(service, 'getPublicProduct').mockImplementation(async (...args) => {
      const r = await real(...args)
      return r.ok ? ok({ ...r.data, product: { ...r.data.product, cta } }) : r
    })
  }

  it('an external link is a full-width pill under the actions, opening in a new tab safely', async () => {
    openApp('/products/nordhaus/sheen-lounge-chair')
    const link = await screen.findByRole('link', { name: 'Contact seller' })
    expect(link).toHaveAttribute('href', 'https://nordhaus.example/visit')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link.className).toMatch(/rounded-full/)
    expect(link.className).toMatch(/w-full/)
    expect(link.className).toMatch(/bg-subtle/) // with 3D the AR action leads
    expect(link.querySelector('svg')).not.toBeNull() // the external-link arrow
    // Under the Share pill.
    const share = screen.getByRole('button', { name: 'Share' })
    expect(!!(share.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true)
  })

  it('without 3D the link is the primary obsidian pill', async () => {
    withCta({ label: { en: 'Visit the showroom' }, url: 'https://nordhaus.example/visit' })
    openApp('/products/nordhaus/fjord-shell-chair')
    const link = await screen.findByRole('link', { name: 'Visit the showroom' })
    expect(link.className).toMatch(/bg-ink/)
    expect(link.className).toMatch(/text-canvas/)
  })

  it('a same-site link opens in the same tab, without the external arrow', async () => {
    withCta({ label: { en: 'See the sofa' }, url: `${window.location.origin}/products/nordhaus/linen-two-seat-sofa` })
    openApp('/products/nordhaus/fjord-shell-chair')
    const link = await screen.findByRole('link', { name: 'See the sofa' })
    expect(link).not.toHaveAttribute('target')
    expect(link.querySelector('svg')).toBeNull()
  })

  it('without a link, "Contact the store" opens the business contact details, as before', async () => {
    const user = userEvent.setup()
    openApp('/products/nordhaus/fjord-shell-chair')
    await screen.findByRole('heading', { name: 'Fjord Shell Chair', level: 1 })
    const button = screen.getByRole('button', { name: 'Contact the store' })
    expect(button.className).toMatch(/bg-ink/) // no 3D: the primary action
    await user.click(button)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('link', { name: 'studio@nordhaus.example' })).toHaveAttribute('href', 'mailto:studio@nordhaus.example?subject=Fjord%20Shell%20Chair')
  })
})

describe('product page v2 sections (ADR-0036 v2)', { timeout: 20_000 }, () => {
  it('"More from" lists up to 4 other published pieces of the business and links to the whole catalogue', async () => {
    openApp('/products/nordhaus/sheen-lounge-chair')
    const section = (await screen.findByRole('heading', { name: 'More from Nordhaus Living' })).closest('section') as HTMLElement
    const published = await service.getProducts({ businessId: 'biz_nord', status: 'published' })
    if (!published.ok) throw new Error('seed')
    const cards = await within(section).findAllByRole('heading', { level: 3 })
    expect(cards.length).toBe(Math.min(4, published.data.length - 1))
    expect(cards.map((c) => c.textContent)).not.toContain('Sheen Lounge Chair')
    expect(cards.map((c) => c.textContent)).not.toContain('Oslo Bar Stool') // a draft
    expect(within(section).getByRole('link', { name: `View all ${published.data.length} pieces` })).toHaveAttribute('href', '/catalog/nordhaus')
  })

  it('"More from" stays hidden when the list cannot be loaded, and the page still works', async () => {
    vi.spyOn(service, 'getProducts').mockResolvedValue(fail('UNKNOWN', 'offline'))
    openApp('/products/nordhaus/sheen-lounge-chair')
    await screen.findByRole('heading', { name: 'Sheen Lounge Chair', level: 1 })
    await waitFor(() => expect(screen.queryByRole('status', { name: 'Loading…' })).toBeNull())
    expect(screen.queryByRole('heading', { name: /More from/ })).toBeNull()
  })

  it('the contact strip shows the business email and phone, and hides without both', async () => {
    openApp('/products/nordhaus/sheen-lounge-chair')
    const strip = (await screen.findByRole('heading', { name: 'Questions about this piece?' })).closest('section') as HTMLElement
    expect(within(strip).getByRole('link', { name: 'studio@nordhaus.example' })).toHaveAttribute('href', 'mailto:studio@nordhaus.example?subject=Sheen%20Lounge%20Chair')
    expect(within(strip).getByRole('link', { name: '+351 22 000 0000' })).toHaveAttribute('href', 'tel:+351220000000')
    expect(within(strip).getByRole('link', { name: 'Email Nordhaus Living' })).toBeInTheDocument()
  })

  it('the dark AR band shows only for a piece with 3D, with the QR code of this page on a computer', async () => {
    const { unmount } = openApp('/products/nordhaus/sheen-lounge-chair')
    const band = (await screen.findByRole('heading', { name: 'Place the Sheen Lounge Chair in your room' })).closest('section') as HTMLElement
    expect(within(band).getByText(/W 83 × D 57 × H 69 cm/)).toBeInTheDocument()
    expect(within(band).getByText('Scan to open on your phone')).toBeInTheDocument()
    expect(await within(band).findByRole('img', { name: /Scan with your phone camera/ })).toHaveAttribute('src', expect.stringMatching(/^data:image\/png/))
    unmount()
    openApp('/products/nordhaus/fjord-shell-chair')
    await screen.findByRole('heading', { name: 'Fjord Shell Chair', level: 1 })
    expect(screen.queryByRole('heading', { name: /in your room/ })).toBeNull()
  })
})

describe('catalog sorting and refresh', { timeout: 20_000 }, () => {
  it('in PT, the catalog is sorted by the Portuguese names', async () => {
    sessionStorage.setItem(LANG_KEY, 'pt')
    const real = await service.getProducts({ businessId: 'biz_casa', status: 'published' })
    if (!real.ok) throw new Error('seed')
    const [a, b] = real.data
    // EN order: Alpha, Beta. PT order: Abajur, Zebra.
    const alpha = { ...a!, name: { en: 'Alpha Piece', pt: 'Zebra Peca' } }
    const beta = { ...b!, name: { en: 'Beta Piece', pt: 'Abajur Peca' } }
    vi.spyOn(service, 'getProducts').mockResolvedValue(ok([alpha, beta]))
    openApp('/catalog/casa-lisboa')
    await screen.findByRole('heading', { name: 'Abajur Peca', level: 2 })
    const names = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(names.indexOf('Abajur Peca')).toBeLessThan(names.indexOf('Zebra Peca'))
  })

  it('CatalogPage refetches products on focus once the data is older than MEDIA_REFRESH_MS', async () => {
    const spy = vi.spyOn(service, 'getProducts')
    openApp('/catalog/casa-lisboa')
    await screen.findByText(/^\d+ pieces$/)
    const before = spy.mock.calls.length
    vi.useFakeTimers({ now: Date.now(), toFake: ['Date'] })
    window.dispatchEvent(new Event('focus'))
    expect(spy.mock.calls.length).toBe(before) // fresh
    vi.setSystemTime(Date.now() + 24 * 3600_000)
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
    })
    expect(spy.mock.calls.length).toBeGreaterThan(before)
  })
})

describe('demo follows the real visibility rule (R-W8-2)', { timeout: 20_000 }, () => {
  it("signed out, /catalog/oak-ember shows 'Catalog not found'", async () => {
    openApp('/catalog/oak-ember')
    expect(await screen.findByRole('heading', { name: 'Catalog not found' })).toBeInTheDocument()
  })
})

describe('a stale product page gives way when the product is gone (R-W4-8)', { timeout: 30_000 }, () => {
  const arButton = () => screen.queryByRole('button', { name: /view in my home/i })
  const glam = async () => {
    const r = await service.getProductById('prd_glam_sofa')
    if (!r.ok) throw new Error('seed')
    return r.data
  }

  it('product page: after a rename the refetch is NOT_FOUND and shows "Product not available"', async () => {
    openApp('/products/casa-lisboa/glam-velvet-sofa')
    await screen.findByRole('heading', { name: 'Glam Velvet Sofa', level: 1 }, { timeout: 10_000 })
    const p = await glam()
    await act(async () => void (await service.updateProduct(p.id, { slug: 'glam-velvet-sofa-2' })))
    expect(await screen.findByRole('heading', { name: 'Product not available' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Glam Velvet Sofa', level: 1 })).toBeNull()
    expect(arButton()).toBeNull()
  })

  it('product page: after unpublish the refetch is NOT_FOUND and shows "Product not available"', async () => {
    openApp('/products/casa-lisboa/glam-velvet-sofa')
    await screen.findByRole('heading', { name: 'Glam Velvet Sofa', level: 1 }, { timeout: 10_000 })
    const p = await glam()
    await act(async () => void (await service.unpublishProduct(p.id)))
    expect(await screen.findByRole('heading', { name: 'Product not available' })).toBeInTheDocument()
    expect(arButton()).toBeNull()
  })

  it('embed: after a rename the refetch is NOT_FOUND and shows "Product not available"', async () => {
    openApp('/embed/products/casa-lisboa/glam-velvet-sofa')
    await screen.findByRole('heading', { name: 'Glam Velvet Sofa', level: 1 }, { timeout: 10_000 })
    const p = await glam()
    await act(async () => void (await service.updateProduct(p.id, { slug: 'glam-velvet-sofa-2' })))
    expect(await screen.findByRole('heading', { name: 'Product not available' })).toBeInTheDocument()
    expect(arButton()).toBeNull()
  })

  it('embed: after unpublish the refetch is NOT_FOUND and shows "Product not available"', async () => {
    openApp('/embed/products/casa-lisboa/glam-velvet-sofa')
    await screen.findByRole('heading', { name: 'Glam Velvet Sofa', level: 1 }, { timeout: 10_000 })
    const p = await glam()
    await act(async () => void (await service.unpublishProduct(p.id)))
    expect(await screen.findByRole('heading', { name: 'Product not available' })).toBeInTheDocument()
    expect(arButton()).toBeNull()
  })
})

describe('vercel.json headers (R-W4-12)', () => {
  type Rule = { source: string; has?: { type: string; key: string }[]; headers: { key: string; value: string }[] }
  const rules = (JSON.parse(readFileSync(resolve(__dirname, '../../../vercel.json'), 'utf8')) as { headers: Rule[] }).headers
  const matches = (r: Rule, path: string, query: string[] = []) => new RegExp(`^${r.source}$`).test(path) && (r.has ?? []).every((h) => h.type === 'query' && query.includes(h.key))
  const noindex = (r: Rule) => r.headers.some((h) => h.key === 'X-Robots-Tag' && h.value === 'noindex')

  it('/embed/products/a/b gets X-Robots-Tag: noindex', () => {
    expect(rules.some((r) => noindex(r) && matches(r, '/embed/products/a/b'))).toBe(true)
  })

  it("a rule with has:[{type:'query', key:'preview'}] and source '/(.*)' sets X-Robots-Tag: noindex", () => {
    const r = rules.find((x) => x.source === '/(.*)' && x.has?.some((h) => h.type === 'query' && h.key === 'preview'))
    expect(r && noindex(r)).toBe(true)
  })

  it('/catalog/casa-lisboa without a query gets no X-Robots-Tag from any rule without a has', () => {
    expect(rules.some((r) => noindex(r) && !r.has && matches(r, '/catalog/casa-lisboa'))).toBe(false)
  })
})

describe('editor: a link with no label (R-W4-13)', { timeout: 30_000 }, () => {
  it("saving a product with a link and no label shows 'Add a button label, or remove the link.' under Button label", async () => {
    const user = userEvent.setup()
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'business_admin', businessId: 'biz_nord' }))
    openApp('/dashboard/products/new')
    await user.type(await screen.findByRole('textbox', { name: /^Product name/ }, { timeout: 10_000 }), 'Link test')
    await user.clear(screen.getByRole('textbox', { name: /^Button label/ }))
    await user.type(screen.getByLabelText(/^Button link/), 'https://shop.example/x')
    // The publish bar's Save draft (S4's 3D model request panel has its own for a new product).
    await user.click(within(screen.getByRole('region', { name: 'Save and publish' })).getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(screen.getAllByText('Add a button label, or remove the link.').length).toBeGreaterThan(0))
  })
})
