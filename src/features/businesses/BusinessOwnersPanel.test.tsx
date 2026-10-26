import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import type { Business } from '@/domain/types'
import { account, service } from '@/services'
import { ok } from '@/services/catalogService'
import { resetMockAccount } from '@/services/mock/mockAccount'
import { BusinessOwnersPanel } from './BusinessOwnersPanel'
import { closureByBusiness } from './closure'

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
