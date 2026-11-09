// ADR-0055: the admin console's Categories and Currencies screens, on the demo service (the same rules as the database).
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { ACCOUNT_KEY, AccountProvider } from '@/auth/AccountProvider'
import { RequirePermission } from '@/auth/usePermission'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { LANG_KEY, LanguageProvider } from '@/i18n/LanguageProvider'
import { service } from '@/services'
import { resetListsCache } from '@/services/listsHooks'
import { resetMockAccount } from '@/services/mock/mockAccount'
import { mockListsService as lists } from '@/services/mock/mockLists'
import { store } from '@/services/mock/store'
import CategoriesPage from './CategoriesPage'
import CurrenciesPage from './CurrenciesPage'
import ListsLayout from './ListsLayout'

const asStaff = (platformRole: 'owner' | 'admin' | 'team') => localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole }))

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  asStaff('admin')
  resetMockAccount()
  resetListsCache()
  await service.resetDemoData()
})

function renderLists(path = '/admin/lists/categories') {
  const router = createMemoryRouter(
    [
      {
        path: '/admin/lists',
        element: (
          <RequirePermission need="content.manage">
            <ListsLayout />
          </RequirePermission>
        ),
        children: [
          { path: 'categories', element: <CategoriesPage /> },
          { path: 'currencies', element: <CurrenciesPage /> },
        ],
      },
    ],
    { initialEntries: [path] },
  )
  render(
    <LanguageProvider>
      <AccountProvider>
        <ToastProvider>
          <ConfirmProvider>
            <RouterProvider router={router} />
          </ConfirmProvider>
        </ToastProvider>
      </AccountProvider>
    </LanguageProvider>,
  )
  return router
}

const row = async (slug: string) => {
  const list = await screen.findByRole('list', { name: 'Categories' })
  const li = list.querySelector(`[data-category="${slug}"]`)
  if (!li) throw new Error(`no row for ${slug}`)
  return within(li as HTMLElement)
}
const order = async () => {
  const list = await screen.findByRole('list', { name: 'Categories' })
  return Array.from(list.querySelectorAll('[data-category]')).map((li) => li.getAttribute('data-category'))
}

