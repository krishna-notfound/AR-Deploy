import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { type SiteContent, emptySiteContent } from '@/domain/siteContent'
import { content, service } from '@/services'
import { mockCatalogService } from '@/services/mock/mockCatalogService'
import { guardApplicationSubmit } from '../editor/previewGuard'
import { LEGAL_CONTENT } from './content.generated'

const ACCOUNT_KEY = 'arfurn:account'
const asAdmin = () => localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))

function openApp(url: string) {
  window.history.replaceState(null, '', url)
  return render(<App />)
}

const page = (slug: string, over: Record<string, unknown> = {}) => ({ id: `id-${slug}`, slug, title: { en: slug.toUpperCase() }, body: { en: `Body of ${slug}` }, showInFooter: false, order: 0, ...over })

/** Saves a document as the draft and, when asked, publishes it (as staff). */
async function put(mutate: (c: SiteContent) => void, publish = true) {
  asAdmin()
  const s = await content.getContentDraft()
  if (!s.ok) throw new Error(s.error.message)
  const doc = emptySiteContent()
  mutate(doc)
  const saved = await content.saveContentDraft(doc, s.data.draftUpdatedAt)
  if (!saved.ok) throw new Error(saved.error.message)
  if (publish) {
    const p = await content.publishContent(saved.data.draftUpdatedAt)
    if (!p.ok) throw new Error(p.error.message)
  }
  localStorage.removeItem(ACCOUNT_KEY) // the visitor is signed out
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

describe('Terms and Privacy with the Editor', () => {
  it('LegalPage with no published content renders LEGAL_CONTENT', async () => {
    openApp('/privacy')
    expect(await screen.findByRole('heading', { level: 1, name: 'Privacy Policy' })).toBeInTheDocument()
    expect(screen.getByRole('note')).toHaveTextContent('DRAFT')
    expect(screen.queryByText('We could not check for a newer version of this page.')).toBeNull()
    expect(LEGAL_CONTENT.privacy.en).toContain('Privacy Policy')
  })

  it('shows the published text per language and the built-in text for a language without an override', async () => {
    await put((c) => void (c.builtinPages = { terms: { en: '# Our house rules\n\nBe kind. See the [privacy page](/privacy).' } }))
    openApp('/terms')
    expect(await screen.findByRole('heading', { level: 1, name: 'Our house rules' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'privacy page' })).toHaveAttribute('href', '/privacy')
    expect(screen.queryByRole('note')).toBeNull() // no DRAFT line in the client's own text
  })

  it('a language without an override shows the built-in text for it', async () => {
    await put((c) => void (c.builtinPages = { terms: { en: '# Our house rules\n\nBe kind.' } }))
    openApp('/terms?lang=pt')
    expect(await screen.findByRole('heading', { level: 1, name: 'Termos e Condições' })).toBeInTheDocument()
  })

  it('shows a skeleton while the published text loads, never the old text first', async () => {
    let release: (v: Awaited<ReturnType<typeof content.getPublishedPage>>) => void = () => {}
    vi.spyOn(content, 'getPublishedPage').mockReturnValue(new Promise((r) => (release = r)))
    openApp('/terms')
    expect(await screen.findByLabelText('Loading…')).toHaveAttribute('aria-busy', 'true')
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
    release({ ok: true, data: null })
    expect(await screen.findByRole('heading', { level: 1, name: 'Terms and Conditions' })).toBeInTheDocument()
  })

  it('on a failed read shows the built-in text, one line about it, and a retry that clears it', async () => {
    const read = vi.spyOn(content, 'getPublishedPage').mockResolvedValueOnce({ ok: false, error: { code: 'UNKNOWN', message: 'offline' } })
    openApp('/terms')
    expect(await screen.findByRole('heading', { level: 1, name: 'Terms and Conditions' })).toBeInTheDocument()
    const line = screen.getByText(/We could not check for a newer version of this page\./)
    await userEvent.click(within(line.closest('p')!).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.queryByText(/We could not check for a newer version/)).toBeNull())
    expect(read).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('heading', { level: 1, name: 'Terms and Conditions' })).toBeInTheDocument()
  })
})

