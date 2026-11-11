import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { APPLY_EDITABLE_KEYS, type SiteContent, emptySiteContent, validateApplyForm } from '@/domain/siteContent'
import { LANG_KEY, LanguageProvider } from '@/i18n/LanguageProvider'
import { en, pt } from '@/i18n/dictionaries/full'
import { APPLY_BUILTIN_KEYS, BUILTIN_FIELDS } from '../../../../supabase/functions/_shared/applyForm.ts'
import { ApplyFormEditor } from './ApplyFormEditor'
import { addQuestion as addQuestionOp } from './formOps'
import { allEditedTextKeys } from './textGroups'

let latest: SiteContent
function Harness({ start }: { start?: SiteContent }) {
  const [draft, setDraft] = useState<SiteContent>(start ?? emptySiteContent())
  latest = draft
  return <ApplyFormEditor draft={draft} onChange={setDraft} />
}
function renderEditor(entry = '/admin/editor/apply', lang: 'en' | 'pt' = 'en', start?: SiteContent) {
  localStorage.setItem(LANG_KEY, lang)
  return render(
    <LanguageProvider>
      <ConfirmProvider>
        <MemoryRouter initialEntries={[entry]}>
          <Harness start={start} />
        </MemoryRouter>
      </ConfirmProvider>
    </LanguageProvider>,
  )
}
const rowOf = (key: string) => document.querySelector(`[data-row="${key}"]`) as HTMLElement
const orderIn = (sectionLabel: RegExp) => {
  const section = screen.getByRole('region', { name: sectionLabel })
  return within(section)
    .getAllByRole('listitem')
    .map((li) => li.getAttribute('data-row'))
}
const typingGroup = () => screen.getByRole('radiogroup', { name: 'Language you are typing in' })
/** Opens the menu of a card or section and picks an item. */
async function menu(user: ReturnType<typeof userEvent.setup>, trigger: string, item: string | RegExp) {
  await user.click(screen.getByRole('button', { name: trigger }))
  await user.click(await screen.findByRole('menuitem', { name: item }))
}
async function addQuestion(user: ReturnType<typeof userEvent.setup>, kind: string) {
  await user.click(screen.getByRole('button', { name: 'Add question' }))
  await user.click(await screen.findByRole('menuitem', { name: kind }))
}

/** A draft that already has `n` short-answer questions (on section 4), to test the limits without clicking ten times. */
function draftWithQuestions(n: number): SiteContent {
  const draft = emptySiteContent()
  for (let i = 0; i < n; i++) draft.applyForm = addQuestionOp(draft.applyForm, 'catalogue', 'short_text', `Question ${i + 1}`).config
  return draft
}

beforeEach(() => localStorage.clear())

describe('the wording the builder offers covers every editable text', () => {
  it('cards plus the Button & message texts panel equal APPLY_EDITABLE_KEYS', () => {
    const options = Object.fromEntries(Object.entries(BUILTIN_FIELDS).filter(([, v]) => v.options).map(([k, v]) => [k, v.options])) as never
    const edited = allEditedTextKeys(APPLY_BUILTIN_KEYS, options)
    expect([...edited].sort()).toEqual([...APPLY_EDITABLE_KEYS].sort())
    for (const k of edited) {
      expect(k in en).toBe(true)
      expect(k in pt).toBe(true)
    }
  })
})

