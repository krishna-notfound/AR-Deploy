import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ToastProvider } from '@/components/ui/ToastProvider'
import type { BusinessCatalog } from '@/domain/types'
import { LANG_KEY, LanguageProvider } from '@/i18n/LanguageProvider'
import { createSeed } from '@/services/mock/seed'
import { CatalogQrPanel } from './CatalogQrPanel'

const business = createSeed().businesses[0]!
const catalog: BusinessCatalog = {
  business: { ...business, status: 'draft' },
  catalogUrl: 'https://example.test/c/demo',
  localPath: '/c/demo',
  publishedProductCount: 2,
  totalProductCount: 5,
}

function renderPanel() {
  return render(
    <LanguageProvider>
      <ToastProvider>
        <MemoryRouter>
          <CatalogQrPanel catalog={catalog} productsLink="/admin/products" />
        </MemoryRouter>
      </ToastProvider>
    </LanguageProvider>,
  )
}

describe('CatalogQrPanel language', () => {
  beforeEach(() => localStorage.clear())
  afterEach(() => localStorage.clear())

  it('speaks English by default', () => {
    renderPanel()
    expect(screen.getByText('Catalog URL')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Preview catalog (not public yet)' })).toBeInTheDocument()
  })

  it('renders the labels, notice and buttons in pt-PT', () => {
    localStorage.setItem(LANG_KEY, 'pt')
    renderPanel()
    expect(screen.getByText('URL do catálogo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pré-visualizar catálogo (ainda não é público)' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Transferir PNG' })).toBeInTheDocument()
    expect(screen.getByText(/Este catálogo ainda não é público/)).toBeInTheDocument()
    expect(screen.queryByText('Catalog URL')).toBeNull()
  })
})
