// The page behind an email's Unsubscribe link (ADR-0078): opening it changes nothing, the button does, and a link that cannot work
// says so in plain words with the way to the email preferences. Uses the demo notification service (an in-memory harness).
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { LANG_KEY, LanguageProvider } from '@/i18n/LanguageProvider'
import { notifications } from '@/services'
import { demoUnsubscribeToken, resetMockNotifications } from '@/services/mock/mockNotifications'
import EmailUnsubscribePage from './EmailUnsubscribePage'

function renderPage(search: string, lang?: 'pt') {
  if (lang) localStorage.setItem(LANG_KEY, lang)
  return render(
    <LanguageProvider>
      <ToastProvider>
        <MemoryRouter initialEntries={[`/email/unsubscribe${search}`]}>
          <Routes>
            <Route path="/email/unsubscribe" element={<EmailUnsubscribePage />} />
            <Route path="/email/preferences" element={<p>Preferences page</p>} />
            <Route path="*" element={<p>Somewhere else</p>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
    </LanguageProvider>,
  )
}

beforeEach(() => {
  localStorage.clear()
  resetMockNotifications()
})
afterEach(() => vi.restoreAllMocks())

describe('email unsubscribe page', () => {
  it('opening the link only asks: nothing is changed until the button is pressed', async () => {
    const spy = vi.spyOn(notifications, 'unsubscribeEmail')
    renderPage(`?t=${demoUnsubscribeToken('new_application')}`)
    expect(await screen.findByRole('heading', { level: 1, name: 'Unsubscribe from new application emails?' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Unsubscribe' })).toBeEnabled()
    expect(spy).not.toHaveBeenCalled()
    const prefs = await notifications.getNotificationPrefs()
    expect(prefs.ok && prefs.data.emailNewApplication).toBe(true)
  })

  it('the button switches that one type off, then says so and links to the preferences', async () => {
    renderPage(`?t=${demoUnsubscribeToken('business_notices')}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Unsubscribe' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'You are unsubscribed' })).toBeInTheDocument()
    expect(screen.getByText(/no longer get platform notice emails/)).toBeInTheDocument()
    const prefs = await notifications.getNotificationPrefs()
    expect(prefs.ok && prefs.data).toMatchObject({ emailBusinessNotices: false, emailNewApplication: true, emailModelRequestUpdates: true })
    await userEvent.click(screen.getByRole('link', { name: 'Email preferences' }))
    expect(await screen.findByText('Preferences page')).toBeInTheDocument()
  })

  it('a missing or unreadable token is a plain message with the preferences link, and nothing is sent', async () => {
    const spy = vi.spyOn(notifications, 'unsubscribeEmail')
    renderPage('')
    expect(await screen.findByRole('heading', { level: 1, name: 'This link does not work' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Unsubscribe' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Email preferences' })).toBeInTheDocument()
    expect(spy).not.toHaveBeenCalled()
  })

  it('an expired link (the server says so) is told apart from an invalid one', async () => {
    vi.spyOn(notifications, 'unsubscribeEmail').mockResolvedValue({ ok: false, error: { code: 'VALIDATION', message: 'x', reason: 'expired_token' } })
    renderPage(`?t=${demoUnsubscribeToken('new_application')}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Unsubscribe' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'This link has expired' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Email preferences' })).toBeInTheDocument()
  })

  it('a server refusal of a tampered link is the plain invalid message', async () => {
    vi.spyOn(notifications, 'unsubscribeEmail').mockResolvedValue({ ok: false, error: { code: 'VALIDATION', message: 'x', reason: 'invalid_token' } })
    renderPage(`?t=${demoUnsubscribeToken('new_application')}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Unsubscribe' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'This link does not work' })).toBeInTheDocument()
  })

  it('a failure that may pass (rate limit, network) says so and lets the person try again', async () => {
    const spy = vi.spyOn(notifications, 'unsubscribeEmail').mockResolvedValueOnce({ ok: false, error: { code: 'RATE_LIMITED', message: 'x', reason: 'rate_limited' } })
    renderPage(`?t=${demoUnsubscribeToken('new_application')}`)
    await userEvent.click(await screen.findByRole('button', { name: 'Unsubscribe' }))
    expect(await screen.findByText(/Too many attempts/)).toBeInTheDocument()
    spy.mockRestore()
    await userEvent.click(screen.getByRole('button', { name: 'Unsubscribe' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'You are unsubscribed' })).toBeInTheDocument()
  })

  it('is in Portuguese when the visitor chose Portuguese', async () => {
    renderPage(`?t=${demoUnsubscribeToken('model_request_updates')}`, 'pt')
    expect(await screen.findByRole('heading', { level: 1, name: 'Cancelar a subscrição dos e-mails de atualizações de pedidos de modelo 3D?' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar subscrição' }))
    await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'A subscrição foi cancelada' })).toBeInTheDocument())
    expect(screen.getByRole('link', { name: 'Preferências de e-mail' })).toBeInTheDocument()
  })
})
