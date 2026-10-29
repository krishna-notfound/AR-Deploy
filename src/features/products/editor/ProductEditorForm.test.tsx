import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RouterProvider, createMemoryRouter, useParams } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { LANG_KEY, LanguageProvider } from '@/i18n/LanguageProvider'
import type { Business } from '@/domain/types'
import { service } from '@/services'
import { ok } from '@/services/catalogService'
import { useServiceQuery } from '@/services/hooks'
import { modelRequestError } from '@/services/modelRequestRules'
import { store } from '@/services/mock/store'
import { modelRequestAdminPath } from '@/lib/urls'
import { ProductEditorForm } from './ProductEditorForm'

// S4 Task 3: the request panel is Task 4's; here it only has to be mounted with the saved product. Permissions are
// all granted (as outside the app shell) unless a test denies one.
const perms = vi.hoisted(() => ({ deny: [] as string[] }))
vi.mock('./ModelRequestPanel', () => ({
  ModelRequestPanel: (p: { product?: { id: string } }) => <div data-testid="request-panel" data-product={p.product?.id ?? ''} />,
}))
vi.mock('@/auth/usePermission', async (orig) => ({
  ...(await orig<typeof import('@/auth/usePermission')>()),
  useCan: () => (need: string) => !perms.deny.includes(need),
}))

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

/** S4 R-S4-4: an owner whose business may upload its own 3D files picks "Upload your own" to get the model slots. */
const chooseUpload = (user: ReturnType<typeof userEvent.setup>) => user.click(screen.getByRole('radio', { name: 'Upload your own' }))

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

  it('announces only the save status, not the status badge', async () => {
    const user = userEvent.setup()
    renderNew()
    const live = publishBar().querySelectorAll('[aria-live]')
    expect(live).toHaveLength(1)
    expect(live[0]).toHaveTextContent(/^Not saved yet$/)
    await user.type(screen.getByRole('textbox', { name: /^Product name/ }), 'Sofa')
    expect(publishBar().querySelector('[aria-live]')).toHaveTextContent(/^Unsaved changes$/)
  })

  it('marks the clicked index item as the current location', async () => {
    const user = userEvent.setup()
    renderNew()
    const index = screen.getByRole('navigation', { name: 'Editor sections' })
    expect(within(index).getByRole('link', { name: 'Basic information' })).toHaveAttribute('aria-current', 'location')
    await user.click(within(index).getByRole('link', { name: 'Dimensions & specs' }))
    expect(within(index).getByRole('link', { name: 'Dimensions & specs' })).toHaveAttribute('aria-current', 'location')
    expect(within(index).getByRole('link', { name: 'Basic information' })).not.toHaveAttribute('aria-current')
  })

  it('marks the index item of a section with errors, and only those', async () => {
    const user = userEvent.setup()
    renderNew()
    const index = screen.getByRole('navigation', { name: 'Editor sections' })
    expect(within(index).getByRole('link', { name: 'Basic information' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Publish' }))
    expect(within(index).getByRole('link', { name: 'Basic information (has errors)' })).toBeInTheDocument()
    expect(within(index).getByRole('link', { name: 'Images (has errors)' })).toBeInTheDocument()
    expect(within(index).getByRole('link', { name: 'Dimensions & specs (has errors)' })).toBeInTheDocument()
    expect(within(index).getByRole('link', { name: 'Call to action' })).toBeInTheDocument()
    expect(within(index).getByRole('link', { name: '3D models' })).toBeInTheDocument()
    expect(within(index).queryAllByRole('link', { name: /\(has errors\)$/ })).toHaveLength(3)
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
    for (const b of buttons) expect(b).toHaveClass('focus-visible:z-10') // the focused segment's ring paints over its neighbour
    expect(screen.getByRole('navigation', { name: 'Editor sections' }).querySelector('ul')).toHaveClass('py-1') // room for the chips' focus ring
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
    await chooseUpload(user) // R-S4-4: Nordhaus may upload its own; "Request from Sanctus" is the default choice
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
    await chooseUpload(user) // R-S4-4
    await user.click(screen.getByRole('button', { name: 'Add colour or option' }))
    await user.type(screen.getAllByLabelText('Option name (English)').at(-1)!, 'Walnut')
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
    expect(screen.getByRole('heading', { name: '1 of 1 option has its own 3D model' })).toBeInTheDocument()
    expect(toggle).toHaveTextContent('own GLB')
    // The product's own model slot is untouched.
    expect(screen.getAllByText('No GLB file yet.')).toHaveLength(1)
  })

  it('rejects a renamed file that only starts with the GLB magic bytes (AR-03)', async () => {
    const user = userEvent.setup()
    renderNew()
    await chooseUpload(user) // R-S4-4
    await user.upload(screen.getByLabelText('Upload .glb file'), new File([new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0])], 'stub.glb'))
    expect(await screen.findByText(/stub\.glb does not look like a valid GLB file/)).toBeInTheDocument()
  })
})

