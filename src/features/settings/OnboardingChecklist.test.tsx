import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { ACCOUNT_KEY } from '@/auth/AccountProvider'
import { account, service } from '@/services'
import { accountFail } from '@/services/accountService'
import { ok } from '@/services/catalogService'
import { DEMO_CODE, resetMockAccount } from '@/services/mock/mockAccount'
import { resetOnboardingVisits } from './OnboardingChecklist'
import { resetMyProfileStore } from './useMyProfile'

type As = { role: 'super_admin' } | { role: 'business_admin'; businessId: string }
const OWNER: As = { role: 'super_admin' }
const BUSINESS: As = { role: 'business_admin', businessId: 'biz_casa' }

function open(as: As, url: string) {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(as))
  window.history.replaceState(null, '', url)
  return render(<App />)
}

const heading = () => screen.findByRole('heading', { level: 1, name: 'Complete your setup' }, { timeout: 10_000 })
/** The checklist with its steps loaded. */
const checklist = async () => {
  await heading()
  return screen.findByRole('list', { name: 'Setup steps' }, { timeout: 10_000 })
}
const step = (name: string) => screen.getByRole('listitem', { name })
const stepNames = () => within(screen.getByRole('list', { name: 'Setup steps' })).getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))
const onboarding = async () => {
  const r = await account.getSecurityState()
  if (!r.ok) throw new Error('no state')
  return r.data.onboarding
}

async function enable2fa() {
  const e = await account.startTotpEnrollment()
  if (!e.ok) throw new Error('no enrolment')
  await account.confirmTotpEnrollment(e.data.factorId, DEMO_CODE)
}
async function finishEveryStep() {
  await account.updateProfile({ displayName: 'Rui Costa' })
  await account.uploadAvatar(new Blob(['x'], { type: 'image/png' }))
  await enable2fa()
}

