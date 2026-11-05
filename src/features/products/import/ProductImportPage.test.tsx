import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_KEY, AccountProvider } from '@/auth/AccountProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { service } from '@/services'
import { fail } from '@/services/catalogService'
import { resetMockAccount } from '@/services/mock/mockAccount'
import ProductImportPage from './ProductImportPage'

const CSV = [
  'name_en,name_pt,category,price,width,height,depth',
  'Import sofa Alpha,Sofá Alfa,sofa,1299.50,210,85,95',
  'Import chair Beta,,chair,89,45,90,50',
  'Import table Gamma,Mesa Gama,table,450,,,',
].join('\n')

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  resetMockAccount()
  await service.resetDemoData()
})

afterEach(() => vi.restoreAllMocks())

function renderPage(scope: 'admin' | 'business', account: object, path: string) {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account))
  const router = createMemoryRouter([{ path, element: <ProductImportPage scope={scope} /> }], { initialEntries: [path] })
  render(
    <AccountProvider>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </AccountProvider>,
  )
  return router
}

const paste = async (text: string) => fireEvent.change(await screen.findByRole('textbox', { name: /paste the csv text/i }), { target: { value: text } })

/** Names of the business's products that came from the test file. */
async function importedNames(businessId: string) {
  const r = await service.getProductsByBusiness(businessId)
  if (!r.ok) throw new Error('products missing')
  return r.data.filter((p) => p.name.en.startsWith('Import ')).sort((a, b) => a.name.en.localeCompare(b.name.en))
}

