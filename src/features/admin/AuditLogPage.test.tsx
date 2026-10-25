import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DashboardContext } from '@/components/layout/dashboardContext'
import { service } from '@/services'
import type { AuditEntry } from '@/services/catalogService'
import AuditLogPage from './AuditLogPage'

const entries: AuditEntry[] = [
  { id: 'a1', createdAt: '2026-10-25T14:11:00Z', eventType: 'access_member_deactivated', fromStatus: 'active', toStatus: 'deactivated', actorEmail: 'owner@example.com', metadata: {} },
  { id: 'a2', createdAt: '2026-10-24T09:05:00Z', eventType: 'application_submitted', toStatus: 'submitted', metadata: { name: 'Atelier Norte' } },
]

afterEach(() => vi.restoreAllMocks())

async function renderPage() {
  vi.spyOn(service, 'getAuditEvents').mockResolvedValue({ ok: true, data: { items: entries, total: entries.length } })
  const { container } = render(
    <MemoryRouter>
      <DashboardContext.Provider value={{ variant: 'admin', home: 'Sanctus Admin', homeTo: '/admin', eyebrow: 'Admin' }}>
        <main>
          <AuditLogPage />
        </main>
      </DashboardContext.Provider>
    </MemoryRouter>,
  )
  await screen.findByText('Application submitted')
  return container
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
})
