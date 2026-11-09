import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { type LandingCollection, SITE_ASSET_PATH, emptySiteContent } from '@/domain/siteContent'
import { content, service, siteAssetUrl } from '@/services'
import { useLandingShowcase } from '@/services/contentHooks'
import { store } from '@/services/mock/store'

const asAdmin = () => localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))
const file = (name: string, type: string, size = 1024) => new File([new Uint8Array(size)], name, { type })

let urlSeq = 0
beforeEach(async () => {
  urlSeq = 0
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  Object.assign(URL, { createObjectURL: vi.fn(() => `blob:test/${++urlSeq}`) })
  localStorage.clear()
  sessionStorage.clear()
  await service.resetDemoData()
})
afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('content.uploadSiteAsset (demo)', () => {
  it('stores a picture and a model under landing/<uuid>.<ext> and resolves them to session-only object URLs', async () => {
    asAdmin()
    const img = await content.uploadSiteAsset(file('Sofa.JPEG', 'image/jpeg'), 'image')
    const glb = await content.uploadSiteAsset(file('sofa.glb', 'model/gltf-binary'), 'glb')
    if (!img.ok || !glb.ok) throw new Error('upload')
    expect(img.data.path).toMatch(SITE_ASSET_PATH)
    expect(img.data.path.endsWith('.jpg')).toBe(true)
    expect(glb.data.path.endsWith('.glb')).toBe(true)
    expect(siteAssetUrl(img.data)).toBe('blob:test/1')
    expect(siteAssetUrl(glb.data)).toBe('blob:test/2')
    expect(siteAssetUrl({ path: 'landing/unknown.png' })).toBe('')
  })

  it('refuses the wrong type, an empty file and a file over its cap, without storing anything', async () => {
    asAdmin()
    const bad = [
      await content.uploadSiteAsset(file('a.gif', 'image/gif'), 'image'),
      await content.uploadSiteAsset(file('a.png', 'image/png', 5 * 1024 * 1024 + 1), 'image'),
      await content.uploadSiteAsset(file('a.glb', 'model/gltf-binary', 30 * 1024 * 1024 + 1), 'glb'),
      await content.uploadSiteAsset(file('a.glb', 'model/gltf-binary', 0), 'glb'),
      await content.uploadSiteAsset(file('a.png', 'image/png'), 'glb'),
    ]
    for (const r of bad) expect(r.ok === false && r.error.code).toBe('VALIDATION')
    expect(URL.createObjectURL).not.toHaveBeenCalled()
  })

  it('needs content.manage', async () => {
    const r = await content.uploadSiteAsset(file('a.png', 'image/png'), 'image')
    expect(r.ok === false && r.error.code).toBe('PERMISSION')
  })
})

describe('published showcase and uploaded collection picture', () => {
  it('useLandingShowcase returns the published showcase, and a collection card shows its uploaded picture', { timeout: 40_000 }, async () => {
    asAdmin()
    const img = await content.uploadSiteAsset(file('card.webp', 'image/webp'), 'image')
    if (!img.ok) throw new Error('upload')
    const card: LandingCollection = { id: crypto.randomUUID(), slug: 'mine', products: [], title: { en: 'Mine' }, image: img.data, link: { kind: 'collection' } }
    const doc = { ...emptySiteContent(), landing: { collections: [card], showcase: { title: { en: 'Own piece' }, image: img.data } } }
    const s = await content.getContentDraft()
    if (!s.ok) throw new Error('draft')
    const saved = await content.saveContentDraft(doc, s.data.draftUpdatedAt)
    if (!saved.ok) throw new Error('save')
    const p = await content.publishContent(saved.data.draftUpdatedAt)
    if (!p.ok) throw new Error('publish')
    localStorage.clear()

    const { result } = renderHook(() => useLandingShowcase())
    await waitFor(() => expect(result.current.showcase?.title.en).toBe('Own piece'))

    window.history.replaceState(null, '', '/')
    render(<App />)
    await waitFor(() => expect(document.querySelector('a[href="/collections/mine"] img')).toHaveAttribute('src', 'blob:test/1'), { timeout: 10_000 })
  })
})

const openAt = (path: string) => {
  window.history.replaceState(null, '', path)
  return render(<App />)
}
const housePieces = async () => {
  const r = await service.getShowcase()
  if (!r.ok) throw new Error('showcase')
  return r.data
}

