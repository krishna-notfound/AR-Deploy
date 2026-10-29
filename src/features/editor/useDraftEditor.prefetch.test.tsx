import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { content } from '@/services'
import { mockCatalogService } from '@/services/mock/mockCatalogService'
import { clearPrefetchedDraft, prefetchContentDraft, takePrefetchedDraft } from './draftPrefetch'
import { useDraftEditor } from './useDraftEditor'

beforeEach(async () => {
  localStorage.clear()
  localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))
  await mockCatalogService.resetDemoData()
  clearPrefetchedDraft()
})
afterEach(() => {
  clearPrefetchedDraft()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useDraftEditor with a prefetched draft', () => {
  it('makes a single network call when the draft was prefetched before it mounted', async () => {
    const spy = vi.spyOn(content, 'getContentDraft')
    prefetchContentDraft()
    const hook = renderHook(() => useDraftEditor())
    await waitFor(() => expect(hook.result.current.load.status).toBe('ready'))
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('fetches normally without a prefetch, and fresh on a later reload', async () => {
    const spy = vi.spyOn(content, 'getContentDraft')
    const hook = renderHook(() => useDraftEditor())
    await waitFor(() => expect(hook.result.current.load.status).toBe('ready'))
    expect(spy).toHaveBeenCalledTimes(1)
    prefetchContentDraft() // a stray prefetch must not be served to a later reload
    expect(spy).toHaveBeenCalledTimes(2)
    await act(async () => void (await hook.result.current.reload()))
    expect(spy).toHaveBeenCalledTimes(3)
  })

  it('drops a pending prefetch when the draft is saved, and when the Editor unmounts', async () => {
    const hook = renderHook(() => useDraftEditor({ autosaveMs: 5 }))
    await waitFor(() => expect(hook.result.current.load.status).toBe('ready'))
    prefetchContentDraft()
    act(() => hook.result.current.setDraft((d) => ({ ...d, social: { instagram: 'https://instagram.com/a' } })))
    await waitFor(() => expect(hook.result.current.save.state).toBe('saved'))
    expect(takePrefetchedDraft()).toBeNull()
    prefetchContentDraft()
    hook.unmount()
    expect(takePrefetchedDraft()).toBeNull()
  })
})
