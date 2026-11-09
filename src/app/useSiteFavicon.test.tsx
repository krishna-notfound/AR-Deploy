// The site icon from the Website Editor (ADR-0053): with a published favicon the page's icon links point to it; without one the
// built-in links from index.html stay.
import { render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptySiteContent } from '@/domain/siteContent'
import { content, service } from '@/services'
import { applyFavicon, useSiteFavicon } from './useSiteFavicon'

function Probe() {
  useSiteFavicon()
  return null
}

/** What index.html ships. */
function builtinIcons() {
  document.head.innerHTML = `
    <link rel="icon" href="/favicon.ico" sizes="48x48" />
    <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />`
}
const icons = () => Array.from(document.head.querySelectorAll('link[rel="icon"]')).map((l) => l.getAttribute('href'))
const touch = () => document.head.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href')

async function publishFavicon() {
  localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))
  const up = await content.uploadSiteAsset(new File([new Uint8Array(64)], 'icon.png', { type: 'image/png' }), 'favicon')
  if (!up.ok) throw new Error('upload')
  const s = await content.getContentDraft()
  if (!s.ok) throw new Error('draft')
  const saved = await content.saveContentDraft({ ...emptySiteContent(), chrome: { favicon: up.data } }, s.data.draftUpdatedAt)
  if (!saved.ok) throw new Error('save')
  const p = await content.publishContent(saved.data.draftUpdatedAt)
  if (!p.ok) throw new Error(JSON.stringify(p.error))
  localStorage.clear()
}

beforeEach(async () => {
  localStorage.clear()
  builtinIcons()
  await service.resetDemoData()
})
afterEach(() => {
  vi.restoreAllMocks()
  document.head.innerHTML = ''
})

describe('applyFavicon', () => {
  it('replaces the icon links by one PNG icon and points the apple-touch-icon at the same file; calling it again updates, not duplicates', () => {
    applyFavicon('https://x.test/a.png')
    expect(icons()).toEqual(['https://x.test/a.png'])
    expect(touch()).toBe('https://x.test/a.png')
    expect(document.head.querySelector('link[rel="apple-touch-icon"]')?.hasAttribute('sizes')).toBe(false)
    applyFavicon('https://x.test/b.png')
    expect(icons()).toEqual(['https://x.test/b.png'])
    expect(document.head.querySelectorAll('link[rel="apple-touch-icon"]')).toHaveLength(1)
  })

  it('adds an apple-touch-icon when the page has none', () => {
    document.head.innerHTML = ''
    applyFavicon('https://x.test/a.png')
    expect(touch()).toBe('https://x.test/a.png')
  })
})

describe('useSiteFavicon', () => {
  it('leaves the built-in icons when no favicon is published', async () => {
    const read = vi.spyOn(content, 'getPublishedChrome')
    render(<Probe />)
    await waitFor(() => expect(read).toHaveBeenCalled())
    await read.mock.results[0]!.value
    expect(icons()).toEqual(['/favicon.ico', '/favicon-32x32.png'])
    expect(touch()).toBe('/apple-touch-icon.png')
  })

  it('leaves the built-in icons when the read fails', async () => {
    const read = vi.spyOn(content, 'getPublishedChrome').mockResolvedValue({ ok: false, error: { code: 'UNKNOWN', message: 'x' } })
    render(<Probe />)
    await waitFor(() => expect(read).toHaveBeenCalled())
    await read.mock.results[0]!.value
    expect(icons()).toEqual(['/favicon.ico', '/favicon-32x32.png'])
  })

  it('points the icon links at the published favicon', async () => {
    Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:favicon/1') })
    await publishFavicon()
    render(<Probe />)
    await waitFor(() => expect(icons()).toEqual(['blob:favicon/1']))
    expect(touch()).toBe('blob:favicon/1')
  })
})
