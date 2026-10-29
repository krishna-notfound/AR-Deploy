import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { APPLY_EDITABLE_KEYS, type SiteContent, emptySiteContent, validateApplyForm } from '@/domain/siteContent'
import { LANG_KEY, LanguageProvider } from '@/i18n/LanguageProvider'
import { en, pt } from '@/i18n/dictionaries/full'
import { APPLY_BUILTIN_KEYS, BUILTIN_FIELDS } from '../../../../supabase/functions/_shared/applyForm.ts'
import { ApplyFormEditor } from './ApplyFormEditor'
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
      <MemoryRouter initialEntries={[entry]}>
        <Harness start={start} />
      </MemoryRouter>
    </LanguageProvider>,
  )
}
const rowOf = (name: string) => screen.getByText(name, { selector: 'span' }).closest('li') as HTMLElement
const orderIn = (stepLabel: RegExp) => {
  const section = screen.getByRole('region', { name: stepLabel })
  return within(section)
    .getAllByRole('listitem')
    .map((li) => li.getAttribute('data-row'))
}

beforeEach(() => localStorage.clear())

describe('the wording the builder offers covers every editable text', () => {
  it('Messages groups plus field panels equal APPLY_EDITABLE_KEYS', () => {
    const options = Object.fromEntries(Object.entries(BUILTIN_FIELDS).filter(([, v]) => v.options).map(([k, v]) => [k, v.options])) as never
    const edited = allEditedTextKeys(APPLY_BUILTIN_KEYS, options)
    expect([...edited].sort()).toEqual([...APPLY_EDITABLE_KEYS].sort())
    for (const k of edited) {
      expect(k in en).toBe(true)
      expect(k in pt).toBe(true)
    }
  })
})

