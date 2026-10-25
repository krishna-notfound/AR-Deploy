import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { ACCOUNT_KEY } from '@/auth/AccountProvider'
import { account, service } from '@/services'
import { accountFail } from '@/services/accountService'
import { resetMockAccount } from '@/services/mock/mockAccount'

function open(url: string) {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' }))
  window.history.replaceState(null, '', url)
  return render(<App />)
}

/** Pretend this device is set to `zone` (what Intl reports as the browser's time zone). */
function browserZone(zone: string) {
  const real = Intl.DateTimeFormat.prototype.resolvedOptions
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(function (this: Intl.DateTimeFormat) {
    return { ...real.call(this), timeZone: zone }
  })
}

beforeAll(async () => {
  await Promise.all([import('@/features/settings/SettingsSectionPage'), import('./PreferencesSection'), import('./ActivitySection')])
}, 60_000)

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  localStorage.clear()
  resetMockAccount()
  await service.resetDemoData()
})

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('Preferences section', () => {
  it('timezone select lists IANA zones with the browser zone suggested', { timeout: 20_000 }, async () => {
    browserZone('America/New_York')
    open('/admin/settings/preferences')
    const select = await screen.findByRole('combobox', { name: 'Time zone' })
    await waitFor(() => expect(select).toHaveValue('Europe/Lisbon'))
    const values = within(select).getAllByRole('option').map((o) => (o as HTMLOptionElement).value)
    expect(values.length).toBeGreaterThan(100)
    expect(values).toEqual(expect.arrayContaining(['Europe/Lisbon', 'Asia/Tokyo', 'America/New_York']))
    expect(screen.getByRole('option', { name: /America\/New_York.*this device/ })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Use America/New_York' }))
    expect(select).toHaveValue('America/New_York')
  })

  it('does not suggest the browser zone when it is already the saved one', { timeout: 20_000 }, async () => {
    browserZone('Europe/Lisbon')
    open('/admin/settings/preferences')
    const select = await screen.findByRole('combobox', { name: 'Time zone' })
    await waitFor(() => expect(select).toHaveValue('Europe/Lisbon'))
    expect(screen.queryByRole('button', { name: /^Use / })).toBeNull()
  })

  it('saving changes dates shown elsewhere', { timeout: 30_000 }, async () => {
    await account.recordSignIn()
    open('/admin/settings/preferences')
    const select = await screen.findByRole('combobox', { name: 'Time zone' })
    await waitFor(() => expect(select).toHaveValue('Europe/Lisbon'))
    const save = screen.getByRole('button', { name: 'Save preferences' })
    expect(save).toBeDisabled()

    await userEvent.click(screen.getByRole('radio', { name: '2026-10-25' }))
    await userEvent.click(screen.getByRole('radio', { name: /^2:05 pm/ }))
    await userEvent.selectOptions(select, 'Asia/Tokyo')
    expect(save).toBeEnabled()
    await userEvent.click(save)
    expect(await screen.findByText('Preferences saved')).toBeInTheDocument()
    const p = await account.getProfile()
    expect(p.ok && p.data).toMatchObject({ timezone: 'Asia/Tokyo', dateFormat: 'yyyy-MM-dd', clock: '12h' })

    // Another page now shows its dates in the saved format.
    await userEvent.click(screen.getByRole('link', { name: 'Security activity' }))
    expect(await screen.findByText('Signed in')).toBeInTheDocument()
    const time = document.querySelector('main time')
    expect(time?.textContent).toMatch(/^\d{4}-\d{2}-\d{2}, \d{1,2}:\d{2} (am|pm)$/)
  })

  it('keeps the choices and says so when saving fails', { timeout: 20_000 }, async () => {
    open('/admin/settings/preferences')
    const select = await screen.findByRole('combobox', { name: 'Time zone' })
    await waitFor(() => expect(select).toHaveValue('Europe/Lisbon'))
    vi.spyOn(account, 'updateProfile').mockResolvedValue(accountFail('unknown'))
    await userEvent.click(screen.getByRole('radio', { name: '25/10/2026' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save preferences' }))
    expect(await screen.findByText('Could not save your preferences')).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: '25/10/2026' })).toBeChecked()
  })

  it('shows loading, then an error with a retry when the profile cannot be loaded', { timeout: 20_000 }, async () => {
    const spy = vi.spyOn(account, 'getProfile').mockResolvedValue(accountFail('unknown'))
    open('/admin/settings/preferences')
    expect(await screen.findByText(/Could not load your preferences/)).toBeInTheDocument()
    spy.mockRestore()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('combobox', { name: 'Time zone' })).toBeInTheDocument()
  })
})
