// The landing page renders the Editor's text overrides over the dictionary (ADR-0053): in English and Portuguese, falling back
// to the original wherever there is no override, and never for a text that is not on the list.
import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { emptySiteContent } from '@/domain/siteContent'
import { LANG_KEY } from '@/i18n/LanguageProvider'
import { content, service } from '@/services'
import { landingText } from './LandingRoute'

async function publishTexts(texts: unknown) {
  localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))
  const s = await content.getContentDraft()
  if (!s.ok) throw new Error('draft')
  const doc = { ...emptySiteContent(), landing: { collections: [], texts } } as never
  const saved = await content.saveContentDraft(doc, s.data.draftUpdatedAt)
  if (!saved.ok) throw new Error('save')
  const p = await content.publishContent(saved.data.draftUpdatedAt)
  if (!p.ok) throw new Error(JSON.stringify(p.error))
  localStorage.clear() // the visitor is not signed in
}

const openLanding = (lang: 'en' | 'pt') => {
  localStorage.setItem(LANG_KEY, lang)
  window.history.replaceState(null, '', '/')
  return render(<App />)
}

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  localStorage.clear()
  sessionStorage.clear()
  await service.resetDemoData()
})
afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('landingText (the lookup)', () => {
  const texts = { 'landing.hero.title1': { en: 'Hello', pt: ' ' }, 'site.apply': { en: 'Join' } }
  it('answers only for listed keys and for a language that has a text', () => {
    expect(landingText(texts, 'en', 'landing.hero.title1')).toBe('Hello')
    expect(landingText(texts, 'pt', 'landing.hero.title1')).toBeUndefined() // blank = the original
    expect(landingText(texts, 'en', 'site.apply')).toBeUndefined() // not on the list
    expect(landingText(texts, 'en', 'landing.hero.body')).toBeUndefined()
    expect(landingText(undefined, 'en', 'landing.hero.title1')).toBeUndefined()
    expect(landingText(texts, 'en', 'constructor')).toBeUndefined()
  })
})

describe('the landing page with published texts', () => {
  it('shows the English override, and the Portuguese original where only English was changed', { timeout: 30_000 }, async () => {
    await publishTexts({ 'landing.hero.title1': { en: 'Brand new headline' }, 'landing.biz.title': { en: 'Join us', pt: 'Junte-se a nós' } })
    openLanding('en')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Brand new headline')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('for furniture brands.') // an unchanged line next to it
    expect(screen.getByRole('heading', { name: 'Join us' })).toBeInTheDocument()
  })

  it('Portuguese: the Portuguese override where there is one, the Portuguese original otherwise (never the English override)', { timeout: 30_000 }, async () => {
    await publishTexts({ 'landing.hero.title1': { en: 'Brand new headline' }, 'landing.biz.title': { en: 'Join us', pt: 'Junte-se a nós' } })
    openLanding('pt')
    const h1 = await screen.findByRole('heading', { level: 1 })
    expect(await screen.findByRole('heading', { name: 'Junte-se a nós' })).toBeInTheDocument()
    expect(h1).not.toHaveTextContent('Brand new headline')
    expect(h1).toHaveTextContent('Catálogos 3D e RA')
  })

  it('shows the dictionary wording when nothing is published, and ignores a text that is not on the list', { timeout: 30_000 }, async () => {
    openLanding('en')
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('3D and AR catalogues')
    expect(screen.getAllByRole('link', { name: 'Apply as a business' }).length).toBeGreaterThan(0)
  })

  it('does not touch the header, which is shared by every public page', { timeout: 30_000 }, async () => {
    // A listed key can be saved, but site.* keys are refused at publish and never rendered as overrides.
    await publishTexts({ 'landing.hero.cta3d': { en: 'Try it' } })
    openLanding('en')
    expect(await screen.findByRole('link', { name: 'Try it' })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: 'Apply as a business' }).length).toBeGreaterThan(0)
  })
})
