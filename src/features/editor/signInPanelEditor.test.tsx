// The Site tab's sign-in panel and the catalogue heading (ADR-0067): pure edits, the Website Editor controls (texts in EN and PT
// with the original as the placeholder, a picture per sign-in page with crop on upload, Remove back to the built-in photograph),
// the catalogue heading in the catalogue banner panel, and where a problem points. The crop dialog is a stand-in.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { emptySiteContent } from '@/domain/siteContent'
import { translate } from '@/i18n/translate'
import { content } from '@/services'
import { mockCatalogService } from '@/services/mock/mockCatalogService'
import { CROP } from '@/test/cropDialogStub'
import { describeProblem } from './problems'
import { setCatalogBanner, setCatalogHeading, setSignInPicture, setSignInText } from './siteOps'

vi.mock('@/components/image/ImageCropDialog', async () => import('@/test/cropDialogStub'))

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
const png = () => new File([new Uint8Array(64)], 'tall.png', { type: 'image/png' })
const IMG = { path: 'landing/11111111-1111-4111-8111-111111111111.webp', originalPath: 'landing/22222222-2222-4222-8222-222222222222.png', crop: CROP }

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  let seq = 0
  Object.assign(URL, { createObjectURL: vi.fn(() => `blob:panel/${++seq}`) })
  localStorage.clear()
  await mockCatalogService.resetDemoData()
})
afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('siteOps: the sign-in panel and the catalogue heading', () => {
  it('sets and clears a panel text per language; a blank text is the original; an emptied panel equals one never set', () => {
    const a = setSignInText(emptySiteContent(), 'title', 'en', 'Made to last')
    expect(a.chrome).toEqual({ signIn: { texts: { title: { en: 'Made to last' } } } })
    const b = setSignInText(a, 'title', 'pt', 'Feito para durar')
    expect(b.chrome?.signIn?.texts?.title).toEqual({ en: 'Made to last', pt: 'Feito para durar' })
    expect(setSignInText(setSignInText(b, 'title', 'en', ''), 'title', 'pt', '   ')).toEqual(emptySiteContent())
  })

  it('sets and clears a page picture without touching the texts, the other pages or the banner', () => {
    const doc = setCatalogBanner(setSignInText(emptySiteContent(), 'tag1', 'en', 'Handmade'), IMG)
    const withPic = setSignInPicture(setSignInPicture(doc, 'login', IMG), 'apply', IMG)
    expect(withPic.chrome?.signIn).toEqual({ texts: { tag1: { en: 'Handmade' } }, pictures: { login: IMG, apply: IMG } })
    expect(setSignInPicture(withPic, 'login', undefined).chrome?.signIn).toEqual({ texts: { tag1: { en: 'Handmade' } }, pictures: { apply: IMG } })
    const none = setSignInPicture(setSignInPicture(withPic, 'login', undefined), 'apply', undefined)
    expect(none.chrome).toEqual({ catalogBanner: IMG, signIn: { texts: { tag1: { en: 'Handmade' } } } })
  })

  it('sets and clears the catalogue heading per language', () => {
    const a = setCatalogHeading(emptySiteContent(), 'pt', 'As nossas peças')
    expect(a.chrome).toEqual({ catalogHeading: { pt: 'As nossas peças' } })
    expect(setCatalogHeading(a, 'pt', '')).toEqual(emptySiteContent())
  })
})

describe('problems point to the Site tab', () => {
  const t = (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) => translate('en', key, vars)
  it('names the panel or the catalogue banner panel', () => {
    expect(describeProblem('chrome.signIn.texts.title.en', 'too_long', emptySiteContent(), t)).toMatchObject({ where: 'Site: Sign-in pages panel', to: '/admin/editor/site' })
    expect(describeProblem('chrome.catalogHeading.pt', 'too_long', emptySiteContent(), t)).toMatchObject({ where: 'Site: Catalogue banner', to: '/admin/editor/site' })
  })
})

