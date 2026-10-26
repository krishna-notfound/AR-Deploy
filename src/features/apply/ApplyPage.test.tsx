import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageProvider } from '@/i18n/LanguageProvider'
import { service } from '@/services'
import ApplyPage from './ApplyPage'

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  await service.resetDemoData()
})

function renderApply(initialEntries: (string | { pathname: string; state?: unknown })[] = ['/', '/apply']) {
  const router = createMemoryRouter(
    [
      { path: '/', element: <p>home page</p> },
      { path: '/apply', element: <ApplyPage /> },
    ],
    { initialEntries, initialIndex: initialEntries.length - 1 },
  )
  const view = render(
    <LanguageProvider>
      <RouterProvider router={router} />
    </LanguageProvider>,
  )
  return { router, ...view }
}

const stepHeading = (name: string) => screen.findByRole('heading', { level: 2, name })

async function completeBusinessStep(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByLabelText(/^Business name/))
  await user.paste('Atelier Norte')
  await user.selectOptions(screen.getByLabelText(/^What do you sell/), 'furniture')
  await user.click(screen.getByLabelText(/^About the business/))
  await user.paste('Handmade oak furniture from Porto.')
  await user.click(screen.getByRole('button', { name: 'Continue' }))
}

describe('ApplyPage', () => {
  // Regression (UX-17): browser Back left the wizard instead of going to the previous step.
  it('browser Back goes to the previous step with the answers kept, then leaves the page from step 1', async () => {
    const user = userEvent.setup()
    const { router } = renderApply()
    await completeBusinessStep(user)
    await stepHeading('Location')
    expect(router.state.location.search).toBe('?step=location')

    await act(() => router.navigate(-1))
    await stepHeading('Your business')
    expect(screen.getByLabelText(/^Business name/)).toHaveValue('Atelier Norte')

    await act(() => router.navigate(1))
    await stepHeading('Location')

    await act(() => router.navigate(-2))
    expect(await screen.findByText('home page')).toBeInTheDocument()
  })

  it('a reload resumes the saved step from the session draft', async () => {
    const user = userEvent.setup()
    const first = renderApply()
    await completeBusinessStep(user)
    await stepHeading('Location')
    first.unmount()

    // Reload of /apply?step=location, and a fresh visit to /apply in the same tab, both resume at Location.
    renderApply(['/apply?step=location']).unmount()
    const { router } = renderApply(['/apply'])
    await stepHeading('Location')
    expect(router.state.location.search).toBe('?step=location')
  })

  // UX-18: the confirmation explains the next steps, labels demo mode, and survives a reload (the history entry keeps it).
  it('keeps the confirmation and reference after a reload, with next steps and the demo label', async () => {
    renderApply([{ pathname: '/apply', state: { applyDone: { reference: 'AYITWHAO', email: 'ana@example.com' } } }])
    expect(await screen.findByText('Reference: AYITWHAO')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'What happens next' })).toBeInTheDocument()
    expect(screen.getByText(/ana@example\.com/)).toBeInTheDocument()
    expect(screen.getByText(/no email is sent/)).toBeInTheDocument()

    await userEvent.setup().click(screen.getByRole('button', { name: 'Start another application' }))
    await stepHeading('Your business')
  })

  // S2 legal: the final step requires "I agree to the Terms and the Privacy Policy" (the function refuses it too).
  it('does not send the application until the Terms tick is set, and links both documents in a new tab', async () => {
    const draft = {
      businessName: 'Atelier Norte', website: '', description: 'Handmade oak furniture from Porto.', categoryKey: 'furniture', categoryOther: '',
      country: 'Portugal', city: 'Porto', applicantName: 'Ana Silva', applicantRole: '', applicantEmail: 'ana@example.com', applicantPhone: '',
      language: 'en', productCount: '1-10', photoReadiness: 'all', modelReadiness: 'none', notes: '', consent: true, acceptedTerms: false,
      submissionKey: '6f1c1b1e-3c55-4a1c-9d47-0a3c1e2b9f10',
    }
    sessionStorage.setItem('sanctus:apply:draft', JSON.stringify({ draft, step: 'review' }))
    const submit = vi.spyOn(service, 'submitApplication')
    const user = userEvent.setup()
    renderApply(['/apply?step=review'])
    await stepHeading('Review and send')
    expect(screen.getByRole('link', { name: 'Terms (opens in a new tab)' })).toHaveAttribute('target', '_blank')
    expect(screen.getByRole('link', { name: 'Privacy Policy (opens in a new tab)' })).toHaveAttribute('href', '/privacy')

    await user.click(screen.getByRole('button', { name: 'Send application' }))
    expect(await screen.findByText('Please agree to the Terms and the Privacy Policy to send your application.')).toBeInTheDocument()
    expect(submit).not.toHaveBeenCalled()

    await user.click(screen.getByRole('checkbox', { name: /^I agree to the Terms/ }))
    await user.click(screen.getByRole('button', { name: 'Send application' }))
    expect(await screen.findByText(/^Reference:/)).toBeInTheDocument()
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ acceptedTerms: true }))
    submit.mockRestore()
  })

  it('opening /apply again after a submission starts a fresh form', async () => {
    renderApply(['/', '/apply'])
    expect(await stepHeading('Your business')).toBeInTheDocument()
  })
})

it('the apply page footer links the Privacy Policy and the Terms', async () => {
  renderApply(['/apply'])
  await stepHeading('Your business')
  const legal = screen.getByRole('navigation', { name: 'Legal' })
  expect(within(legal).getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy')
  expect(within(legal).getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms')
})
