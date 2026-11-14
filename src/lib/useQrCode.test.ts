import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const toDataURL = vi.fn()
vi.mock('qrcode', () => ({ default: { toDataURL: (...a: unknown[]) => toDataURL(...a) } }))

import { useQrCode } from './useQrCode'

afterEach(() => toDataURL.mockReset())

describe('useQrCode (QA BL-7)', () => {
  it('makes a code, and clears an earlier failure when the next text works', async () => {
    toDataURL.mockRejectedValueOnce(new Error('too long')).mockResolvedValueOnce('data:image/png;base64,OK')
    const { result, rerender } = renderHook(({ text }) => useQrCode(text), { initialProps: { text: 'https://a.test/x' } })
    await waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current.url).toBeNull()
    await act(async () => rerender({ text: 'https://a.test/y' }))
    await waitFor(() => expect(result.current.url).toBe('data:image/png;base64,OK'))
    expect(result.current.error).toBe(false)
  })
})