describe('Site tab: the sign-in pages panel', () => {
  it('edits the shared texts in English and Portuguese, with the original as the placeholder', { timeout: 60_000 }, async () => {
    const user = userEvent.setup()
    open('/admin/editor/site')
    const block = await screen.findByRole('region', { name: 'Sign-in pages panel' }, { timeout: 15_000 })
    const titleEn = within(block).getByRole('textbox', { name: 'Title (English)' })
    expect(titleEn).toHaveAttribute('placeholder', 'Furniture, beyond the ordinary.')
    expect(within(block).getByRole('textbox', { name: 'Title (Portuguese)' })).toHaveAttribute('placeholder', 'Mobiliário, além do comum.')
    await user.type(titleEn, 'Made to last')
    await user.type(within(block).getByRole('textbox', { name: 'Second tag (Portuguese)' }), 'Design')
    await waitFor(async () => expect((await saved()).chrome?.signIn?.texts).toEqual({ title: { en: 'Made to last' }, tag2: { pt: 'Design' } }), { timeout: 8000 })
    await user.clear(titleEn)
    await waitFor(async () => expect((await saved()).chrome?.signIn?.texts).toEqual({ tag2: { pt: 'Design' } }), { timeout: 8000 })
  })

  it('gives each page its own picture (cropped tall, original kept), and Remove goes back to the built-in photograph', { timeout: 60_000 }, async () => {
    const user = userEvent.setup()
    open('/admin/editor/site')
    const block = await screen.findByRole('region', { name: 'Sign-in pages panel' }, { timeout: 15_000 })
    const apply = within(block).getByRole('group', { name: 'Application' })
    expect(within(apply).getByRole('img', { name: 'Sign-in panel picture: Application' })).toHaveAttribute('src', '/images/sanctus/v2/sofa-travertine.webp')
    expect(within(apply).getByText('Built-in photograph')).toBeInTheDocument()
    expect(within(apply).queryByRole('button', { name: /^Remove/ })).toBeNull()

    await user.upload(within(apply).getByTestId('upload-image'), png())
    const dialog = await screen.findByRole('dialog', { name: 'Adjust the picture' })
    expect(dialog).toHaveAttribute('data-aspect', String(4 / 5))
    await user.click(within(dialog).getByRole('button', { name: 'Save crop' }))
    await waitFor(async () => expect((await saved()).chrome?.signIn?.pictures?.apply).toMatchObject({ path: expect.stringMatching(/^landing\/.+\.webp$/), originalPath: expect.stringMatching(/^landing\/.+\.png$/), crop: CROP }), { timeout: 8000 })
    expect((await saved()).chrome?.signIn?.pictures).not.toHaveProperty('login')
    expect(within(apply).getByRole('img', { name: 'Sign-in panel picture: Application' })).toHaveAttribute('src', 'blob:panel/2')
    expect(within(apply).getByRole('button', { name: 'Edit picture: Application' })).toBeInTheDocument()

    await user.click(within(apply).getByRole('button', { name: 'Remove: Sign-in panel picture: Application' }))
    await waitFor(async () => expect((await saved()).chrome).toBeUndefined(), { timeout: 8000 })
    expect(within(apply).getByText('Built-in photograph')).toBeInTheDocument()
  })

  it('lists every sign-in page', { timeout: 60_000 }, async () => {
    open('/admin/editor/site')
    const block = await screen.findByRole('region', { name: 'Sign-in pages panel' }, { timeout: 15_000 })
    for (const name of ['Sign in', 'Application', 'Team invitation', 'Password reset', 'Company owner invitation', 'Demo accounts'])
      expect(within(block).getByRole('group', { name })).toBeInTheDocument()
  })
})

describe('Site tab: the catalogue heading', () => {
  it('edits the heading above the pieces in the catalogue banner panel', { timeout: 60_000 }, async () => {
    const user = userEvent.setup()
    open('/admin/editor/site')
    const block = await screen.findByRole('region', { name: 'Catalogue banner' }, { timeout: 15_000 })
    const en = within(block).getByRole('textbox', { name: 'Heading above the pieces (English)' })
    expect(en).toHaveAttribute('placeholder', 'The pieces')
    expect(within(block).getByRole('textbox', { name: 'Heading above the pieces (Portuguese)' })).toHaveAttribute('placeholder', 'As peças')
    await user.type(en, 'Our collection')
    await waitFor(async () => expect((await saved()).chrome?.catalogHeading).toEqual({ en: 'Our collection' }), { timeout: 8000 })
  })
})