describe('Categories', () => {
  it('lists the seeded categories with both names, and Other has no delete, hide or move', async () => {
    renderLists()
    expect(await order()).toEqual(['sofa', 'chair', 'table', 'bed', 'storage', 'lighting', 'decor', 'other'])
    const sofa = await row('sofa')
    expect(sofa.getByText('Sofa')).toBeInTheDocument()
    expect(sofa.getByText('/ Sofá')).toBeInTheDocument()
    expect(sofa.getByText('Key: sofa')).toBeInTheDocument()
    const other = await row('other')
    expect(other.getByText(/Always available/)).toBeInTheDocument()
    expect(other.queryByRole('button', { name: /^Delete/ })).toBeNull()
    expect(other.queryByRole('switch')).toBeNull()
    expect(other.queryByRole('button', { name: /^Move/ })).toBeNull()
    expect(other.getByRole('button', { name: 'Edit Other' })).toBeInTheDocument()
  })

  it('adds a category: both names are required, then it shows before Other and the form clears', async () => {
    const user = userEvent.setup()
    renderLists()
    await order()
    await user.click(screen.getByRole('button', { name: 'Add category' }))
    expect(await screen.findByText('Enter the English name.')).toBeInTheDocument()
    expect(screen.getByText('Enter the Portuguese name.')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Name in English'), 'Garden furniture')
    await user.type(screen.getByLabelText('Name in Portuguese'), 'Mobiliário de jardim')
    await user.click(screen.getByRole('button', { name: 'Add category' }))
    expect(await screen.findByText('"Garden furniture" added.')).toBeInTheDocument()
    await waitFor(async () => expect((await order()).slice(-2)).toEqual(['garden-furniture', 'other']))
    expect(screen.getByLabelText('Name in English')).toHaveValue('')
  })

  it('renames in both languages', async () => {
    const user = userEvent.setup()
    renderLists()
    await user.click((await row('table')).getByRole('button', { name: 'Edit Table' }))
    const en = screen.getAllByLabelText('Name in English').at(-1)!
    await user.clear(en)
    await user.type(en, 'Dining table')
    await user.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('"Dining table" saved.')).toBeInTheDocument()
    expect((await row('table')).getByText('Dining table')).toBeInTheDocument()
  })

  it('hides and shows a category with its switch', async () => {
    const user = userEvent.setup()
    renderLists()
    const sw = (await row('bed')).getByRole('switch')
    expect(sw).toBeChecked()
    await user.click(sw)
    await waitFor(async () => expect((await row('bed')).getByRole('switch')).not.toBeChecked())
    expect((await row('bed')).getByText('Hidden')).toBeInTheDocument()
    const saved = await lists.getCategories()
    expect(saved.ok && saved.data.find((c) => c.slug === 'bed')?.active).toBe(false)
  })

  it('moves a category up and down; the first cannot go up and the last cannot go down', async () => {
    const user = userEvent.setup()
    renderLists()
    await order()
    expect((await row('sofa')).getByRole('button', { name: 'Move Sofa up' })).toBeDisabled()
    expect((await row('decor')).getByRole('button', { name: 'Move Decor down' })).toBeDisabled()
    await user.click((await row('chair')).getByRole('button', { name: 'Move Chair up' }))
    await waitFor(async () => expect((await order()).slice(0, 3)).toEqual(['chair', 'sofa', 'table']))
    await user.click((await row('chair')).getByRole('button', { name: 'Move Chair down' }))
    await waitFor(async () => expect((await order()).slice(0, 3)).toEqual(['sofa', 'chair', 'table']))
  })

  it('deleting asks first, names Other, moves the products and says how many', async () => {
    const user = userEvent.setup()
    renderLists()
    const inSofa = store.get().products.filter((p) => p.category === 'sofa').length
    await user.click((await row('sofa')).getByRole('button', { name: 'Delete Sofa' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Delete "Sofa"?')).toBeInTheDocument()
    expect(within(dialog).getByText(/move to "Other"/)).toBeInTheDocument()
    // Cancelling changes nothing.
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(await order()).toContain('sofa')
    await user.click((await row('sofa')).getByRole('button', { name: 'Delete Sofa' }))
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete category' }))
    expect(await screen.findByText(`Deleted. ${inSofa} products moved to "Other".`)).toBeInTheDocument()
    await waitFor(async () => expect(await order()).not.toContain('sofa'))
    expect(store.get().products.filter((p) => p.category === 'other')).toHaveLength(inSofa)
  })

  it('shows the screen in Portuguese', async () => {
    localStorage.setItem(LANG_KEY, 'pt')
    renderLists()
    expect(await screen.findByRole('heading', { name: 'Categorias e moedas' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Adicionar categoria' })).toBeInTheDocument()
    const sofa = await screen.findByText('/ Sofá')
    expect(sofa).toBeInTheDocument()
  })
})

describe('access', () => {
  it('Team, without content.manage, cannot open the lists', async () => {
    asStaff('team')
    resetMockAccount()
    renderLists()
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Categories & currencies' })).toBeNull())
    expect(screen.queryByRole('list', { name: 'Categories' })).toBeNull()
  })
})

describe('Currencies', () => {
  it('lists the currencies with the three on, counts them and searches by code or name', async () => {
    const user = userEvent.setup()
    renderLists('/admin/lists/currencies')
    const list = await screen.findByRole('list', { name: 'Currencies' })
    expect(screen.getByText(/3 of \d+ switched on/)).toBeInTheDocument()
    expect(within(list).getByRole('switch', { name: /EUR/ })).toBeChecked()
    expect(within(list).getByRole('switch', { name: /GBP/ })).not.toBeChecked()
    await user.type(screen.getByRole('searchbox', { name: 'Search currencies' }), 'swiss')
    await waitFor(() => expect(within(screen.getByRole('list', { name: 'Currencies' })).getAllByRole('switch')).toHaveLength(1))
    expect(within(screen.getByRole('list', { name: 'Currencies' })).getByRole('switch', { name: /CHF/ })).toBeInTheDocument()
    await user.clear(screen.getByRole('searchbox', { name: 'Search currencies' }))
    await user.type(screen.getByRole('searchbox', { name: 'Search currencies' }), 'zzzz')
    expect(await screen.findByText('No currency matches "zzzz".')).toBeInTheDocument()
  })

  it('switches a currency on and off; the count follows', async () => {
    const user = userEvent.setup()
    renderLists('/admin/lists/currencies')
    const gbp = await screen.findByRole('switch', { name: /GBP/ })
    await user.click(gbp)
    await waitFor(() => expect(screen.getByRole('switch', { name: /GBP/ })).toBeChecked())
    expect(screen.getByText(/4 of \d+ switched on/)).toBeInTheDocument()
    await user.click(screen.getByRole('switch', { name: /GBP/ }))
    await waitFor(() => expect(screen.getByRole('switch', { name: /GBP/ })).not.toBeChecked())
  })

  it('the last currency on cannot be switched off, and the screen says why', async () => {
    const user = userEvent.setup()
    await lists.setCurrencyEnabled('BRL', false)
    await lists.setCurrencyEnabled('USD', false)
    renderLists('/admin/lists/currencies')
    expect(await screen.findByText('At least one currency must stay on.')).toBeInTheDocument()
    expect(screen.getByRole('switch', { name: /EUR/ })).toBeDisabled()
    await user.click(screen.getByRole('switch', { name: /GBP/ }))
    await waitFor(() => expect(screen.getByRole('switch', { name: /EUR/ })).not.toBeDisabled())
  })
})
