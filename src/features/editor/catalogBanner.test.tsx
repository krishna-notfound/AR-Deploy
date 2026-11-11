// The Site tab's "Catalogue banner" panel (ADR-0065): the platform's default picture at the top of every catalogue. Upload (cropped 2:1,
// original kept), Edit picture, Remove; part of the draft; counted in the publish summary. The crop dialog is a stand-in.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { emptySiteContent, summarizeChanges } from '@/domain/siteContent'
import { content } from '@/services'
import { mockCatalogService } from '@/services/mock/mockCatalogService'
import { CROP } from '@/test/cropDialogStub'
import { setCatalogBanner, setFavicon } from './siteOps'

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
const png = () => new File([new Uint8Array(64)], 'wide.png', { type: 'image/png' })
const IMG = { path: 'landing/11111111-1111-4111-8111-111111111111.webp', originalPath: 'landing/22222222-2222-4222-8222-222222222222.png', crop: CROP }

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  let seq = 0
  Object.assign(URL, { createObjectURL: vi.fn(() => `blob:banner/${++seq}`) })
  localStorage.clear()
  await mockCatalogService.resetDemoData()
})
afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('siteOps: the banner and the favicon share chrome', () => {
  const icon = { path: 'landing/33333333-3333-4333-8333-333333333333.png' }

  it('sets and clears the banner; an emptied chrome equals one never set', () => {
    const doc = setCatalogBanner(emptySiteContent(), IMG)
    expect(doc.chrome).toEqual({ catalogBanner: IMG })
    expect(setCatalogBanner(doc, undefined)).toEqual(emptySiteContent())
    expect('chrome' in setCatalogBanner(doc, undefined)).toBe(false)
  })

  it('clearing the favicon keeps the banner, and clearing the banner keeps the favicon', () => {
    const both = setFavicon(setCatalogBanner(emptySiteContent(), IMG), icon)
    expect(both.chrome).toEqual({ catalogBanner: IMG, favicon: icon })
    expect(setFavicon(both, undefined).chrome).toEqual({ catalogBanner: IMG })
    expect(setCatalogBanner(both, undefined).chrome).toEqual({ favicon: icon })
  })

  it('counts the banner once in the publish summary, whichever part of it changed', () => {
    const a = emptySiteContent()
    const b = setCatalogBanner(a, IMG)
    expect(summarizeChanges(a, b)).toMatchObject({ catalogBanner: 1, siteFavicon: 0, total: 1 })
    expect(summarizeChanges(b, b)).toMatchObject({ catalogBanner: 0, total: 0 })
    expect(summarizeChanges(b, setCatalogBanner(b, { ...IMG, crop: { ...CROP, x: 99 } }))).toMatchObject({ catalogBanner: 1, total: 1 })
    expect(summarizeChanges(b, setCatalogBanner(b, undefined))).toMatchObject({ catalogBanner: 1, total: 1 })
  })
})

describe('Site tab: the catalogue banner panel', () => {
  it('says the built-in photograph is used; uploads (original + 2:1 copy), edits and removes it; each change is in the draft', { timeout: 60_000 }, async () => {
    const user = userEvent.setup()
    open('/admin/editor/site')
    const block = await screen.findByRole('region', { name: 'Catalogue banner' }, { timeout: 15_000 })
    expect(within(block).getByText(/show the built-in Sanctus photograph/)).toBeInTheDocument()
    expect(within(block).queryByRole('button', { name: /^Remove/ })).toBeNull()
    expect(within(block).queryByRole('button', { name: /^Edit picture/ })).toBeNull()
    expect(within(block).getByText(/on a narrow screen its sides are trimmed/)).toBeInTheDocument()

    await user.upload(within(block).getByTestId('upload-image'), png())
    const dialog = await screen.findByRole('dialog', { name: 'Adjust the picture' })
    expect(dialog).toHaveAttribute('data-aspect', '2')
    await user.click(within(dialog).getByRole('button', { name: 'Save crop' }))
    await waitFor(async () => expect((await saved()).chrome?.catalogBanner).toMatchObject({ path: expect.stringMatching(/^landing\/.+\.webp$/), originalPath: expect.stringMatching(/^landing\/.+\.png$/), crop: CROP }), { timeout: 8000 })
    const first = (await saved()).chrome!.catalogBanner!
    expect(first.path).not.toBe(first.originalPath)
    expect(within(block).getByRole('img', { name: 'The default catalogue banner' })).toHaveAttribute('src', 'blob:banner/2')
    expect(within(block).getByRole('button', { name: 'Replace picture' })).toBeInTheDocument()

    // Edit picture: opens the ORIGINAL with its crop, and keeps the original path.
    await user.click(within(block).getByRole('button', { name: 'Edit picture: Catalogue banner' }))
    const again = await screen.findByRole('dialog', { name: 'Adjust the picture' })
    expect(JSON.parse(again.getAttribute('data-initial')!)).toEqual(CROP)
    await user.click(within(again).getByRole('button', { name: 'Save crop' }))
    await waitFor(async () => expect((await saved()).chrome?.catalogBanner?.path).not.toBe(first.path), { timeout: 8000 })
    expect((await saved()).chrome?.catalogBanner?.originalPath).toBe(first.originalPath)

    await user.click(within(block).getByRole('button', { name: 'Remove: The default catalogue banner' }))
    await waitFor(async () => expect((await saved()).chrome).toBeUndefined(), { timeout: 8000 })
    expect(within(block).getByText(/show the built-in Sanctus photograph/)).toBeInTheDocument()
  })

  it('refuses a file that is not a picture with a sentence and saves nothing', { timeout: 60_000 }, async () => {
    open('/admin/editor/site')
    const block = await screen.findByRole('region', { name: 'Catalogue banner' }, { timeout: 15_000 })
    await userEvent.upload(within(block).getByTestId('upload-image'), new File([new Uint8Array(64)], 'notes.txt', { type: 'text/plain' }), { applyAccept: false })
    expect(await within(block).findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect((await saved()).chrome).toBeUndefined()
  })

  it('does not disturb the favicon panel next to it', { timeout: 60_000 }, async () => {
    open('/admin/editor/site')
    await screen.findByRole('region', { name: 'Catalogue banner' }, { timeout: 15_000 })
    expect(screen.getByRole('region', { name: 'Site icon (favicon)' })).toBeInTheDocument()
  })
})
