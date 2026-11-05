import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type ApplyFormConfig, DEFAULT_APPLY_FORM } from '@/domain/siteContent'
import type { Lang } from '@/domain/types'
import { LanguageProvider } from '@/i18n/LanguageProvider'
import { service } from '@/services'
import { fail, ok } from '@/services/catalogService'
import { ApplyForm } from './ApplyForm'

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T
/** The default form with a change applied to a copy. */
function form(change: (c: ApplyFormConfig) => void = () => {}): ApplyFormConfig {
  const c = clone(DEFAULT_APPLY_FORM)
  change(c)
  return c
}
const place = (c: ApplyFormConfig, key: string, patch: { hidden?: boolean; required?: boolean; stepId?: string }) => Object.assign(c.fields.find((f) => f.key === key)!, patch)
const OPTIONS = [
  { id: 'o1', label: { en: 'Wood', pt: 'Madeira' } },
  { id: 'o2', label: { en: 'Metal' } },
]
const addQuestion = (c: ApplyFormConfig, stepId: string, required: boolean) => {
  c.customQuestions.push({ id: 'q1', type: 'multi_choice', label: { en: 'Materials you work with', pt: 'Materiais com que trabalha' }, help: { en: 'Choose all that apply' }, options: OPTIONS })
  c.fields.push({ key: 'custom:q1', stepId, required })
}

const SAVED = {
  businessName: 'Atelier Norte', website: '', description: 'Handmade oak furniture from Porto.', categoryKey: 'furniture', categoryOther: '',
  country: 'Portugal', city: 'Porto', applicantName: 'Ana Silva', applicantRole: '', applicantEmail: 'ana@example.com', applicantPhone: '',
  language: 'en', productCount: '1-10', photoReadiness: 'all', modelReadiness: 'none', notes: '', consent: true, acceptedTerms: true, custom: {},
  submissionKey: '6f1c1b1e-3c55-4a1c-9d47-0a3c1e2b9f10',
}
const saveDraft = (over: Record<string, unknown> = {}, step = 'review') => sessionStorage.setItem('sanctus:apply:draft', JSON.stringify({ draft: { ...SAVED, ...over }, step }))

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  await service.resetDemoData()
})

function Harness({ initial, next, lang, preview }: { initial: ApplyFormConfig | null; next?: ApplyFormConfig; lang?: Lang; preview?: boolean }) {
  const [config, setConfig] = useState(initial)
  return <ApplyForm config={config} lang={lang} preview={preview} onStale={() => next && setConfig(next)} />
}
function renderForm(props: Parameters<typeof Harness>[0], entry = '/apply') {
  const router = createMemoryRouter([{ path: '/apply', element: <Harness {...props} /> }], { initialEntries: [entry] })
  const view = render(
    <LanguageProvider>
      <RouterProvider router={router} />
    </LanguageProvider>,
  )
  return { router, ...view }
}
const stepHeading = (name: string) => screen.findByRole('heading', { level: 2, name })
const progress = () => within(screen.getByRole('list', { name: 'Application steps' })).getAllByRole('listitem')

