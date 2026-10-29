import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { ACCOUNT_KEY } from '@/auth/AccountProvider'
import type { Product } from '@/domain/types'
import { catalogPublicUrl, productPublicUrl } from '@/lib/urls'
import { account, service } from '@/services'
import { ok } from '@/services/catalogService'
import { DEMO_CODE, resetMockAccount } from '@/services/mock/mockAccount'
import { OWNER_CLOSURE_LINE } from '../businesses/closure'
import { productArReadiness } from '../products/productReadiness'

// The QR library draws on a canvas jsdom does not have; record what each code would encode instead.
const qr = vi.hoisted(() => ({ encoded: [] as string[] }))
vi.mock('qrcode', () => ({
  default: {
    toDataURL: async (text: string) => {
      qr.encoded.push(text)
      return `data:image/png;base64,${btoa(text)}`
    },
  },
}))

/** Renders the whole app (router, providers, lazy routes) at `url`. */
function openApp(url: string, account?: { role: 'business_admin'; businessId: string }) {
  if (account) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account))
  window.history.replaceState(null, '', url)
  return render(<App />)
}
const asOwner = (businessId: string) => ({ role: 'business_admin' as const, businessId })

// Warm the lazy routes once: on a busy full run a cold import (charts included) can outlast the find timeouts.
beforeAll(async () => {
  await Promise.all([
    import('@/features/business/BusinessOverviewPage'),
    import('@/features/business/MyProductsPage'),
    import('@/features/business/BusinessAnalyticsPage'),
    import('@/features/business/MyCatalogPage'),
    import('@/features/public/CatalogPage'),
    import('@/features/public/ProductPage'),
  ])
}, 60_000)

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.spyOn(window, 'open').mockImplementation(() => null)
  localStorage.clear()
  sessionStorage.clear()
  qr.encoded.length = 0
  await service.resetDemoData()
})

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('catalogue status notice (DUX-01)', () => {
  // First test to open the lazy overview page (charts included): a cold import can exceed 5 s on a loaded run.
  it('tells the owner of a paused business on every dashboard page', { timeout: 20_000 }, async () => {
    openApp('/dashboard', asOwner('biz_oak'))
    expect(await screen.findByText('Your catalog is paused.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Preview your catalog' })).toHaveAttribute('href', '/catalog/oak-ember?preview=1')
    // The page itself is lazy-loaded after the shell: wait for it before looking for its header button.
    await screen.findByRole('heading', { name: 'Overview', level: 1 }, { timeout: 15_000 })
    // The only catalog link in the page chrome is the top bar's (D5); the header no longer repeats it.
    expect(screen.getByRole('link', { name: /^Preview catalog/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Preview catalog/ })).toBeNull()
  })

  it('keeps the "not public yet" copy for a draft business', async () => {
    await service.setBusinessStatus('biz_oak', 'draft')
    openApp('/dashboard/products', asOwner('biz_oak'))
    expect(await screen.findByText('Oak & Ember Studio is not public yet.')).toBeInTheDocument()
    expect(screen.queryByText('Your catalog is paused.')).toBeNull()
  })

  it('shows no notice for an active business', async () => {
    openApp('/dashboard', asOwner('biz_casa'))
    await screen.findByRole('heading', { name: 'Overview', level: 1 })
    await screen.findByRole('link', { name: /^View catalog/ })
    expect(screen.queryByText('Your catalog is paused.')).toBeNull()
    expect(screen.queryByText(/is not public yet/)).toBeNull()
  })
})

describe('business Overview layout (dashboard clarity, D4 and D5)', () => {
  it('business Overview has no recent lists and links the catalog only from the top bar', async () => {
    openApp('/dashboard', asOwner('biz_casa'))
    await screen.findByRole('heading', { name: 'Overview', level: 1 })
    await screen.findByRole('heading', { name: 'Most viewed products' }, { timeout: 15_000 })
    expect(screen.queryByRole('heading', { name: /Recently added products|Recent products/ })).toBeNull()
    // Exactly one catalog link (the shell's "View catalog", or "Preview catalog" when not public) and it sits in the top bar.
    const links = screen.getAllByRole('link', { name: /^(View my catalog|View catalog|Preview catalog)/ })
    expect(links).toHaveLength(1)
    expect(links[0]?.closest('header')).not.toBeNull()
    expect(screen.queryByRole('button', { name: /View my catalog|Preview catalog/ })).toBeNull()
    // The title carries the business name next to the status, not as an eyebrow above it.
    expect(within(screen.getByRole('main')).getByText('Casa Lisboa Interiors')).toBeInTheDocument()
  })
})

