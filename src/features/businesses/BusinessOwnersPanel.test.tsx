import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import type { Business } from '@/domain/types'
import { account, service } from '@/services'
import { ok } from '@/services/catalogService'
import { resetMockAccount } from '@/services/mock/mockAccount'
import type { DatePrefs } from '@/lib/format'
import { BusinessOwnersPanel } from './BusinessOwnersPanel'
import { closureByBusiness } from './closure'

// The signed-in person's date preferences (none unless a test sets them).
const prefsState = vi.hoisted(() => ({ prefs: undefined as DatePrefs | undefined }))
vi.mock('@/lib/preferences', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/preferences')>()), usePreferences: () => prefsState.prefs }))

const OWNER = { userId: 'usr_rita', email: 'rita@oak.example', addedAt: '2026-09-01T10:00:00.000Z', invitedAt: '2026-09-01T10:00:00.000Z', acceptedAt: '2026-09-02T10:00:00.000Z' }
const REQUEST = { userId: 'usr_rita', email: 'rita@oak.example', businessId: 'biz_oak', businessName: 'Oak & Ember Studio', requestedAt: '2026-10-20T10:00:00.000Z' }

beforeEach(async () => {
  localStorage.clear()
  resetMockAccount()
  await service.resetDemoData()
  vi.spyOn(service, 'getBusinessMembers').mockResolvedValue(ok([OWNER]))
})

afterEach(() => {
  vi.restoreAllMocks()
})

async function oak(status?: Business['status']): Promise<Business> {
  const r = await service.getBusinessById('biz_oak')
  if (!r.ok) throw new Error('seed business missing')
  return status ? { ...r.data, status } : r.data
}

function renderPanel(business: Business) {
  render(
    <ToastProvider>
      <ConfirmProvider>
        <BusinessOwnersPanel business={business} />
      </ConfirmProvider>
    </ToastProvider>,
  )
}

async function openRemoveDialog() {
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'Remove rita@oak.example' }))
  return screen.findByRole('dialog', { name: 'Remove rita@oak.example?' })
}

describe('BusinessOwnersPanel: removing an owner with an open closure request (R-W1-2)', () => {
  it("shows 'This owner asked to close their account on {date}. Removing them cancels that request. The catalog stays {status label}.' only when a request is open", async () => {
    const list = vi.spyOn(account, 'listClosureRequests').mockResolvedValue(ok([REQUEST]))
    renderPanel(await oak())
    await vi.waitFor(() => expect(list).toHaveBeenCalled())
    const dialog = await openRemoveDialog()
    expect(within(dialog).getByText(/This owner asked to close their account on .*2026\. Removing them cancels that request\. The catalog stays inactive\./)).toBeInTheDocument()
  })

  it('names the real status of the catalog', async () => {
    vi.spyOn(account, 'listClosureRequests').mockResolvedValue(ok([REQUEST]))
    renderPanel(await oak('draft'))
    const dialog = await openRemoveDialog()
    expect(await within(dialog).findByText(/The catalog stays draft\./)).toBeInTheDocument()
  })

  it('says nothing about a closure when no request is open, or when the request is not this owner’s', async () => {
    vi.spyOn(account, 'listClosureRequests').mockResolvedValue(ok([{ ...REQUEST, userId: 'usr_someone_else' }]))
    renderPanel(await oak())
    const dialog = await openRemoveDialog()
    expect(within(dialog).getByText(/They will no longer be able to manage/)).toBeInTheDocument()
    expect(within(dialog).queryByText(/asked to close their account/)).toBeNull()
  })
})

describe('closureByBusiness', () => {
  it('maps each business to its request, leaves out staff closures and keeps the earliest of two', () => {
    const later = { ...REQUEST, userId: 'usr_late', requestedAt: '2026-10-22T10:00:00.000Z' }
    const staff = { ...REQUEST, userId: 'usr_staff', businessId: null, businessName: null }
    const map = closureByBusiness([later, staff, REQUEST])
    expect([...map.keys()]).toEqual(['biz_oak'])
    expect(map.get('biz_oak')?.userId).toBe('usr_rita')
  })
})