describe('ProductImportPage (admin)', () => {
  it('creates the ready rows as drafts for the chosen business', async () => {
    const user = userEvent.setup()
    renderPage('admin', { role: 'super_admin' }, '/admin/products/import')
    const businesses = await service.getBusinesses()
    if (!businesses.ok) throw new Error('businesses missing')
    const target = businesses.data.find((b) => b.id === 'biz_nord') ?? businesses.data[0]!

    await user.selectOptions(await screen.findByRole('combobox', { name: /business/i }), target.id)
    await paste(CSV)
    expect(await screen.findByText('3 of 3 rows are ready. 0 with problems.')).toBeInTheDocument()
    const table = screen.getByRole('table', { name: /rows to import/i })
    expect(within(table).getAllByText('Ready')).toHaveLength(3)

    await user.click(screen.getByRole('button', { name: 'Create 3 drafts' }))
    expect(await screen.findByText(/3 drafts created\./)).toBeInTheDocument()

    const made = await importedNames(target.id)
    expect(made.map((p) => p.name.en)).toEqual(['Import chair Beta', 'Import sofa Alpha', 'Import table Gamma'])
    expect(made.every((p) => p.status === 'draft' && p.businessId === target.id && p.images.length === 0)).toBe(true)
    const sofa = made.find((p) => p.name.en === 'Import sofa Alpha')!
    expect(sofa).toMatchObject({ price: 129950, category: 'sofa', name: { pt: 'Sofá Alfa' }, dimensions: { width: 210, height: 85, depth: 95 } })
    // Each created draft links to its editor.
    expect(screen.getByRole('link', { name: /open in editor.*import sofa alpha/i })).toHaveAttribute('href', `/admin/products/${sofa.id}/edit`)
    // Nothing went to another business.
    for (const b of businesses.data.filter((x) => x.id !== target.id)) expect(await importedNames(b.id)).toEqual([])
  })

  it('skips a row with errors, reports it, and creates the others', async () => {
    const user = userEvent.setup()
    renderPage('admin', { role: 'super_admin' }, '/admin/products/import')
    await paste(`${CSV}\nImport broken,,spaceship,10,,,`)
    expect(await screen.findByText('3 of 4 rows are ready. 1 with problems.')).toBeInTheDocument()
    expect(screen.getByText(/Category "spaceship" is not one of/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Create 3 drafts' }))
    expect(await screen.findByText(/3 drafts created\. 1 row not created\./)).toBeInTheDocument()
    expect(screen.getByText('Row 4: Import broken')).toBeInTheDocument()
    const all = await service.getProducts()
    if (!all.ok) throw new Error('products missing')
    expect(all.data.some((p) => p.name.en === 'Import broken')).toBe(false)
    expect(all.data.filter((p) => p.name.en.startsWith('Import ')).length).toBe(3)
  })

  it('reports a row the service refuses and keeps going', async () => {
    const user = userEvent.setup()
    renderPage('admin', { role: 'super_admin' }, '/admin/products/import')
    await paste(CSV)
    const real = service.createProduct.bind(service)
    vi.spyOn(service, 'createProduct').mockImplementation((input) =>
      input.name.en === 'Import chair Beta' ? Promise.resolve(fail('CONFLICT', 'Taken.', { slug: { key: 'common.validation.product.slugTaken' } })) : real(input),
    )
    await user.click(await screen.findByRole('button', { name: 'Create 3 drafts' }))
    expect(await screen.findByText(/2 drafts created\. 1 row not created\./)).toBeInTheDocument()
    expect(screen.getByText('Row 2: Import chair Beta')).toBeInTheDocument()
    expect(screen.getByText('Another product in this catalog already uses this slug.')).toBeInTheDocument()
  })

  it('explains a file it cannot use and creates nothing', async () => {
    renderPage('admin', { role: 'super_admin' }, '/admin/products/import')
    await paste('title,kind\nA,B')
    expect(await screen.findByText('The first line must name these columns: name_en, category.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /create/i })).not.toBeInTheDocument()
  })

  it('gives each import fresh slugs: a second file with the same names is a new set of drafts', async () => {
    const user = userEvent.setup()
    renderPage('admin', { role: 'super_admin' }, '/admin/products/import')
    await paste('name_en,category\nImport twin,chair')
    await user.click(await screen.findByRole('button', { name: 'Create 1 draft' }))
    await screen.findByText(/1 draft created\./)
    await user.click(screen.getByRole('button', { name: 'Import another file' }))
    await paste('name_en,category\nImport twin,chair')
    await user.click(await screen.findByRole('button', { name: 'Create 1 draft' }))
    await screen.findByText(/1 draft created\./)
    const all = await service.getProducts()
    if (!all.ok) throw new Error('products missing')
    const twins = all.data.filter((p) => p.name.en === 'Import twin')
    expect(twins.map((p) => p.slug).sort()).toEqual(['import-twin', 'import-twin-2'])
  })

  it('stops after the row being saved when the import is cancelled', async () => {
    const user = userEvent.setup()
    renderPage('admin', { role: 'super_admin' }, '/admin/products/import')
    await paste(CSV)
    const real = service.createProduct.bind(service)
    let first = true
    vi.spyOn(service, 'createProduct').mockImplementation(async (input) => {
      const r = await real(input)
      if (first) {
        first = false
        // The person presses Cancel while the first row is being saved.
        await user.click(screen.getByRole('button', { name: 'Cancel import' }))
      }
      return r
    })
    await user.click(await screen.findByRole('button', { name: 'Create 3 drafts' }))
    expect(await screen.findByText(/The import was cancelled/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText(/1 draft created\./)).toBeInTheDocument())
  })
})

describe('ProductImportPage (business)', () => {
  it('imports into the signed-in business without a business choice', async () => {
    const user = userEvent.setup()
    renderPage('business', { role: 'business_admin', businessId: 'biz_nord' }, '/dashboard/products/import')
    await screen.findByRole('button', { name: 'Download template' })
    expect(screen.queryByRole('combobox', { name: /business/i })).not.toBeInTheDocument()
    await paste(CSV)
    await user.click(await screen.findByRole('button', { name: 'Create 3 drafts' }))
    expect(await screen.findByText(/3 drafts created\./)).toBeInTheDocument()
    expect((await importedNames('biz_nord')).map((p) => p.name.en)).toEqual(['Import chair Beta', 'Import sofa Alpha', 'Import table Gamma'])
    const others = await service.getProducts()
    if (!others.ok) throw new Error('products missing')
    expect(others.data.filter((p) => p.name.en.startsWith('Import ') && p.businessId !== 'biz_nord')).toEqual([])
    const sofa = (await importedNames('biz_nord')).find((p) => p.name.en === 'Import sofa Alpha')!
    expect(screen.getByRole('link', { name: /open in editor.*import sofa alpha/i })).toHaveAttribute('href', `/dashboard/products/${sofa.id}/edit`)
  })
})
