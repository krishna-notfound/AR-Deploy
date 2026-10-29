import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_KEY, AccountProvider } from '@/auth/AccountProvider'
import { DashboardContext } from '@/components/layout/dashboardContext'
import { service } from '@/services'
import type { AuditEntry, AuditQuery } from '@/services/catalogService'
import AuditLogPage from './AuditLogPage'

const entries: AuditEntry[] = [
  { id: 'a1', createdAt: '2026-10-25T14:11:00Z', eventType: 'access_member_deactivated', fromStatus: 'active', toStatus: 'deactivated', actorEmail: 'owner@example.com', metadata: {} },
  { id: 'a2', createdAt: '2026-10-24T09:05:00Z', eventType: 'application_submitted', toStatus: 'submitted', metadata: { name: 'Atelier Norte' } },
]
const signIn: AuditEntry = { id: 's1', createdAt: '2026-10-25T15:00:00Z', eventType: 'account_signed_in', actorEmail: 'admin@example.com', metadata: {} }

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

/** Stands in for the service filter: sign-ins only when asked for. */
function mockEvents() {
  return vi.spyOn(service, 'getAuditEvents').mockImplementation(async (q?: AuditQuery) => {
    const items = q?.includeSignIns ? [signIn, ...entries] : entries
    return { ok: true, data: { items, total: items.length } }
  })
}

function renderAt(page = <AuditLogPage />) {
  return render(
    <MemoryRouter>
      <DashboardContext.Provider value={{ variant: 'admin', home: 'Sanctus Admin', homeTo: '/admin', eyebrow: 'Admin' }}>
        <main>{page}</main>
      </DashboardContext.Provider>
    </MemoryRouter>,
  )
}

async function renderPage() {
  mockEvents()
  const { container } = renderAt()
  await screen.findByText('Application submitted')
  return container
}

/** The page inside the demo account provider, signed in as the Owner or an Admin. */
async function renderAs(platformRole: 'owner' | 'admin') {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole }))
  const access = vi.spyOn(service, 'getMyAccess')
  const events = mockEvents()
  renderAt(
    <AccountProvider>
      <AuditLogPage />
    </AccountProvider>,
  )
  await screen.findByText('Application submitted')
  // Let the role load, so a checkbox that depends on it would have appeared.
  await waitFor(() => expect(access).toHaveBeenCalled())
  await act(async () => {
    await access.mock.results[0]!.value
  })
  return events
}

describe('AuditLogPage', () => {
  it('shows dates as tabular numbers', async () => {
    await renderPage()
    const times = document.querySelectorAll('main time')
    expect(times).toHaveLength(entries.length)
    for (const t of times) expect(t.className).toContain('tabular-nums')
  })

  it('uses sentence-case labels and no uppercase text', async () => {
    const container = await renderPage()
    expect(container.querySelector('main .uppercase')).toBeNull()
    // Event types without a written label still read as a sentence.
    expect(screen.getByText('Access member deactivated')).toBeInTheDocument()
  })

  it('labels the search field visibly', async () => {
    await renderPage()
    expect(screen.getByText('Search events', { selector: 'label, label *' })).toBeVisible()
  })

  it("lists no 'Account signed in' rows by default", async () => {
    const events = await renderAs('owner')
    expect(screen.queryByText('Account signed in')).toBeNull()
    for (const [q] of events.mock.calls) expect(q?.includeSignIns).toBe(false)
  })

  it("the Owner sees a 'Show sign-ins' checkbox that adds them; an Admin never sees the checkbox", async () => {
    const events = await renderAs('owner')
    const box = await screen.findByRole('checkbox', { name: 'Show sign-ins' })
    expect(box).not.toBeChecked()
    await userEvent.click(box)
    expect(await screen.findByText('Account signed in')).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'Show sign-ins' })).toBeChecked()
    expect(events).toHaveBeenLastCalledWith(expect.objectContaining({ includeSignIns: true }))

    cleanup()
    vi.restoreAllMocks()
    const adminEvents = await renderAs('admin')
    expect(screen.queryByRole('checkbox', { name: 'Show sign-ins' })).toBeNull()
    expect(screen.queryByText('Account signed in')).toBeNull()
    for (const [q] of adminEvents.mock.calls) expect(q?.includeSignIns).toBe(false)
  })

  it('shows a loading state while the events load', async () => {
    vi.spyOn(service, 'getAuditEvents').mockReturnValue(new Promise(() => {}))
    renderAt()
    expect(await screen.findByRole('status', { name: 'Loading' })).toBeInTheDocument()
  })

  it('shows an empty state when there are no events', async () => {
    vi.spyOn(service, 'getAuditEvents').mockResolvedValue({ ok: true, data: { items: [], total: 0 } })
    renderAt()
    expect(await screen.findByText('No events yet')).toBeInTheDocument()
  })

  it('shows an error state with a retry when the events fail to load', async () => {
    const spy = vi.spyOn(service, 'getAuditEvents').mockResolvedValue({ ok: false, error: { code: 'UNKNOWN', message: 'Could not load the audit log.' } })
    renderAt()
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again in a moment.')
    spy.mockResolvedValue({ ok: true, data: { items: entries, total: entries.length } })
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Application submitted')).toBeInTheDocument()
  })
})
