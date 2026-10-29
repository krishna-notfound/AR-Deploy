import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { content } from '@/services'
import { fail, ok } from '@/services/catalogService'
import type { ContentDraftState } from '@/services/contentService'
import { PREFETCH_TTL_MS, clearPrefetchedDraft, loadFirstDraft, prefetchContentDraft, takePrefetchedDraft } from './draftPrefetch'

const state = (v: number) => ({ version: v }) as unknown as ContentDraftState

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  clearPrefetchedDraft()
})
afterEach(() => {
  clearPrefetchedDraft()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('draftPrefetch', () => {
  it('starts one request however many times it is asked, and hands the same promise to the first consumer', async () => {
    const spy = vi.spyOn(content, 'getContentDraft').mockResolvedValue(ok(state(1)))
    prefetchContentDraft()
    prefetchContentDraft()
    expect(spy).toHaveBeenCalledTimes(1)
    const r = await loadFirstDraft()
    expect(r.ok && r.data.version).toBe(1)
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('serves the cached promise only once; the next load fetches fresh', async () => {
    const spy = vi.spyOn(content, 'getContentDraft').mockResolvedValue(ok(state(1)))
    prefetchContentDraft()
    await loadFirstDraft()
    await loadFirstDraft()
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('does not reuse a prefetch older than 30 seconds', async () => {
    const spy = vi.spyOn(content, 'getContentDraft').mockResolvedValue(ok(state(1)))
    prefetchContentDraft()
    vi.setSystemTime(Date.now() + PREFETCH_TTL_MS + 1)
    expect(takePrefetchedDraft()).toBeNull()
    await loadFirstDraft()
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('reuses a prefetch just inside 30 seconds', () => {
    vi.spyOn(content, 'getContentDraft').mockResolvedValue(ok(state(1)))
    prefetchContentDraft()
    vi.setSystemTime(Date.now() + PREFETCH_TTL_MS - 1)
    expect(takePrefetchedDraft()).not.toBeNull()
  })

  it('does not cache an error result: the next request is a normal fetch', async () => {
    const spy = vi
      .spyOn(content, 'getContentDraft')
      .mockResolvedValueOnce(fail('UNKNOWN', 'down'))
      .mockResolvedValue(ok(state(2)))
    prefetchContentDraft()
    await Promise.resolve()
    await Promise.resolve()
    expect(takePrefetchedDraft()).toBeNull()
    const r = await loadFirstDraft()
    expect(r.ok && r.data.version).toBe(2)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('falls back to a fresh fetch when the consumer finds the prefetch failed', async () => {
    const spy = vi
      .spyOn(content, 'getContentDraft')
      .mockResolvedValueOnce(fail('UNKNOWN', 'down'))
      .mockResolvedValue(ok(state(3)))
    prefetchContentDraft()
    const r = await loadFirstDraft()
    expect(r.ok && r.data.version).toBe(3)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('survives a rejected prefetch', async () => {
    const spy = vi.spyOn(content, 'getContentDraft').mockRejectedValueOnce(new Error('boom')).mockResolvedValue(ok(state(4)))
    prefetchContentDraft()
    const r = await loadFirstDraft()
    expect(r.ok && r.data.version).toBe(4)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('is cleared on demand (after a save, publish or restore, and on unmount)', async () => {
    const spy = vi.spyOn(content, 'getContentDraft').mockResolvedValue(ok(state(1)))
    prefetchContentDraft()
    clearPrefetchedDraft()
    expect(takePrefetchedDraft()).toBeNull()
    await loadFirstDraft()
    expect(spy).toHaveBeenCalledTimes(2)
  })
})
