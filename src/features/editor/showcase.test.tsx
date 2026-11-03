import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { type LandingCollection, SITE_ASSET_PATH, emptySiteContent } from '@/domain/siteContent'
import { content, service, siteAssetUrl } from '@/services'
import { useLandingShowcase } from '@/services/contentHooks'

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

describe('Landing editor: 3D showcase panel', () => {
  it('uploads a picture and a 3D model, shows the preview, saves them in the draft, and removes them', { timeout: 40_000 }, async () => {
    asAdmin()
    window.history.replaceState(null, '', '/admin/editor/landing')
    render(<App />)
    expect(await screen.findByRole('heading', { name: '3D showcase' })).toBeInTheDocument()

    await userEvent.upload(screen.getAllByTestId('upload-image')[0]!, file('sofa.png', 'image/png'))
    const preview = await screen.findByAltText('The uploaded showcase picture')
    expect(preview).toHaveAttribute('src', 'blob:test/1')
    await userEvent.upload(screen.getByTestId('upload-glb'), file('sofa.glb', 'model/gltf-binary'))
    expect(await screen.findByText(/Model uploaded: /)).toBeInTheDocument()
    await userEvent.type(screen.getByRole('textbox', { name: /Showcase title \(English\)/ }), 'The Linden sofa')

    await waitFor(
      async () => {
        const s = await content.getContentDraft()
        const sc = s.ok ? s.data.draft.landing.showcase : undefined
        expect(sc?.title.en).toBe('The Linden sofa')
        expect(sc?.image?.path).toMatch(SITE_ASSET_PATH)
        expect(sc?.model?.glb.path.endsWith('.glb')).toBe(true)
      },
      { timeout: 8000 },
    )

    await userEvent.click(screen.getByRole('button', { name: 'Remove the showcase' }))
    await waitFor(async () => {
      const s = await content.getContentDraft()
      expect(s.ok && s.data.draft.landing.showcase).toBeFalsy()
    }, { timeout: 8000 })
  })

  it('shows the error when a file is refused and keeps the draft unchanged', { timeout: 30_000 }, async () => {
    asAdmin()
    window.history.replaceState(null, '', '/admin/editor/landing')
    render(<App />)
    await screen.findByRole('heading', { name: '3D showcase' })
    await userEvent.upload(screen.getByTestId('upload-glb'), file('sofa.glb', 'model/gltf-binary', 30 * 1024 * 1024 + 1))
    expect(await screen.findByRole('alert')).toHaveTextContent(/too large/i)
    expect(screen.queryByText(/Model uploaded: /)).toBeNull()
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
