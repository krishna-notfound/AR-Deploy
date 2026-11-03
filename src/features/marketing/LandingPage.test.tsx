// The landing page speaks to a furniture business owner: a clear apply button in the header on every width, one hero action
// that opens the admin's own showcase piece (ADR-0047), and facts that match the product (AR in Chrome first on Android).
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptySiteContent, HOUSE_BUSINESS_SLUG } from '@/domain/siteContent'
import { LANG_KEY, LanguageProvider } from '@/i18n/LanguageProvider'
import { APPLY_PATH } from '@/lib/urls'
import { content, service } from '@/services'
import LandingPage from './LandingPage'

/** The showcase pieces of the demo data, newest first as the page sees them. */
async function housePieces() {
  const r = await service.getShowcase()
  if (!r.ok) throw new Error('showcase')
  return r.data.products.filter((p) => p.status === 'published')
}

/** Publishes landing refs through the demo service, as the Editor does. */
async function publishLanding(landing: Record<string, unknown>) {
  localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))
  const s = await content.getContentDraft()
  if (!s.ok) throw new Error('draft')
  const saved = await content.saveContentDraft({ ...emptySiteContent(), landing: { collections: [], ...landing } }, s.data.draftUpdatedAt)
  if (!saved.ok) throw new Error('save')
  const p = await content.publishContent(saved.data.draftUpdatedAt)
  if (!p.ok) throw new Error(JSON.stringify(p.error))
  localStorage.clear() // the visitor is not signed in
}

function renderLanding(lang: 'en' | 'pt' = 'en') {
  localStorage.setItem(LANG_KEY, lang)
  return render(
    <LanguageProvider>
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    </LanguageProvider>,
  )
}

describe('landing page for a business owner', () => {
  beforeEach(async () => {
    localStorage.clear()
    await service.resetDemoData()
  })
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('has an apply button in the header bar (desktop and phone labels) that opens /apply', () => {
    renderLanding()
    const header = screen.getByRole('banner')
    const links = within(header).getAllByRole('link', { name: 'Apply as a business' })
    expect(links.length).toBeGreaterThan(0)
    for (const l of links) expect(l).toHaveAttribute('href', APPLY_PATH)
    // The bar link carries both the short phone label and the full label; the menu does not hide it.
    const bar = links.find((l) => !l.closest('dialog'))!
    expect(bar).toHaveTextContent('Apply')
    expect(bar.className).not.toMatch(/\bhidden\b/)
  })

  it('says what Sanctus is for businesses; the hero has one action, "See a live example", and no apply button', async () => {
    renderLanding()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('3D and AR catalogues for furniture brands.')
    const hero = screen.getByRole('heading', { level: 1 }).closest('section')!
    const example = await within(hero).findByRole('link', { name: 'See a live example' })
    expect(within(hero).getAllByRole('link')).toHaveLength(1)
    expect(within(hero).queryByRole('link', { name: /Apply as a business/ })).toBeNull()
    // It opens one of the admin's own pieces, in the site's own style.
    const slugs = (await housePieces()).map((p) => p.slug)
    const slug = example.getAttribute('href')!.replace('/showcase/', '')
    expect(example.getAttribute('href')).toMatch(/^\/showcase\//)
    expect(slugs).toContain(slug)
    expect(example.className).toMatch(/bg-ink/) // the primary (obsidian) button
  })

  it('"See a live example" opens landing.example when the admin chose one, else the 3D card\'s piece', async () => {
    const pieces = await housePieces()
    const [a, b] = [pieces[0]!, pieces[pieces.length - 1]!]
    expect(a.slug).not.toBe(b.slug)
    await publishLanding({ example: { businessSlug: HOUSE_BUSINESS_SLUG, productSlug: b.slug }, featured: { businessSlug: HOUSE_BUSINESS_SLUG, productSlug: a.slug } })
    const first = renderLanding()
    expect(await screen.findByRole('link', { name: 'See a live example' })).toHaveAttribute('href', `/showcase/${b.slug}`)
    first.unmount()

    await publishLanding({ featured: { businessSlug: HOUSE_BUSINESS_SLUG, productSlug: a.slug } })
    renderLanding()
    await waitFor(() => expect(screen.getByRole('link', { name: 'See a live example' })).toHaveAttribute('href', `/showcase/${a.slug}`))
  })

  it('never reads a business\'s products or businesses for its showcase content', async () => {
    const products = vi.spyOn(service, 'getProducts')
    const businesses = vi.spyOn(service, 'getBusinesses')
    const catalogs = vi.spyOn(service, 'getCatalogs')
    renderLanding()
    await screen.findByRole('link', { name: 'See a live example' })
    await within(document.getElementById('experiencia')!).findByRole('button', { name: '3D' })
    expect(products).not.toHaveBeenCalled()
    expect(businesses).not.toHaveBeenCalled()
    expect(catalogs).not.toHaveBeenCalled()
  })

  it('has no example button when the showcase has no published piece', async () => {
    const pieces = await housePieces()
    localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))
    for (const p of pieces) {
      const r = await service.unpublishProduct(p.id)
      if (!r.ok) throw new Error(JSON.stringify(r.error))
    }
    localStorage.clear() // the visitor is not signed in
    renderLanding()
    const xp = document.getElementById('experiencia')!
    expect(await within(xp).findByText(/Illustrative piece/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'See a live example' })).toBeNull()
  })

  it('explains the four steps for a business and ends with the apply button', () => {
    renderLanding()
    const how = screen.getByRole('heading', { name: /How it works for your business/ }).closest('section')!
    expect(within(how).getAllByRole('listitem')).toHaveLength(4)
    expect(how).toHaveTextContent('3D model request')
    expect(within(how).getByRole('link', { name: /Apply as a business/ })).toHaveAttribute('href', APPLY_PATH)
  })

  it('names Chrome (WebXR) first for Android AR, with Scene Viewer only as the fallback', () => {
    renderLanding()
    const xp = document.getElementById('experiencia')!
    expect(xp).toHaveTextContent(/inside Chrome, with Scene Viewer as the fallback/)
    expect(xp).not.toHaveTextContent('Android with Scene Viewer')
  })

  it('shows a showcase piece with a model in the 3D section; its call to action switches the card to 3D in place', async () => {
    renderLanding()
    const xp = document.getElementById('experiencia')!
    const three = await within(xp).findByRole('button', { name: '3D' })
    expect(three).toHaveAttribute('aria-pressed', 'false')
    expect(xp).not.toHaveTextContent('Illustrative piece')
    expect(within(xp).getByRole('button', { name: 'View in your room' })).toBeInTheDocument()
    fireEvent.click(within(xp).getByRole('button', { name: /Open a live piece in 3D/ }))
    expect(three).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows the 3D section in Portuguese too', async () => {
    renderLanding('pt')
    const xpPt = document.getElementById('experiencia')!
    expect(await within(xpPt).findByRole('button', { name: '3D' })).toBeInTheDocument()
    expect(within(xpPt).getByRole('button', { name: 'Imagem' })).toBeInTheDocument()
    expect(xpPt).toHaveTextContent('Chrome')
    expect(screen.getAllByRole('link', { name: 'Candidatar a sua empresa' })[0]).toHaveAttribute('href', APPLY_PATH)
  })
})
