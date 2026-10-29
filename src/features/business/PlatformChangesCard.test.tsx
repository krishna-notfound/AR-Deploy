import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { service } from '@/services'
import { type AuditEntry, fail, ok } from '@/services/catalogService'
import { PlatformChangesCard } from './PlatformChangesCard'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('Changes by the platform team (R-W7-2)', () => {
  it('loading, then the rows', async () => {
    const rows: AuditEntry[] = [
      { id: 'a', createdAt: '2026-10-26T10:00:00Z', eventType: 'business_status_changed', businessId: 'b1', toStatus: 'inactive', actorLabel: 'Admin', businessName: 'Casa', metadata: { business_name: 'Casa' } },
      { id: 'b', createdAt: '2026-10-26T09:00:00Z', eventType: 'product_deleted', businessId: 'b1', actorLabel: 'Team', metadata: { name: 'Oslo sofa' } },
    ]
    let resolve!: (v: Awaited<ReturnType<typeof service.getPlatformChanges>>) => void
    const spy = vi.spyOn(service, 'getPlatformChanges').mockReturnValue(new Promise((r) => (resolve = r)))
    render(<PlatformChangesCard businessId="b1" />)
    expect(screen.getByRole('region', { name: 'Changes by the platform team' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument()
    resolve(ok(rows))
    expect(await screen.findByText('Catalog for Casa was paused')).toBeInTheDocument()
    expect(screen.getByText('Oslo sofa was deleted')).toBeInTheDocument()
    expect(spy).toHaveBeenCalledWith('b1')
  })

  it("empty: 'No changes by the platform team.'", async () => {
    vi.spyOn(service, 'getPlatformChanges').mockResolvedValue(ok([]))
    render(<PlatformChangesCard businessId="b1" />)
    expect(await screen.findByText('No changes by the platform team.')).toBeInTheDocument()
  })

  it('error with retry', async () => {
    vi.spyOn(service, 'getPlatformChanges').mockResolvedValue(fail('UNKNOWN', 'Network down.'))
    render(<PlatformChangesCard businessId="b1" />)
    // The service message stays English for logs; the card shows the translated generic sentence.
    expect(await screen.findByText('Something went wrong. Try again in a moment.')).toBeInTheDocument()
    expect(screen.queryByText('Network down.')).toBeNull()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  })
})
