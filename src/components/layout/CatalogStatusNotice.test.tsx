import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_KEY, AccountProvider, useAccount } from '@/auth/AccountProvider'
import type { BusinessStatus } from '@/domain/types'
import { settingsPath } from '@/lib/urls'
import { type SecurityState, account, service } from '@/services'
import { accountFail } from '@/services/accountService'
import { ok } from '@/services/catalogService'
import { resetMockAccount } from '@/services/mock/mockAccount'
import { CatalogStatusNotice } from './DashboardShell'

const OFFLINE = 'Your catalog is offline because you asked to close your account. To keep it, cancel the request in My account.'

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  resetMockAccount()
  await service.resetDemoData()
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'business_admin', businessId: 'biz_oak' }))
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function securityWith(closure: SecurityState['closure']) {
  const base = await account.getSecurityState()
  if (!base.ok) throw new Error('security state missing')
  vi.spyOn(account, 'getSecurityState').mockResolvedValue(ok({ ...base.data, closure }))
}

/** Shows when the account provider has loaded the business, so "nothing shows" is checked after that. */
function Loaded() {
  const { business } = useAccount()
  return business ? <p>loaded {business.status}</p> : null
}

async function renderAt(status: BusinessStatus) {
  await service.setBusinessStatus('biz_oak', status)
  render(
    <AccountProvider>
      <MemoryRouter>
        <CatalogStatusNotice />
        <Loaded />
      </MemoryRouter>
    </AccountProvider>,
  )
}

describe("S2 Task 2: the owner's closure notice (R-W3-6, BIZ-08)", () => {
  it("with an open closure and status inactive: the closure sentence, 'My account' links to settings; the paused notice is absent", async () => {
    await securityWith({ requestedAt: '2026-10-20T10:00:00Z', businessId: 'biz_oak' })
    await renderAt('inactive')
    const notices = await screen.findAllByText((_, el) => el?.textContent === OFFLINE && !!el.querySelector('a'))
    expect(notices[0]).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'My account' })).toHaveAttribute('href', settingsPath('business', 'account'))
    expect(screen.queryByText('Your catalog is paused.')).toBeNull()
  })

  it("without a closure: today's paused and draft notices", async () => {
    await securityWith(null)
    await renderAt('inactive')
    expect(await screen.findByText('Your catalog is paused.')).toBeInTheDocument()
    expect(screen.queryByText(/asked to close your account/)).toBeNull()
  })

  it('without a closure, a draft business keeps the "not public yet" notice', async () => {
    await securityWith(null)
    await renderAt('draft')
    expect(await screen.findByText('Oak & Ember Studio is not public yet.')).toBeInTheDocument()
  })

  it('while the security state loads, nothing shows; on its error, the status notice shows', async () => {
    let settle: (v: Awaited<ReturnType<typeof account.getSecurityState>>) => void = () => {}
    vi.spyOn(account, 'getSecurityState').mockReturnValue(new Promise((r) => (settle = r)))
    await renderAt('inactive')
    // The business has loaded (the account provider) but the security state has not: no notice yet.
    await screen.findByText('loaded inactive')
    expect(screen.queryByText('Your catalog is paused.')).toBeNull()
    expect(screen.queryByText(/asked to close your account/)).toBeNull()
    settle(accountFail('network'))
    expect(await screen.findByText('Your catalog is paused.')).toBeInTheDocument()
  })
})
