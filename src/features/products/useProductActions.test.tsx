import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Product } from '@/domain/types'
import { service } from '@/services'
import { useProductActions } from './useProductActions'

const confirm = vi.fn(async (_opts: { title: string; body: string }) => false)
const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() }
vi.mock('@/components/ui/ConfirmProvider', () => ({ useConfirm: () => confirm }))
vi.mock('@/components/ui/ToastProvider', () => ({ useToast: () => toast }))
vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }))

describe('product delete dialog (R-W5-4)', () => {
  it("adds 'Its past views stay in your totals as 'Deleted product'.'", async () => {
    const { result } = renderHook(() => useProductActions('business'))
    expect(await result.current.remove({ id: 'p1', name: { en: 'Oslo Sofa' } } as Product)).toBe(false)
    const body = confirm.mock.calls[0]![0].body
    expect(body).toContain("Its past views stay in your totals as 'Deleted product'.")
    expect(body).not.toContain('analytics')
  })
})

describe('product delete toast (R-W3-4)', () => {
  it("'Product deleted, but 1 file could not be removed from storage.'", async () => {
    confirm.mockResolvedValueOnce(true)
    vi.spyOn(service, 'deleteProduct').mockResolvedValue({ ok: true, data: { removedFiles: 0, failedFiles: 1 } })
    const { result } = renderHook(() => useProductActions('business'))
    expect(await result.current.remove({ id: 'p1', name: { en: 'Oslo Sofa' } } as Product)).toBe(true)
    expect(toast.info).toHaveBeenCalledWith('Product deleted, but 1 file could not be removed from storage.')
    expect(toast.success).not.toHaveBeenCalled()
  })
})
