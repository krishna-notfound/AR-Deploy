// The Landing tab's Sections block (ADR-0061): the list of built-in and own sections, move, hide, add, edit and delete, plus the QR
// and About pictures. Runs on the demo service like the other Editor tests.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { content } from '@/services'
import { mockCatalogService } from '@/services/mock/mockCatalogService'

const open = () => {
  localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))
  window.history.replaceState(null, '', '/admin/editor/landing')
  return render(<App />)
}
const savedLanding = async () => {
  const s = await content.getContentDraft()
  if (!s.ok) throw new Error('draft')
  return s.data.draft.landing
}
const block = async () => within(await screen.findByRole('region', { name: 'Sections' }, { timeout: 15_000 }))
const rowNames = (b: ReturnType<typeof within>) => b.getAllByRole('listitem').map((li) => li.querySelector('.truncate')?.textContent)

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  localStorage.clear()
  await mockCatalogService.resetDemoData()
})
afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('Landing tab: Sections', () => {
  it('is the first block and lists the six built-in sections in page order, none deletable', { timeout: 60_000 }, async () => {
    open()
    const b = await block()
    expect(screen.getAllByRole('heading', { level: 3 })[0]).toHaveTextContent('Sections')
    expect(rowNames(b)).toEqual(['QR code', 'How it works', 'Experience', 'Collections', 'About', 'Partners'])
    expect(b.queryByRole('button', { name: /^Delete / })).toBeNull()
    expect(b.queryByText('Hidden')).toBeNull()
    expect(b.getByRole('button', { name: 'Move QR code up' })).toBeDisabled()
    expect(b.getByRole('button', { name: 'Move Partners down' })).toBeDisabled()
    // The wording of the others lives in Texts: only QR and About open a panel here.
    expect(b.getAllByRole('button', { name: /^Edit / }).map((x) => x.getAttribute('aria-label'))).toEqual(['Edit QR code', 'Edit About'])
  })

  it('moves a section and hides and shows another; the draft keeps the list, and putting things back drops it again', { timeout: 60_000 }, async () => {
    open()
    const b = await block()
    await userEvent.click(b.getByRole('button', { name: 'Move How it works up' }))
    await waitFor(async () => expect((await savedLanding()).sections?.map((s) => s.id).slice(0, 2)).toEqual(['how', 'qr']), { timeout: 8000 })
    expect(rowNames(b).slice(0, 2)).toEqual(['How it works', 'QR code'])

    await userEvent.click(b.getByRole('button', { name: 'Hide About' }))
    await waitFor(async () => expect((await savedLanding()).sections?.find((s) => s.id === 'about')).toMatchObject({ hidden: true }), { timeout: 8000 })
    expect(within(b.getAllByRole('listitem')[4]!).getByText('Hidden')).toBeInTheDocument()
    expect(b.getByRole('button', { name: 'Show About' })).toBeInTheDocument()

    await userEvent.click(b.getByRole('button', { name: 'Show About' }))
    await userEvent.click(b.getByRole('button', { name: 'Move QR code up' }))
    await waitFor(async () => expect((await savedLanding()).sections).toBeUndefined(), { timeout: 8000 })
    expect(b.queryByText('Hidden')).toBeNull()
  })

  it('adds an own section of each design at the end, opens it, saves what is typed in both languages, and counts toward the limit', { timeout: 90_000 }, async () => {
    open()
    const b = await block()
    await userEvent.click(b.getByRole('button', { name: 'Add section' }))
    expect(b.getByText('Choose a design for the new section')).toBeInTheDocument()
    expect(b.getByRole('button', { name: /^Text/ })).toBeInTheDocument()
    expect(b.getByRole('button', { name: /^Picture and text/ })).toBeInTheDocument()
    expect(b.getByRole('button', { name: /^Banner/ })).toBeInTheDocument()
    await userEvent.click(b.getByRole('button', { name: /^Text/ }))

    // The new section is last, open, and empty.
    expect(rowNames(b).at(-1)).toBe('Untitled section')
    const heading = await b.findByRole('textbox', { name: 'Heading (English)' })
    await userEvent.type(heading, 'Visit us')
    await userEvent.type(b.getByRole('textbox', { name: 'Heading (Portuguese)' }), 'Visite-nos')
    await userEvent.type(b.getByRole('textbox', { name: 'Text (optional) (English)' }), 'Open daily.')
    await userEvent.type(b.getByRole('textbox', { name: 'Button text (English)' }), 'Find us')
    await userEvent.type(b.getByRole('textbox', { name: 'Button link' }), '/apply')
    await waitFor(
      async () => {
        const s = (await savedLanding()).sections?.at(-1)
        expect(s).toMatchObject({ kind: 'text', id: 'section-1', title: { en: 'Visit us', pt: 'Visite-nos' }, body: { en: 'Open daily.' }, button: { label: { en: 'Find us' }, href: '/apply' } })
      },
      { timeout: 8000 },
    )
    expect(rowNames(b).at(-1)).toBe('Visit us')

    // A link that is not allowed is refused with a sentence, in the field.
    await userEvent.clear(b.getByRole('textbox', { name: 'Button link' }))
    await userEvent.type(b.getByRole('textbox', { name: 'Button link' }), 'javascript:alert(1)')
    expect(await b.findByText('Use a page of this site starting with / or a full address starting with https://.')).toBeInTheDocument()

    // Picture designs wait for a picture.
    await userEvent.click(b.getByRole('button', { name: 'Add section' }))
    await userEvent.click(b.getByRole('button', { name: /^Banner/ }))
    expect(await b.findByText('No picture yet. Upload one to publish this section.')).toBeInTheDocument()
    await waitFor(async () => expect((await savedLanding()).sections?.at(-1)).toMatchObject({ kind: 'banner', id: 'section-2' }), { timeout: 8000 })
  })

  it('uploads a picture for a picture design, keeps its description, and removes it again', { timeout: 90_000 }, async () => {
    let seq = 0
    Object.assign(URL, { createObjectURL: vi.fn(() => `blob:sec/${++seq}`) })
    open()
    const b = await block()
    await userEvent.click(b.getByRole('button', { name: 'Add section' }))
    await userEvent.click(b.getByRole('button', { name: /^Picture and text/ }))
    await userEvent.upload(await b.findByTestId('upload-image'), new File([new Uint8Array(1024)], 'pic.png', { type: 'image/png' }))
    await waitFor(async () => expect((await savedLanding()).sections?.at(-1)).toMatchObject({ kind: 'imageText', image: { path: expect.stringMatching(/^landing\/.+\.png$/) } }), { timeout: 8000 })
    expect(b.getByRole('img', { name: 'The picture of this section' })).toHaveAttribute('src', 'blob:sec/1')

    await userEvent.type(b.getByRole('textbox', { name: 'Description (English)' }), 'A walnut table')
    await userEvent.click(b.getByRole('radio', { name: 'Right' }))
    await waitFor(async () => expect((await savedLanding()).sections?.at(-1)).toMatchObject({ imageSide: 'right', image: { alt: { en: 'A walnut table' } } }), { timeout: 8000 })

    await userEvent.click(b.getByRole('button', { name: 'Remove: Picture' }))
    await waitFor(async () => expect(((await savedLanding()).sections?.at(-1) as { image: { path: string } }).image.path).toBe(''), { timeout: 8000 })
  })

  it('hides and moves an own section, and deletes it only after a confirm', { timeout: 90_000 }, async () => {
    open()
    const b = await block()
    await userEvent.click(b.getByRole('button', { name: 'Add section' }))
    await userEvent.click(b.getByRole('button', { name: /^Text/ }))
    await userEvent.type(await b.findByRole('textbox', { name: 'Heading (English)' }), 'Story')
    await userEvent.click(b.getByRole('button', { name: 'Move Story up' }))
    await userEvent.click(b.getByRole('button', { name: 'Hide Story' }))
    await waitFor(async () => expect((await savedLanding()).sections?.find((s) => s.id === 'section-1')).toMatchObject({ hidden: true }), { timeout: 8000 })
    expect(rowNames(b).at(-2)).toBe('Story')

    await userEvent.click(b.getByRole('button', { name: 'Delete Story' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete this section?' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(rowNames(b)).toContain('Story')
    await userEvent.click(b.getByRole('button', { name: 'Delete Story' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Delete this section?' })).getByRole('button', { name: 'Delete' }))
    await waitFor(async () => expect((await savedLanding()).sections).toBeUndefined(), { timeout: 8000 })
    expect(rowNames(b)).not.toContain('Story')
  })
})

describe('Landing tab: QR and About pictures', () => {
  it('QR: text only until a picture is uploaded, then on the left; the side can change; removing the picture goes back', { timeout: 90_000 }, async () => {
    let seq = 0
    Object.assign(URL, { createObjectURL: vi.fn(() => `blob:qr/${++seq}`) })
    open()
    const b = await block()
    await userEvent.click(b.getByRole('button', { name: 'Edit QR code' }))
    expect(b.getByText('No picture: the section shows centred text.')).toBeInTheDocument()
    expect(b.getByRole('radio', { name: 'Picture on the left' })).toBeDisabled()
    expect(b.getByRole('radio', { name: 'Text only, centred' })).toBeChecked()

    await userEvent.upload(b.getByTestId('upload-image'), new File([new Uint8Array(1024)], 'qr.png', { type: 'image/png' }))
    await waitFor(async () => expect((await savedLanding()).qr).toMatchObject({ imageSide: 'left', image: { path: expect.stringMatching(/^landing\/.+\.png$/) } }), { timeout: 8000 })
    await userEvent.click(b.getByRole('radio', { name: 'Picture on the right' }))
    await userEvent.type(b.getByRole('textbox', { name: 'Description (English)' }), 'A table card')
    await waitFor(async () => expect((await savedLanding()).qr).toMatchObject({ imageSide: 'right', image: { alt: { en: 'A table card' } } }), { timeout: 8000 })

    await userEvent.click(b.getByRole('button', { name: /^Remove: QR section/ }))
    await waitFor(async () => expect((await savedLanding()).qr).toBeUndefined(), { timeout: 8000 })
  })

  it('About: shows the built-in photos, replaces each, and goes back to the built-in photo', { timeout: 90_000 }, async () => {
    let seq = 0
    Object.assign(URL, { createObjectURL: vi.fn(() => `blob:about/${++seq}`) })
    open()
    const b = await block()
    await userEvent.click(b.getByRole('button', { name: 'Edit About' }))
    const previews = b.getAllByRole('img', { name: 'The picture of this section' })
    expect(previews.map((p) => p.getAttribute('src'))).toEqual(['/images/sanctus/v2/coffee-table.webp', '/images/sanctus/v2/detail-joinery.webp'])
    expect(b.getAllByText('Built-in photo in use.')).toHaveLength(2)

    const uploads = b.getAllByTestId('upload-image')
    await userEvent.upload(uploads[1]!, new File([new Uint8Array(1024)], 'detail.png', { type: 'image/png' }))
    await waitFor(async () => expect((await savedLanding()).about).toMatchObject({ detail: { path: expect.stringMatching(/^landing\/.+\.png$/) } }), { timeout: 8000 })
    expect((await savedLanding()).about?.image).toBeUndefined()
    await userEvent.type(b.getByRole('textbox', { name: 'Description (English)' }), 'Dovetail joint')
    await waitFor(async () => expect((await savedLanding()).about?.detail?.alt).toEqual({ en: 'Dovetail joint' }), { timeout: 8000 })

    await userEvent.click(b.getByRole('button', { name: 'Use the built-in photo: Detail photograph' }))
    await waitFor(async () => expect((await savedLanding()).about).toBeUndefined(), { timeout: 8000 })
  })

  it('the QR texts are in the Texts block under their own section, with the old hero text as the original', { timeout: 60_000 }, async () => {
    open()
    const heading = await screen.findByRole('heading', { level: 3, name: 'Texts' }, { timeout: 15_000 })
    const section = heading.closest('section')!.querySelector('[data-section="qr"]') as HTMLElement
    expect(section).not.toBeNull()
    await userEvent.click(section.querySelector('summary')!)
    const body = await within(section).findByRole('textbox', { name: /Your customers scan a QR code.* \(English\)/ })
    expect(body).toHaveAttribute('placeholder', expect.stringContaining('Your customers scan a QR code'))
    expect(within(section).getAllByRole('textbox')).toHaveLength(6) // eyebrow, title and body, in English and Portuguese
  })
})
