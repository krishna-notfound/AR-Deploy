// The sign-in pages' left panel from the Website Editor (ADR-0067): one shared text set (empty = the built-in text) and each
// page's own picture (absent = that page's built-in photograph). Whole-app renders in demo mode, plus the pure choices.
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { emptySiteContent, type SignInPanel } from '@/domain/siteContent'
import { content, service } from '@/services'
import { SIGN_IN_PHOTOS, chooseSignInPicture, signInText } from './signInPanel'

function openApp(url: string) {
  window.history.replaceState(null, '', url)
  return render(<App />)
}

/** Publishes a panel (its pictures are uploaded first, in the demo store); the signed-in editor is gone afterwards, like a visitor. */
async function publishPanel(texts: SignInPanel['texts'], picturePages: (keyof NonNullable<SignInPanel['pictures']>)[] = []) {
  localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))
  const pictures: NonNullable<SignInPanel['pictures']> = {}
  for (const page of picturePages) {
    const up = await content.uploadSiteAsset(new File([new Uint8Array(64)], `${page}.png`, { type: 'image/png' }), 'image')
    if (!up.ok) throw new Error('upload')
    pictures[page] = up.data
  }
  const s = await content.getContentDraft()
  if (!s.ok) throw new Error('draft')
  const signIn: SignInPanel = { ...(texts ? { texts } : {}), ...(picturePages.length ? { pictures } : {}) }
  const saved = await content.saveContentDraft({ ...emptySiteContent(), chrome: { signIn } }, s.data.draftUpdatedAt)
  if (!saved.ok) throw new Error('save')
  const p = await content.publishContent(saved.data.draftUpdatedAt)
  if (!p.ok) throw new Error(JSON.stringify(p.error))
  localStorage.clear()
}

const panelPicture = () => document.querySelector<HTMLImageElement>('img[data-panel-picture]')

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  let n = 0
  Object.assign(URL, { createObjectURL: vi.fn(() => `blob:panel/${++n}`) })
  localStorage.clear()
  sessionStorage.clear()
  await service.resetDemoData()
})
afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('the pure choices', () => {
  it('a page picture: its own once loaded, else its built-in photograph; nothing while the content loads', () => {
    const own = { path: 'landing/never-uploaded.webp' }
    expect(chooseSignInPicture('apply', { loading: false, pictures: undefined })).toEqual({ source: 'builtin', ...SIGN_IN_PHOTOS.apply })
    expect(chooseSignInPicture('apply', { loading: true, pictures: undefined })).toBeNull()
    // A picture whose address is not available (a demo upload after a reload) falls back to the built-in photograph.
    expect(chooseSignInPicture('login', { loading: false, pictures: { login: own } })).toEqual({ source: 'builtin', ...SIGN_IN_PHOTOS.login })
  })

  it('keeps the photographs each page had before', () => {
    expect(SIGN_IN_PHOTOS.login.src).toBe('/images/sanctus/v2/interior-villa.webp')
    expect(SIGN_IN_PHOTOS.resetPassword.src).toBe('/images/sanctus/v2/interior-villa.webp')
    expect(SIGN_IN_PHOTOS.acceptInvite.src).toBe('/images/sanctus/v2/interior-villa.webp')
    expect(SIGN_IN_PHOTOS.apply.src).toBe('/images/sanctus/v2/sofa-travertine.webp')
    expect(SIGN_IN_PHOTOS.join.src).toBe('/images/sanctus/v2/lounge-chair.webp')
    expect(SIGN_IN_PHOTOS.demo.src).toBe('/images/sanctus/v2/lounge-chair.webp')
  })

  it('a text: the language with text, else undefined (the dictionary answers); blank counts as empty', () => {
    const texts = { title: { en: 'Made to last', pt: '  ' } }
    expect(signInText(texts, 'title', 'en')).toBe('Made to last')
    expect(signInText(texts, 'title', 'pt')).toBeUndefined()
    expect(signInText(undefined, 'body', 'en')).toBeUndefined()
  })
})

describe('the sign-in panel', () => {
  it('shows the built-in texts and photograph when nothing is published', async () => {
    openApp('/demo')
    expect(await screen.findByText('Furniture, beyond the ordinary.')).toBeInTheDocument()
    expect(screen.getByText('Art & architecture')).toBeInTheDocument()
    await waitFor(() => expect(panelPicture()).toHaveAttribute('src', SIGN_IN_PHOTOS.demo.src))
    expect(panelPicture()).toHaveAttribute('data-panel-picture', 'builtin')
  })

  it('shows the published texts on every sign-in page; an empty field keeps the built-in text', async () => {
    await publishPanel({ title: { en: 'Made to last', pt: 'Feito para durar' }, tag1: { en: 'Handmade' } })
    const view = openApp('/demo')
    expect(await screen.findByText('Made to last')).toBeInTheDocument()
    expect(screen.getByText('Handmade')).toBeInTheDocument()
    expect(screen.getByText('Spatial design')).toBeInTheDocument() // tag2 not set: built-in
    expect(screen.getByText('Art & architecture')).toBeInTheDocument()
    expect(screen.queryByText('Furniture, beyond the ordinary.')).toBeNull()
    view.unmount()

    openApp('/apply')
    expect(await screen.findByText('Made to last')).toBeInTheDocument()
  })

  it('in Portuguese shows the Portuguese text, and the built-in Portuguese one where none was written', async () => {
    await publishPanel({ title: { en: 'Made to last', pt: 'Feito para durar' }, tag1: { en: 'Handmade' } })
    localStorage.setItem('arfurn:lang', 'pt')
    openApp('/demo')
    expect(await screen.findByText('Feito para durar')).toBeInTheDocument()
    expect(screen.getByText('Mobiliário autoral')).toBeInTheDocument()
  })

  it("each page shows its own picture; a page without one keeps its built-in photograph", async () => {
    await publishPanel(undefined, ['demo'])
    const view = openApp('/demo')
    await waitFor(() => expect(panelPicture()).toHaveAttribute('data-panel-picture', 'own'))
    expect(panelPicture()!.getAttribute('src')).toMatch(/^blob:panel\//)
    view.unmount()

    openApp('/apply')
    await screen.findByRole('heading', { level: 1 })
    await waitFor(() => expect(panelPicture()).toHaveAttribute('src', SIGN_IN_PHOTOS.apply.src))
    expect(panelPicture()).toHaveAttribute('data-panel-picture', 'builtin')
  })

  it('the form is there at once, whatever the site content does', async () => {
    vi.spyOn(content, 'getPublishedChrome').mockReturnValue(new Promise(() => {}))
    openApp('/demo')
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument()
    expect(panelPicture()).toBeNull() // no built-in photograph flashing before the chosen one
  })

  it('a failed read shows the built-in texts and photograph', async () => {
    vi.spyOn(content, 'getPublishedChrome').mockResolvedValue({ ok: false, error: { code: 'UNKNOWN', message: 'down' } })
    openApp('/demo')
    expect(await screen.findByText('Furniture, beyond the ordinary.')).toBeInTheDocument()
    await waitFor(() => expect(panelPicture()).toHaveAttribute('src', SIGN_IN_PHOTOS.demo.src))
  })
})
