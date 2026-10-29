import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_KEY, AccountProvider } from '@/auth/AccountProvider'
import { account } from '@/services'
import { resetMockAccount } from '@/services/mock/mockAccount'
import { resetMyProfileStore, useMyProfile } from './useMyProfile'

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <AccountProvider>{children}</AccountProvider>
  </MemoryRouter>
)

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' }))
  resetMockAccount()
  resetMyProfileStore()
})
afterEach(() => vi.restoreAllMocks())

describe('useMyProfile', () => {
  it('keeps the last good profile when a refetch fails, and reports the error separately', async () => {
    const { result } = renderHook(() => useMyProfile(), { wrapper })
    await waitFor(() => expect(result.current.profile).not.toBeNull())
    const good = result.current.profile
    vi.spyOn(account, 'getProfile').mockResolvedValue({ ok: false, error: { code: 'UNKNOWN', reason: 'unknown', message: 'Network down.' } })
    act(() => result.current.reload())
    await waitFor(() => expect(result.current.error?.message).toBe('Network down.'))
    expect(result.current.profile).toBe(good)
    expect(result.current.loading).toBe(false)
  })

  it('does not refetch on mount while the profile is fresh, and does once it is stale', async () => {
    const get = vi.spyOn(account, 'getProfile')
    const first = renderHook(() => useMyProfile(), { wrapper })
    await waitFor(() => expect(first.result.current.profile).not.toBeNull())
    expect(get).toHaveBeenCalledTimes(1)
    first.unmount()

    const second = renderHook(() => useMyProfile(), { wrapper })
    // The cached copy shows as soon as the account resolves, with no new request.
    await waitFor(() => expect(second.result.current.profile).not.toBeNull())
    await new Promise((r) => setTimeout(r, 20))
    expect(get).toHaveBeenCalledTimes(1)
    second.unmount()

    const later = Date.now() + 10 * 60_000
    vi.spyOn(Date, 'now').mockReturnValue(later)
    const third = renderHook(() => useMyProfile(), { wrapper })
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2))
    third.unmount()
  })
})
