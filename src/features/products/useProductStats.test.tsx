// QA #3: the Overview card and the My products column must count the same 30 local days, so both ask the service
// for the person's saved time zone.
import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { service } from '@/services'
import { useProductStats } from './useCatalogData'

vi.mock('@/lib/preferences', async (orig) => ({
  ...(await orig<typeof import('@/lib/preferences')>()),
  usePreferences: () => ({ timezone: 'Pacific/Auckland', dateFormat: 'dmy', clock: '24h' }),
}))

afterEach(() => vi.restoreAllMocks())

describe('useProductStats', () => {
  it("asks for one business's numbers in the person's time zone", async () => {
    const spy = vi.spyOn(service, 'getBusinessAnalytics')
    const { result } = renderHook(() => useProductStats('b-1'))
    await waitFor(() => expect(result.current.query.status).not.toBe('loading'))
    expect(spy).toHaveBeenCalledWith('b-1', { timeZone: 'Pacific/Auckland' })
  })

  it("asks for the platform's numbers in the person's time zone", async () => {
    const spy = vi.spyOn(service, 'getAnalytics')
    const { result } = renderHook(() => useProductStats())
    await waitFor(() => expect(result.current.query.status).not.toBe('loading'))
    expect(spy).toHaveBeenCalledWith({ timeZone: 'Pacific/Auckland' })
  })
})