describe('custom pages', () => {
  it('shows a published page at /pages/:slug with its Markdown', async () => {
    await put((c) => void (c.customPages = [page('shipping', { title: { en: 'Shipping' }, body: { en: '## Rates\n\nFree over **100**.\n\n- Lisbon\n- Porto' } })]))
    openApp('/pages/shipping')
    expect(await screen.findByRole('heading', { level: 1, name: 'Shipping' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'Rates' })).toBeInTheDocument()
    expect(screen.getByText('100').tagName).toBe('STRONG')
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(expect.arrayContaining(['Lisbon', 'Porto']))
    expect(document.title).toBe('Shipping · Sanctus')
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe('Free over 100.')
  })

  it('an empty Portuguese text falls back to English and says so with lang="en"', async () => {
    await put((c) => void (c.customPages = [page('about', { title: { en: 'About us' }, body: { en: 'English only text' } })]))
    openApp('/pages/about?lang=pt')
    const h1 = await screen.findByRole('heading', { level: 1, name: 'About us' })
    expect(h1).toHaveAttribute('lang', 'en')
    expect(screen.getByText('English only text').closest('[lang]')).toHaveAttribute('lang', 'en')
  })

  it('uses the Portuguese text when there is one', async () => {
    await put((c) => void (c.customPages = [page('about', { title: { en: 'About us', pt: 'Sobre nós' }, body: { en: 'English', pt: 'Texto em português' } })]))
    openApp('/pages/about?lang=pt')
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Sobre nós' })
    expect(h1).not.toHaveAttribute('lang')
    expect(screen.getByText('Texto em português')).toBeInTheDocument()
  })

  it('an unknown slug, and a built-in one, are the public not-found page', async () => {
    openApp('/pages/nope')
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })

  it('a failed read is an error with Retry (there is no built-in text)', async () => {
    await put((c) => void (c.customPages = [page('shipping', { title: { en: 'Shipping' } })]))
    const read = vi.spyOn(content, 'getPublishedPage').mockResolvedValueOnce({ ok: false, error: { code: 'UNKNOWN', message: 'offline' } })
    openApp('/pages/shipping')
    expect(await screen.findByText('We could not load this page.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Shipping' })).toBeInTheDocument()
    expect(read).toHaveBeenCalledTimes(2)
  })
})

