// The public landing page renders the Website Editor's section list (ADR-0061): the hero, then the sections in order, hidden ones skipped,
// the QR section with its own texts, the three own designs, and the About photographs.
import { render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { type LandingSection, type SiteContent, emptySiteContent } from '@/domain/siteContent'
import { LANG_KEY, LanguageProvider } from '@/i18n/LanguageProvider'
import { content, service } from '@/services'
import LandingRoute from './LandingRoute'
import { SiteContentProvider } from './SiteContentProvider'

let IMG = { path: 'landing/none.webp', alt: { en: 'A sofa in a room', pt: 'Um sofá numa sala' } }
const BLOB = 'blob:sofa/1'

/** Uploads a picture through the demo service so that its address resolves (in the demo an upload only lives in this session). */
async function uploadPicture(): Promise<{ path: string }> {
  Object.assign(URL, { createObjectURL: vi.fn(() => BLOB) })
  localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))
  const up = await content.uploadSiteAsset(new File([new Uint8Array(8)], 'a.png', { type: 'image/png' }), 'image')
  if (!up.ok) throw new Error('upload')
  return up.data
}

/** Publishes landing parts through the demo service, as the Editor does. */
async function publishLanding(landing: Partial<SiteContent['landing']>) {
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
        <SiteContentProvider>
          <LandingRoute />
        </SiteContentProvider>
      </MemoryRouter>
    </LanguageProvider>,
  )
}
const main = () => screen.getByRole('main')
/** The ids of the page's sections after the hero, in order. */
const sectionIds = () => Array.from(main().children).slice(1).map((el) => el.id)

const builtin = (id: string, hidden?: boolean): LandingSection => ({ kind: 'builtin', id, ...(hidden ? { hidden } : {}) }) as LandingSection

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  localStorage.clear()
  await service.resetDemoData()
  IMG = { ...IMG, ...(await uploadPicture()) }
})
afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

