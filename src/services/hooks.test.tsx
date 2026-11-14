import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Result } from './catalogService'
import { useServiceMutation, useServiceQuery } from './hooks'

describe('useServiceQuery', () => {
  it('a rejected call is an error state, not a query that loads forever (QA EF-08)', async () => {
    const { result } = renderHook(() => useServiceQuery<number>(() => Promise.reject(new Error('network down')), []))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error).toMatchObject({ code: 'UNKNOWN' })
    expect(result.current.refreshing).toBe(false)
  })

  it('a call that throws synchronously is an error state too, and refetch can recover', async () => {
    let fail = true
    const fn = (): Promise<Result<number>> => {
      if (fail) throw new Error('boom')
      return Promise.resolve({ ok: true, data: 7 })
    }
    const { result } = renderHook(() => useServiceQuery(fn, []))
    await waitFor(() => expect(result.current.status).toBe('error'))
    fail = false
    act(() => result.current.refetch())
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.data).toBe(7)
  })
})

describe('useServiceMutation', () => {
  it('a rejected call resolves to a failed result and clears pending (QA EF-08)', async () => {
    const { result } = renderHook(() => useServiceMutation((): Promise<Result<number>> => Promise.reject(new Error('network down'))))
    let res: Result<number> | undefined
    await act(async () => {
      res = await result.current.mutate()
    })
    expect(res).toMatchObject({ ok: false, error: { code: 'UNKNOWN' } })
    expect(result.current.pending).toBe(false)
  })
})