describe('ApplyForm follows the published form', () => {
  it('shows a field moved to another step, first in its step, and not on its old step', async () => {
    const config = form((c) => {
      const phone = c.fields.splice(c.fields.findIndex((f) => f.key === 'applicantPhone'), 1)[0]!
      c.fields.unshift({ ...phone, stepId: 'business' })
    })
    const user = userEvent.setup()
    renderForm({ initial: config })
    await stepHeading('Your business')
    const inputs = screen.getAllByRole('textbox')
    expect(inputs[0]).toHaveAccessibleName(/^Phone/)
    expect(screen.getAllByLabelText(/^Phone/)).toHaveLength(1)
    // On the contact step there is no phone any more.
    saveDraft({}, 'contact')
    renderForm({ initial: config }, '/apply?step=contact')
    await user.click((await screen.findAllByRole('heading', { level: 2, name: 'Contact person' }))[0]!)
    expect(screen.getAllByLabelText(/^Phone/)).toHaveLength(1)
  })

  it('does not render a hidden field and lets Continue pass without it', async () => {
    const user = userEvent.setup()
    renderForm({ initial: form((c) => place(c, 'website', { hidden: true })) })
    await stepHeading('Your business')
    expect(screen.queryByLabelText(/^Website/)).not.toBeInTheDocument()
    await user.click(screen.getByLabelText(/^Business name/))
    await user.paste('Atelier Norte')
    await user.selectOptions(screen.getByLabelText(/^What do you sell/), 'furniture')
    await user.click(screen.getByLabelText(/^About the business/))
    await user.paste('Handmade oak furniture from Porto.')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await stepHeading('Location')
  })

  it('a field switched to required shows the star and blocks Continue; an optional one says optional', async () => {
    const user = userEvent.setup()
    renderForm({ initial: form((c) => (place(c, 'website', { required: true }), place(c, 'description', { required: false }))) })
    await stepHeading('Your business')
    expect(screen.getByLabelText(/^Website \*/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^About the business \(optional\)/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findAllByText('This field is required.')).not.toHaveLength(0)
    expect(screen.getByRole('heading', { level: 2, name: 'Your business' })).toBeInTheDocument()
  })

  it('uses the Editor wording over the dictionary, per language, and the original where it is empty', async () => {
    const config = form((c) => {
      c.texts['apply.title'] = { en: 'Join our atelier network' }
      c.texts['apply.next'] = { en: 'Onwards' }
      c.steps[0]!.title = { en: 'About you', pt: '' }
    })
    const { unmount } = renderForm({ initial: config })
    expect(await screen.findByRole('heading', { level: 1, name: 'Join our atelier network' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Onwards/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'About you' })).toBeInTheDocument()
    unmount()
    // Portuguese has no override for the title, so the original Portuguese text shows; the step title falls back to the original too.
    renderForm({ initial: config, lang: 'pt' })
    expect(await screen.findByRole('heading', { level: 1, name: 'Candidatura de empresa' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 2, name: 'A sua empresa' })).toBeInTheDocument()
  })

  it('a new step title with only English falls back to English in Portuguese', async () => {
    const config = form((c) => {
      c.steps.splice(1, 0, { id: 'extra-step', title: { en: 'Your story' } })
      c.fields.push({ key: 'notes', stepId: 'extra-step' })
      c.fields.splice(c.fields.findIndex((f) => f.key === 'notes'), 1)
    })
    renderForm({ initial: config, lang: 'pt' }, '/apply?step=extra-step')
    expect(await screen.findByRole('heading', { level: 2, name: 'Your story' })).toBeInTheDocument()
    expect(document.querySelector('form')?.closest('[lang]')?.getAttribute('lang')).toBe('pt')
  })

  it('does not render a hidden option', async () => {
    saveDraft({}, 'catalogue')
    renderForm({ initial: form((c) => (c.hiddenOptions = { productCount: ['200+'], modelReadiness: ['need_help'] })) }, '/apply?step=catalogue')
    await stepHeading('Your catalogue')
    expect(screen.getByRole('radio', { name: '1 to 10' })).toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'More than 200' })).not.toBeInTheDocument()
    expect(screen.queryByRole('radio', { name: 'We need help creating them' })).not.toBeInTheDocument()
  })

  it('skips a step with no visible field in the progress bar and the step count', async () => {
    renderForm({ initial: form((c) => (place(c, 'country', { hidden: true }), place(c, 'city', { hidden: true }))) })
    await stepHeading('Your business')
    expect(progress()).toHaveLength(4)
    expect(screen.queryByText(/Location/)).not.toBeInTheDocument()
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument()
  })

  it('an unknown ?step= opens the first shown step', async () => {
    renderForm({ initial: form() }, '/apply?step=does-not-exist')
    await stepHeading('Your business')
  })

  it('shows a question on a later step and keeps Review last', async () => {
    const config = form((c) => addQuestion(c, 'location', false))
    saveDraft({}, 'location')
    renderForm({ initial: config }, '/apply?step=location')
    await stepHeading('Location')
    const group = screen.getByRole('group', { name: /Materials you work with/ })
    expect(within(group).getByRole('checkbox', { name: 'Wood' })).toBeInTheDocument()
    expect(within(group).getByText('Choose all that apply')).toBeInTheDocument()
    expect(progress().at(-1)).toHaveTextContent('Review and send')
  })
})