describe('product editor header and price row at narrow widths', () => {
  async function renderEdit() {
    const list = await service.getProductsByBusiness('biz_nord')
    if (!list.ok || !list.data[0]) throw new Error('seed product missing')
    const p = list.data[0]
    const router = createMemoryRouter([{ path: '/dashboard/products/:productId/edit', element: <EditRoute /> }], { initialEntries: [`/dashboard/products/${p.id}/edit`] })
    render(
      <ToastProvider>
        <ConfirmProvider>
          <RouterProvider router={router} />
        </ConfirmProvider>
      </ToastProvider>,
    )
    await screen.findByTestId('edit-route')
    return p
  }

  it('shows Delete inline from sm and in the More menu below sm, with the same confirm', async () => {
    const user = userEvent.setup()
    const p = await renderEdit()
    const inline = screen.getByRole('button', { name: 'Delete' })
    expect(inline).toHaveClass('max-sm:hidden')
    await user.click(screen.getByRole('button', { name: 'More actions' }))
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(await screen.findByRole('dialog')).toHaveAccessibleName(expect.stringContaining(p.name.en))
  })

  it('has no More menu on a new product (nothing to delete yet)', () => {
    renderNew()
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull()
  })

  it('puts Price and Currency side by side below sm', () => {
    renderNew()
    const row = screen.getByLabelText('Price').closest('.grid')!
    expect(row.className).toContain('grid-cols-[1fr_96px]')
    expect(row.className).toContain('sm:grid-cols-[2fr_1fr_1fr]')
  })
})

