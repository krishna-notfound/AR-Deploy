import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { service } from '@/services'
import { type AuditEntry, fail, ok } from '@/services/catalogService'
import { AuditTimeline, actorText } from './AuditTimeline'

afterEach(() => {
  vi.restoreAllMocks()
})

const base = { createdAt: '2026-10-25T10:00:00Z', metadata: {} }

function renderTimeline(items: AuditEntry[], props: Parameters<typeof AuditTimeline>[0] = { applicationId: 'app-1' }) {
  vi.spyOn(service, 'getAuditEvents').mockResolvedValue(ok({ items, total: items.length }))
  return render(
    <MemoryRouter>
      <AuditTimeline {...props} />
    </MemoryRouter>,
  )
}

describe('actorText (R-W7-1)', () => {
  it("a null actor with a label → 'Deleted user ({label})', with no label → 'System'", () => {
    expect(actorText({ ...base, id: '1', eventType: 'x', actorLabel: 'Admin' })).toBe('Deleted user (Admin)')
    expect(actorText({ ...base, id: '2', eventType: 'x' })).toBe('System')
    expect(actorText({ ...base, id: '3', eventType: 'x', actorId: 'u-1', actorEmail: 'ada@x.test', actorLabel: 'Admin' })).toBe('ada@x.test')
    expect(actorText({ ...base, id: '4', eventType: 'x', actorId: 'abcdef1234', actorLabel: 'Team' })).toBe('User abcdef12')
  })
})

describe('AuditTimeline (R-W7-1)', () => {
  it("a null actor with a label → 'Deleted user ({label})', with no label → 'System'; a missing business → '{business_name} (deleted)' with no link", async () => {
    renderTimeline([
      { ...base, id: 'e1', eventType: 'application_status_changed', toStatus: 'approved', actorLabel: 'Admin' },
      { ...base, id: 'e2', createdAt: '2026-10-25T11:00:00Z', eventType: 'application_submitted' },
      { ...base, id: 'e3', createdAt: '2026-10-25T12:00:00Z', eventType: 'business_deleted', businessId: 'b-gone', businessName: 'Gone Co', businessDeleted: true },
      { ...base, id: 'e4', createdAt: '2026-10-25T13:00:00Z', eventType: 'owner_provisioned', businessId: 'b-live', businessName: 'Live Co', businessDeleted: false },
    ])
    expect(await screen.findByText(/Deleted user \(Admin\)/)).toBeInTheDocument()
    expect(screen.getAllByText(/· System$/)).toHaveLength(3)
    expect(screen.getByText('Gone Co (deleted)')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Gone Co/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Live Co' })).toHaveAttribute('href', '/admin/businesses/b-live')
  })

  it('shows the note when given (application events only)', async () => {
    renderTimeline([{ ...base, id: 'e1', eventType: 'application_submitted' }], { applicationId: 'app-1', note: 'Showing application events only.' })
    expect(await screen.findByText('Showing application events only.')).toBeInTheDocument()
  })

  it('loading, empty and error states', async () => {
    const spy = vi.spyOn(service, 'getAuditEvents').mockResolvedValue(fail('UNKNOWN', 'Network down.'))
    const { unmount } = render(
      <MemoryRouter>
        <AuditTimeline applicationId="app-1" />
      </MemoryRouter>,
    )
    expect(await screen.findByText('Network down.')).toBeInTheDocument()
    unmount()
    spy.mockResolvedValue(ok({ items: [], total: 0 }))
    renderTimeline([])
    expect(await screen.findByText('No history yet')).toBeInTheDocument()
  })
})