describe('the cards', () => {
  it("opens today's form unchanged: five sections with the standard questions, nothing to fix", () => {
    renderEditor()
    expect(orderIn(/^Section 1/)).toEqual(['businessName', 'website', 'category', 'description'])
    expect(orderIn(/^Section 2/)).toEqual(['country', 'city'])
    expect(orderIn(/^Section 3/)).toEqual(['applicantName', 'applicantRole', 'applicantEmail', 'applicantPhone', 'language'])
    expect(orderIn(/^Section 4/)).toEqual(['productCount', 'photoReadiness', 'modelReadiness', 'notes', 'catalogue'])
    expect(screen.getByText('5 of 8 sections · 0 of 10 own questions')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('a closed card looks like the question; Enter or a click opens it in place, one at a time', async () => {
    const user = userEvent.setup()
    renderEditor()
    expect(within(rowOf('website')).getByText('Optional')).toBeInTheDocument()
    expect(within(rowOf('website')).getByText('Standard')).toBeInTheDocument()
    const open = screen.getByRole('button', { name: 'Edit Website' })
    open.focus()
    await user.keyboard('{Enter}')
    expect(within(rowOf('website')).getByRole('textbox', { name: 'Question (English)' })).toHaveFocus()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Edit Business name' }))
    expect(within(rowOf('website')).queryByRole('textbox')).not.toBeInTheDocument()
    expect(within(rowOf('businessName')).queryByRole('button', { name: 'Edit Business name' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: 'Edit Business name' })).toHaveFocus()
  })

  it('edits the wording of a standard question in place, and Reset to default puts the original back', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.click(screen.getByRole('button', { name: 'Edit Website' }))
    const box = within(rowOf('website')).getByRole('textbox', { name: 'Question (English)' })
    expect(box).toHaveAttribute('placeholder', 'Website')
    await user.click(box)
    await user.paste('Company website')
    expect(latest.applyForm.texts['apply.f.website']).toEqual({ en: 'Company website' })
    expect(within(rowOf('website')).getByRole('button', { name: 'Reset to default' })).toBeEnabled()
    await user.click(within(rowOf('website')).getByRole('button', { name: 'Reset to default' }))
    expect(latest.applyForm.texts['apply.f.website']).toBeUndefined()
  })

  it('a locked question shows its lock and reason and has no Hide and no Required switch', async () => {
    const user = userEvent.setup()
    renderEditor()
    const row = rowOf('businessName')
    expect(within(row).getByRole('img', { name: 'Locked' })).toBeInTheDocument()
    expect(within(row).getByText('Needed to create the company account')).toBeInTheDocument()
    await user.click(within(row).getByRole('button', { name: 'Edit Business name' }))
    expect(within(row).queryByRole('button', { name: /^Hide/ })).not.toBeInTheDocument()
    expect(within(row).queryByRole('switch')).not.toBeInTheDocument()
    expect(within(row).getByText('Needed to create the company account')).toBeInTheDocument()
    // The wording can still be edited.
    await user.type(within(row).getByRole('textbox', { name: 'Question (English)' }), 'Company')
    expect(latest.applyForm.texts['apply.f.businessName']).toEqual({ en: 'Company' })
    expect(validateApplyForm(latest.applyForm)).toEqual({})
  })

  it('hides and shows an ordinary question; a hidden card stays in its section with a Show button', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.click(screen.getByRole('button', { name: 'Edit Website' }))
    await user.click(screen.getByRole('button', { name: 'Hide Website' }))
    expect(latest.applyForm.fields.find((f) => f.key === 'website')!.hidden).toBe(true)
    expect(orderIn(/^Section 1/)).toContain('website')
    expect(within(rowOf('website')).getByText('Hidden: people do not see this question on the form.')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(within(rowOf('website')).getByText('Hidden')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show Website' }))
    expect(latest.applyForm.fields.find((f) => f.key === 'website')!.hidden).toBeUndefined()
  })

  it('options of a standard choice can be hidden but the last visible one cannot', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.click(screen.getByRole('button', { name: 'Edit How many products would you show?' }))
    const row = rowOf('productCount')
    for (const name of ['1 to 10', '11 to 50', '51 to 200']) await user.click(within(row).getByRole('button', { name: `Hide “${name}”` }))
    expect(latest.applyForm.hiddenOptions.productCount).toEqual(['1-10', '11-50', '51-200'])
    expect(within(row).getByRole('button', { name: 'Hide “More than 200”' })).toBeDisabled()
    expect(within(row).getByText('At least one option must stay visible.')).toBeInTheDocument()
    expect(validateApplyForm(latest.applyForm)).toEqual({})
    await user.click(within(row).getByRole('button', { name: 'Show “1 to 10”' }))
    expect(latest.applyForm.hiddenOptions.productCount).toEqual(['11-50', '51-200'])
  })

  it('the Required switch of an optional question works and the language question has none', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.click(screen.getByRole('button', { name: 'Edit Website' }))
    await user.click(within(rowOf('website')).getByRole('switch', { name: 'Required' }))
    expect(latest.applyForm.fields.find((f) => f.key === 'website')!.required).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Edit Preferred language for emails' }))
    expect(within(rowOf('language')).queryByRole('switch')).not.toBeInTheDocument()
  })
})

describe('moving questions', () => {
  it('the menu moves a question; focus stays on its handle and the move is announced', async () => {
    const user = userEvent.setup()
    renderEditor()
    expect(orderIn(/^Section 1/).slice(0, 3)).toEqual(['businessName', 'website', 'category'])
    await menu(user, 'Actions for Website', 'Move down')
    expect(orderIn(/^Section 1/).slice(0, 3)).toEqual(['businessName', 'category', 'website'])
    expect(screen.getByRole('button', { name: 'Move Website: drag, or use the arrow keys' })).toHaveFocus()
    expect(screen.getByRole('status')).toHaveTextContent('Moved to section 1, position 3')
    await menu(user, 'Actions for Website', 'Move up')
    expect(latest.applyForm.fields.map((f) => f.key).slice(0, 3)).toEqual(['businessName', 'website', 'category'])
  })

  it('the arrow keys on the handle move it too', async () => {
    renderEditor()
    const handle = screen.getByRole('button', { name: 'Move Website: drag, or use the arrow keys' })
    fireEvent.keyDown(handle, { key: 'ArrowDown' })
    expect(orderIn(/^Section 1/).slice(0, 3)).toEqual(['businessName', 'category', 'website'])
    expect(screen.getByRole('button', { name: 'Move Website: drag, or use the arrow keys' })).toHaveFocus()
  })

  it('the first question cannot move up and the last cannot move down', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.click(screen.getByRole('button', { name: 'Actions for Business name' }))
    expect(screen.getByRole('menuitem', { name: 'Move up' })).toBeDisabled()
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Actions for About the business' }))
    expect(screen.getByRole('menuitem', { name: 'Move down' })).toBeDisabled()
  })

  it('Move to section puts the question last in another section, never on Review', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.click(screen.getByRole('button', { name: 'Actions for Phone' }))
    expect(screen.queryByRole('menuitem', { name: /Section 5/ })).not.toBeInTheDocument()
    await user.click(screen.getByRole('menuitem', { name: 'Move to section 2: Location' }))
    expect(orderIn(/^Section 2/)).toEqual(['country', 'city', 'applicantPhone'])
    expect(orderIn(/^Section 3/)).not.toContain('applicantPhone')
    expect(screen.getByRole('status')).toHaveTextContent('Moved to section 2, position 3')
    expect(validateApplyForm(latest.applyForm)).toEqual({})
  })

  describe('dragging by the handle', () => {
    // jsdom has no layout: every card is 100px tall and sections are stacked from the top, as the real page lays them out.
    let restore: () => void
    beforeEach(() => {
      const original = Element.prototype.getBoundingClientRect
      Element.prototype.getBoundingClientRect = function (this: Element) {
        const rows = [...document.querySelectorAll('[data-row]')]
        const zones = [...document.querySelectorAll('[data-step-zone]')]
        const rect = (top: number, height: number) => ({ top, bottom: top + height, left: 0, right: 600, width: 600, height, x: 0, y: top, toJSON: () => ({}) }) as DOMRect
        // Each section: 200px of header, then its cards at 100px each.
        let y = 0
        const layout = new Map<Element, DOMRect>()
        for (const z of zones) {
          const inZone = rows.filter((r) => z.contains(r))
          layout.set(z, rect(y, 200 + inZone.length * 100))
          inZone.forEach((r, i) => layout.set(r, rect(y + 200 + i * 100, 100)))
          y += 200 + inZone.length * 100
        }
        return layout.get(this) ?? original.call(this)
      }
      restore = () => {
        Element.prototype.getBoundingClientRect = original
      }
    })
    afterEach(() => restore())

    it('drops a card inside its section where the pointer is released', () => {
      renderEditor()
      // Section 1 starts at y=0: header 0-200, then Business name 200-300, Website 300-400, Category 400-500, About 500-600.
      const handle = screen.getByRole('button', { name: 'Move Business name: drag, or use the arrow keys' })
      fireEvent.pointerDown(handle, { clientX: 20, clientY: 250, pointerId: 1, button: 0 })
      fireEvent.pointerMove(window, { clientX: 20, clientY: 460, pointerId: 1 })
      fireEvent.pointerUp(window, { clientX: 20, clientY: 460, pointerId: 1 })
      expect(orderIn(/^Section 1/)).toEqual(['website', 'category', 'businessName', 'description'])
      expect(screen.getByRole('status')).toHaveTextContent('Moved to section 1, position 3')
    })

    it('drops a card into another section', () => {
      renderEditor()
      // Section 2 spans 600-1000 (header 600-800, Country 800-900, City 900-1000); 980 is past the middle of City (950).
      const handle = screen.getByRole('button', { name: 'Move Website: drag, or use the arrow keys' })
      fireEvent.pointerDown(handle, { clientX: 20, clientY: 350, pointerId: 1, button: 0 })
      fireEvent.pointerMove(window, { clientX: 20, clientY: 980, pointerId: 1 })
      fireEvent.pointerUp(window, { clientX: 20, clientY: 980, pointerId: 1 })
      expect(orderIn(/^Section 2/)).toEqual(['country', 'city', 'website'])
      expect(orderIn(/^Section 1/)).not.toContain('website')
      expect(validateApplyForm(latest.applyForm)).toEqual({})
    })

    it('Escape cancels the drag and a press that does not move changes nothing', () => {
      renderEditor()
      const before = JSON.stringify(latest.applyForm)
      const handle = screen.getByRole('button', { name: 'Move Website: drag, or use the arrow keys' })
      fireEvent.pointerDown(handle, { clientX: 20, clientY: 350, pointerId: 1, button: 0 })
      fireEvent.pointerMove(window, { clientX: 20, clientY: 900, pointerId: 1 })
      fireEvent.keyDown(window, { key: 'Escape' })
      fireEvent.pointerUp(window, { clientX: 20, clientY: 900, pointerId: 1 })
      expect(JSON.stringify(latest.applyForm)).toBe(before)
      fireEvent.pointerDown(handle, { clientX: 20, clientY: 350, pointerId: 1, button: 0 })
      fireEvent.pointerUp(window, { clientX: 20, clientY: 350, pointerId: 1 })
      expect(JSON.stringify(latest.applyForm)).toBe(before)
    })
  })
})

