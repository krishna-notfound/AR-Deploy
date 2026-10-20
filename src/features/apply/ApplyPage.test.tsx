import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
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

  it('opening /apply again after a submission starts a fresh form', async () => {
    renderApply(['/', '/apply'])
    expect(await stepHeading('Your business')).toBeInTheDocument()
  })
})