describe('Showcase tab (ADR-0047)', () => {
  it('lists the four house pieces with status, 3D chip and date, and offers "New piece"', { timeout: 40_000 }, async () => {
    asAdmin()
    const { business, products } = await housePieces()
    expect(products).toHaveLength(4)
    openAt('/admin/editor/showcase')
    const list = await screen.findByRole('list', { name: 'Showcase pieces' }, { timeout: 15_000 })
    const cards = within(list).getAllByRole('listitem')
    expect(cards).toHaveLength(4)
    for (const [i, p] of products.entries()) {
      const link = within(cards[i]!).getByRole('link', { name: `Edit ${p.name.en}` })
      expect(link).toHaveAttribute('href', `/admin/editor/showcase/${p.id}/edit`)
      expect(within(cards[i]!).getByText('Published')).toBeInTheDocument()
      expect(within(cards[i]!).getByText('3D')).toBeInTheDocument()
      expect(within(cards[i]!).getByText(/^Updated /)).toBeInTheDocument()
    }
    expect(screen.getByRole('link', { name: 'New piece' })).toHaveAttribute('href', '/admin/editor/showcase/new')
    // The tab is in the Editor menu, before Landing page.
    const menu = screen.getByRole('navigation', { name: 'Editor sections' })
    expect(within(menu).getAllByRole('link').map((a) => a.textContent)).toEqual(['Pages', 'Showcase', 'Landing page', 'Application form', 'Social media', 'Site'])
    expect(business.house).toBe(true)
  })

  it('shows a draft piece as Draft, and the empty state when there are none', { timeout: 40_000 }, async () => {
    asAdmin()
    const { products } = await housePieces()
    const unpublished = await service.unpublishProduct(products[0]!.id)
    expect(unpublished.ok).toBe(true)
    const first = openAt('/admin/editor/showcase')
    const list = await screen.findByRole('list', { name: 'Showcase pieces' }, { timeout: 15_000 })
    expect(within(list).getAllByText('Draft')).toHaveLength(1)
    first.unmount()

    for (const p of products) await service.deleteProduct(p.id)
    openAt('/admin/editor/showcase')
    expect(await screen.findByText('Your own pieces for the landing page. Visitors never see them as a business.', {}, { timeout: 15_000 })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'New piece' })).toHaveLength(1) // only the one in the empty state
  })

  it('shows an error with Try again when the showcase cannot be read', { timeout: 40_000 }, async () => {
    asAdmin()
    vi.spyOn(service, 'getShowcase').mockResolvedValue({ ok: false, error: { code: 'UNKNOWN', message: 'boom' } })
    openAt('/admin/editor/showcase')
    expect(await screen.findByRole('button', { name: 'Try again' }, { timeout: 15_000 })).toBeInTheDocument()
  })

  it('hides the tab and the route from someone with content.manage but without products.edit', { timeout: 40_000 }, async () => {
    store.update((db) => void (db.team!.rolePermissions.team = ['products.view', 'content.manage']))
    localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin', platformRole: 'team' }))
    const first = openAt('/admin/editor/pages')
    const menu = await screen.findByRole('navigation', { name: 'Editor sections' }, { timeout: 15_000 })
    expect(within(menu).getAllByRole('link').map((a) => a.textContent)).toEqual(['Pages', 'Landing page', 'Application form', 'Social media', 'Site'])
    first.unmount()
    openAt('/admin/editor/showcase')
    expect(await screen.findByRole('heading', { name: /access/i }, { timeout: 15_000 })).toBeInTheDocument()
    expect(screen.queryByRole('list', { name: 'Showcase pieces' })).toBeNull()
  })
})

describe('Shared product editor on a showcase piece (scope "house")', () => {
  it('creates a piece for the house business without a business picker, and opens it at the Showcase edit address', { timeout: 60_000 }, async () => {
    asAdmin()
    const { business } = await housePieces()
    openAt('/admin/editor/showcase/new')
    const name = await screen.findByRole('textbox', { name: /^Product name/ }, { timeout: 15_000 })
    expect(screen.queryByRole('combobox', { name: /Business/ })).toBeNull()
    await userEvent.type(name, 'Showcase armchair')
    await userEvent.click(within(screen.getByRole('region', { name: 'Save and publish' })).getByRole('button', { name: 'Save draft' }))
    await waitFor(() => expect(window.location.pathname).toMatch(/^\/admin\/editor\/showcase\/[^/]+\/edit$/), { timeout: 15_000 })
    const after = await housePieces()
    const created = after.products.find((p) => p.name.en === 'Showcase armchair')
    expect(created?.businessId).toBe(business.id)
    expect(created?.status).toBe('draft')
    // Never listed under a real business.
    const all = await service.getProducts()
    expect(all.ok && all.data.some((p) => p.id === created?.id)).toBe(false)
  })

  it('opens a house piece, and says "not found" for a product of a real business', { timeout: 60_000 }, async () => {
    asAdmin()
    const { products } = await housePieces()
    const first = openAt(`/admin/editor/showcase/${products[0]!.id}/edit`)
    expect(await screen.findByDisplayValue(products[0]!.name.en, {}, { timeout: 15_000 })).toBeInTheDocument()
    first.unmount()
    const real = await service.getProducts()
    if (!real.ok) throw new Error('products')
    openAt(`/admin/editor/showcase/${real.data[0]!.id}/edit`)
    expect(await screen.findByText('Product not found', {}, { timeout: 15_000 })).toBeInTheDocument()
  })
})
