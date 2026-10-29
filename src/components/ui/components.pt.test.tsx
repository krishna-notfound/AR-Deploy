// The shared components speak the person's language (ADR-0044): rendered in Portuguese, their built-in words are Portuguese.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it } from 'vitest'
import { ACCOUNT_KEY, AccountProvider, useAccount } from '@/auth/AccountProvider'
import { ActivityTrend } from '@/components/charts/ActivityTrend'
import { CatalogStatusNotice } from '@/components/layout/DashboardShell'
import { LANG_KEY, LanguageProvider } from '@/i18n/LanguageProvider'
import { service } from '@/services'
import { resetMockAccount } from '@/services/mock/mockAccount'
import { ConfirmProvider, useConfirm } from './ConfirmProvider'
import { Pagination } from './Pagination'
import { SearchInput } from './SearchInput'
import { EmptyState, ErrorState } from './States'
import { StatGroup } from './StatGroup'
import { ToastProvider, useToast } from './ToastProvider'
import { AssetStatusBadge, ProductStatusBadge, SampleDataTag } from './Badge'

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem(LANG_KEY, 'pt')
})

const inPt = (ui: React.ReactNode) => render(<LanguageProvider>{ui}</LanguageProvider>)

function AskConfirm() {
  const confirm = useConfirm()
  return (
    <button type="button" onClick={() => void confirm({ title: 'Remover?', confirmLabel: 'Remover' })}>
      pedir
    </button>
  )
}

function RaiseToast() {
  const toast = useToast()
  return (
    <button type="button" onClick={() => toast.success('Feito')}>
      avisar
    </button>
  )
}

describe('shared components in Portuguese', () => {
  it('the confirm dialog cancels with the Portuguese default', async () => {
    inPt(
      <ConfirmProvider>
        <AskConfirm />
      </ConfirmProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'pedir' }))
    expect(await screen.findByRole('button', { name: 'Cancelar' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Fechar janela' })).toBeInTheDocument()
  })

  it('a toast can be dismissed with a Portuguese label', async () => {
    inPt(
      <ToastProvider>
        <RaiseToast />
      </ToastProvider>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'avisar' }))
    expect(await screen.findByRole('button', { name: 'Fechar notificação' })).toBeInTheDocument()
  })

  it('the error state offers "Tentar novamente"', () => {
    inPt(<ErrorState message="x" onRetry={() => {}} />)
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument()
    expect(screen.queryByText('Try again')).not.toBeInTheDocument()
  })

  it('pagination speaks Portuguese and formats numbers with the pt-PT separators', () => {
    inPt(<Pagination page={2} pageSize={10} total={1234} onPage={() => {}} />)
    expect(screen.getByRole('navigation', { name: 'Paginação' })).toBeInTheDocument()
    expect(screen.getByText(/A mostrar/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Página seguinte' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Página 3' })).toBeInTheDocument()
    expect(screen.getByText(/de/)).toHaveTextContent(/1\s?234/)
  })

  it('the search box has a Portuguese placeholder and clear button', () => {
    inPt(<SearchInput value="sofá" onChange={() => {}} label="Pesquisar" />)
    expect(screen.getByRole('button', { name: 'Limpar pesquisa' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Pesquisar' })).toBeInTheDocument()
  })

  it('status badges and the sample-data tag are translated', () => {
    inPt(
      <>
        <ProductStatusBadge status="draft" />
        <AssetStatusBadge status="session-only" />
        <SampleDataTag />
      </>,
    )
    expect(screen.getByText('Rascunho')).toBeInTheDocument()
    expect(screen.getByText('Apenas nesta sessão')).toBeInTheDocument()
    expect(screen.getByText('Dados de exemplo')).toBeInTheDocument()
  })

  it('stat groups and the empty activity chart are translated', () => {
    inPt(
      <>
        <StatGroup stats={[{ label: 'Produtos', value: '3' }]} />
        <ActivityTrend data={[]} />
        <EmptyState title="Nada aqui" />
      </>,
    )
    expect(screen.getByRole('region', { name: 'Números principais' })).toBeInTheDocument()
    expect(screen.getByText('Sem atividade nos últimos 30 dias')).toBeInTheDocument()
  })

  it('the catalog status notice is Portuguese', async () => {
    resetMockAccount()
    await service.resetDemoData()
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'business_admin', businessId: 'biz_oak' }))
    await service.setBusinessStatus('biz_oak', 'inactive')
    function Loaded() {
      const { business } = useAccount()
      return business ? <p>carregado</p> : null
    }
    inPt(
      <AccountProvider>
        <MemoryRouter>
          <CatalogStatusNotice />
          <Loaded />
        </MemoryRouter>
      </AccountProvider>,
    )
    expect(await screen.findByText('O seu catálogo está em pausa.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pré-visualizar o seu catálogo' })).toBeInTheDocument()
  })
})