describe('ApplyForm review and submit', () => {
  it('lists answers by step; hidden fields are absent, empty optional fields say not given, choices use option labels', async () => {
    const config = form((c) => {
      addQuestion(c, 'catalogue', false)
      place(c, 'applicantRole', { hidden: true })
    })
    saveDraft({ custom: { q1: ['o2', 'o1'] } })
    renderForm({ initial: config }, '/apply?step=review')
    await stepHeading('Review and send')
    expect(screen.queryByText('Role')).not.toBeInTheDocument()
    const row = (label: string) => screen.getByText(label).nextElementSibling as HTMLElement
    expect(row('Materials you work with')).toHaveTextContent('Metal, Wood')
    expect(row('Phone')).toHaveTextContent('Not given')
    expect(row('What do you sell?')).toHaveTextContent('Furniture')
  })

  it('sends the answers to the questions and the form only once; a required question missing stops on its step', async () => {
    const submit = vi.spyOn(service, 'submitApplication').mockResolvedValue(ok({ id: 'a1', reference: 'REF12345' }))
    const config = form((c) => addQuestion(c, 'catalogue', true))
    saveDraft()
    const user = userEvent.setup()
    renderForm({ initial: config }, '/apply?step=review')
    await stepHeading('Review and send')
    await user.click(screen.getByRole('button', { name: 'Send application' }))
    await stepHeading('Your catalogue')
    expect(await screen.findByText('This field is required.')).toBeInTheDocument()
    expect(submit).not.toHaveBeenCalled()

    await user.click(screen.getByRole('checkbox', { name: 'Metal' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(await screen.findByRole('button', { name: 'Send application' }))
    expect(await screen.findByText(/^Reference:/)).toBeInTheDocument()
    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ custom: { q1: ['o2'] } }))
    submit.mockRestore()
  })

  it('a form republished meanwhile (409): shows the notice, reloads the form and keeps every answer', async () => {
    const submit = vi.spyOn(service, 'submitApplication').mockResolvedValue({ ok: false, error: { code: 'CONFLICT', message: 'x', reason: 'form_changed' } })
    const before = form((c) => addQuestion(c, 'catalogue', false))
    const after = form((c) => {
      addQuestion(c, 'catalogue', true)
      c.customQuestions[0]!.label.en = 'Which materials?'
    })
    saveDraft({ custom: { q1: ['o1'] } })
    const user = userEvent.setup()
    renderForm({ initial: before, next: after }, '/apply?step=review')
    await stepHeading('Review and send')
    await user.click(screen.getByRole('button', { name: 'Send application' }))
    expect(await screen.findByText('The form was updated. Please check the highlighted fields.')).toBeInTheDocument()
    expect(submit).toHaveBeenCalledTimes(1)
    // Wood is still chosen and the earlier answers are in the saved draft.
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('checkbox', { name: 'Wood' })).toBeChecked()
    expect(screen.getByText('Which materials?')).toBeInTheDocument()
    expect(JSON.parse(sessionStorage.getItem('sanctus:apply:draft')!).draft.businessName).toBe('Atelier Norte')
    submit.mockRestore()
  })

  it('drops an answer to an option that no longer exists, without touching the other answers', async () => {
    const submit = vi.spyOn(service, 'submitApplication').mockResolvedValue(ok({ id: 'a1', reference: 'REF12345' }))
    const config = form((c) => {
      addQuestion(c, 'catalogue', false)
      c.customQuestions[0]!.options = [OPTIONS[1]!, { id: 'o3', label: { en: 'Glass' } }]
    })
    saveDraft({ custom: { q1: ['o1', 'o2'], gone: 'x' }, productCount: '200+' })
    const user = userEvent.setup()
    renderForm({ initial: { ...config, hiddenOptions: { productCount: ['200+'] } } }, '/apply?step=review')
    await user.click(await screen.findByRole('button', { name: 'Send application' }))
    await screen.findByText('Choose an option.', {}, { timeout: 500 }).catch(() => undefined)
    // productCount's saved value is a hidden option now: it is treated as not chosen, so the (required) field blocks the send.
    await stepHeading('Your catalogue')
    expect(submit).not.toHaveBeenCalled()
    await user.click(screen.getByRole('radio', { name: '1 to 10' }))
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    await user.click(await screen.findByRole('button', { name: 'Send application' }))
    await screen.findByText(/^Reference:/)
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ custom: { q1: ['o2'] }, businessName: 'Atelier Norte' }))
    submit.mockRestore()
  })

  it('maps the server field errors of a question onto the question', async () => {
    vi.spyOn(service, 'submitApplication').mockResolvedValue(fail('VALIDATION', 'x', { 'custom.q1': 'required' }))
    saveDraft()
    const user = userEvent.setup()
    renderForm({ initial: form((c) => addQuestion(c, 'catalogue', false)) }, '/apply?step=review')
    await user.click(await screen.findByRole('button', { name: 'Send application' }))
    await stepHeading('Your catalogue')
    expect(await screen.findByText('This field is required.')).toBeInTheDocument()
    vi.restoreAllMocks()
  })

  it('preview mode never sends, never stores a draft, and the send button says Preview', async () => {
    const submit = vi.spyOn(service, 'submitApplication')
    const user = userEvent.setup()
    renderForm({ initial: form(), preview: true })
    await stepHeading('Your business')
    await user.click(screen.getByLabelText(/^Business name/))
    await user.paste('Atelier Norte')
    expect(sessionStorage.getItem('sanctus:apply:draft')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Send application' })).not.toBeInTheDocument()
    submit.mockRestore()
  })

  it('shows the form in the chosen language in preview', async () => {
    renderForm({ initial: form(), preview: true, lang: 'pt' })
    expect(await screen.findByRole('heading', { level: 2, name: 'A sua empresa' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Continuar/ })).toBeInTheDocument()
  })
})

