// The Site tab (favicon) and the Landing tab's Texts block (ADR-0053).
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { LANDING_TEXT_GROUPS, emptySiteContent } from '@/domain/siteContent'
import { content } from '@/services'
import { mockCatalogService } from '@/services/mock/mockCatalogService'
import { FAVICON_MIN_PIXELS, faviconRefusal } from './SiteScreen'
import { changedTexts, resetLandingSection, resetLandingText, sectionKeys, setFavicon, setLandingText } from './siteOps'

const open = (path: string) => {
  localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))
  window.history.replaceState(null, '', path)
  return render(<App />)
}
const saved = async () => {
  const s = await content.getContentDraft()
  if (!s.ok) throw new Error('draft')
  return s.data.draft
}

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  localStorage.clear()
  await mockCatalogService.resetDemoData()
})
afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('siteOps', () => {
  const icon = { path: 'landing/11111111-1111-4111-8111-111111111111.png' }

  it('sets and clears the favicon; an emptied chrome equals one never set', () => {
    const doc = setFavicon(emptySiteContent(), icon)
    expect(doc.chrome).toEqual({ favicon: icon })
    expect(setFavicon(doc, undefined)).toEqual(emptySiteContent())
    expect('chrome' in setFavicon(doc, undefined)).toBe(false)
  })

  it('sets a text per language, drops it when emptied, and drops landing.texts when nothing is left', () => {
    let doc = setLandingText(emptySiteContent(), 'landing.hero.title1', 'en', 'Hello')
    doc = setLandingText(doc, 'landing.hero.title1', 'pt', 'Olá')
    expect(doc.landing.texts).toEqual({ 'landing.hero.title1': { en: 'Hello', pt: 'Olá' } })
    doc = setLandingText(doc, 'landing.hero.title1', 'pt', '  ')
    expect(doc.landing.texts).toEqual({ 'landing.hero.title1': { en: 'Hello' } })
    expect(setLandingText(doc, 'landing.hero.title1', 'en', '')).toEqual(emptySiteContent())
  })

  it('resets one text and a whole section, leaving other sections alone; counts changed texts', () => {
    let doc = emptySiteContent()
    doc = setLandingText(doc, 'landing.hero.title1', 'en', 'A')
    doc = setLandingText(doc, 'landing.hero.title1', 'pt', 'B')
    doc = setLandingText(doc, 'landing.hero.body', 'en', 'C')
    doc = setLandingText(doc, 'landing.biz.title', 'pt', 'D')
    expect(changedTexts(doc, sectionKeys('hero'))).toBe(2) // a text counts once, whichever languages are set
    expect(changedTexts(doc, LANDING_TEXT_GROUPS.flatMap((g) => g.keys.map(([k]) => k)))).toBe(3)
    expect(resetLandingText(doc, 'landing.hero.title1').landing.texts).toEqual({ 'landing.hero.body': { en: 'C' }, 'landing.biz.title': { pt: 'D' } })
    expect(resetLandingSection(doc, 'hero').landing.texts).toEqual({ 'landing.biz.title': { pt: 'D' } })
    expect(resetLandingText(doc, 'landing.about.body')).toBe(doc)
    expect(resetLandingSection(resetLandingSection(doc, 'hero'), 'partners')).toEqual(emptySiteContent())
  })
})

describe('faviconRefusal', () => {
  const t = (key: string, vars?: Record<string, string | number>) => `${key}:${JSON.stringify(vars ?? {})}`
  const png = new File([new Uint8Array(100)], 'icon.png', { type: 'image/png' })
  afterEach(() => vi.unstubAllGlobals())

  it('refuses a picture that is not square or is too small, and one that cannot be read', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 64, height: 32, close() {} })))
    expect(await faviconRefusal(png, t as never)).toContain('editor.site.favicon.notSquare:{"w":64,"h":32}')
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 16, height: 16, close() {} })))
    expect(await faviconRefusal(png, t as never)).toContain(`editor.site.favicon.tooSmall:{"min":${FAVICON_MIN_PIXELS}}`)
    vi.stubGlobal('createImageBitmap', vi.fn(async () => Promise.reject(new Error('bad'))))
    expect(await faviconRefusal(png, t as never)).toContain('unreadable')
  })

  it('accepts a square picture of 32 px or more, and skips the check where pictures cannot be measured', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 512, height: 512, close() {} })))
    expect(await faviconRefusal(png, t as never)).toBeNull()
    vi.stubGlobal('createImageBitmap', undefined)
    expect(await faviconRefusal(png, t as never)).toBeNull()
  })
})

