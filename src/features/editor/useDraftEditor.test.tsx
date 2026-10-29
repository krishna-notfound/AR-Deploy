import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { emptySiteContent } from '@/domain/siteContent'
import { content } from '@/services'
import { mockCatalogService } from '@/services/mock/mockCatalogService'
import { useDraftEditor } from './useDraftEditor'

beforeEach(async () => {
  localStorage.clear()
  localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))
  await mockCatalogService.resetDemoData()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

async function ready() {
  const hook = renderHook(() => useDraftEditor())
  await waitFor(() => expect(hook.result.current.load.status).toBe('ready'))
  return hook
}

describe('useDraftEditor', () => {
  it('loads the draft once into local state', async () => {
    const { result } = await ready()
    expect(result.current.draft).toEqual(emptySiteContent())
    expect(result.current.version).toBe(0)
    expect(result.current.save.state).toBe('saved')
    expect(result.current.dirty).toBe(false)
  })

  it('autosaves 2 seconds after the last change, with the last base, and chains the next base', async () => {
    const hook = await ready()
    const save = vi.spyOn(content, 'saveContentDraft')
    const s0 = await content.getContentDraft()
    const base0 = s0.ok ? s0.data.draftUpdatedAt : ''
    vi.useFakeTimers({ shouldAdvanceTime: true })

    act(() => hook.result.current.setDraft((d) => ({ ...d, social: { instagram: 'https://instagram.com/a' } })))
    expect(hook.result.current.save.state).toBe('pending')
    await act(async () => void (await vi.advanceTimersByTimeAsync(1900)))
    expect(save).not.toHaveBeenCalled()
    // A second change restarts the wait.
    act(() => hook.result.current.setDraft((d) => ({ ...d, social: { instagram: 'https://instagram.com/ab' } })))
    await act(async () => void (await vi.advanceTimersByTimeAsync(1900)))
    expect(save).not.toHaveBeenCalled()
    await act(async () => void (await vi.advanceTimersByTimeAsync(200)))
    await waitFor(() => expect(hook.result.current.save.state).toBe('saved'))
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0]![0].social.instagram).toBe('https://instagram.com/ab')
    expect(save.mock.calls[0]![1]).toBe(base0)

    // The next save uses the base the first one returned.
    act(() => hook.result.current.setDraft((d) => ({ ...d, social: {} })))
    await act(async () => void (await vi.advanceTimersByTimeAsync(2100)))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    const first = await save.mock.results[0]!.value
    expect(save.mock.calls[1]![1]).toBe(first.data.draftUpdatedAt)
  })

  it('a stale base is a conflict: nothing is overwritten and the local text stays', async () => {
    const hook = await ready()
    // Someone else saves first.
    const s = await content.getContentDraft()
    if (!s.ok) throw new Error('draft')
    await content.saveContentDraft({ ...emptySiteContent(), social: { facebook: 'https://facebook.com/x' } }, s.data.draftUpdatedAt)

    act(() => hook.result.current.setDraft((d) => ({ ...d, social: { instagram: 'https://instagram.com/mine' } })))
    let ok = true
    await act(async () => void (ok = await hook.result.current.flush()))
    expect(ok).toBe(false)
    expect(hook.result.current.save.state).toBe('conflict')
    expect(hook.result.current.draft.social.instagram).toBe('https://instagram.com/mine')
    const server = await content.getContentDraft()
    expect(server.ok && server.data.draft.social).toEqual({ facebook: 'https://facebook.com/x' })

    await act(async () => void (await hook.result.current.reload()))
    expect(hook.result.current.save.state).toBe('saved')
    expect(hook.result.current.draft.social).toEqual({ facebook: 'https://facebook.com/x' })
  })

  it('a failed save keeps the local text and can be retried', async () => {
    const hook = await ready()
    const save = vi.spyOn(content, 'saveContentDraft').mockResolvedValueOnce({ ok: false, error: { code: 'UNKNOWN', message: 'offline' } })
    act(() => hook.result.current.setDraft((d) => ({ ...d, social: { instagram: 'https://instagram.com/a' } })))
    await act(async () => void (await hook.result.current.flush()))
    expect(hook.result.current.save.state).toBe('failed')
    expect(hook.result.current.dirty).toBe(true)
    await act(async () => void (await hook.result.current.flush()))
    expect(hook.result.current.save.state).toBe('saved')
    expect(save).toHaveBeenCalledTimes(2)
  })

  it('publish saves first, then publishes the saved base and updates the version', async () => {
    const hook = await ready()
    act(() => hook.result.current.setDraft((d) => ({ ...d, builtinPages: { terms: { en: 'New terms' } } })))
    let res: Awaited<ReturnType<typeof hook.result.current.publish>> | undefined
    await act(async () => void (res = await hook.result.current.publish()))
    expect(res?.ok).toBe(true)
    expect(hook.result.current.version).toBe(1)
    expect(hook.result.current.published?.builtinPages.terms?.en).toBe('New terms')
    expect(hook.result.current.publishedByName).toBeTruthy()
    expect(hook.result.current.dirty).toBe(false)
  })
})