describe('Form tab', () => {
  it('Move up and Move down change the document, keep focus on the moved row and announce the position', async () => {
    const user = userEvent.setup()
    renderEditor()
    expect(orderIn(/^Step 1/).slice(0, 3)).toEqual(['businessName', 'website', 'category'])
    await user.click(screen.getByRole('button', { name: 'Move Website down' }))
    expect(orderIn(/^Step 1/).slice(0, 3)).toEqual(['businessName', 'category', 'website'])
    expect(screen.getByRole('button', { name: 'Move Website down' })).toHaveFocus()
    expect(screen.getByRole('status')).toHaveTextContent('Moved to step 1, position 3')
    await user.click(screen.getByRole('button', { name: 'Move Website up' }))
    expect(orderIn(/^Step 1/).slice(0, 3)).toEqual(['businessName', 'website', 'category'])
    expect(screen.getByRole('button', { name: 'Move Website up' })).toHaveFocus()
    expect(latest.applyForm.fields.map((f) => f.key).slice(0, 3)).toEqual(['businessName', 'website', 'category'])
  })

  it('the first field cannot move up and the last cannot move down', () => {
    renderEditor()
    expect(screen.getByRole('button', { name: 'Move Business name up' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Move About the business down' })).toBeDisabled()
  })

  it('Move to step puts the field last on the other step', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.selectOptions(screen.getByRole('combobox', { name: 'Move Phone to another step' }), 'location')
    expect(orderIn(/^Step 2/)).toEqual(['country', 'city', 'applicantPhone'])
    expect(orderIn(/^Step 3/)).not.toContain('applicantPhone')
    expect(screen.getByRole('status')).toHaveTextContent('Moved to step 2, position 3')
    expect(validateApplyForm(latest.applyForm)).toEqual({})
  })

  it('Review is fixed: no move buttons, locked consent rows, and nothing can be moved onto it', () => {
    renderEditor()
    const review = screen.getByRole('region', { name: /^Step 5/ })
    expect(within(review).queryByRole('button')).not.toBeInTheDocument()
    expect(within(review).getByText('Always last')).toBeInTheDocument()
    expect(within(review).getAllByText('Required')).toHaveLength(2)
    expect(screen.queryByRole('option', { name: /^Step 5/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Move step 4 down' })).toBeDisabled()
  })

  it('adds steps up to eight and then the button is disabled', async () => {
    const user = userEvent.setup()
    renderEditor()
    expect(screen.getByText('5 of 8 steps used')).toBeInTheDocument()
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole('button', { name: 'Add step' }))
    expect(latest.applyForm.steps).toHaveLength(8)
    expect(screen.getByRole('button', { name: 'Add step' })).toBeDisabled()
    expect(screen.getByText('8 of 8 steps used')).toBeInTheDocument()
    // Review stays last.
    expect(latest.applyForm.steps.at(-1)!.builtin).toBe('review')
  })

  it('renames a step in English and Portuguese and the original shows as the guide', async () => {
    const user = userEvent.setup()
    renderEditor()
    const en1 = screen.getByRole('textbox', { name: 'Title of step 1 (English)' })
    expect(en1).toHaveAttribute('placeholder', 'Your business')
    await user.type(en1, 'About you')
    await user.type(screen.getByRole('textbox', { name: 'Title of step 1 (Português)' }), 'Sobre si')
    expect(latest.applyForm.steps[0]!.title).toEqual({ en: 'About you', pt: 'Sobre si' })
  })

  it('adds a question on step 2, opens its panel, and stops at ten', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.selectOptions(within(screen.getByRole('region', { name: /^Step 2/ })).getByRole('combobox', { name: 'Type of the new question' }), 'multi_choice')
    await user.click(screen.getByRole('button', { name: 'Add question to step 2' }))
    const dialog = await screen.findByRole('dialog')
    expect(latest.applyForm.customQuestions).toHaveLength(1)
    expect(orderIn(/^Step 2/).at(-1)).toBe(`custom:${latest.applyForm.customQuestions[0]!.id}`)
    expect(latest.applyForm.customQuestions[0]!.type).toBe('multi_choice')
    await user.clear(within(dialog).getByRole('textbox', { name: 'Label (English)' }))
    await user.type(within(dialog).getByRole('textbox', { name: 'Label (English)' }), 'Materials')
    await user.type(within(dialog).getByRole('textbox', { name: 'Option 1 (English)' }), 'Wood')
    await user.type(within(dialog).getByRole('textbox', { name: 'Option 2 (English)' }), 'Metal')
    await user.click(within(dialog).getByRole('switch', { name: 'Required' }))
    expect(latest.applyForm.customQuestions[0]).toMatchObject({ label: { en: 'Materials' }, options: [{ label: { en: 'Wood' } }, { label: { en: 'Metal' } }] })
    expect(latest.applyForm.fields.find((f) => f.key.startsWith('custom:'))!.required).toBe(true)
    await user.keyboard('{Escape}')
    for (let i = 1; i < 10; i++) {
      await user.click(screen.getByRole('button', { name: 'Add question to step 2' }))
      await user.keyboard('{Escape}')
    }
    expect(screen.getByRole('button', { name: 'Add question to step 2' })).toBeDisabled()
    expect(screen.getAllByText('10 of 10 questions used').length).toBeGreaterThan(0)
  })

  it('locked fields show the lock and the reason, and their panel has disabled switches', async () => {
    const user = userEvent.setup()
    renderEditor()
    const row = rowOf('Business name')
    expect(within(row).getByRole('img', { name: 'Locked' })).toBeInTheDocument()
    expect(within(row).getByText('Approval creates the company account from this field.')).toBeInTheDocument()
    await user.click(within(row).getByRole('button', { name: 'Edit Business name' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('switch', { name: 'Required' })).toBeDisabled()
    expect(within(dialog).getByRole('switch', { name: 'Required' })).toBeChecked()
    expect(within(dialog).getByRole('switch', { name: 'Hidden' })).toBeDisabled()
    expect(within(dialog).getByText('Approval creates the company account from this field.')).toBeInTheDocument()
  })

  it('hides and shows an ordinary field; a hidden row stays in its step with a Show button', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.click(within(rowOf('Website')).getByRole('button', { name: 'Edit Website' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('switch', { name: 'Hidden' }))
    await user.keyboard('{Escape}')
    expect(latest.applyForm.fields.find((f) => f.key === 'website')!.hidden).toBe(true)
    expect(orderIn(/^Step 1/)).toContain('website')
    await user.click(screen.getByRole('button', { name: 'Show Website' }))
    expect(latest.applyForm.fields.find((f) => f.key === 'website')!.hidden).toBeUndefined()
  })

  it('options can be hidden but the last visible one cannot', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.click(screen.getByRole('button', { name: 'Edit How many products would you show?' }))
    const dialog = await screen.findByRole('dialog')
    for (const name of ['1 to 10', '11 to 50', '51 to 200']) await user.click(within(dialog).getByRole('switch', { name: `Show “${name}”` }))
    expect(latest.applyForm.hiddenOptions.productCount).toEqual(['1-10', '11-50', '51-200'])
    const last = within(dialog).getByRole('switch', { name: 'Show “More than 200”' })
    expect(last).toBeDisabled()
    expect(within(dialog).getByText('At least one option must stay visible.')).toBeInTheDocument()
    expect(validateApplyForm(latest.applyForm)).toEqual({})
  })

  it('the required switch of an optional field works and the language field has none', async () => {
    const user = userEvent.setup()
    renderEditor()
    await user.click(screen.getByRole('button', { name: 'Edit Website' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('switch', { name: 'Required' }))
    expect(latest.applyForm.fields.find((f) => f.key === 'website')!.required).toBe(true)
    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: /^Edit Language|^Edit Preferred language|^Edit Which language/ }))
    expect(within(await screen.findByRole('dialog')).queryByRole('switch', { name: 'Required' })).not.toBeInTheDocument()
  })
})

describe('Messages tab', () => {
  it('edits a text in English and Portuguese, shows the original as the guide, and resets it', async () => {
    const user = userEvent.setup()
    renderEditor('/admin/editor/apply?tab=messages')
    const box = screen.getByRole('textbox', { name: 'This field is required. (English)' })
    expect(box).toHaveAttribute('placeholder', 'This field is required.')
    await user.type(box, 'Please fill this in.')
    await user.type(screen.getByRole('textbox', { name: 'This field is required. (Português)' }), 'Preencha este campo.')
    expect(latest.applyForm.texts['apply.err.required']).toEqual({ en: 'Please fill this in.', pt: 'Preencha este campo.' })
    await user.click(screen.getByRole('button', { name: 'Reset “This field is required.” to the original' }))
    expect(latest.applyForm.texts['apply.err.required']).toBeUndefined()
  })

  it('a {token} the original does not have is an error; a missing {ref} too', async () => {
    const user = userEvent.setup()
    renderEditor('/admin/editor/apply?tab=messages')
    const step = screen.getByRole('textbox', { name: /^Step … of … \(English\)$/ })
    await user.click(step)
    await user.paste('Step {n} of {total} {oops}')
    expect(await screen.findByText('This text uses a {token} the original does not have.')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/to fix/)
  })

  it('searches the messages and groups them', async () => {
    const user = userEvent.setup()
    renderEditor('/admin/editor/apply?tab=messages')
    for (const g of ['Page', 'Buttons', 'Sending problems', 'Validation errors', 'Consent', 'Thank-you screen']) expect(screen.getByRole('heading', { name: g })).toBeInTheDocument()
    await user.type(screen.getByRole('searchbox', { name: 'Search the messages' }), 'copied')
    expect(screen.getByRole('heading', { name: 'Thank-you screen' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Buttons' })).not.toBeInTheDocument()
    await user.clear(screen.getByRole('searchbox'))
    await user.type(screen.getByRole('searchbox'), 'zzzzqq')
    expect(screen.getByText('No message matches your search.')).toBeInTheDocument()
  })

  it('links the thank-you group to its preview', () => {
    renderEditor('/admin/editor/apply?tab=messages')
    expect(screen.getByRole('link', { name: 'Preview the thank-you screen' })).toHaveAttribute('href', '/admin/editor/preview/apply/done')
  })
})

describe('live preview', () => {
  it('shows the real form with the draft, switches EN | PT, and never leaves the editor', async () => {
    const user = userEvent.setup()
    renderEditor()
    const preview = screen.getByRole('complementary', { name: 'Preview' })
    expect(within(preview).getByRole('heading', { level: 1, name: 'Apply as a business' })).toBeInTheDocument()
    await user.click(within(preview).getByRole('radio', { name: 'PT' }))
    expect(within(preview).getByRole('heading', { level: 1, name: 'Candidatura de empresa' })).toBeInTheDocument()
    expect(within(preview).getByRole('heading', { level: 2, name: 'A sua empresa' })).toBeInTheDocument()
  })

  it('shows an edit at once: a new title and a hidden field', async () => {
    const user = userEvent.setup()
    renderEditor()
    const preview = screen.getByRole('complementary', { name: 'Preview' })
    await user.type(screen.getByRole('textbox', { name: 'Title of step 1 (English)' }), 'About you')
    expect(within(preview).getByRole('heading', { level: 2, name: 'About you' })).toBeInTheDocument()
    await user.click(within(rowOf('Website')).getByRole('button', { name: 'Edit Website' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('switch', { name: 'Hidden' }))
    expect(within(preview).queryByLabelText(/^Website/)).not.toBeInTheDocument()
  })
})

describe('in Portuguese', () => {
  it('the builder itself is in Portuguese', async () => {
    renderEditor('/admin/editor/apply', 'pt')
    expect(screen.getByRole('button', { name: 'Adicionar passo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mover Website para baixo' })).toBeInTheDocument()
    expect(screen.getByText('5 de 8 passos usados')).toBeInTheDocument()
    expect(screen.getByText('Sempre o último')).toBeInTheDocument()
  })
})