describe('sections', () => {
  it('rename a section in English and Portuguese; the original shows as the guide', async () => {
    const user = userEvent.setup()
    renderEditor()
    const title = screen.getByRole('textbox', { name: 'Title of section 1 (English)' })
    expect(title).toHaveAttribute('placeholder', 'Your business')
    await user.type(title, 'About you')
    await user.click(within(typingGroup()).getByRole('radio', { name: 'PT' }))
    const pt1 = screen.getByRole('textbox', { name: 'Title of section 1 (Português)' })
    expect(pt1).toHaveAttribute('placeholder', 'A sua empresa')
    await user.type(pt1, 'Sobre si')
    expect(latest.applyForm.steps[0]!.title).toEqual({ en: 'About you', pt: 'Sobre si' })
  })

  it('Add section below puts a new section after this one and focuses its title', async () => {
    const user = userEvent.setup()
    renderEditor()
    await menu(user, 'Actions for section 1', 'Add section below')
    expect(latest.applyForm.steps.map((s) => s.id)[1]).not.toBe('location')
    expect(latest.applyForm.steps).toHaveLength(6)
    expect(latest.applyForm.steps[1]!.title).toEqual({ en: 'New section' })
    expect(screen.getByRole('textbox', { name: 'Title of section 2 (English)' })).toHaveFocus()
    expect(latest.applyForm.steps.at(-1)!.builtin).toBe('review')
  })

  it('adds sections up to eight and then Add section is disabled with the reason', async () => {
    const user = userEvent.setup()
    renderEditor()
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: 'Add section' }))
    expect(latest.applyForm.steps).toHaveLength(8)
    expect(screen.getByRole('button', { name: 'Add section' })).toBeDisabled()
    expect(screen.getByText('8 sections is the most')).toBeInTheDocument()
    expect(screen.getByText('8 of 8 sections · 0 of 10 own questions')).toBeInTheDocument()
    expect(latest.applyForm.steps.at(-1)!.builtin).toBe('review')
  })

  it('a section can move; only one the client added can be deleted, after a confirmation, and its questions move up', async () => {
    const user = userEvent.setup()
    renderEditor()
    await menu(user, 'Actions for section 2', 'Move section up')
    expect(latest.applyForm.steps.map((s) => s.id).slice(0, 2)).toEqual(['location', 'business'])
    expect(screen.getByRole('status')).toHaveTextContent('Section moved to position 1 of 5')
    await user.click(screen.getByRole('button', { name: 'Actions for section 1' }))
    expect(screen.getByRole('menuitem', { name: 'Move section up' })).toBeDisabled()
    expect(screen.queryByRole('menuitem', { name: 'Delete section' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')
    // A new section holding a question: deleting it moves the question to the section above.
    await menu(user, 'Actions for section 4', 'Add section below')
    const added = latest.applyForm.steps[4]!
    await user.click(within(rowOf('notes')).getByRole('button', { name: /^Actions for/ }))
    await user.click(screen.getByRole('menuitem', { name: 'Move to section 5: New section' }))
    await user.click(screen.getByRole('button', { name: 'Actions for section 5' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete section' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete section 5?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(latest.applyForm.steps.some((s) => s.id === added.id)).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Actions for section 5' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete section' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete section' }))
    expect(latest.applyForm.steps.some((s) => s.id === added.id)).toBe(false)
    expect(validateApplyForm(latest.applyForm)).toEqual({})
    expect(orderIn(/^Section 4/)).toContain('notes')
  })

  it('Review is fixed: no menu, always last, its rows are locked with the legal reason, and nothing can be moved onto it', async () => {
    const user = userEvent.setup()
    renderEditor()
    const review = screen.getByRole('region', { name: /^Section 5/ })
    expect(within(review).queryByRole('button', { name: /Actions for/ })).not.toBeInTheDocument()
    expect(within(review).getByText('Always last')).toBeInTheDocument()
    expect(within(review).getAllByText('Always asked (legal)')).toHaveLength(2)
    expect(within(review).getByText('Agreement to the Terms and the Privacy Policy')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Actions for section 4' }))
    expect(screen.getByRole('menuitem', { name: 'Move section down' })).toBeDisabled()
    await user.keyboard('{Escape}')
    // The consent sentence can be reworded.
    await user.type(within(review).getByRole('textbox', { name: 'Consent sentence (English)' }), 'I agree.')
    expect(latest.applyForm.texts['apply.f.consent']).toEqual({ en: 'I agree.' })
  })

  it('the header card edits the page title and introduction in place', async () => {
    const user = userEvent.setup()
    renderEditor()
    const title = screen.getByRole('textbox', { name: 'Form title (English)' })
    expect(title).toHaveAttribute('placeholder', 'Apply as a business')
    await user.type(title, 'Join Sanctus')
    expect(latest.applyForm.texts['apply.title']).toEqual({ en: 'Join Sanctus' })
  })
})

describe('own questions', () => {
  it('adds a question by choosing its kind first, opens it, and stops at ten', async () => {
    const user = userEvent.setup()
    renderEditor()
    await addQuestion(user, 'Checkboxes')
    expect(latest.applyForm.customQuestions).toHaveLength(1)
    const q = latest.applyForm.customQuestions[0]!
    expect(q.type).toBe('multi_choice')
    expect(orderIn(/^Section 4/).at(-1)).toBe(`custom:${q.id}`)
    const row = rowOf(`custom:${q.id}`)
    const label = within(row).getByRole('textbox', { name: 'Question (English)' })
    expect(label).toHaveFocus()
    await user.clear(label)
    await user.type(label, 'Materials')
    await user.type(within(row).getByRole('textbox', { name: 'Option 1 (English)' }), 'Wood')
    await user.type(within(row).getByRole('textbox', { name: 'Option 2 (English)' }), 'Metal')
    await user.click(within(row).getByRole('switch', { name: 'Required' }))
    expect(latest.applyForm.customQuestions[0]).toMatchObject({ label: { en: 'Materials' }, options: [{ label: { en: 'Wood' } }, { label: { en: 'Metal' } }] })
    expect(latest.applyForm.fields.find((f) => f.key.startsWith('custom:'))!.required).toBe(true)
    expect(validateApplyForm(latest.applyForm)).toEqual({})
  })

  it('stops at ten own questions: Add question is disabled and says why', async () => {
    const user = userEvent.setup()
    renderEditor('/admin/editor/apply', 'en', draftWithQuestions(9))
    await addQuestion(user, 'Short answer')
    expect(latest.applyForm.customQuestions).toHaveLength(10)
    const add = screen.getByRole('button', { name: 'Add question' })
    expect(add).toBeDisabled()
    expect(add).toHaveAccessibleDescription('10 own questions is the most')
    expect(validateApplyForm(latest.applyForm)).toEqual({})
  })

  it('a new question goes right below the open card', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.click(screen.getByRole('button', { name: 'Edit Website' }))
    await addQuestion(user, 'Paragraph')
    const keys = orderIn(/^Section 1/)
    expect(keys.indexOf(`custom:${latest.applyForm.customQuestions[0]!.id}`)).toBe(keys.indexOf('website') + 1)
  })

  it('the kind menu changes the type; the closed card draws the answer', async () => {
    const user = userEvent.setup()
    renderEditor()
    await addQuestion(user, 'Yes or no')
    const id = latest.applyForm.customQuestions[0]!.id
    await menu(user, 'Type of question: Yes or no', 'Multiple choice')
    expect(latest.applyForm.customQuestions[0]!.type).toBe('single_choice')
    expect(latest.applyForm.customQuestions[0]!.options).toHaveLength(2)
    await user.type(within(rowOf(`custom:${id}`)).getByRole('textbox', { name: 'Option 1 (English)' }), 'Oak')
    await user.keyboard('{Escape}')
    expect(within(rowOf(`custom:${id}`)).getByText('Oak')).toBeInTheDocument()
    expect(within(rowOf(`custom:${id}`)).getByText('Multiple choice')).toBeInTheDocument()
  })

  it('duplicates a question below itself with "(copy)", and is disabled with a reason at ten', async () => {
    const user = userEvent.setup()
    renderEditor()
    await addQuestion(user, 'Short answer')
    const first = latest.applyForm.customQuestions[0]!
    const label = within(rowOf(`custom:${first.id}`)).getByRole('textbox', { name: 'Question (English)' })
    await user.clear(label)
    await user.type(label, 'Showroom hours')
    await user.click(within(rowOf(`custom:${first.id}`)).getByRole('button', { name: 'Duplicate' }))
    expect(latest.applyForm.customQuestions).toHaveLength(2)
    const copy = latest.applyForm.customQuestions[1]!
    expect(copy.label.en).toBe('Showroom hours (copy)')
    const keys = orderIn(/^Section 4/)
    expect(keys.indexOf(`custom:${copy.id}`)).toBe(keys.indexOf(`custom:${first.id}`) + 1)
    expect(within(rowOf(`custom:${copy.id}`)).getByRole('textbox', { name: 'Question (English)' })).toHaveFocus()
  })

  it('Duplicate is disabled with the reason at ten own questions', async () => {
    const user = userEvent.setup()
    const start = draftWithQuestions(10)
    renderEditor('/admin/editor/apply', 'en', start)
    await user.click(screen.getByRole('button', { name: 'Edit Question 1' }))
    const duplicate = screen.getByRole('button', { name: 'Duplicate' })
    expect(duplicate).toBeDisabled()
    expect(duplicate).toHaveAccessibleDescription('10 own questions is the most')
    expect(latest.applyForm.customQuestions).toHaveLength(10)
  })

  it('deleting a question asks first; Cancel keeps it', async () => {
    const user = userEvent.setup()
    renderEditor()
    await addQuestion(user, 'Short answer')
    const id = latest.applyForm.customQuestions[0]!.id
    await user.click(within(rowOf(`custom:${id}`)).getByRole('button', { name: 'Delete' }))
    const dialog = await screen.findByRole('dialog', { name: 'Delete this question?' })
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(latest.applyForm.customQuestions).toHaveLength(1)
    await user.click(within(rowOf(`custom:${id}`)).getByRole('button', { name: 'Delete' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete question' }))
    expect(latest.applyForm.customQuestions).toHaveLength(0)
    expect(latest.applyForm.fields.some((f) => f.key.startsWith('custom:'))).toBe(false)
    expect(rowOf(`custom:${id}`)).toBeNull()
  })

  it('options can be added, reordered and removed down to two', async () => {
    const user = userEvent.setup()
    renderEditor()
    await addQuestion(user, 'Multiple choice')
    const id = latest.applyForm.customQuestions[0]!.id
    const row = () => rowOf(`custom:${id}`)
    await user.type(within(row()).getByRole('textbox', { name: 'Option 1 (English)' }), 'A')
    await user.type(within(row()).getByRole('textbox', { name: 'Option 2 (English)' }), 'B')
    await user.click(within(row()).getByRole('button', { name: 'Move option 1 down' }))
    expect(latest.applyForm.customQuestions[0]!.options!.map((o) => o.label.en)).toEqual(['B', 'A'])
    await user.click(within(row()).getByRole('button', { name: 'Add option' }))
    expect(latest.applyForm.customQuestions[0]!.options).toHaveLength(3)
    await user.click(within(row()).getByRole('button', { name: 'Remove option 3' }))
    expect(within(row()).getByRole('button', { name: 'Remove option 1' })).toBeDisabled()
  })
})

describe('the EN | PT typing switch', () => {
  it('Portuguese fields show the English text greyed as the guide; typing stores the Portuguese, emptying removes it', async () => {
    const user = userEvent.setup()
    renderEditor()
    await addQuestion(user, 'Short answer')
    const id = latest.applyForm.customQuestions[0]!.id
    await user.clear(within(rowOf(`custom:${id}`)).getByRole('textbox', { name: 'Question (English)' }))
    await user.type(within(rowOf(`custom:${id}`)).getByRole('textbox', { name: 'Question (English)' }), 'Materials')
    await user.click(within(typingGroup()).getByRole('radio', { name: 'PT' }))
    const box = within(rowOf(`custom:${id}`)).getByRole('textbox', { name: 'Question (Português)' })
    expect(box).toHaveValue('')
    expect(box).toHaveAttribute('placeholder', 'Materials')
    await user.type(box, 'Materiais')
    expect(latest.applyForm.customQuestions[0]!.label).toEqual({ en: 'Materials', pt: 'Materiais' })
    await user.clear(box)
    expect(latest.applyForm.customQuestions[0]!.label).toEqual({ en: 'Materials' })
    // The closed cards follow the language being typed.
    await user.click(within(typingGroup()).getByRole('radio', { name: 'EN' }))
    expect(within(typingGroup()).getByRole('radio', { name: 'EN' })).toBeChecked()
  })

  it('shows the Portuguese original of a standard question as the guide', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.click(within(typingGroup()).getByRole('radio', { name: 'PT' }))
    expect(screen.getByRole('button', { name: /^Edit Website/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Edit Website/ }))
    expect(within(rowOf('website')).getByRole('textbox', { name: 'Question (Português)' })).toHaveAttribute('lang', 'pt')
  })
})

describe('problems', () => {
  it('lists each problem as a link that opens and focuses its card', async () => {
    const user = userEvent.setup()
    renderEditor()
    await menu(user, 'Actions for section 1', 'Add section below')
    await user.clear(screen.getByRole('textbox', { name: 'Title of section 2 (English)' }))
    await addQuestion(user, 'Short answer')
    const id = latest.applyForm.customQuestions[0]!.id
    await user.clear(within(rowOf(`custom:${id}`)).getByRole('textbox', { name: 'Question (English)' }))
    await user.keyboard('{Escape}')
    expect(screen.getByRole('alert')).toHaveTextContent('2 things to fix')
    // The section problem.
    await user.click(screen.getByRole('button', { name: /^Section 2: This is required/ }))
    expect(screen.getByRole('textbox', { name: 'Title of section 2 (English)' })).toHaveFocus()
    // The question problem: its card opens and the empty field takes focus.
    await user.click(screen.getByRole('button', { name: /^Untitled question: This is required/ }))
    expect(within(rowOf(`custom:${id}`)).getByRole('textbox', { name: 'Question (English)' })).toHaveFocus()
    await user.type(within(rowOf(`custom:${id}`)).getByRole('textbox', { name: 'Question (English)' }), 'Hours')
    expect(screen.getByRole('alert')).toHaveTextContent('1 things to fix')
  })

  it('a problem in the Portuguese text switches to Portuguese', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.click(within(typingGroup()).getByRole('radio', { name: 'PT' }))
    await user.click(screen.getByRole('textbox', { name: 'Form title (Português)' }))
    await user.paste('Título {oops}')
    expect(await screen.findByText('This text uses a {token} the original does not have.')).toBeInTheDocument()
    await user.click(within(typingGroup()).getByRole('radio', { name: 'EN' }))
    expect(screen.getByText(/Português: This text uses a/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /^Form header: / }))
    expect(within(typingGroup()).getByRole('radio', { name: 'PT' })).toBeChecked()
    expect(screen.getByRole('textbox', { name: 'Form title (Português)' })).toHaveFocus()
  })
})

describe('Button & message texts', () => {
  it('?tab=messages opens the panel; it edits a text in the language being typed and resets it', async () => {
    const user = userEvent.setup()
    renderEditor('/admin/editor/apply?tab=messages')
    expect(screen.getByRole('button', { name: /Button & message texts/ })).toHaveAttribute('aria-expanded', 'true')
    const box = screen.getByRole('textbox', { name: 'This field is required. (English)' })
    expect(box).toHaveAttribute('placeholder', 'This field is required.')
    await user.click(box)
    await user.paste('Fill in.')
    await user.click(within(typingGroup()).getByRole('radio', { name: 'PT' }))
    await user.click(screen.getByRole('textbox', { name: 'This field is required. (Português)' }))
    await user.paste('Preencha.')
    expect(latest.applyForm.texts['apply.err.required']).toEqual({ en: 'Fill in.', pt: 'Preencha.' })
    await user.click(screen.getByRole('button', { name: 'Reset “This field is required.” to the original' }))
    expect(latest.applyForm.texts['apply.err.required']).toBeUndefined()
  })

  it('is closed by default and opens with a click', async () => {
    const user = userEvent.setup()
    renderEditor()
    const toggle = screen.getByRole('button', { name: /Button & message texts/ })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    await user.click(toggle)
    expect(screen.getByRole('searchbox', { name: 'Search the texts' })).toBeInTheDocument()
  })

  it('a {token} the original does not have is an error, and its problem link focuses the text', async () => {
    const user = userEvent.setup()
    renderEditor('/admin/editor/apply?tab=messages')
    await user.click(screen.getByRole('textbox', { name: /^Step … of … \(English\)$/ }))
    await user.paste('Step {n} of {total} {oops}')
    expect(await screen.findAllByText('This text uses a {token} the original does not have.')).not.toHaveLength(0)
    expect(screen.getByRole('alert')).toHaveTextContent(/to fix/)
    screen.getByRole('searchbox').focus()
    await user.click(screen.getByRole('button', { name: /This text uses a \{token\}/ }))
    expect(screen.getByRole('textbox', { name: /^Step … of … \(English\)$/ })).toHaveFocus()
  })

  it('searches the texts and groups them; the texts that have their own card are not repeated here', async () => {
    const user = userEvent.setup()
    renderEditor('/admin/editor/apply?tab=messages')
    for (const g of ['Page labels', 'Buttons', 'Sending problems', 'Validation errors']) expect(screen.getByRole('heading', { name: g })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Thank-you screen' })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /^Apply as a business/ })).not.toBeInTheDocument()
    await user.type(screen.getByRole('searchbox', { name: 'Search the texts' }), 'Send application')
    expect(screen.getByRole('heading', { name: 'Buttons' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Validation errors' })).not.toBeInTheDocument()
    await user.clear(screen.getByRole('searchbox'))
    await user.type(screen.getByRole('searchbox'), 'zzzzqq')
    expect(screen.getByText('No text matches your search.')).toBeInTheDocument()
  })
})

describe('After sending', () => {
  it('edits the thank-you title in place, keeps the rest behind a toggle, and links to the preview', async () => {
    const user = userEvent.setup()
    renderEditor()
    const card = screen.getByRole('region', { name: 'After sending' })
    expect(within(card).getByRole('link', { name: 'Preview the thank-you screen' })).toHaveAttribute('href', '/admin/editor/preview/apply/done')
    const lead = within(card).getAllByRole('textbox')
    expect(lead).toHaveLength(2)
    await user.type(lead[0]!, 'Thank you')
    expect(latest.applyForm.texts['apply.done.title']).toEqual({ en: 'Thank you' })
    expect(within(card).queryByRole('button', { name: /^Reset/ })).not.toBeInTheDocument()
    await user.click(within(card).getByRole('button', { name: 'More thank-you texts (11)' }))
    expect(within(card).getAllByRole('textbox')).toHaveLength(13)
    expect(within(card).getAllByRole('button', { name: /^Reset .* to the original$/ }).length).toBeGreaterThan(0)
  })
})

describe('live preview', () => {
  it('opens the real form with the draft in a light area, switches EN | PT, and never leaves the editor', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.click(screen.getByRole('button', { name: 'Preview the form' }))
    const dialog = await screen.findByRole('dialog', { name: 'Preview' })
    expect(within(dialog).getByRole('heading', { level: 1, name: 'Apply as a business' })).toBeInTheDocument()
    expect(within(dialog).getByTestId('builder-preview')).toHaveAttribute('data-theme', 'light')
    await user.click(within(dialog).getByRole('radio', { name: 'PT' }))
    expect(within(dialog).getByRole('heading', { level: 1, name: 'Candidatura de empresa' })).toBeInTheDocument()
    expect(within(dialog).getByRole('heading', { level: 2, name: 'A sua empresa' })).toBeInTheDocument()
  })

  it('shows an edit at once: a new title and a hidden question', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.type(screen.getByRole('textbox', { name: 'Title of section 1 (English)' }), 'About you')
    await user.click(screen.getByRole('button', { name: 'Edit Website' }))
    await user.click(screen.getByRole('button', { name: 'Hide Website' }))
    await user.click(screen.getByRole('button', { name: 'Preview the form' }))
    const dialog = await screen.findByRole('dialog', { name: 'Preview' })
    expect(within(dialog).getByRole('heading', { level: 2, name: 'About you' })).toBeInTheDocument()
    expect(within(dialog).queryByLabelText(/^Website/)).not.toBeInTheDocument()
  })
})

describe('in Portuguese', () => {
  it('the builder itself is in Portuguese', async () => {
    const user = userEvent.setup()
    renderEditor('/admin/editor/apply', 'pt')
    expect(screen.getByRole('button', { name: 'Adicionar secção' })).toBeInTheDocument()
    expect(screen.getByText('5 de 8 secções · 0 de 10 perguntas próprias')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mover Website: arraste ou use as teclas de seta' })).toBeInTheDocument()
    expect(screen.getByText('Sempre a última')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Textos de botões e mensagens/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Adicionar pergunta' }))
    expect(await screen.findByRole('menuitem', { name: 'Caixas de seleção' })).toBeInTheDocument()
  })
})