describe('BusinessOwnersPanel: owner state and invitations (S1.5 Task 17: R-W2-3, R-W2-4)', () => {
  const PENDING = { userId: 'usr_rita', email: 'rita@oak.example', addedAt: '2026-09-01T10:00:00.000Z', invitedAt: '2026-09-01T10:00:00.000Z' }
  const STATE = { businessId: 'biz_oak', state: 'invite_pending' as const, lastInvitedAt: '2026-10-20T10:00:00.000Z', emailFailed: false }

  afterEach(() => {
    prefsState.prefs = undefined
  })

  it("a pending owner shows 'Last invitation sent {date}' from the owner state, not invitedAt", async () => {
    vi.spyOn(service, 'getBusinessMembers').mockResolvedValue(ok([PENDING]))
    vi.spyOn(service, 'getOwnerStates').mockResolvedValue(ok([STATE]))
    prefsState.prefs = { timezone: 'Europe/Lisbon', dateFormat: 'yyyy-MM-dd', clock: '24h' }
    renderPanel(await oak())
    expect(await screen.findByText('Last invitation sent 2026-10-20 · has not set a password yet')).toBeInTheDocument()
    expect(screen.queryByText(/2026-09-01/)).toBeNull()
    expect(screen.getByRole('button', { name: 'Resend invitation' })).toBeInTheDocument()
  })

  it("an accepted owner shows 'Owner active', hides Resend and offers Reset 2FA", async () => {
    vi.spyOn(service, 'getOwnerStates').mockResolvedValue(ok([{ ...STATE, state: 'owner_active' as const }]))
    renderPanel(await oak())
    expect(await screen.findByText('Owner active')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Resend invitation' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Reset 2FA for rita@oak.example' })).toBeInTheDocument()
  })

  it("too_many_invitations shows 'Ten invitations were sent to this owner in the last 24 hours. You can send the next one after {time}.' with retryAt in the date-format preference", async () => {
    vi.spyOn(service, 'getBusinessMembers').mockResolvedValue(ok([PENDING]))
    vi.spyOn(service, 'getOwnerStates').mockResolvedValue(ok([STATE]))
    vi.spyOn(service, 'resendOwnerInvitation').mockResolvedValue({
      ok: false,
      error: { code: 'RATE_LIMITED', message: 'Ten invitations were sent to this owner in the last 24 hours.', reason: 'too_many_invitations', retryAt: '2026-10-21T09:30:00.000Z' },
    })
    prefsState.prefs = { timezone: 'Asia/Tokyo', dateFormat: 'dd/MM/yyyy', clock: '24h' }
    renderPanel(await oak())
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Resend invitation' }))
    const dialog = await screen.findByRole('dialog', { name: 'Send a new invitation to rita@oak.example?' })
    await user.click(within(dialog).getByRole('button', { name: 'Resend invitation' }))
    expect(await screen.findByText('Ten invitations were sent to this owner in the last 24 hours. You can send the next one after 21/10/2026, 18:30.')).toBeInTheDocument()
  })

  it('a failed invitation email never shows the provider text, only fixed copy', async () => {
    vi.spyOn(service, 'getBusinessMembers').mockResolvedValue(ok([PENDING]))
    vi.spyOn(service, 'getOwnerStates').mockResolvedValue(ok([STATE]))
    vi.spyOn(service, 'resendOwnerInvitation').mockResolvedValue(ok({ owner: 'already_linked', email: { status: 'failed', error: 'Resend 500: internal provider detail', attempt: 2 } }))
    renderPanel(await oak())
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: 'Resend invitation' }))
    const dialog = await screen.findByRole('dialog', { name: 'Send a new invitation to rita@oak.example?' })
    await user.click(within(dialog).getByRole('button', { name: 'Resend invitation' }))
    expect(await screen.findByText('New invitation created, but the invitation email was not sent')).toBeInTheDocument()
    expect(screen.getByText('The email service did not take it. Use “Resend invitation” to try again.')).toBeInTheDocument()
    expect(screen.queryByText(/internal provider detail/)).toBeNull()
  })

  it('when the owner state fails to load, a pending owner shows no invitation date (never invitedAt)', async () => {
    vi.spyOn(service, 'getBusinessMembers').mockResolvedValue(ok([PENDING]))
    vi.spyOn(service, 'getOwnerStates').mockResolvedValue({ ok: false, error: { code: 'UNKNOWN', message: 'Network down' } })
    renderPanel(await oak())
    expect(await screen.findByText('Has not set a password yet')).toBeInTheDocument()
    expect(screen.queryByText(/Invited 1 Sep|2026-09-01|Last invitation sent/)).toBeNull()
  })
})
