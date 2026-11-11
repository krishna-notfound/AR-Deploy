// Changeable catalogue banner (ADR-0065): the catalogue top shows the company's own banner, else the platform's default banner,
// else the built-in Sanctus photograph. Whole-app renders in demo mode, plus the pure choice.
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { emptySiteContent } from '@/domain/siteContent'
import { content, service } from '@/services'
import { CATALOG_PHOTO, CATALOG_PHOTO_POSITION, chooseCatalogBanner } from './catalogBanner'

const OWN = 'data:image/webp;base64,own'

function openApp(url: string) {
  window.history.replaceState(null, '', url)
  return render(<App />)
}

/** Uploads a picture as the platform's default banner and publishes it (the signed-in editor is gone afterwards, like a visitor). */
async function publishDefaultBanner() {
  localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))
  const up = await content.uploadSiteAsset(new File([new Uint8Array(64)], 'banner.png', { type: 'image/png' }), 'image')
  if (!up.ok) throw new Error('upload')
  const s = await content.getContentDraft()
  if (!s.ok) throw new Error('draft')
  const saved = await content.saveContentDraft({ ...emptySiteContent(), chrome: { catalogBanner: up.data } }, s.data.draftUpdatedAt)
  if (!saved.ok) throw new Error('save')
  const p = await content.publishContent(saved.data.draftUpdatedAt)
  if (!p.ok) throw new Error(JSON.stringify(p.error))
  localStorage.clear()
}

async function setOwnBanner(slug: string) {
  const all = await service.getBusinesses()
  const b = all.ok ? all.data.find((x) => x.slug === slug) : undefined
  if (!b) throw new Error(`no ${slug}`)
  const r = await service.updateBusiness(b.id, { banner: { url: OWN } })
  if (!r.ok) throw new Error('banner')
}

/** The picture of the catalogue top: the only image inside the section named by the h1. */
async function topPicture(name: RegExp | string) {
  const h1 = await screen.findByRole('heading', { level: 1, name })
  return h1.closest('section')!.querySelector<HTMLImageElement>('img[data-banner]')
}

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:default-banner/1') })
  localStorage.clear()
  sessionStorage.clear()
  await service.resetDemoData()
})
afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('chooseCatalogBanner: the order', () => {
  const site = (over: Partial<Parameters<typeof chooseCatalogBanner>[1]> = {}) => ({ loading: false, defaultBanner: undefined, ...over })

  it('the company own banner wins, even over a default and while the site content loads', () => {
    expect(chooseCatalogBanner({ banner: { url: OWN } }, site({ defaultBanner: { path: 'landing/a.webp' } }))).toEqual({ source: 'own', src: OWN })
    expect(chooseCatalogBanner({ banner: { url: OWN } }, site({ loading: true }))).toEqual({ source: 'own', src: OWN })
  })

  it('without its own banner, the built-in photograph shows when the platform has set none', () => {
    expect(chooseCatalogBanner({}, site())).toEqual({ source: 'builtin', src: CATALOG_PHOTO })
  })

  it('waits (no picture yet) while the site content loads and the company has none, so the built-in photo does not flash', () => {
    expect(chooseCatalogBanner({}, site({ loading: true }))).toBeNull()
  })

  it('a default whose address is not available (a demo upload after a reload) falls back to the built-in photograph', () => {
    expect(chooseCatalogBanner({}, site({ defaultBanner: { path: 'landing/never-uploaded-in-this-session.webp' } }))).toEqual({ source: 'builtin', src: CATALOG_PHOTO })
  })
})

describe('the catalogue top', () => {
  it('shows the built-in Sanctus photograph, anchored as before, when nothing is set', async () => {
    openApp('/catalog/nordhaus')
    const img = await waitFor(async () => {
      const el = await topPicture('Nordhaus Living')
      if (!el) throw new Error('no picture yet')
      return el
    })
    expect(img).toHaveAttribute('src', CATALOG_PHOTO)
    expect(img).toHaveAttribute('data-banner', 'builtin')
    expect(img.className).toContain(CATALOG_PHOTO_POSITION)
    expect(img.className).toContain('object-cover')
  })

  it("shows the platform's default banner on every catalogue without a banner of its own", async () => {
    await publishDefaultBanner()
    const view = openApp('/catalog/nordhaus')
    await waitFor(async () => expect(await topPicture('Nordhaus Living')).toHaveAttribute('src', 'blob:default-banner/1'))
    const img = (await topPicture('Nordhaus Living'))!
    expect(img).toHaveAttribute('data-banner', 'default')
    expect(img.className).not.toContain(CATALOG_PHOTO_POSITION)
    expect(img.className).toContain('object-cover')
    view.unmount()
    openApp('/catalog/casa-lisboa')
    await waitFor(async () => expect(await topPicture(/Casa/)).toHaveAttribute('src', 'blob:default-banner/1'))
  })

  it("shows the company's own banner over the default, and another company still shows the default; Remove goes back to it", async () => {
    await publishDefaultBanner()
    await setOwnBanner('nordhaus')
    const view = openApp('/catalog/nordhaus')
    await waitFor(async () => expect(await topPicture('Nordhaus Living')).toHaveAttribute('src', OWN))
    expect((await topPicture('Nordhaus Living'))!).toHaveAttribute('data-banner', 'own')
    view.unmount()

    openApp('/catalog/casa-lisboa')
    await waitFor(async () => expect(await topPicture(/Casa/)).toHaveAttribute('src', 'blob:default-banner/1'))
  })

  it('keeps the name, the eyebrow, the logo and the piece count over the picture, with the dark veil, whichever picture shows', async () => {
    await setOwnBanner('nordhaus')
    openApp('/catalog/nordhaus')
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Nordhaus Living' })
    const section = h1.closest('section')!
    await screen.findByText(/^\d+ products$/)
    expect(section.querySelector('.bg-obsidian\\/45')).not.toBeNull() // the veil
    expect(section.querySelector('.bg-linear-to-t')).not.toBeNull() // the gradient
    expect(section).toHaveTextContent('Catalog')
    expect(section.querySelector('img:not([data-banner])')).not.toBeNull() // the logo
  })

  it('a visitor sees the picture only: the original and the crop are not part of a public read', async () => {
    const all = await service.getBusinesses()
    const b = all.ok ? all.data.find((x) => x.slug === 'nordhaus')! : undefined
    await service.updateBusiness(b!.id, { banner: { url: OWN, originalUrl: 'data:image/jpeg;base64,orig', crop: { x: 1, y: 2, width: 30, height: 15 } } })
    const read = await service.getBusinessBySlug('nordhaus')
    expect(read.ok && read.data.banner).toEqual({ url: OWN })
  })
})