beforeAll(async () => {
  await Promise.all([
    import('@/features/settings/SettingsSectionPage'),
    import('@/features/settings/sections/ProfileSection'),
    import('@/features/business/BusinessOverviewPage'),
    import('@/features/admin/AdminOverviewPage'),
    import('@/features/products/ProductEditorPage'),
  ])
}, 60_000)

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  localStorage.clear()
  sessionStorage.clear()
  await service.resetDemoData()
  // A new account: setup neither completed nor dismissed (the demo accounts start completed).
  resetMockAccount({ onboarding: 'new' })
  resetMyProfileStore()
  resetOnboardingVisits()
})

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('Complete your setup', () => {
  it('business owner steps: name (required), photo, 2FA (recommended without the policy), logo and contact email, first product', { timeout: 20_000 }, async () => {
    open(BUSINESS, '/dashboard')
    await checklist()
    expect(screen.queryByRole('heading', { level: 1, name: 'Overview' })).not.toBeInTheDocument()
    expect(stepNames()).toEqual([
      'Add your name, not done, required',
      'Add a profile photo, not done',
      'Turn on two-step verification (2FA), not done, recommended',
      'Add your logo and contact email, done',
      'Add your first product, done',
    ])
    // Real data: the demo business already has a logo, a contact email and products.
    expect(screen.getByText('2 of 5 done')).toBeInTheDocument()
    expect(within(step('Add your name, not done, required')).getByRole('link')).toHaveAttribute('href', '/dashboard/settings/profile')
  })

  it('staff steps: name, photo, 2FA', { timeout: 20_000 }, async () => {
    open(OWNER, '/admin')
    await checklist()
    expect(stepNames()).toEqual(['Add your name, not done, required', 'Add a profile photo, not done', 'Turn on two-step verification (2FA), not done, recommended'])
    expect(screen.getByText('0 of 3 done')).toBeInTheDocument()
  })

  it('Finish later is hidden while a required step is open; it sets dismissed and shows the Overview card', { timeout: 30_000 }, async () => {
    const user = userEvent.setup()
    open(BUSINESS, '/dashboard')
    await checklist()
    expect(screen.queryByRole('button', { name: 'Finish later' })).not.toBeInTheDocument()
    expect(screen.getByText('Add your name to continue.')).toBeInTheDocument()

    // The step opens Profile settings (not covered by the checklist); closing settings comes back to it.
    await user.click(within(step('Add your name, not done, required')).getByRole('link'))
    expect(await screen.findByRole('heading', { level: 1, name: 'Profile' }, { timeout: 10_000 })).toBeInTheDocument()
    const name = await screen.findByLabelText('Name')
    await user.clear(name)
    await user.type(name, 'Rui Costa')
    await user.click(screen.getByRole('button', { name: 'Save name' }))
    await waitFor(async () => expect((await account.getProfile()).ok && ((await account.getProfile()) as { data: { displayName: string } }).data.displayName).toBe('Rui Costa'))
    await user.click(screen.getByRole('button', { name: 'Close settings' }))

    await checklist()
    expect(step('Add your name, done')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Finish later' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' }, { timeout: 10_000 })).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: 'Finish your setup · 3 of 5' })).toBeInTheDocument()
    expect((await onboarding()).dismissedAt).toBeTruthy()
    expect((await onboarding()).completedAt).toBeNull()
  })

  it('a dismissed setup never shows full screen again; the Overview card lists what is left', { timeout: 20_000 }, async () => {
    await account.updateProfile({ displayName: 'Rui Costa' })
    await account.setOnboarding('dismissed')
    open(BUSINESS, '/dashboard')
    const card = await screen.findByRole('heading', { name: 'Finish your setup · 3 of 5' }, { timeout: 10_000 })
    expect(screen.queryByRole('heading', { name: 'Complete your setup' })).not.toBeInTheDocument()
    const region = card.closest('section') as HTMLElement
    expect(within(region).getByRole('link', { name: /Add a profile photo/ })).toHaveAttribute('href', '/dashboard/settings/profile')
    expect(within(region).getByRole('link', { name: /Turn on two-step verification/ })).toHaveAttribute('href', '/dashboard/settings/security')
    expect(within(region).queryByRole('link', { name: /Add your name/ })).not.toBeInTheDocument()
  })

  it('all steps done sets completed and the card disappears', { timeout: 20_000 }, async () => {
    await finishEveryStep()
    await account.setOnboarding('dismissed')
    open(BUSINESS, '/dashboard')
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' }, { timeout: 10_000 })).toBeInTheDocument()
    await waitFor(async () => expect((await onboarding()).completedAt).toBeTruthy())
    await waitFor(() => expect(screen.queryByRole('heading', { name: /Finish your setup/ })).not.toBeInTheDocument())
  })

  it('every step done in the checklist: "Go to dashboard" sets completed', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    await finishEveryStep()
    open(BUSINESS, '/dashboard')
    await checklist()
    expect(screen.getByText('5 of 5 done')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Finish later' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Go to dashboard' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' }, { timeout: 10_000 })).toBeInTheDocument()
    expect((await onboarding()).completedAt).toBeTruthy()
    expect(screen.queryByRole('heading', { name: /Finish your setup/ })).not.toBeInTheDocument()
  })

  it('a completed setup (the demo accounts) shows neither the checklist nor the card', { timeout: 20_000 }, async () => {
    resetMockAccount()
    open(OWNER, '/admin')
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' }, { timeout: 10_000 })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Complete your setup' })).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /Finish your setup/ })).not.toBeInTheDocument()
  })

  it('the settings routes are not covered', { timeout: 20_000 }, async () => {
    open(BUSINESS, '/dashboard/settings/profile')
    expect(await screen.findByRole('heading', { level: 1, name: 'Profile' }, { timeout: 10_000 })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Complete your setup' })).not.toBeInTheDocument()
  })

  it('a step outside settings (first product) lets the owner through for this visit; Overview then shows the card', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    vi.spyOn(service, 'getProducts').mockResolvedValue(ok([]))
    await account.updateProfile({ displayName: 'Rui Costa' })
    open(BUSINESS, '/dashboard')
    await checklist()
    await user.click(within(step('Add your first product, not done')).getByRole('link'))
    expect(await screen.findByRole('heading', { level: 1, name: 'Add product' }, { timeout: 10_000 })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Complete your setup' })).not.toBeInTheDocument()
    // Not dismissed: only this visit.
    expect((await onboarding()).dismissedAt).toBeNull()
  })

  it('a profile that cannot load shows the error with Retry and a way on to the dashboard', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    vi.spyOn(account, 'getProfile').mockResolvedValue(accountFail('unknown'))
    open(BUSINESS, '/dashboard')
    await heading()
    expect(await screen.findByRole('button', { name: 'Try again' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue to dashboard' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Overview' }, { timeout: 10_000 })).toBeInTheDocument()
    expect((await onboarding()).dismissedAt).toBeNull()
  })
})