describe('footer links and social icons', () => {
  const footerNav = async () => within(await screen.findByRole('navigation', { name: 'Legal' }))

  it('LegalLinks renders Privacy, Terms, then the published footer pages in order', async () => {
    await put((c) => {
      c.customPages = [
        page('returns', { title: { en: 'Returns', pt: 'Devoluções' }, showInFooter: true, order: 1 }),
        page('shipping', { title: { en: 'Shipping' }, showInFooter: true, order: 0 }),
        page('hidden', { title: { en: 'Hidden' }, showInFooter: false, order: 2 }),
      ]
    })
    openApp('/')
    const nav = await footerNav()
    await waitFor(() => expect(nav.getAllByRole('link').map((a) => a.textContent)).toEqual(['Privacy', 'Terms', 'Shipping', 'Returns']))
    expect(nav.getByRole('link', { name: 'Returns' })).toHaveAttribute('href', '/pages/returns')
  })

  it('a footer page shows in Portuguese, with English where Portuguese is missing', async () => {
    await put((c) => void (c.customPages = [page('returns', { title: { en: 'Returns', pt: 'Devoluções' }, showInFooter: true }), page('shipping', { title: { en: 'Shipping' }, showInFooter: true, order: 1 })]))
    openApp('/?lang=pt')
    const nav = await footerNav().catch(() => within(screen.getByRole('navigation', { name: 'Informação legal' })))
    await waitFor(() => expect(nav.getByRole('link', { name: 'Devoluções' })).toBeInTheDocument())
    expect(nav.getByRole('link', { name: 'Shipping' })).toHaveAttribute('lang', 'en')
  })

  it('with the footer content failing, only Privacy and Terms show', async () => {
    await put((c) => void (c.customPages = [page('shipping', { title: { en: 'Shipping' }, showInFooter: true })]))
    vi.spyOn(content, 'getPublishedChrome').mockResolvedValue({ ok: false, error: { code: 'UNKNOWN', message: 'offline' } })
    openApp('/')
    const nav = await footerNav()
    expect(nav.getAllByRole('link').map((a) => a.textContent)).toEqual(['Privacy', 'Terms'])
    expect(screen.queryByRole('list', { name: 'Social media' })).toBeNull()
  })

  it('social icons appear only for filled networks, in order, with accessible names and safe link attributes', async () => {
    await put((c) => void (c.social = { youtube: 'https://youtube.com/@sanctus', instagram: 'https://instagram.com/sanctus' }))
    openApp('/')
    const list = await screen.findByRole('list', { name: 'Social media' })
    const links = within(list).getAllByRole('link')
    expect(links.map((a) => a.getAttribute('aria-label'))).toEqual(['Instagram, opens in a new tab', 'YouTube, opens in a new tab'])
    for (const a of links) {
      expect(a).toHaveAttribute('target', '_blank')
      expect(a).toHaveAttribute('rel', 'noopener noreferrer')
      expect(a.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
    }
    expect(links[0]).toHaveAttribute('href', 'https://instagram.com/sanctus')
  })

  it('no icons before anything is published, and none in the business catalogue footer', async () => {
    openApp('/')
    await screen.findByRole('navigation', { name: 'Legal' })
    expect(screen.queryByRole('list', { name: 'Social media' })).toBeNull()
  })

  it('no social icons in a catalogue footer even when some are published', async () => {
    await put((c) => void (c.social = { instagram: 'https://instagram.com/sanctus' }))
    openApp('/catalog/nordhaus')
    await screen.findByRole('heading', { name: 'Nordhaus Living', level: 1 })
    await screen.findByRole('navigation', { name: 'Legal' })
    expect(screen.queryByRole('list', { name: 'Social media' })).toBeNull()
  })
})

describe('Editor preview', () => {
  it('shows the saved draft under the "Not live" bar, and the live page is unchanged', async () => {
    await put((c) => void (c.builtinPages = { terms: { en: '# Draft terms\n\nNot yet.' } }), false)
    asAdmin()
    openApp('/admin/editor/preview/page/terms')
    expect(await screen.findByRole('heading', { level: 1, name: 'Draft terms' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Preview of the draft. Not live.' })).toBeInTheDocument()
    const live = await content.getPublishedPage('terms')
    expect(live).toEqual({ ok: true, data: null })
  })

  it('previews a custom page that is only in the draft', async () => {
    await put((c) => void (c.customPages = [page('soon', { title: { en: 'Coming soon' }, body: { en: 'Draft body' } })]), false)
    asAdmin()
    openApp('/admin/editor/preview/page/id-soon')
    expect(await screen.findByRole('heading', { level: 1, name: 'Coming soon' })).toBeInTheDocument()
    expect(screen.getByText('Draft body')).toBeInTheDocument()
    expect((await content.getPublishedPage('soon')).ok).toBe(false)
  })

  it('the application form preview never sends: the submit call is answered locally and put back on leaving', async () => {
    const real = vi.spyOn(service, 'submitApplication')
    asAdmin()
    const view = openApp('/admin/editor/preview/apply')
    await screen.findByRole('region', { name: 'Preview of the draft. Not live.' })
    expect(screen.getByText('Nothing is sent from this preview.')).toBeInTheDocument()
    await waitFor(() => expect(service.submitApplication).not.toBe(real))
    const res = await service.submitApplication({} as never)
    expect(res).toMatchObject({ ok: true, data: { reference: 'PREVIEW-0000' } })
    expect(real).not.toHaveBeenCalled()
    view.unmount()
    expect(service.submitApplication).toBe(real)
  })

  it('guardApplicationSubmit restores the real call', async () => {
    const real = vi.spyOn(service, 'submitApplication')
    const restore = guardApplicationSubmit()
    expect(service.submitApplication).not.toBe(real)
    restore()
    expect(service.submitApplication).toBe(real)
  })

  it('apply/done shows the thank-you screen with a sample reference', async () => {
    asAdmin()
    openApp('/admin/editor/preview/apply/done')
    expect(await screen.findByText(/PREVIEW-0000/)).toBeInTheDocument()
  })
})
