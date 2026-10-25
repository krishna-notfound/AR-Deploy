import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { ACCOUNT_KEY } from '@/auth/AccountProvider'
import { account, service } from '@/services'
import { accountFail } from '@/services/accountService'
import { DEMO_CODE, resetMockAccount } from '@/services/mock/mockAccount'

type As = { role: 'super_admin'; platformRole?: 'owner' | 'admin' | 'team' }

function open(as: As, url = '/admin/settings/security-policy') {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(as))
  window.history.replaceState(null, '', url)
  return render(<App />)
}

/** The demo Owner sets up their own authenticator, which leaves the session at aal2. */
async function ownerAtAal2() {
  const e = await account.startTotpEnrollment()
  if (!e.ok) throw new Error('enrollment did not start')
  const c = await account.confirmTotpEnrollment(e.data.factorId, DEMO_CODE)
  if (!c.ok) throw new Error('enrollment did not confirm')
}

beforeAll(async () => {
  await Promise.all([import('@/features/settings/SettingsSectionPage'), import('./SecurityPolicySection')])
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

describe('Security policy section', () => {
  it('refuses to enable the staff policy without aal2', { timeout: 20_000 }, async () => {
    // Signed in without 2FA: the switch can't be turned on, and says why.
    open({ role: 'super_admin' })
    const sw = await screen.findByRole('switch', { name: 'Require 2FA for staff' })
    expect(sw).toBeDisabled()
    expect(sw).toHaveAttribute('aria-checked', 'false')
    expect(screen.getAllByText(/Turn on your own 2FA first/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Turning on staff 2FA without it would lock you out of staff data/)).toBeInTheDocument()
    // RLS refuses every policy update below aal2, so the business-owner switch is off limits too.
    expect(screen.getByRole('switch', { name: 'Require 2FA for business owners' })).toBeDisabled()
    expect(screen.getByRole('link', { name: 'Go to Security & 2FA' })).toHaveAttribute('href', '/admin/settings/security')
    cleanup()

    // The security state said aal2, but the server refuses the save at aal1: the same reason, nothing saved.
    await ownerAtAal2()
    const save = vi.spyOn(account, 'updatePlatformSettings').mockResolvedValue(accountFail('aal2_required'))
    open({ role: 'super_admin' })
    const sw2 = await screen.findByRole('switch', { name: 'Require 2FA for staff' })
    await waitFor(() => expect(sw2).toBeEnabled())
    expect(screen.queryByText(/Turn on your own 2FA first/)).toBeNull()
    await userEvent.click(sw2)
    const dialog = await screen.findByRole('dialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Require 2FA' }))
    expect(save).toHaveBeenCalledWith({ require2faStaff: true })
    expect(await screen.findByText(/Turn on your own 2FA first/)).toBeInTheDocument()
    expect(sw2).toHaveAttribute('aria-checked', 'false')
    const p = await account.getPlatformSettings()
    expect(p.ok && p.data.require2faStaff).toBe(false)
  })

  it("with aal2, enabling the staff policy confirms 'Staff without 2FA will be asked to set it up at their next request' and saves", { timeout: 20_000 }, async () => {
    await ownerAtAal2()
    open({ role: 'super_admin' })
    const sw = await screen.findByRole('switch', { name: 'Require 2FA for staff' })
    await waitFor(() => expect(sw).toBeEnabled())
    await userEvent.click(sw)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Staff without 2FA will be asked to set it up at their next request.')).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Require 2FA' }))
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'))
    const p = await account.getPlatformSettings()
    expect(p.ok && p.data.require2faStaff).toBe(true)
    expect(p.ok && p.data.require2faBusiness).toBe(false)

    // Business owners have their own switch, saved on its own.
    const biz = screen.getByRole('switch', { name: 'Require 2FA for business owners' })
    await userEvent.click(biz)
    const d2 = await screen.findByRole('dialog')
    expect(within(d2).getByText('Business owners without 2FA will be asked to set it up at their next request.')).toBeInTheDocument()
    await userEvent.click(within(d2).getByRole('button', { name: 'Require 2FA' }))
    await waitFor(() => expect(biz).toHaveAttribute('aria-checked', 'true'))
    const p2 = await account.getPlatformSettings()
    expect(p2.ok && p2.data).toMatchObject({ require2faStaff: true, require2faBusiness: true })
  })

  it('with 2FA set up but signed in at aal1, both switches are disabled with "Sign in with your 2FA code to change these."', { timeout: 20_000 }, async () => {
    const original = account.getSecurityState.bind(account)
    vi.spyOn(account, 'getSecurityState').mockImplementation(async () => {
      const r = await original()
      return r.ok ? { ok: true as const, data: { ...r.data, aal: 'aal1' as const, hasVerifiedFactor: true } } : r
    })
    const save = vi.spyOn(account, 'updatePlatformSettings')
    open({ role: 'super_admin' })
    const staff = await screen.findByRole('switch', { name: 'Require 2FA for staff' })
    expect(staff).toBeDisabled()
    expect(screen.getByRole('switch', { name: 'Require 2FA for business owners' })).toBeDisabled()
    expect(screen.getAllByText(/Sign in with your 2FA code to change these\./).length).toBeGreaterThan(0)
    expect(screen.queryByText(/Turn on your own 2FA first/)).toBeNull()
    await userEvent.click(staff)
    expect(save).not.toHaveBeenCalled()
  })

  it('turning a policy off at aal2 skips the confirmation and saves', { timeout: 20_000 }, async () => {
    await ownerAtAal2()
    await account.updatePlatformSettings({ require2faStaff: true })
    open({ role: 'super_admin' })
    const sw = await screen.findByRole('switch', { name: 'Require 2FA for staff' })
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'true'))
    await waitFor(() => expect(sw).toBeEnabled())
    await userEvent.click(sw)
    await waitFor(() => expect(sw).toHaveAttribute('aria-checked', 'false'))
    expect(screen.queryByRole('dialog')).toBeNull()
    const p = await account.getPlatformSettings()
    expect(p.ok && p.data.require2faStaff).toBe(false)
  })

  it('cancelling the confirmation saves nothing', { timeout: 20_000 }, async () => {
    await ownerAtAal2()
    const save = vi.spyOn(account, 'updatePlatformSettings')
    open({ role: 'super_admin' })
    const sw = await screen.findByRole('switch', { name: 'Require 2FA for staff' })
    await waitFor(() => expect(sw).toBeEnabled())
    await userEvent.click(sw)
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }))
    expect(save).not.toHaveBeenCalled()
    expect(sw).toHaveAttribute('aria-checked', 'false')
  })

  it('shows an error with retry when the policy fails to load', { timeout: 20_000 }, async () => {
    const original = account.getPlatformSettings.bind(account)
    const spy = vi.spyOn(account, 'getPlatformSettings').mockResolvedValue(accountFail('unknown'))
    open({ role: 'super_admin' })
    expect(await screen.findByText(/Could not load the security policy/)).toBeInTheDocument()
    expect(screen.queryByRole('switch', { name: 'Require 2FA for staff' })).toBeNull()
    spy.mockImplementation(original)
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByRole('switch', { name: 'Require 2FA for staff' })).toBeInTheDocument()
  })

  it('none of these appear for Admin or Team', { timeout: 20_000 }, async () => {
    for (const platformRole of ['admin', 'team'] as const) {
      open({ role: 'super_admin', platformRole })
      // The hub sends them to My account; the policy switches never render.
      expect(await screen.findByRole('heading', { level: 1, name: 'My account' })).toBeInTheDocument()
      expect(screen.queryByRole('switch', { name: 'Require 2FA for staff' })).toBeNull()
      expect(screen.queryByRole('link', { name: 'Security policy' })).toBeNull()
      cleanup()
    }
  })
})