describe('Site tab: the favicon', () => {
  it('shows the built-in notice; uploads a PNG with previews at 16, 32 and 180 px; removes it again', { timeout: 60_000 }, async () => {
    let seq = 0
    Object.assign(URL, { createObjectURL: vi.fn(() => `blob:icon/${++seq}`) })
    open('/admin/editor/site')
    const block = await screen.findByRole('region', { name: 'Site icon (favicon)' }, { timeout: 15_000 })
    expect(within(block).getByText('The built-in Sanctus icon is in use.')).toBeInTheDocument()
    expect(within(block).queryByRole('button', { name: /^Remove/ })).toBeNull()

    await userEvent.upload(within(block).getByTestId('upload-favicon'), new File([new Uint8Array(1024)], 'icon.png', { type: 'image/png' }))
    await waitFor(async () => expect((await saved()).chrome?.favicon?.path).toMatch(/^landing\/.+\.png$/), { timeout: 8000 })
    for (const n of [16, 32, 180]) {
      const img = within(block).getByRole('img', { name: `The site icon, ${n} px` })
      expect(img).toHaveAttribute('src', 'blob:icon/1')
      expect(img).toHaveAttribute('width', String(n))
    }
    expect(within(block).getByRole('button', { name: 'Replace icon' })).toBeInTheDocument()

    await userEvent.click(within(block).getByRole('button', { name: 'Remove: The site icon' }))
    await waitFor(async () => expect((await saved()).chrome).toBeUndefined(), { timeout: 8000 })
    expect(within(block).getByText('The built-in Sanctus icon is in use.')).toBeInTheDocument()
  })

  it('refuses a file that is not a PNG with a sentence, and saves nothing', { timeout: 60_000 }, async () => {
    open('/admin/editor/site')
    const block = await screen.findByRole('region', { name: 'Site icon (favicon)' }, { timeout: 15_000 })
    await userEvent.upload(within(block).getByTestId('upload-favicon'), new File([new Uint8Array(1024)], 'icon.jpg', { type: 'image/jpeg' }), { applyAccept: false })
    expect(await within(block).findByRole('alert')).toHaveTextContent('Choose a square PNG picture up to 1 MB.')
    expect((await saved()).chrome).toBeUndefined()
  })
})

describe('Landing tab: the Texts block', () => {
  it('lists the sections, shows the original as the placeholder, saves an override in both languages, and counts it', { timeout: 60_000 }, async () => {
    open('/admin/editor/landing')
    const heading = await screen.findByRole('heading', { level: 3, name: 'Texts' }, { timeout: 15_000 })
    const block = within(heading.closest('section')!)
    const names = ['Hero', 'How it works', 'Experience', 'Collections', 'About', 'Partners']
    expect(block.getAllByText((_, el) => el?.tagName === 'SPAN' && names.includes(el.textContent ?? '') && el.closest('summary') !== null).map((e) => e.textContent)).toEqual(names)
    expect(block.getByRole('status')).toHaveTextContent('Every text is the original wording.')

    const heroSection = heading.closest('section')!.querySelector('[data-section="hero"]') as HTMLElement
    const hero = within(heroSection)
    // A section's boxes are built only once it is opened.
    await userEvent.click(heroSection.querySelector('summary')!)
    const en = await hero.findByRole('textbox', { name: '3D and AR catalogues (English)' })
    expect(en).toHaveAttribute('placeholder', '3D and AR catalogues')
    expect(hero.getByRole('textbox', { name: '3D and AR catalogues (Portuguese)' })).toHaveAttribute('placeholder', 'Catálogos 3D e RA')
    expect(en).toHaveAttribute('maxlength', '200')

    await userEvent.type(en, 'Our new line')
    await userEvent.type(hero.getByRole('textbox', { name: '3D and AR catalogues (Portuguese)' }), 'A nossa linha')
    await waitFor(async () => expect((await saved()).landing.texts).toEqual({ 'landing.hero.title1': { en: 'Our new line', pt: 'A nossa linha' } }), { timeout: 8000 })
    expect(block.getByRole('status')).toHaveTextContent('1 text changed')
    expect(hero.getByText('1 text changed')).toBeInTheDocument()
  })

  it('resets one text and then a whole section to the original', { timeout: 60_000 }, async () => {
    open('/admin/editor/landing')
    const heading = await screen.findByRole('heading', { level: 3, name: 'Texts' }, { timeout: 15_000 })
    const section = heading.closest('section')!
    const heroSection = section.querySelector('[data-section="hero"]') as HTMLElement
    const hero = within(heroSection)
    await userEvent.click(heroSection.querySelector('summary')!)
    await userEvent.type(await hero.findByRole('textbox', { name: '3D and AR catalogues (English)' }), 'One')
    await userEvent.type(hero.getByRole('textbox', { name: 'for furniture brands. (English)' }), 'Two')
    await waitFor(async () => expect(Object.keys((await saved()).landing.texts ?? {})).toHaveLength(2), { timeout: 8000 })
    expect(within(section).getByRole('status')).toHaveTextContent('2 texts changed')

    await userEvent.click(hero.getByRole('button', { name: 'Reset to original: 3D and AR catalogues' }))
    await waitFor(async () => expect(Object.keys((await saved()).landing.texts ?? {})).toEqual(['landing.hero.title2']), { timeout: 8000 })
    expect(hero.getByRole('textbox', { name: '3D and AR catalogues (English)' })).toHaveValue('')
    expect(hero.getByRole('button', { name: 'Reset to original: 3D and AR catalogues' })).toBeDisabled()

    await userEvent.click(hero.getByRole('button', { name: 'Reset section to original: Hero' }))
    await waitFor(async () => expect((await saved()).landing.texts).toBeUndefined(), { timeout: 8000 })
    expect(within(section).getByRole('status')).toHaveTextContent('Every text is the original wording.')
    expect(hero.getByRole('button', { name: 'Reset section to original: Hero' })).toBeDisabled()
  })
})