describe('landing page sections', () => {
  it('nothing published: the hero then the QR section and the five others in today\'s order; the hero keeps only title and buttons', async () => {
    renderLanding()
    await screen.findByRole('link', { name: 'See a live example' })
    expect(sectionIds()).toEqual(['qr', 'como-funciona', 'experiencia', 'colecoes', 'sobre', 'parcerias'])
    const hero = screen.getByRole('heading', { level: 1 }).closest('section')!
    expect(hero).not.toHaveTextContent('scan a QR code')
    expect(hero.querySelectorAll('p')).toHaveLength(2) // eyebrow and the note under the button
    const qr = document.getElementById('qr')!
    expect(within(qr).getByRole('heading', { level: 2 })).toHaveTextContent("From a QR code to the customer's own room")
    expect(qr).toHaveTextContent('Your customers scan a QR code, see each piece in 3D, then place it in their own room with augmented reality. No app to install.')
    expect(qr.querySelector('img')).toBeNull() // centred text until a picture is added
  })

  it('renders the saved order and skips hidden sections, including their links in the header', async () => {
    await publishLanding({ sections: [builtin('partners'), builtin('how'), builtin('qr', true), builtin('about'), builtin('collections', true), builtin('experience', true)] })
    renderLanding()
    await waitFor(() => expect(sectionIds()).toEqual(['parcerias', 'como-funciona', 'sobre']))
    expect(document.getElementById('qr')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Collections' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Experience' })).toBeNull()
    expect(screen.getAllByRole('link', { name: 'About' }).length).toBeGreaterThan(0)
  })

  it('renders the three own designs among the built-in ones, in the list order, with the language of the visitor', async () => {
    await publishLanding({
      sections: [
        builtin('qr'),
        { kind: 'text', id: 'welcome', anchor: 'hello', eyebrow: { en: 'Welcome', pt: 'Bem-vindo' }, title: { en: 'Visit the showroom', pt: 'Visite a loja' }, subtitle: { en: 'Open daily' }, body: { en: 'Line one\nLine two' }, button: { label: { en: 'Apply', pt: 'Candidatar' }, href: '/apply' } },
        { kind: 'imageText', id: 'story', title: { en: 'Our story', pt: 'A nossa história' }, body: { en: 'Made by hand.' }, image: IMG, imageSide: 'right', button: { label: { en: 'Read more' }, href: 'https://example.com/story' } },
        builtin('how'),
        { kind: 'banner', id: 'wide', image: IMG, title: { en: 'A big picture' }, body: { en: 'Banner text' }, button: { label: { en: 'See pieces' }, href: '/catalog/x' } },
      ] as LandingSection[],
    })
    renderLanding()
    await screen.findByRole('heading', { level: 2, name: 'Visit the showroom' })
    expect(sectionIds()).toEqual(['qr', 'hello', '', 'como-funciona', '']) // own sections without an anchor have no id

    const text = document.getElementById('hello')!
    expect(within(text).getByText('Welcome')).toBeInTheDocument()
    expect(text).toHaveTextContent('Open daily')
    expect(within(text).getByRole('link', { name: 'Apply' })).toHaveAttribute('href', '/apply')

    const story = screen.getByRole('heading', { level: 2, name: 'Our story' }).closest('section')!
    const img = within(story).getByRole('img', { name: 'A sofa in a room' })
    expect(img.className).toMatch(/object-contain/) // contained, never cropped
    expect(img.className).not.toMatch(/object-cover/)
    const external = within(story).getByRole('link', { name: 'Read more' })
    expect(external).toHaveAttribute('href', 'https://example.com/story')
    expect(external).toHaveAttribute('rel', expect.stringContaining('noopener'))

    const banner = screen.getByRole('heading', { level: 2, name: 'A big picture' }).closest('section')!
    expect(banner.querySelector('img')!.className).toMatch(/object-cover/) // the banner is a photograph under a veil
    expect(within(banner).getByRole('link', { name: 'See pieces' })).toHaveAttribute('href', '/catalog/x')
    expect(banner.className).toMatch(/bg-obsidian/)
  })

  it('shows Portuguese texts and descriptions where there are some, English otherwise', async () => {
    await publishLanding({
      sections: [{ kind: 'imageText', id: 'story', title: { en: 'Our story', pt: 'A nossa história' }, body: { en: 'Made by hand.' }, image: IMG, imageSide: 'left' }] as LandingSection[],
    })
    renderLanding('pt')
    const heading = await screen.findByRole('heading', { level: 2, name: 'A nossa história' })
    const section = heading.closest('section')!
    expect(section).toHaveTextContent('Made by hand.') // no Portuguese: the English
    expect(within(section).getByRole('img', { name: 'Um sofá numa sala' })).toBeInTheDocument()
  })

  it('an own section without a button has no link; a hidden own section is skipped', async () => {
    await publishLanding({
      sections: [
        { kind: 'text', id: 'a', title: { en: 'Shown' } },
        { kind: 'text', id: 'b', title: { en: 'Not shown' }, hidden: true },
      ] as LandingSection[],
    })
    renderLanding()
    const heading = await screen.findByRole('heading', { level: 2, name: 'Shown' })
    expect(within(heading.closest('section')!).queryByRole('link')).toBeNull()
    expect(screen.queryByRole('heading', { name: 'Not shown' })).toBeNull()
  })

  it('the QR section shows its picture on the chosen side, contained, and its edited texts', async () => {
    await publishLanding({
      qr: { image: IMG, imageSide: 'right' },
      texts: { 'landing.qr.title': { en: 'Scan me' }, 'landing.qr.body': { en: 'New body' }, 'landing.qr.eyebrow': { en: 'Eyebrow here' } },
    })
    renderLanding()
    const qr = await waitFor(() => {
      const el = document.getElementById('qr')!
      expect(within(el).getByRole('heading', { level: 2 })).toHaveTextContent('Scan me')
      return el
    })
    expect(qr).toHaveTextContent('New body')
    expect(qr).toHaveTextContent('Eyebrow here')
    const img = within(qr).getByRole('img', { name: 'A sofa in a room' })
    expect(img.className).toMatch(/object-contain/)
    expect(img.className).toMatch(/lg:order-last/) // right side
  })

  it('the QR section: a picture with the layout "none" is not shown', async () => {
    await publishLanding({ qr: { image: IMG, imageSide: 'none' } })
    renderLanding()
    await screen.findByRole('link', { name: 'See a live example' })
    expect(document.getElementById('qr')!.querySelector('img')).toBeNull()
  })

  it('a saved hero text override moves to the QR section body', async () => {
    await publishLanding({ texts: { 'landing.hero.body': { en: 'Old hero text' } } })
    renderLanding()
    await waitFor(() => expect(document.getElementById('qr')).toHaveTextContent('Old hero text'))
    expect(screen.getByRole('heading', { level: 1 }).closest('section')).not.toHaveTextContent('Old hero text')
  })

  it('About: the built-in photos until the Editor sets its own, then those with their descriptions', async () => {
    const first = renderLanding()
    const about = () => document.getElementById('sobre')!
    await screen.findByRole('link', { name: 'See a live example' })
    expect(within(about()).getAllByRole('img').map((i) => i.getAttribute('src'))).toEqual(['/images/sanctus/v2/coffee-table.webp', '/images/sanctus/v2/detail-joinery.webp'])
    first.unmount()

    // In the demo an uploaded picture only exists in this session; give the service one so its address resolves.
    const url = 'blob:about/1'
    Object.assign(URL, { createObjectURL: vi.fn(() => url) })
    localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))
    const up = await content.uploadSiteAsset(new File([new Uint8Array(8)], 'a.png', { type: 'image/png' }), 'image')
    if (!up.ok) throw new Error('upload')
    await publishLanding({ about: { image: { path: up.data.path, alt: { en: 'My table', pt: 'A minha mesa' } } } })
    renderLanding()
    await waitFor(() => expect(within(about()).getByRole('img', { name: 'My table' })).toHaveAttribute('src', url))
    // The detail photo stays the built-in one.
    expect(within(about()).getAllByRole('img')[1]).toHaveAttribute('src', '/images/sanctus/v2/detail-joinery.webp')
  })
})
