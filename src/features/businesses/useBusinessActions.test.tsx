import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Business } from '@/domain/types'
import { service } from '@/services'
import { useBusinessActions } from './useBusinessActions'

const toast = { success: vi.fn(), error: vi.fn(), info: vi.fn() }
vi.mock('@/components/ui/ConfirmProvider', () => ({ useConfirm: () => async () => true }))
vi.mock('@/components/ui/ToastProvider', () => ({ useToast: () => toast }))
vi.mock('react-router', () => ({ useNavigate: () => vi.fn() }))

const biz = { id: 'b1', name: 'Casa' } as Business

beforeEach(() => {
  vi.restoreAllMocks()
  for (const f of Object.values(toast)) f.mockClear()
})

describe('business delete toast (R-W3-4)', () => {
  it("reads 'Business deleted, but 2 files could not be removed from storage.' when failedFiles is 2", async () => {
    vi.spyOn(service, 'deleteBusiness').mockResolvedValue({ ok: true, data: { removedFiles: 1, failedFiles: 2 } })
    const { result } = renderHook(() => useBusinessActions())
    expect(await result.current.remove(biz, 0)).toBe(true)
    expect(toast.info).toHaveBeenCalledWith('Business deleted, but 2 files could not be removed from storage.')
    expect(toast.success).not.toHaveBeenCalled()
  })

  it("reads 'Business deleted' when failedFiles is 0", async () => {
    vi.spyOn(service, 'deleteBusiness').mockResolvedValue({ ok: true, data: { removedFiles: 3, failedFiles: 0 } })
    const { result } = renderHook(() => useBusinessActions())
    await result.current.remove(biz, 0)
    expect(toast.success).toHaveBeenCalledWith('Business deleted')
    expect(toast.info).not.toHaveBeenCalled()
  })
})

describe('demo service sweep (R-W3-4)', () => {
  it('mock deleteBusiness and deleteProduct resolve { removedFiles: 0, failedFiles: 0 }', async () => {
    await service.resetDemoData()
    const products = await service.getProducts({ businessId: 'biz_oak' })
    if (!products.ok || !products.data[0]) throw new Error('no demo product')
    expect(await service.deleteProduct(products.data[0].id)).toEqual({ ok: true, data: { removedFiles: 0, failedFiles: 0 } })
    expect(await service.deleteBusiness('biz_oak')).toEqual({ ok: true, data: { removedFiles: 0, failedFiles: 0 } })
  })
})
