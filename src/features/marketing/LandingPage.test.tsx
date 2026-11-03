// The landing page speaks to a furniture business owner: a clear apply button on every width, hero calls to action that
// go somewhere real, and facts that match the product (AR in Chrome first on Android, prices in euros).
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LANG_KEY, LanguageProvider } from '@/i18n/LanguageProvider'
import { APPLY_PATH } from '@/lib/urls'
import LandingPage from './LandingPage'

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
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

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

  it('says what Sanctus is for businesses and gives the hero a real apply link and a real example link', async () => {
    renderLanding()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('3D and AR catalogues for furniture brands.')
    const hero = screen.getByRole('heading', { level: 1 }).closest('section')!
    expect(within(hero).getByRole('link', { name: /Apply as a business/ })).toHaveAttribute('href', APPLY_PATH)
    const example = await within(hero).findByRole('link', { name: 'See a live example' })
    expect(example.getAttribute('href')).toMatch(/^\/(catalog|[\w-]+\/)/)
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

  it('shows the illustrative piece in euros, in both languages', () => {
    const { unmount } = renderLanding()
    const xp = document.getElementById('experiencia')!
    expect(xp).toHaveTextContent('€')
    expect(xp).not.toHaveTextContent('R$')
    expect(xp).toHaveTextContent('Illustrative piece')
    unmount()
    renderLanding('pt')
    const xpPt = document.getElementById('experiencia')!
    expect(xpPt).toHaveTextContent('€')
    expect(xpPt).toHaveTextContent('Peça ilustrativa')
    expect(xpPt).toHaveTextContent('Chrome')
    expect(screen.getAllByRole('link', { name: 'Candidatar a sua empresa' })[0]).toHaveAttribute('href', APPLY_PATH)
  })
})
