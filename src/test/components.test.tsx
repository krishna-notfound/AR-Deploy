import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { ConfirmProvider, useConfirm } from '@/components/ui/ConfirmProvider'
import { LanguageProvider, useI18n } from '@/i18n/LanguageProvider'
import { LanguageSwitcher } from '@/features/public/PublicShell'
import { service } from '@/services'
import { fail, ok } from '@/services/catalogService'
import { useServiceQuery } from '@/services/hooks'

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  await service.resetDemoData()
})

describe('ConfirmDialog', () => {
  function Harness({ onResult }: { onResult: (v: boolean) => void }) {
    const confirm = useConfirm()
    return (
      <button type="button" onClick={async () => onResult(await confirm({ title: 'Delete it?', confirmLabel: 'Delete', destructive: true }))}>
        open
      </button>
    )
  }

  it('resolves true on confirm and false on cancel / Escape', async () => {
    const user = userEvent.setup()
    const results: boolean[] = []
    render(
      <ConfirmProvider>
        <Harness onResult={(v) => results.push(v)} />
      </ConfirmProvider>,
    )
    await user.click(screen.getByText('open'))
    expect(screen.getByRole('dialog', { name: 'Delete it?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Delete' }))
    await user.click(screen.getByText('open'))
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    await user.click(screen.getByText('open'))
    await user.keyboard('{Escape}')
    await waitFor(() => expect(results).toEqual([true, false, false]))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})

describe('useServiceQuery', () => {
  function ProductCount() {
    const q = useServiceQuery(() => service.getProductsByBusiness('biz_nord'), [])
    return <p>{q.status === 'success' ? `count:${q.data.length}` : 'loading'}</p>
  }

  it('refetches after a mutation changes the store', async () => {
    render(<ProductCount />)
    await screen.findByText('count:7')
    await act(async () => {
      await service.duplicateProduct('prd_bed')
    })
    await screen.findByText('count:8')
  })

  // Regression (QA #1): the catalogue resolved a placeholder [] before its business loaded; when the real
  // query then failed, the old [] survived and the page said "No products yet" instead of showing an error.
  it('never carries an earlier result into a new query (deps change)', async () => {
    function Products({ businessId }: { businessId: string | null }) {
      const q = useServiceQuery<string[]>(
        async () => (businessId ? fail<string[]>('UNKNOWN', 'offline') : ok<string[]>([])),
        [businessId],
      )
      const view = q.status === 'error' && !q.data ? 'error' : q.data?.length === 0 ? 'empty' : q.status
      return <p>{view}</p>
    }
    const { rerender } = render(<Products businessId={null} />)
    await screen.findByText('empty')
    rerender(<Products businessId="biz_nord" />)
    await screen.findByText('error')
    expect(screen.queryByText('empty')).toBeNull()
  })
})

describe('LanguageSwitcher', () => {
  function Label() {
    const { t } = useI18n()
    return <p>{t('ar.button')}</p>
  }

  it('switches between English and Portuguese and persists for the session', async () => {
    const user = userEvent.setup()
    render(
      <LanguageProvider>
        <LanguageSwitcher />
        <Label />
      </LanguageProvider>,
    )
    expect(screen.getByText('View in AR')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: 'PT' }))
    expect(screen.getByText('Ver em AR')).toBeInTheDocument()
    expect(sessionStorage.getItem('arfurn:lang')).toBe('pt')
    expect(document.documentElement.lang).toBe('pt-PT')
  })
})

describe('useRefreshWhenStale', () => {
  it('refetches on return to the page only once the data is older than the limit', async () => {
    const { renderHook } = await import('@testing-library/react')
    const { useRefreshWhenStale } = await import('@/services/hooks')
    const { vi } = await import('vitest')
    vi.useFakeTimers({ now: 0, toFake: ['Date'] })
    const refetch = vi.fn()
    renderHook(() => useRefreshWhenStale(refetch, 60_000, 'data-v1'))
    window.dispatchEvent(new Event('focus'))
    expect(refetch).not.toHaveBeenCalled() // fresh
    vi.setSystemTime(61_000)
    document.dispatchEvent(new Event('visibilitychange'))
    expect(refetch).toHaveBeenCalledOnce() // stale: signed media URLs would be close to expiry
    vi.useRealTimers()
  })
})

describe('product filters in the URL', () => {
  it('keeps every filter when two updates land before a re-render (search + status)', async () => {
    const { MemoryRouter, useLocation } = await import('react-router')
    const { useProductFilterParams } = await import('@/features/products/ProductFilters')
    let update!: ReturnType<typeof useProductFilterParams>[1]
    let search = ''
    function Harness() {
      update = useProductFilterParams()[1]
      search = useLocation().search
      return null
    }
    render(
      <MemoryRouter initialEntries={['/admin/products']}>
        <Harness />
      </MemoryRouter>,
    )
    act(() => {
      update({ q: 'Aurora' }) // the debounced search write...
      update({ status: 'published' }) // ...and a filter change from the same render
    })
    const params = new URLSearchParams(search)
    expect(params.get('q')).toBe('Aurora')
    expect(params.get('status')).toBe('published')
  })
})
