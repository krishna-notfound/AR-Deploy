// ADR-0055: the public catalogue's filter chips and category names come from the managed list.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { LANG_KEY } from '@/i18n/LanguageProvider'
import { service } from '@/services'
import { resetListsCache } from '@/services/listsHooks'
import { mockListsService as lists } from '@/services/mock/mockLists'
import { store } from '@/services/mock/store'

function openApp(url: string) {
  window.history.replaceState(null, '', url)
  return render(<App />)
}

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin', platformRole: 'owner' }))
  resetListsCache()
  await service.resetDemoData()
})
afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

/** Published Nordhaus products, so a test knows what the catalogue shows. */
const published = () => store.get().products.filter((p) => p.businessId === 'biz_nord' && p.status === 'published')
const chips = async () => within(await screen.findByRole('group', { name: /^Categor/ })).getAllByRole('button').map((b) => b.textContent)

describe('catalogue categories', () => {
  it('shows a chip per category the catalogue has products in, named from the list (singular names)', async () => {
    openApp('/catalog/nordhaus')
    await screen.findByText(/^\d+ products$/)
    const have = new Set(published().map((p) => p.category))
    const names = await chips()
    expect(names[0]).toBe('All')
    expect(names.length - 1).toBe(have.size)
    expect(names).not.toContain('Sofas')
  })

  it('shows a category added in the admin console with its own name, and filters by it', async () => {
    const user = userEvent.setup()
    const cat = await lists.saveCategory({ labelEn: 'Garden pieces', labelPt: 'Peças de jardim' })
    if (!cat.ok) throw new Error('save failed')
    const mine = published()[0]!
    store.update((db) => void (db.products.find((p) => p.id === mine.id)!.category = cat.data.slug))
    openApp('/catalog/nordhaus')
    await screen.findByText(/^\d+ products$/)
    await waitFor(async () => expect(await chips()).toContain('Garden pieces'))
    await user.click(screen.getByRole('button', { name: 'Garden pieces' }))
    await waitFor(() => expect(screen.getAllByRole('heading', { level: 2 }).filter((h) => h.textContent !== 'The pieces')).toHaveLength(1))
    expect(screen.getByRole('heading', { level: 2, name: mine.name.en })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Garden pieces' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('a hidden category has no chip; one that was deleted in the address is ignored', async () => {
    const [first] = published()
    await lists.saveCategory({ slug: first!.category, labelEn: 'X', labelPt: 'X', active: false })
    openApp('/catalog/nordhaus?category=sofa-that-is-gone')
    await screen.findByText(/^\d+ products$/)
    const names = await chips()
    expect(names).not.toContain('X')
    // The unknown category in the address does not empty the page.
    expect(screen.queryByText('No matches')).toBeNull()
    expect(screen.getAllByRole('heading', { level: 2 }).length).toBeGreaterThan(0)
  })

  it('names categories in Portuguese from the list', async () => {
    localStorage.setItem(LANG_KEY, 'pt')
    const [first] = published()
    await lists.saveCategory({ slug: first!.category, labelEn: 'Piece', labelPt: 'Peça de sala' })
    openApp('/catalog/nordhaus')
    await waitFor(async () => expect(await chips()).toContain('Peça de sala'))
  })
})
