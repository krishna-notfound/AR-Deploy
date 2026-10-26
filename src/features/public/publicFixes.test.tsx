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
import { ok } from '@/services/catalogService'
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
    const back = screen.getAllByRole('link').find((a) => a.getAttribute('href')?.startsWith('/catalog/nordhaus') && /back/i.test(a.textContent ?? ''))
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
    await screen.findByText(/^\d+ products$/)
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
  const matches = (r: Rule, path: string, query: string[] = []) =>
    new RegExp(`^${r.source}$`).test(path) && (r.has ?? []).every((h) => h.type === 'query' && query.includes(h.key))
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