describe('owner catalogue preview (DUX-02, ADR-0025)', () => {
  it('shows the paused catalogue to its signed-in owner with a preview banner', async () => {
    openApp('/catalog/oak-ember?preview=1', asOwner('biz_oak'))
    expect(await screen.findByText('Preview. Customers cannot see this catalog until it is activated.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Oak & Ember Studio', level: 1 })).toBeInTheDocument()
    const link = await screen.findByRole('link', { name: /Sunny Loveseat/ })
    expect(link).toHaveAttribute('href', '/products/oak-ember/sunny-loveseat?preview=1')
  })

  // R-W8-2: the demo follows the database's RLS, so a paused catalogue is not readable by outsiders at all. The page
  // shows the not-found state (the separate "unavailable" page was dropped), and no preview or content leaks.
  it('reads as not found to an anonymous visitor (R-W8-2)', async () => {
    openApp('/catalog/oak-ember?preview=1')
    expect(await screen.findByRole('heading', { name: 'Catalog not found' })).toBeInTheDocument()
    expect(screen.queryByText(/Preview\. Customers cannot see/)).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Oak & Ember Studio' })).toBeNull()
  })

  it('reads as not found to the owner of another business (R-W8-2)', async () => {
    openApp('/catalog/oak-ember?preview=1', asOwner('biz_casa'))
    expect(await screen.findByRole('heading', { name: 'Catalog not found' })).toBeInTheDocument()
    expect(screen.queryByText(/Preview\. Customers cannot see/)).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Oak & Ember Studio' })).toBeNull()
  })
})

describe('AR readiness in the product list (DUX-05)', () => {
  it('derives the label from the stored model files', () => {
    const glb = { url: 'x.glb', fileName: 'x.glb', status: 'valid' } as unknown as NonNullable<Product['models']['glb']>
    expect(productArReadiness({ models: {} })).toBe('photos-only')
    expect(productArReadiness({ models: { glb } })).toBe('android-only')
    expect(productArReadiness({ models: { glb, usdz: { ...glb, url: 'x.usdz', fileName: 'x.usdz' } } })).toBe('ready')
    // A GLB Scene Viewer cannot open is never presented as Android-ready.
    expect(productArReadiness({ models: { glb: { ...glb, requiredExtensions: ['EXT_texture_webp'] } } })).toBe('android-blocked')
    // Models only on the finishes (QA journey bug): the page has 3D and AR, so the list must not say "Photos only".
    const variant = { id: 'v1', name: { en: 'Sheen' } }
    expect(productArReadiness({ models: {}, variants: [{ ...variant, models: { glb } }] })).toBe('android-only')
    expect(productArReadiness({ models: {}, variants: [variant] })).toBe('photos-only')
  })

  it('labels each product and filters by readiness', async () => {
    const user = userEvent.setup()
    openApp('/dashboard/products', asOwner('biz_casa'))
    const table = await screen.findByRole('table')
    const row = (name: string) => within(table).getByRole('link', { name }).closest('tr') as HTMLElement
    await within(table).findByRole('link', { name: 'Atlantic Round Dining Table' })
    expect(within(row('Atlantic Round Dining Table')).getByText('Photos only')).toBeInTheDocument()
    expect(within(row('Glam Velvet Sofa')).getByText('Android only')).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: /AR attempts/ })).toBeInTheDocument()

    await user.selectOptions(screen.getByRole('combobox', { name: 'Filter by 3D and AR' }), 'photos-only')
    await waitFor(() => expect(within(screen.getByRole('table')).queryByRole('link', { name: 'Glam Velvet Sofa' })).toBeNull())
    expect(within(screen.getByRole('table')).getByRole('link', { name: 'Atlantic Round Dining Table' })).toBeInTheDocument()
  })
})

describe('My products when the business has none', () => {
  it('hides the filter toolbar and the second Add product, and shows both once there are products', async () => {
    const real = service.getProductsByBusiness.bind(service)
    const spy = vi.spyOn(service, 'getProductsByBusiness').mockResolvedValue(ok([]))
    const first = openApp('/dashboard/products', asOwner('biz_casa'))
    expect(await screen.findByText('Add your first product')).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByRole('combobox', { name: 'Filter by status' })).toBeNull()
    // Only the header button remains.
    expect(screen.getAllByRole('link', { name: /Add product/ })).toHaveLength(1)
    first.unmount()

    spy.mockImplementation(real)
    openApp('/dashboard/products', asOwner('biz_casa'))
    await screen.findByRole('table')
    expect(screen.getByRole('combobox', { name: 'Filter by status' })).toBeInTheDocument()
  })
})

