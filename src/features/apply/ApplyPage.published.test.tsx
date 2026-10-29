import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { type ApplyFormConfig, DEFAULT_APPLY_FORM, emptySiteContent } from '@/domain/siteContent'
import { LanguageProvider } from '@/i18n/LanguageProvider'
import { content, service } from '@/services'
import { fail } from '@/services/catalogService'
import { SiteContentSourceContext } from '@/services/contentHooks'
import ApplyPage from './ApplyPage'

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  await service.resetDemoData()
})

function renderApply(entries: string[], source: 'published' | 'draft' = 'published') {
  const router = createMemoryRouter(
    [
      {
        path: '/apply',
        element: (
          <SiteContentSourceContext.Provider value={source}>
            <ApplyPage />
          </SiteContentSourceContext.Provider>
        ),
      },
    ],
    { initialEntries: entries },
  )
  return render(
    <LanguageProvider>
      <RouterProvider router={router} />
    </LanguageProvider>,
  )
}
const stepHeading = (name: string) => screen.findByRole('heading', { level: 2, name })
const asStaff = () => localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))

/** Saves the draft with this form and, unless told not to, publishes it (demo mode). Leaves the signed-in staff account off. */
async function publishForm(change: (c: ApplyFormConfig) => void, publish = true) {
  asStaff()
  const doc = emptySiteContent()
  doc.applyForm = JSON.parse(JSON.stringify(DEFAULT_APPLY_FORM)) as ApplyFormConfig
  change(doc.applyForm)
  const state = await content.getContentDraft()
  if (!state.ok) throw new Error('draft')
  const saved = await content.saveContentDraft(doc, state.data.draftUpdatedAt)
  if (!saved.ok) throw new Error(`save: ${JSON.stringify(saved.error)}`)
  if (publish) await content.publishContent(saved.data.draftUpdatedAt)
  localStorage.removeItem('arfurn:account')
}

const SAVED = {
  businessName: 'Atelier Norte', website: '', description: 'Handmade oak furniture from Porto.', categoryKey: 'furniture', categoryOther: '',
  country: 'Portugal', city: 'Porto', applicantName: 'Ana Silva', applicantRole: '', applicantEmail: 'ana@example.com', applicantPhone: '',
  language: 'en', productCount: '1-10', photoReadiness: 'all', modelReadiness: 'none', notes: '', consent: true, acceptedTerms: true, custom: {},
  submissionKey: '6f1c1b1e-3c55-4a1c-9d47-0a3c1e2b9f11',
}

describe('ApplyPage with published content', () => {
  it('shows a skeleton on the first read, then the published wording, fields and questions', async () => {
    await publishForm((c) => {
      c.texts['apply.title'] = { en: 'Join the Acme network' }
      c.fields.find((f) => f.key === 'website')!.hidden = true
      c.customQuestions.push({ id: 'q1', type: 'short_text', label: { en: 'How did you hear about us?' } })
      c.fields.push({ key: 'custom:q1', stepId: 'business', required: true })
    })
    renderApply(['/apply'])
    expect(screen.getByRole('status', { name: 'Loading…' })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { level: 1, name: 'Join the Acme network' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Website/)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/^How did you hear about us\?/)).toBeInTheDocument()
  })

  it('the draft is shown to the preview and never to visitors', async () => {
    await publishForm((c) => (c.texts['apply.title'] = { en: 'Only in the draft' }), false)
    const first = renderApply(['/apply'])
    await stepHeading('Your business')
    expect(screen.getByRole('heading', { level: 1, name: 'Apply as a business' })).toBeInTheDocument()
    first.unmount()
    asStaff()
    renderApply(['/apply'], 'draft')
    expect(await screen.findByRole('heading', { level: 1, name: 'Only in the draft' })).toBeInTheDocument()
  })

  it('a failed read shows the built-in form with a notice and a retry', async () => {
    const read = vi.spyOn(content, 'getPublishedApplyForm').mockResolvedValueOnce(fail('UNKNOWN', 'down'))
    const user = userEvent.setup()
    renderApply(['/apply'])
    expect(await screen.findByText('We could not check for a newer version of this form.')).toBeInTheDocument()
    await stepHeading('Your business')
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(screen.queryByText('We could not check for a newer version of this form.')).not.toBeInTheDocument())
    expect(read).toHaveBeenCalledTimes(2)
    read.mockRestore()
  })

  it('sends to the demo service with the published rules: hidden country and city are stored as not given, and approval works', async () => {
    await publishForm((c) => {
      for (const k of ['country', 'city']) c.fields.find((f) => f.key === k)!.hidden = true
    })
    sessionStorage.setItem('sanctus:apply:draft', JSON.stringify({ draft: SAVED, step: 'review' }))
    const user = userEvent.setup()
    renderApply(['/apply?step=review'])
    await user.click(await screen.findByRole('button', { name: 'Send application' }))
    expect(await screen.findByText(/^Reference:/)).toBeInTheDocument()
    asStaff()
    const list = await service.getApplications({})
    if (!list.ok) throw new Error('list')
    const app = list.data.items[0]!
    expect(app).toMatchObject({ businessName: 'Atelier Norte', country: undefined, city: undefined, category: 'furniture' })
    expect(app.answers).toMatchObject({ formVersion: 1, custom: [] })
    const approved = await service.reviewApplication(app.id, 'approve')
    expect(approved.ok).toBe(true)
  })
})