describe('S4 Task 3: the 3D section by role and switch (R-S4-4, R-S4-17)', () => {
  afterEach(() => {
    perms.deny = []
  })

  async function renderEditor(scope: 'admin' | 'business', businessId: string, productId: string) {
    const b = await service.getBusinessById(businessId)
    const p = await service.getProductById(productId)
    if (!b.ok || !p.ok) throw new Error('seed missing')
    const router = createMemoryRouter(
      [
        { path: '/edit', element: <ProductEditorForm scope={scope} product={p.data} currentStatus={p.data.status} businesses={[b.data]} fixedBusiness={scope === 'business' ? b.data : undefined} breadcrumbs={crumbs} /> },
        { path: '*', element: <p data-testid="other-route" /> },
      ],
      { initialEntries: ['/edit'] },
    )
    render(
      <ToastProvider>
        <ConfirmProvider>
          <RouterProvider router={router} />
        </ConfirmProvider>
      </ToastProvider>,
    )
    return p.data
  }
  const asOwner = (businessId: string) => localStorage.setItem('arfurn:account', JSON.stringify({ role: 'business_admin', businessId }))
  const modelInputs = () => [...document.querySelectorAll<HTMLInputElement>('input[type="file"]')].filter((i) => /\.(glb|usdz)/.test(i.accept))
  const models = () => within(document.getElementById('models')!)

  it("owner + switch off: no .glb/.usdz file input anywhere (product and options), the managed files read-only, 'made by the Sanctus team' with none, and the request panel", async () => {
    const user = userEvent.setup()
    asOwner('biz_casa')
    const p = await renderEditor('business', 'biz_casa', 'prd_glam_sofa')
    expect(models().getByText('Current 3D files, managed by the Sanctus team')).toBeInTheDocument()
    expect(models().getByText(p.models.glb!.fileName)).toBeInTheDocument()
    expect(models().getByTestId('request-panel')).toHaveAttribute('data-product', p.id)
    expect(models().queryByRole('radio', { name: 'Upload your own' })).toBeNull()
    await user.click(screen.getByRole('button', { name: 'Add colour or option' }))
    await user.type(screen.getAllByLabelText('Option name (English)').at(-1)!, 'Walnut')
    await user.click(screen.getByRole('button', { name: /Photos and 3D for Walnut/ }))
    expect(screen.getAllByText('No 3D files yet.').length).toBeGreaterThan(0)
    expect(modelInputs()).toEqual([])
  })

  it("owner + switch off, product without files: '3D models for your products are made by the Sanctus team. Request one below.'", async () => {
    asOwner('biz_casa')
    await renderEditor('business', 'biz_casa', 'prd_mustard_chair')
    expect(models().getByText('3D models for your products are made by the Sanctus team. Request one below.')).toBeInTheDocument()
    expect(models().queryByText('Current 3D files, managed by the Sanctus team')).toBeNull()
    expect(modelInputs()).toEqual([])
  })

  it("owner + switch on: 'Request from Sanctus (recommended)' first and 'Upload your own' second; request shows the panel, upload shows the model slots", async () => {
    const user = userEvent.setup()
    asOwner('biz_nord')
    await renderEditor('business', 'biz_nord', 'prd_shell_chair')
    const choices = models().getAllByRole('radio')
    expect(choices.map((c) => c.textContent)).toEqual(['Request from Sanctus (recommended)', 'Upload your own'])
    expect(choices[0]).toHaveAttribute('aria-checked', 'true')
    expect(models().getByTestId('request-panel')).toBeInTheDocument()
    expect(models().queryByLabelText('Upload .glb file')).toBeNull()
    await user.click(choices[1]!)
    expect(models().getByLabelText('Upload .glb file')).toBeInTheDocument()
    expect(models().queryByTestId('request-panel')).toBeNull()
  })

  it("Admin: the model slots whatever the switch says, plus 'Open 3D request: {status}' linking to the request with models.manage, and no line without it", async () => {
    const spy = vi.spyOn(service, 'getModelRequests').mockResolvedValue(
      ok({ items: [{ id: 'mrq_x', status: 'in_progress', productId: 'prd_glam_sofa', businessId: 'biz_casa' } as never], total: 1 }),
    )
    await renderEditor('admin', 'biz_casa', 'prd_glam_sofa')
    expect(models().getByLabelText(/(Upload|Replace) .glb file/)).toBeInTheDocument()
    expect(models().queryByTestId('request-panel')).toBeNull()
    const link = await models().findByRole('link', { name: 'Open 3D request: In progress' })
    expect(link).toHaveAttribute('href', modelRequestAdminPath('mrq_x'))
    expect(spy).toHaveBeenCalledWith({ productId: 'prd_glam_sofa', status: ['requested', 'in_progress'] })
    // Final review: a router link, so it opens in the app without a full page load.
    await userEvent.click(link)
    expect(await screen.findByTestId('other-route')).toBeInTheDocument()
  })

  it('Admin without models.manage: no open-request line and no request read', async () => {
    perms.deny = ['models.manage']
    const spy = vi.spyOn(service, 'getModelRequests')
    await renderEditor('admin', 'biz_casa', 'prd_glam_sofa')
    expect(models().getByLabelText(/(Upload|Replace) .glb file/)).toBeInTheDocument()
    expect(models().queryByRole('link', { name: /Open 3D request/ })).toBeNull()
    expect(spy).not.toHaveBeenCalled()
  })

  it("Admin: the open-request line has loading and error states with Retry", async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(service, 'getModelRequests').mockResolvedValueOnce({ ok: false, error: { code: 'UNKNOWN', message: 'x' } })
    await renderEditor('admin', 'biz_casa', 'prd_glam_sofa')
    expect(await models().findByText("Couldn't load 3D model requests.")).toBeInTheDocument()
    spy.mockResolvedValueOnce(ok({ items: [], total: 0 }))
    await user.click(models().getByRole('button', { name: 'Retry' }))
    await waitFor(() => expect(models().queryByText("Couldn't load 3D model requests.")).toBeNull())
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('owner + switch off: a save sends keepModels and the models_changed_at it loaded', async () => {
    const user = userEvent.setup()
    asOwner('biz_casa')
    const spy = vi.spyOn(service, 'updateProduct')
    const p = await renderEditor('business', 'biz_casa', 'prd_glam_sofa')
    await user.type(screen.getByRole('textbox', { name: /^Product name/ }), ' II')
    await user.click(screen.getByRole('button', { name: /Save (draft|changes)/ }))
    await waitFor(() => expect(spy).toHaveBeenCalled())
    const sent = spy.mock.calls[0]![1]
    expect(sent).toMatchObject({ keepModels: true })
    expect(Object.hasOwn(sent, 'modelsChangedAt')).toBe(true)
    expect(sent.modelsChangedAt).toBe(p.modelsChangedAt)
  })

  it('Review Focus 5: a save refused with own_models_not_allowed shows the copy and keeps the form values; the new file is not attached', async () => {
    const user = userEvent.setup()
    asOwner('biz_nord')
    const p = await renderEditor('business', 'biz_nord', 'prd_shell_chair')
    await chooseUpload(user)
    await user.upload(models().getByLabelText('Upload .glb file'), glbFile('mine.glb'))
    expect(await models().findByText('mine.glb')).toBeInTheDocument()
    await user.type(screen.getByRole('textbox', { name: /^Product name/ }), ' II')
    // Staff turn the switch off while the editor is open.
    store.update((d) => {
      d.businesses = d.businesses.map((b) => (b.id === 'biz_nord' ? { ...b, allowOwnModels: false } : b))
    })
    await user.click(screen.getByRole('button', { name: /Save (draft|changes)/ }))
    expect(await screen.findByText(/to continue$/)).toBeInTheDocument()
    expect(summary()).toHaveTextContent('This business is not allowed to upload its own 3D files.')
    expect(screen.getByRole('textbox', { name: /^Product name/ })).toHaveValue(`${p.name.en} II`)
    expect(models().getByText('mine.glb')).toBeInTheDocument()
    const stored = await service.getProductById(p.id)
    expect(stored.ok && stored.data.models.glb).toBeFalsy()
    expect(stored.ok && stored.data.name.en).toBe(p.name.en)
  })

  it('models_changed_elsewhere shows its copy with a Reload button that loads the stored 3D files and keeps the unsaved edits (final review)', async () => {
    const user = userEvent.setup()
    asOwner('biz_nord')
    const p = await renderEditor('business', 'biz_nord', 'prd_shell_chair')
    const update = vi.spyOn(service, 'updateProduct').mockResolvedValueOnce({ ok: false, error: modelRequestError('models_changed_elsewhere')! })
    await user.type(screen.getByRole('textbox', { name: /^Product name/ }), ' II')
    await user.click(screen.getByRole('button', { name: /Save (draft|changes)/ }))
    await screen.findByText(/to continue$/)
    const alert = summary()
    expect(alert).toHaveTextContent('The 3D files were changed somewhere else. Reload the page and try again.')
    // The team delivered a GLB for the product and one for its first option meanwhile.
    const glb = { format: 'glb' as const, url: 'blob:delivered', fileName: 'delivered.glb', status: 'valid' as const }
    const stamp = '2026-10-26T12:00:00.000Z'
    store.update((d) => {
      d.products = d.products.map((x) => (x.id === p.id
        ? { ...x, name: { ...x.name, en: 'Renamed elsewhere' }, models: { glb }, modelsChangedAt: stamp, variants: x.variants.map((v, i) => (i === 0 ? { ...v, models: { glb: { ...glb, fileName: 'option.glb' } } } : v)) }
        : x))
    })
    const read = vi.spyOn(service, 'getProductById')
    await user.click(within(alert).getByRole('button', { name: 'Reload' }))
    await waitFor(() => expect(screen.queryByText(/to continue$/)).toBeNull())
    expect(read).toHaveBeenCalledWith(p.id)
    // The unsaved name stays; the stored 3D files and their stamp come in, so the next save is not refused again.
    expect(screen.getByRole('textbox', { name: /^Product name/ })).toHaveValue(`${p.name.en} II`)
    expect(screen.getAllByText('Unsaved changes').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: /Save (draft|changes)/ }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2))
    const sent = update.mock.calls[1]![1]
    expect(sent.name?.en).toBe(`${p.name.en} II`)
    expect(sent.modelsChangedAt).toBe(stamp)
    expect(sent.models?.glb?.fileName).toBe('delivered.glb')
    if (p.variants[0]) expect(sent.variants?.[0]?.models?.glb?.fileName).toBe('option.glb')
  })
})

describe('T6: product editor in Portuguese', () => {
  afterEach(() => localStorage.removeItem(LANG_KEY))

  it('shows the Portuguese title, sections and buttons, and a Portuguese publish message', async () => {
    localStorage.setItem(LANG_KEY, 'pt')
    const user = userEvent.setup()
    const router = createMemoryRouter(
      [{ path: '/dashboard/products/new', element: <ProductEditorForm scope="business" product={null} currentStatus="draft" businesses={[business]} fixedBusiness={business} breadcrumbs={crumbs} /> }],
      { initialEntries: ['/dashboard/products/new'] },
    )
    render(
      <LanguageProvider>
        <ToastProvider>
          <ConfirmProvider>
            <RouterProvider router={router} />
          </ConfirmProvider>
        </ToastProvider>
      </LanguageProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Adicionar produto', level: 1 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Informação básica' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Guardar rascunho' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Publicar' }))
    expect(await screen.findByText(/problemas para continuar$/)).toBeInTheDocument()
    expect(screen.queryByText(/to continue$/)).toBeNull()
  })
})
