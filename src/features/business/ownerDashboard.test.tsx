import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { ACCOUNT_KEY } from '@/auth/AccountProvider'
import type { Product } from '@/domain/types'
import { catalogPublicUrl, productPublicUrl } from '@/lib/urls'
import { service } from '@/services'
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
    expect(screen.getByRole('button', { name: 'Preview catalog (not public yet)' })).toBeInTheDocument()
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
    await screen.findByRole('button', { name: 'View my catalog' })
    expect(screen.queryByText('Your catalog is paused.')).toBeNull()
    expect(screen.queryByText(/is not public yet/)).toBeNull()
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

  it('still answers "unavailable" to an anonymous visitor', async () => {
    openApp('/catalog/oak-ember?preview=1')
    expect(await screen.findByRole('heading', { name: 'This catalog is currently unavailable' })).toBeInTheDocument()
    expect(screen.queryByText(/Preview\. Customers cannot see/)).toBeNull()
  })

  it('still answers "unavailable" to the owner of another business', async () => {
    openApp('/catalog/oak-ember?preview=1', asOwner('biz_casa'))
    expect(await screen.findByRole('heading', { name: 'This catalog is currently unavailable' })).toBeInTheDocument()
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

describe('analytics labels (DUX-07)', () => {
  it('says "attempts", never "activations", and shows "—" for products without a 3D model', async () => {
    openApp('/dashboard/analytics', asOwner('biz_casa'))
    expect(await screen.findByText('AR launch attempts per product page view')).toBeInTheDocument()
    const table = await screen.findByRole('table', { name: 'Product performance' })
    const row = (await within(table).findByRole('link', { name: 'Atlantic Round Dining Table' })).closest('tr') as HTMLElement
    expect(within(row).getAllByTitle('No 3D model')).toHaveLength(2)
    expect(within(row).queryByText('0.0%')).toBeNull()
    expect(document.body.textContent).not.toMatch(/activation/i)
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
