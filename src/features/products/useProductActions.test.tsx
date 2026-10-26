import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Product } from '@/domain/types'
import { useProductActions } from './useProductActions'

const confirm = vi.fn(async (_opts: { title: string; body: string }) => false)
vi.mock('@/components/ui/ConfirmProvider', () => ({ useConfirm: () => confirm }))
vi.mock('@/components/ui/ToastProvider', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }))
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