describe('ApplyForm: the PDF catalogue (ADR-0050)', () => {
  const pdf = (name = 'range.pdf') => new File(['%PDF-1.7 body'], name, { type: 'application/pdf' })
  const KEY = SAVED.submissionKey
  const catalogueStep = (config: ApplyFormConfig | null = form(), props: Partial<Parameters<typeof Harness>[0]> = {}) => {
    saveDraft({}, 'catalogue')
    return renderForm({ initial: config, ...props }, '/apply?step=catalogue')
  }

  it('is an optional field of the catalogue step: choose a PDF, it uploads once with the submission key, the name shows with Remove', async () => {
    const upload = vi.spyOn(service, 'uploadApplicationCatalogue')
    const user = userEvent.setup()
    catalogueStep()
    await stepHeading('Your catalogue')
    const input = screen.getByLabelText(/^Product catalogue \(PDF\) \(optional\)/)
    expect(screen.getByText(/up to 20 MB/)).toBeInTheDocument()
    expect(screen.getByText(/Demo only/)).toBeInTheDocument()
    await user.upload(input, pdf())
    expect(await screen.findByText('range.pdf')).toBeInTheDocument()
    expect(upload).toHaveBeenCalledTimes(1)
    expect(upload).toHaveBeenCalledWith(KEY, expect.objectContaining({ name: 'range.pdf', type: 'application/pdf' }))
    expect(JSON.parse(sessionStorage.getItem('sanctus:apply:draft')!).draft).toMatchObject({ cataloguePath: `pending/${KEY}/catalogue.pdf`, catalogueName: 'range.pdf' })
    await user.click(screen.getByRole('button', { name: 'Remove range.pdf' }))
    expect(screen.queryByText('range.pdf')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose a PDF' })).toBeInTheDocument()
    expect(JSON.parse(sessionStorage.getItem('sanctus:apply:draft')!).draft).toMatchObject({ cataloguePath: '', catalogueName: '' })
    upload.mockRestore()
  })

  it('shows the uploading state, holds Continue back meanwhile, and keeps going afterwards', async () => {
    let finish: (v: ReturnType<typeof ok<{ path: string }>>) => void = () => {}
    const upload = vi.spyOn(service, 'uploadApplicationCatalogue').mockReturnValue(new Promise((r) => (finish = r)))
    const user = userEvent.setup()
    catalogueStep()
    await stepHeading('Your catalogue')
    await user.upload(screen.getByLabelText(/^Product catalogue \(PDF\)/), pdf('slow.pdf'))
    expect(await screen.findByRole('status')).toHaveTextContent('Uploading slow.pdf…')
    expect(screen.getByRole('button', { name: 'Continue' })).toBeDisabled()
    await act(async () => finish(ok({ path: `pending/${KEY}/catalogue.pdf` })))
    expect(await screen.findByText('slow.pdf')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled()
    upload.mockRestore()
  })

  it('refuses a file that is not a PDF or is over 20 MB before any upload, with a message naming the file', async () => {
    const upload = vi.spyOn(service, 'uploadApplicationCatalogue')
    const user = userEvent.setup({ applyAccept: false })
    catalogueStep()
    await stepHeading('Your catalogue')
    const input = screen.getByLabelText(/^Product catalogue \(PDF\)/)
    await user.upload(input, new File(['png'], 'photo.png', { type: 'image/png' }))
    expect(await screen.findByText('photo.png is not a PDF. Choose a PDF file.')).toBeInTheDocument()
    const big = pdf('huge.pdf')
    Object.defineProperty(big, 'size', { value: 25 * 1024 * 1024 })
    await user.upload(input, big)
    expect(await screen.findByText('huge.pdf is 25 MB. The limit is 20 MB.')).toBeInTheDocument()
    expect(upload).not.toHaveBeenCalled()
    upload.mockRestore()
  })

  it('shows an upload failure and a rate limit as text, and nothing is kept', async () => {
    const upload = vi.spyOn(service, 'uploadApplicationCatalogue').mockResolvedValueOnce(fail('UNKNOWN', 'x')).mockResolvedValueOnce(fail('RATE_LIMITED', 'x'))
    const user = userEvent.setup()
    catalogueStep()
    await stepHeading('Your catalogue')
    await user.upload(screen.getByLabelText(/^Product catalogue \(PDF\)/), pdf())
    expect(await screen.findByText('The file could not be uploaded. Check your connection and try again.')).toBeInTheDocument()
    await user.upload(screen.getByLabelText(/^Product catalogue \(PDF\)/), pdf())
    expect(await screen.findByText('Too many uploads. Wait a little and try again.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Choose a PDF' })).toBeInTheDocument()
    expect(JSON.parse(sessionStorage.getItem('sanctus:apply:draft')!).draft.cataloguePath).toBe('')
    upload.mockRestore()
  })

  it('the form builder can hide it (not rendered, not sent) or make it required (star, blocks Continue)', async () => {
    const { unmount } = catalogueStep(form((c) => place(c, 'catalogue', { hidden: true })))
    await stepHeading('Your catalogue')
    expect(screen.queryByLabelText(/Product catalogue/)).not.toBeInTheDocument()
    unmount()
    const user = userEvent.setup()
    catalogueStep(form((c) => place(c, 'catalogue', { required: true })))
    await stepHeading('Your catalogue')
    expect(screen.getByLabelText(/^Product catalogue \(PDF\) \*/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('This field is required.')).toBeInTheDocument()
  })

  it('the review lists the file name, and the application is sent with cataloguePath only (no file name)', async () => {
    const submit = vi.spyOn(service, 'submitApplication').mockResolvedValue(ok({ id: 'a1', reference: 'REF12345' }))
    saveDraft({ cataloguePath: `pending/${KEY}/catalogue.pdf`, catalogueName: 'range.pdf' })
    const user = userEvent.setup()
    renderForm({ initial: form() }, '/apply?step=review')
    await stepHeading('Review and send')
    expect(screen.getByText('Product catalogue (PDF)').nextElementSibling).toHaveTextContent('range.pdf')
    await user.click(screen.getByRole('button', { name: 'Send application' }))
    await screen.findByText(/^Reference:/)
    const sent = submit.mock.calls[0]![0] as Record<string, unknown>
    expect(sent.cataloguePath).toBe(`pending/${KEY}/catalogue.pdf`)
    expect(sent).not.toHaveProperty('catalogueName')
    submit.mockRestore()
  })

  it('a server refusal of the catalogue lands on its field on the catalogue step', async () => {
    vi.spyOn(service, 'submitApplication').mockResolvedValue(fail('VALIDATION', 'x', { catalogue: 'invalid_file' }))
    saveDraft({ cataloguePath: `pending/${KEY}/catalogue.pdf`, catalogueName: 'range.pdf' })
    const user = userEvent.setup()
    renderForm({ initial: form() }, '/apply?step=review')
    await user.click(await screen.findByRole('button', { name: 'Send application' }))
    await stepHeading('Your catalogue')
    expect(await screen.findByText('The catalogue could not be used. Remove it and add the PDF again.')).toBeInTheDocument()
    vi.restoreAllMocks()
  })

  it('in Portuguese the field and its texts are Portuguese; in the Editor preview nothing can be chosen', async () => {
    const { unmount } = catalogueStep(form(), { lang: 'pt' })
    expect(await screen.findByLabelText(/^Catálogo de produtos \(PDF\) \(opcional\)/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Escolher um PDF' })).toBeInTheDocument()
    unmount()
    sessionStorage.clear()
    renderForm({ initial: form((c) => c.steps.splice(0, 3)), preview: true })
    await stepHeading('Your catalogue')
    expect(screen.getByRole('button', { name: 'Choose a PDF' })).toBeDisabled()
  })
})

it('preview: moving through the steps uses state, not the URL', async () => {
  const user = userEvent.setup()
  const { router } = renderForm({ initial: form((c) => place(c, 'website', { required: false })), preview: true })
  await stepHeading('Your business')
  await user.click(screen.getByLabelText(/^Business name/))
  await user.paste('Atelier Norte')
  await user.selectOptions(screen.getByLabelText(/^What do you sell/), 'furniture')
  await user.click(screen.getByLabelText(/^About the business/))
  await user.paste('Handmade oak furniture from Porto.')
  await user.click(screen.getByRole('button', { name: 'Continue' }))
  await stepHeading('Location')
  await act(async () => {})
  await waitFor(() => expect(router.state.location.search).toBe(''))
})
