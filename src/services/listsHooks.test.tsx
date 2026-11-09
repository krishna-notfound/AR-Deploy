// ADR-0055: the shared cache behind useCategories / useCategoryLabel / useCurrencies, and its fallbacks.
import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LANG_KEY, LanguageProvider } from '@/i18n/LanguageProvider'
import { fail } from './catalogService'
import { lists } from './listsInstance'
import { reloadLists, resetListsCache, useCategories, useCategoryLabel, useCurrencies } from './listsHooks'
import { mockCatalogService } from './mock/mockCatalogService'
import { mockListsService } from './mock/mockLists'

const wrapper = ({ children }: { children: ReactNode }) => <LanguageProvider>{children}</LanguageProvider>

beforeEach(async () => {
  localStorage.clear()
  localStorage.setItem(ACCOUNT, JSON.stringify({ role: 'super_admin', platformRole: 'owner' }))
  resetListsCache()
  await mockCatalogService.resetDemoData()
})
afterEach(() => vi.restoreAllMocks())
const ACCOUNT = 'arfurn:account'

describe('while loading', () => {
  it('stands in with the seven categories and Other, and EUR, BRL, USD, so a picker is never empty', () => {
    const { result } = renderHook(() => ({ c: useCategories(), cur: useCurrencies() }), { wrapper })
    expect(result.current.c.loaded).toBe(false)
    expect(result.current.c.categories.map((x) => x.slug)).toHaveLength(8)
    expect(result.current.cur.offered()).toEqual(['EUR', 'BRL', 'USD'])
  })

  it('names a built-in category from the dictionary, a custom one readably', () => {
    const { result } = renderHook(() => useCategoryLabel(), { wrapper })
    expect(result.current('sofa')).toBe('Sofa')
    expect(result.current('other')).toBe('Other')
    expect(result.current('garden-lamp')).toBe('Garden lamp')
  })
})

describe('once loaded', () => {
  it('serves the list and names categories in the language', async () => {
    await mockListsService.saveCategory({ labelEn: 'Rugs', labelPt: 'Tapetes' })
    localStorage.setItem(LANG_KEY, 'pt')
    const { result } = renderHook(() => ({ c: useCategories(), label: useCategoryLabel() }), { wrapper })
    await waitFor(() => expect(result.current.c.loaded).toBe(true))
    expect(result.current.label('rugs')).toBe('Tapetes')
    expect(result.current.label('sofa')).toBe('Sofá')
    expect(result.current.c.categories.at(-1)!.slug).toBe('other')
  })

  it('refreshes after a change', async () => {
    const { result } = renderHook(() => useCategories(), { wrapper })
    await waitFor(() => expect(result.current.loaded).toBe(true))
    await mockListsService.saveCategory({ labelEn: 'Rugs', labelPt: 'Tapetes' })
    await waitFor(() => expect(result.current.categories.some((c) => c.slug === 'rugs')).toBe(true))
    await act(async () => {
      await lists.deleteCategory('rugs')
      await reloadLists()
    })
    expect(result.current.categories.some((c) => c.slug === 'rugs')).toBe(false)
  })

  it('a hidden category leaves `active` and `offered`, except the one asked to be kept', async () => {
    await mockListsService.saveCategory({ slug: 'bed', labelEn: 'Bed', labelPt: 'Cama', active: false })
    const { result } = renderHook(() => useCategories(), { wrapper })
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.active.some((c) => c.slug === 'bed')).toBe(false)
    expect(result.current.offered().some((c) => c.slug === 'bed')).toBe(false)
    expect(result.current.offered('bed').some((c) => c.slug === 'bed')).toBe(true)
  })

  it('offers enabled currencies, keeping the one a row has', async () => {
    await mockListsService.setCurrencyEnabled('GBP', true)
    await mockListsService.setCurrencyEnabled('BRL', false)
    const { result } = renderHook(() => useCurrencies(), { wrapper })
    await waitFor(() => expect(result.current.offered()).toContain('GBP'))
    expect(result.current.offered()).not.toContain('BRL')
    expect(result.current.offered('BRL')).toContain('BRL')
  })
})

describe('when the read fails', () => {
  it('keeps the fallback, reports the error, and never shows demo data as if it were the list', async () => {
    vi.spyOn(lists, 'getCategories').mockResolvedValue(fail('UNKNOWN', 'offline'))
    const { result } = renderHook(() => useCategories(), { wrapper })
    await waitFor(() => expect(result.current.error).not.toBeNull())
    expect(result.current.loaded).toBe(false)
    expect(result.current.categories).toHaveLength(8)
  })
})