describe('analytics labels (DUX-07)', () => {
  it('says "attempts", never "activations", and shows "No 3D" (not a number or a dash) for products without a 3D model', async () => {
    openApp('/dashboard/analytics', asOwner('biz_casa'))
    expect(await screen.findByText('Over page and embed views, last 30 days')).toBeInTheDocument()
    const table = await screen.findByRole('table', { name: 'Product performance' })
    const row = (await within(table).findByRole('link', { name: 'Atlantic Round Dining Table' })).closest('tr') as HTMLElement
    expect(within(row).getAllByText('No 3D')).toHaveLength(2)
    expect(within(row).queryByText('0.0%')).toBeNull()
    expect(document.body.textContent).not.toMatch(/activation/i)
  })
})

describe('shared analytics view (platform scope)', () => {
  it('labels the business filter, keeps the sample tag and lists views by business as plain truncated rows', { timeout: 20_000 }, async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' }))
    window.history.replaceState(null, '', '/admin/analytics')
    render(<App />)
    expect(await screen.findByLabelText('Business', undefined, { timeout: 15_000 })).toBeInTheDocument()
    expect(await screen.findByText('Sample data')).toBeInTheDocument()
    const list = await screen.findByRole('list', { name: 'Views by business' })
    const first = within(list).getAllByRole('listitem')[0]
    expect(first?.querySelector('[title]')?.getAttribute('title')).toBeTruthy()
    const ranks = within(screen.getByRole('heading', { name: 'Most viewed products' }).closest('div[class*="rounded"]') as HTMLElement)
    expect(ranks.queryByText('01')).toBeNull()
  })
})

describe('QR codes (ADR-0005, ADR-0025)', () => {
  it('the catalogue QR still encodes the catalogue URL', async () => {
    openApp('/dashboard/catalog', asOwner('biz_casa'))
    await screen.findByRole('img', { name: /^QR code linking to/ })
    expect(qr.encoded).toEqual([catalogPublicUrl({ slug: 'casa-lisboa' })])
  })

  it('the product QR encodes the public product URL, and only for published products', async () => {
    const user = userEvent.setup()
    openApp('/dashboard/products', asOwner('biz_casa'))
    const table = await screen.findByRole('table')
    const published = (await within(table).findByRole('link', { name: 'Glam Velvet Sofa' })).closest('tr') as HTMLElement
    await user.click(within(published).getByRole('button', { name: 'Actions for Glam Velvet Sofa' }))
    await user.click(screen.getByRole('menuitem', { name: 'Product QR code' }))
    const dialog = await screen.findByRole('dialog', { name: 'Product QR code' })
    await within(dialog).findByRole('img', { name: /^QR code linking to/ })
    expect(qr.encoded).toEqual([productPublicUrl({ slug: 'casa-lisboa' }, { slug: 'glam-velvet-sofa' })])
    await user.click(within(dialog).getByRole('button', { name: 'Close' }))

    const res = await service.getProducts({ businessId: 'biz_casa', status: 'draft' })
    const drafts = res.ok ? res.data : []
    const draft = drafts[0]
    if (!draft) throw new Error('seed has a Casa Lisboa draft')
    const draftRow = within(table).getByRole('link', { name: draft.name.en }).closest('tr') as HTMLElement
    await user.click(within(draftRow).getByRole('button', { name: `Actions for ${draft.name.en}` }))
    await user.click(screen.getByRole('menuitem', { name: 'Product QR code (not public yet)' }))
    const draftDialog = await screen.findByRole('dialog', { name: 'Product QR code' })
    expect(within(draftDialog).getByText('Not public yet.')).toBeInTheDocument()
    expect(within(draftDialog).queryByRole('img')).toBeNull()
    expect(qr.encoded).toHaveLength(1)
  })
})

