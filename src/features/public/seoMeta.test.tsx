import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { metaSnippet } from '@/lib/pageMeta'
import { service } from '@/services'

/** Renders the whole app (real router, providers and lazy routes) at `url`, as a crawler that runs JavaScript would. */
function openApp(url: string) {
  window.history.replaceState(null, '', url)
  return render(<App />)
}

const robots = () => document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? null
const description = () => document.querySelector('meta[name="description"]')?.getAttribute('content') ?? null

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {}) // jsdom has no scrolling; ScrollRestoration calls it
  localStorage.clear()
  sessionStorage.clear()
  await service.resetDemoData()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('not-found pages are marked noindex (P3D-03 / EF-18: the server answers 200 for them)', () => {
  it('an unknown public URL', async () => {
    openApp('/no-such-page')
    await screen.findByRole('heading', { name: 'Page not found', level: 1 })
    expect(robots()).toBe('noindex')
  })

  it('a catalogue that does not exist', async () => {
    openApp('/catalog/no-such-store')
    await screen.findByRole('heading', { name: 'Catalog not found' })
    expect(robots()).toBe('noindex')
    expect(document.title).toContain('Catalog not found')
  })

  it('a product that does not exist, and a draft asked for by a visitor', async () => {
    openApp('/products/nordhaus/no-such-product')
    await screen.findByRole('heading', { name: 'Product not available' })
    expect(robots()).toBe('noindex')
    cleanup()
    expect(robots()).toBeNull()

    openApp('/products/nordhaus/oslo-bar-stool?preview=1')
    await screen.findByRole('heading', { name: 'Product not available' })
    expect(robots()).toBe('noindex')
  })

  it('the tag goes away with the page', async () => {
    const { unmount } = openApp('/no-such-page')
    await screen.findByRole('heading', { name: 'Page not found', level: 1 })
    expect(robots()).toBe('noindex')
    unmount()
    expect(robots()).toBeNull()
  })

  it('a catalogue and a product that exist are not noindex', async () => {
    const products = await service.getProductsByBusiness('biz_nord')
    if (!products.ok) throw new Error('seed missing')
    const published = products.data.find((p) => p.status === 'published')!
    openApp(`/products/nordhaus/${published.slug}`)
    await screen.findByRole('heading', { level: 1 })
    expect(robots()).toBeNull()
    cleanup()
    openApp('/catalog/nordhaus')
    await screen.findByRole('heading', { name: 'Nordhaus Living', level: 1 })
    expect(robots()).toBeNull()
  })
})

describe('catalogue and product pages set a description (PSA-2)', () => {
  it('the catalogue names the business and never carries its internal description (ADR-0054)', async () => {
    openApp('/catalog/nordhaus')
    await screen.findByRole('heading', { name: 'Nordhaus Living', level: 1 })
    await waitFor(() => expect(description()).toBe('Nordhaus Living: the catalog, with photographs, interactive 3D and augmented reality.'))
  })

  it('a product uses its short description and gives the page back the default one when it closes', async () => {
    const before = description()
    const products = await service.getProductsByBusiness('biz_nord')
    if (!products.ok) throw new Error('seed missing')
    const published = products.data.find((p) => p.status === 'published')!
    const { unmount } = openApp(`/products/nordhaus/${published.slug}`)
    await screen.findByRole('heading', { level: 1 })
    await waitFor(() => expect(description()).toBe(metaSnippet(published.shortDescription.en)))
    unmount()
    expect(description()).toBe(before)
  })
})

describe('robots.txt and sitemap.xml are real files (ENV-SITE-01)', () => {
  const read = (name: string) => readFileSync(resolve(process.cwd(), 'public', name), 'utf8')

  it('robots.txt lets the public pages be crawled and keeps the dashboards, sign-in pages and embeds out', () => {
    const lines = read('robots.txt').split(/\r?\n/)
    expect(lines).toContain('User-agent: *')
    expect(lines).not.toContain('Disallow: /')
    for (const path of ['/admin', '/dashboard', '/embed/', '/login', '/reset-password', '/accept-invite'])
      expect(lines).toContain(`Disallow: ${path}`)
    expect(lines.some((l) => /^Sitemap: https:\/\/\S+\/sitemap\.xml$/.test(l))).toBe(true)
  })

  it('sitemap.xml lists only the fixed public pages', () => {
    const urls = [...read('sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname)
    expect(urls).toEqual(['/', '/apply', '/privacy', '/terms'])
  })
})

describe('metaSnippet', () => {
  it('collapses whitespace and cuts long text at a word boundary with an ellipsis', () => {
    expect(metaSnippet('  A   quiet\n chair. ')).toBe('A quiet chair.')
    const long = Array.from({ length: 60 }, () => 'word').join(' ')
    const out = metaSnippet(long)
    expect(out.length).toBeLessThanOrEqual(160)
    expect(out.endsWith('…')).toBe(true)
    expect(out).not.toMatch(/wor…$/)
  })

  it('is empty for nothing', () => {
    expect(metaSnippet(undefined)).toBe('')
  })
})
