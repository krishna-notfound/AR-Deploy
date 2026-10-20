import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter, useParams } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import type { Business } from '@/domain/types'
import { service } from '@/services'
import { ok } from '@/services/catalogService'
import { useServiceQuery } from '@/services/hooks'
import { ProductEditorForm } from './ProductEditorForm'

let business: Business

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  await service.resetDemoData()
  const res = await service.getBusinessById('biz_nord')
  if (!res.ok) throw new Error('seed business missing')
  business = res.data
})

afterEach(() => {
  vi.restoreAllMocks()
})

const crumbs = [{ label: 'My Products', to: '/dashboard/products' }]

/** Stand-in for ProductEditorPage's edit route (that page needs the account provider). */
function EditRoute() {
  const { productId } = useParams()
  const q = useServiceQuery(() => service.getProductById(productId!), [productId])
  if (!q.data) return <p>loading</p>
  return <ProductEditorForm key={q.data.id} scope="business" product={q.data} currentStatus={q.data.status} businesses={[business]} fixedBusiness={business} breadcrumbs={crumbs} />
}

function renderNew() {
  const router = createMemoryRouter(
    [
      { path: '/dashboard/products/new', element: <ProductEditorForm scope="business" product={null} currentStatus="draft" businesses={[business]} fixedBusiness={business} breadcrumbs={crumbs} /> },
      { path: '/dashboard/products/:productId/edit', element: <EditRoute /> },
    ],
    { initialEntries: ['/dashboard/products/new'] },
  )
  render(
    <ToastProvider>
      <ConfirmProvider>
        <RouterProvider router={router} />
      </ConfirmProvider>
    </ToastProvider>,
  )
  return router
}

const summary = () => screen.getByText(/to continue$/).closest('[role="alert"]') as HTMLElement
const DIM_MSG = 'Dimensions must be greater than zero to publish.'

/** uploadAsset calls that stay pending until the test resolves them, in any order. */
function deferUploads() {
  const pending = new Map<string, () => void>()
  vi.spyOn(service, 'uploadAsset').mockImplementation(
    ({ file, kind }) =>
      new Promise((resolve) => {
        pending.set(file.name, () => resolve(ok({ url: `blob:test/${file.name}`, status: kind === 'image' ? 'valid' : 'session-only' })))
      }),
  )
  const resolveUpload = async (name: string) => {
    await waitFor(() => expect(pending.has(name)).toBe(true))
    await act(async () => pending.get(name)!())
  }
  return resolveUpload
}

describe('product editor: publish rules', () => {
  it('lists every missing requirement in one pass, each message once (UX-12)', async () => {
    const user = userEvent.setup()
    renderNew()
    await user.click(screen.getByRole('button', { name: 'Publish' }))
    const box = summary()
    expect(within(box).getByText('Fix these 5 issues to continue')).toBeInTheDocument()
    expect(within(box).getByText('Product name (English) is required.')).toBeInTheDocument()
    expect(within(box).getByText('Set a price greater than zero before publishing.')).toBeInTheDocument()
    expect(within(box).getByText('Add at least one product image before publishing.')).toBeInTheDocument()
    expect(within(box).getAllByText(DIM_MSG)).toHaveLength(1)
    expect(await screen.findByText('Fix the 5 issues listed at the top of the form.')).toBeInTheDocument()
  })

  it('keeps the publish errors after a new draft is saved and opened for editing (COR-12)', async () => {
    const user = userEvent.setup()
    const router = renderNew()
    await user.type(screen.getByRole('textbox', { name: /^Product name/ }), 'Test sofa')
    await user.click(screen.getByRole('button', { name: 'Publish' }))
    await waitFor(() => expect(router.state.location.pathname).toMatch(/\/edit$/))
    await screen.findByText('Fix these 3 issues to continue')
    expect(within(summary()).getByText('Add at least one product image before publishing.')).toBeInTheDocument()
    expect(within(summary()).getAllByText(DIM_MSG)).toHaveLength(1)
  })

  it('clears a field error as soon as the value is valid (UX-02)', async () => {
    const user = userEvent.setup()
    renderNew()
    await user.click(screen.getByRole('button', { name: 'Publish' }))
    expect(screen.getAllByText(DIM_MSG).length).toBeGreaterThan(0)
    await user.type(screen.getByLabelText('Width'), '83')
    await user.type(screen.getByLabelText('Height'), '69')
    expect(screen.getAllByText(DIM_MSG).length).toBeGreaterThan(0)
    await user.type(screen.getByLabelText('Depth'), '57')
    expect(screen.queryByText(DIM_MSG)).not.toBeInTheDocument()
    expect(within(summary()).getByText('Fix these 4 issues to continue')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Price'), '10')
    expect(within(summary()).getByText('Fix these 3 issues to continue')).toBeInTheDocument()
  })
})

describe('product editor: uploads and units', () => {
  it('keeps both models when a slow GLB finishes after a fast USDZ (COR-13)', async () => {
    const user = userEvent.setup()
    const resolveUpload = deferUploads()
    renderNew()
    await user.upload(screen.getByLabelText('Upload .glb file'), new File([new Uint8Array([0x67, 0x6c, 0x54, 0x46])], 'chair.glb'))
    await user.upload(screen.getByLabelText('Upload .usdz file'), new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'chair.usdz'))
    await resolveUpload('chair.usdz')
    await resolveUpload('chair.glb')
    expect(await screen.findByText('chair.glb')).toBeInTheDocument()
    expect(screen.getByText('chair.usdz')).toBeInTheDocument()
  })

  it('keeps gallery and additional photos uploaded at the same time (COR-13)', async () => {
    const user = userEvent.setup()
    const resolveUpload = deferUploads()
    renderNew()
    await user.upload(screen.getByLabelText('Upload product images'), new File(['a'], 'front.png', { type: 'image/png' }))
    await user.upload(screen.getByLabelText('Upload additional photos'), new File(['b'], 'detail.png', { type: 'image/png' }))
    expect(screen.getByLabelText('Upload product images')).toBeDisabled()
    await resolveUpload('detail.png')
    await resolveUpload('front.png')
    expect(await screen.findByRole('img', { name: 'front' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'detail' })).toBeInTheDocument()
  })

  it('asks before switching units and converts on request (UX-13)', async () => {
    const user = userEvent.setup()
    renderNew()
    await user.type(screen.getByLabelText('Width'), '83')
    await user.click(screen.getByRole('radio', { name: 'Inches' }))
    const dialog = await screen.findByRole('dialog', { name: 'Switch to inches?' })
    await user.click(within(dialog).getByRole('button', { name: /^Convert to 32.7/ }))
    expect(screen.getByLabelText('Width')).toHaveValue('32.7')
    expect(screen.getByRole('radio', { name: 'Inches' })).toHaveAttribute('aria-checked', 'true')
  })
})