describe('business Overview: Published hint and activity (R-W5-8, R-W5-5)', () => {
  const publishedHint = async () => {
    const figures = await screen.findByRole('region', { name: 'Key figures' }, { timeout: 15_000 })
    const term = await within(figures).findByText('Published')
    return term.closest('div')!.parentElement!
  }

  it("'In your catalog' active, 'Catalog not public yet' draft, 'Catalog paused' inactive", { timeout: 30_000 }, async () => {
    const cases: [string, string][] = [
      ['active', 'In your catalog'],
      ['draft', 'Catalog not public yet'],
      ['inactive', 'Catalog paused'],
    ]
    for (const [status, hint] of cases) {
      await service.setBusinessStatus('biz_casa', status as 'active' | 'draft' | 'inactive')
      const view = openApp('/dashboard', asOwner('biz_casa'))
      const stat = await publishedHint()
      expect(await within(stat).findByText(hint)).toBeInTheDocument()
      for (const other of cases.filter(([, h]) => h !== hint)) expect(within(stat).queryByText(other[1])).toBeNull()
      view.unmount()
      localStorage.clear()
    }
  })

  it("the owner's feed shows their catalog's changes, the platform team's included, and nothing of other businesses", { timeout: 20_000 }, async () => {
    const own = await service.getProductsByBusiness('biz_casa')
    if (!own.ok) throw new Error('seed products missing')
    const live = own.data.find((p) => p.status === 'published')!
    await service.unpublishProduct(live.id)
    await service.setBusinessStatus('biz_casa', 'inactive')
    await service.setBusinessStatus('biz_nord', 'inactive')
    openApp('/dashboard', asOwner('biz_casa'))
    const feed = await screen.findByRole('region', { name: 'Recent activity' }, { timeout: 15_000 })
    expect(await within(feed).findByText('Catalog for Casa Lisboa Interiors was paused')).toBeInTheDocument()
    expect(within(feed).getByText(`${live.name.en} was unpublished`)).toBeInTheDocument()
    expect(within(feed).queryByText(/Nordhaus/)).toBeNull()
  })
})

describe('business Overview: Changes by the platform team (R-W7-2)', () => {
  it("lists an Admin's pause of this catalogue and not the owner's own changes or another business's", { timeout: 20_000 }, async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))
    await service.setBusinessStatus('biz_casa', 'inactive')
    await service.setBusinessStatus('biz_nord', 'inactive')
    localStorage.clear()
    openApp('/dashboard', asOwner('biz_casa'))
    const card = await screen.findByRole('region', { name: 'Changes by the platform team' }, { timeout: 15_000 })
    expect(await within(card).findByText('Catalog for Casa Lisboa Interiors was paused')).toBeInTheDocument()
    expect(within(card).getAllByRole('listitem')).toHaveLength(1)
    expect(within(card).queryByText(/Nordhaus/)).toBeNull()
  })
})

describe("S2 Task 2: the owner's closure line follows the real status (R-W3-6)", () => {
  afterEach(() => resetMockAccount())
  const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

  it("the closure line reads 'Closure requested on {date} · ' + OWNER_CLOSURE_LINE[status]; the shell notice names the closure", { timeout: 20_000 }, async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(asOwner('biz_casa')))
    expect((await account.requestClosure(DEMO_CODE)).ok).toBe(true)
    openApp('/dashboard', asOwner('biz_casa'))
    const line = await screen.findByText(new RegExp(`^Closure requested on .+ · ${escape(OWNER_CLOSURE_LINE.inactive)}$`), {}, { timeout: 15_000 })
    expect(line).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'My account' })).toHaveAttribute('href', '/dashboard/settings/account')
    expect(screen.queryByText('Your catalog is paused.')).toBeNull()
  })

  it("a draft status reads 'Your catalog is not public yet.'", { timeout: 20_000 }, async () => {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(asOwner('biz_casa')))
    expect((await account.requestClosure(DEMO_CODE)).ok).toBe(true)
    await service.setBusinessStatus('biz_casa', 'draft')
    openApp('/dashboard', asOwner('biz_casa'))
    expect(await screen.findByText(/^Closure requested on .+ · Your catalog is not public yet\.$/, {}, { timeout: 15_000 })).toBeInTheDocument()
  })
})

describe('T6: business dashboard in Portuguese', () => {
  it('the Overview shows the Portuguese title, add button and card headings', { timeout: 20_000 }, async () => {
    localStorage.setItem('arfurn:lang', 'pt')
    openApp('/dashboard', asOwner('biz_casa'))
    await screen.findByRole('heading', { name: 'Visão geral', level: 1 }, { timeout: 15_000 })
    expect(screen.getByRole('link', { name: /Adicionar produto/ })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Produtos mais vistos' }, { timeout: 15_000 })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Overview' })).toBeNull()
  })
})
