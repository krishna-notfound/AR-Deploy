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
  return (
    <div data-testid="edit-route">
      <ProductEditorForm key={q.data.id} scope="business" product={q.data} currentStatus={q.data.status} businesses={[business]} fixedBusiness={business} breadcrumbs={crumbs} />
    </div>
  )
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

/** Smallest well-formed files the upload check accepts: a glTF 2.0 binary and a stored zip led by a .usdc scene. */
function glbFile(name: string): File {
  const json = new TextEncoder().encode(JSON.stringify({ asset: { version: '2.0' } }).padEnd(28, ' '))
  const v = new DataView(new ArrayBuffer(20 + json.length))
  v.setUint32(0, 0x46546c67, true)
  v.setUint32(4, 2, true)
  v.setUint32(8, 20 + json.length, true)
  v.setUint32(12, json.length, true)
  v.setUint32(16, 0x4e4f534a, true)
  new Uint8Array(v.buffer, 20).set(json)
  return new File([v.buffer], name)
}
function usdzFile(name: string): File {
  const entry = new TextEncoder().encode('chair.usdc')
  const bytes = new Uint8Array(30 + entry.length + 16 + 22)
  const v = new DataView(bytes.buffer)
  v.setUint32(0, 0x04034b50, true)
  v.setUint32(18, 16, true)
  v.setUint32(22, 16, true)
  v.setUint16(26, entry.length, true)
  bytes.set(entry, 30)
  v.setUint32(30 + entry.length + 16, 0x06054b50, true)
  return new File([bytes], name)
}
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
    // Wait for the remounted edit-page editor, not the new-product one it replaces (the draft loads in between).
    await within(await screen.findByTestId('edit-route', {}, { timeout: 10_000 })).findByText('Fix these 3 issues to continue')
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

describe('product editor: section index, language control and publish bar (BRIEF section 6)', () => {
  const publishBar = (root: HTMLElement = document.body) => within(root).getByRole('region', { name: 'Save and publish' })

  it('the publish bar says "Not saved yet", then "Unsaved changes" after an edit and "All changes saved" after saving', async () => {
    const user = userEvent.setup()
    renderNew()
    expect(within(publishBar()).getByText('Not saved yet')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: /^Product name/ }), 'Test sofa')
    expect(within(publishBar()).getByText('Unsaved changes')).toBeInTheDocument()
    await user.click(within(publishBar()).getByRole('button', { name: 'Save draft' }))
    const edit = await screen.findByTestId('edit-route', {}, { timeout: 10_000 })
    expect(await within(publishBar(edit)).findByText('All changes saved')).toBeInTheDocument()
    expect(within(publishBar(edit)).getByRole('button', { name: 'Preview' })).toBeInTheDocument()
    expect(within(publishBar(edit)).getByRole('button', { name: 'Publish' })).toBeInTheDocument()
  })

  it('marks the index item of a section with errors, and only those', async () => {
    const user = userEvent.setup()
    renderNew()
    const index = screen.getByRole('navigation', { name: 'Editor sections' })
    expect(within(index).getByRole('link', { name: 'Basic information' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Publish' }))
    expect(within(index).getByRole('link', { name: 'Basic information (has errors)' })).toHaveClass('text-danger')
    expect(within(index).getByRole('link', { name: 'Images (has errors)' })).toBeInTheDocument()
    expect(within(index).getByRole('link', { name: 'Dimensions & specs (has errors)' })).toBeInTheDocument()
    expect(within(index).getByRole('link', { name: 'Call to action' })).not.toHaveClass('text-danger')
    // The COR-12 summary text is unchanged.
    expect(within(summary()).getByText('Fix these 5 issues to continue')).toBeInTheDocument()
  })

  it('the EN/PT switch is a group named after its field, with two toggle buttons and a "PT ·" marker', async () => {
    const user = userEvent.setup()
    renderNew()
    const group = screen.getByRole('group', { name: 'Product name language' })
    const buttons = within(group).getAllByRole('button')
    expect(buttons).toHaveLength(2)
    expect(within(group).getByRole('button', { name: 'EN' })).toHaveAttribute('aria-pressed', 'true')
    await user.type(screen.getByRole('textbox', { name: /^Product name/ }), 'Sofa')
    const pt = within(group).getByRole('button', { name: /^PT/ })
    expect(pt).toHaveTextContent('PT ·')
    await user.click(pt)
    expect(pt).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByText('If left empty, customers see the English text.')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: /^Product name/ }), 'Sofá')
    expect(pt).toHaveTextContent(/^PT$/)
  })
})

describe('product editor: uploads and units', () => {
  it('keeps both models when a slow GLB finishes after a fast USDZ (COR-13)', async () => {
    const user = userEvent.setup()
    const resolveUpload = deferUploads()
    renderNew()
    await user.upload(screen.getByLabelText('Upload .glb file'), glbFile('chair.glb'))
    await user.upload(screen.getByLabelText('Upload .usdz file'), usdzFile('chair.usdz'))
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

  it('converting back to the original unit restores the exact numbers (AR-10)', async () => {
    const user = userEvent.setup()
    renderNew()
    await user.type(screen.getByLabelText('Width'), '83')
    await user.click(screen.getByRole('radio', { name: 'Inches' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Switch to inches?' })).getByRole('button', { name: /^Convert to/ }))
    await user.click(screen.getByRole('radio', { name: 'Centimetres' }))
    await user.click(within(await screen.findByRole('dialog', { name: 'Switch to centimetres?' })).getByRole('button', { name: /^Convert to/ }))
    expect(screen.getByLabelText('Width')).toHaveValue('83')
  })
})

describe('product editor: per-variant photos and 3D', () => {
  it('uploads a GLB for one option with the shared model slots (upload only) and reports it per option', async () => {
    const user = userEvent.setup()
    renderNew()
    await user.click(screen.getByRole('button', { name: 'Add colour or option' }))
    await user.type(screen.getByLabelText('Option name (English)'), 'Walnut')
    const toggle = screen.getByRole('button', { name: /Photos and 3D for Walnut/ })
    expect(toggle).toHaveTextContent('uses the product’s photos and model')
    await user.click(toggle)
    const panel = document.getElementById(toggle.getAttribute('aria-controls')!)!
    expect(within(panel).getByText('No 3D model for this option')).toBeInTheDocument()
    expect(within(panel).queryByPlaceholderText(/paste a/)).toBeNull() // variant files are owner uploads only
    expect(within(panel).getByText(/customers who pick this option see the product’s photos/)).toBeInTheDocument()

    const uploads = screen.getAllByLabelText('Upload .glb file')
    expect(uploads).toHaveLength(2) // the product's slot and this option's slot
    await user.upload(within(panel).getByLabelText('Upload .glb file'), glbFile('walnut.glb'))
    expect(await within(panel).findByText('walnut.glb')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '1 of 1 option have their own 3D model' })).toBeInTheDocument()
    expect(toggle).toHaveTextContent('own GLB')
    // The product's own model slot is untouched.
    expect(screen.getAllByText('No GLB file yet.')).toHaveLength(1)
  })

  it('rejects a renamed file that only starts with the GLB magic bytes (AR-03)', async () => {
    const user = userEvent.setup()
    renderNew()
    await user.upload(screen.getByLabelText('Upload .glb file'), new File([new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0])], 'stub.glb'))
    expect(await screen.findByText(/stub\.glb does not look like a valid GLB file/)).toBeInTheDocument()
  })
})
