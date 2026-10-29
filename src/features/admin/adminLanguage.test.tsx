import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_KEY, AccountProvider } from '@/auth/AccountProvider'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { LANG_KEY, LanguageProvider } from '@/i18n/LanguageProvider'
import { service } from '@/services'
import { resetMockAccount } from '@/services/mock/mockAccount'
import AdminOverviewPage from './AdminOverviewPage'
import ApplicationsPage from './ApplicationsPage'
import BusinessesListPage from './BusinessesListPage'

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' }))
  resetMockAccount()
  await service.resetDemoData()
})

afterEach(() => {
  vi.restoreAllMocks()
  localStorage.clear()
})

function renderPt(path: string, element: React.ReactElement) {
  localStorage.setItem(LANG_KEY, 'pt')
  const router = createMemoryRouter([{ path, element }], { initialEntries: [path] })
  return render(
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
}

describe('admin pages in Portuguese (pt-PT)', () => {
  it('Businesses: title, status filter, closure button and columns', async () => {
    renderPt('/admin/businesses', <BusinessesListPage />)
    expect(await screen.findByRole('heading', { name: 'Empresas' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /Encerramento pedido/ })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Filtrar por estado' })).toBeInTheDocument()
    expect((await screen.findAllByRole('columnheader', { name: /Última atualização/ })).length).toBeGreaterThan(0)
    expect(screen.queryByText('Last updated')).toBeNull()
  })

  it('Applications: title, tabs and empty state', async () => {
    renderPt('/admin/applications', <ApplicationsPage />)
    expect(await screen.findByRole('heading', { name: 'Candidaturas' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Em revisão/ })).toBeInTheDocument()
    expect(await screen.findByText('Ainda não há candidaturas')).toBeInTheDocument()
  })

  it('Overview: title and primary action', async () => {
    renderPt('/admin', <AdminOverviewPage />)
    expect(await screen.findByRole('heading', { name: 'Produtos mais vistos' })).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Criar empresa' })).toBeInTheDocument()
  })
})
