import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '@/components/ui/ToastProvider'
import type { ModelRequest, ModelRequestStatus } from '@/domain/modelRequests'
import type { Product } from '@/domain/types'
import { service } from '@/services'
import { fail, ok } from '@/services/catalogService'
import { ModelRequestPanel } from './ModelRequestPanel'

let product: Product
let urls = 0
const revoked: string[] = []

beforeEach(async () => {
  localStorage.clear()
  await service.resetDemoData()
  const res = await service.getProductById('prd_bookcase')
  if (!res.ok) throw new Error('seed product missing')
  product = { ...res.data, variants: [], dimensions: { width: 100, height: 180, depth: 40, unit: 'cm' } }
  urls = 0
  revoked.length = 0
  Object.assign(URL, { createObjectURL: vi.fn(() => `blob:photo-${++urls}`), revokeObjectURL: vi.fn((u: string) => revoked.push(u)) })
})

afterEach(() => {
  vi.restoreAllMocks()
})

const request = (over: Partial<ModelRequest> & { status: ModelRequestStatus }): ModelRequest => ({
  id: `r-${over.status}-${over.variantId ?? 'p'}`,
  businessId: product.businessId,
  productId: product.id,
  createdAt: '2026-10-20T10:00:00Z',
  updatedAt: '2026-10-21T10:00:00Z',
  photoCount: 2,
  productName: product.name,
  businessName: 'Casa',
  ...over,
})

function requests(items: ModelRequest[]) {
  return vi.spyOn(service, 'getModelRequests').mockResolvedValue(ok({ items, total: items.length }))
}

function renderPanel(p: Product | null = product, handlers = { onSaveDraft: vi.fn(), onReload: vi.fn() }) {
  render(
    <ToastProvider>
      <ModelRequestPanel product={p ?? undefined} {...handlers} />
    </ToastProvider>,
  )
  return handlers
}

/** A JPEG whose header says w × h (enough for imageSize). */
function jpeg(name: string, w: number, h: number): File {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]
  return new File([new Uint8Array([0xff, 0xd8, ...app0, ...sof0, 0xff, 0xd9])], name, { type: 'image/jpeg' })
}
const big = (name: string, bytes: number, type = 'image/jpeg') => {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'size', { value: bytes })
  return f
}
const photos = (n: number, from = 1) => Array.from({ length: n }, (_, i) => jpeg(`photo-${from + i}.jpg`, 2000, 1500))
const picker = () => screen.getByLabelText('Add photos') as HTMLInputElement
const pick = async (files: File[]) => {
  await userEvent.setup({ applyAccept: false }).upload(picker(), files)
}
const sendButton = () => screen.getByRole('button', { name: 'Send request' })

describe('S4 Task 4: ModelRequestPanel', () => {
  it('unsaved: asks to save first, and Save draft calls onSaveDraft', async () => {
    const h = renderPanel(null)
    expect(screen.getByText('Save this product first, then request its 3D model.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Save draft' }))
    expect(h.onSaveDraft).toHaveBeenCalled()
  })

  it('loading shows a skeleton; an error shows "Couldn\'t load 3D model requests." with Retry, which loads again', async () => {
    let resolve!: (v: Awaited<ReturnType<typeof service.getModelRequests>>) => void
    const spy = vi.spyOn(service, 'getModelRequests').mockReturnValueOnce(new Promise((r) => (resolve = r)))
    renderPanel()
    expect(screen.getByTestId('model-request-loading')).toBeInTheDocument()
    await act(async () => resolve(fail('UNKNOWN', 'boom')))
    expect(await screen.findByText("Couldn't load 3D model requests.")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send request' })).not.toBeInTheDocument()
    spy.mockResolvedValue(ok({ items: [], total: 0 }))
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('button', { name: 'Send request' })).toBeInTheDocument()
  })

  it('dimensions missing: the form shows and Send is replaced by the dimensions line linking to #specs', async () => {
    requests([])
    renderPanel({ ...product, dimensions: { ...product.dimensions, depth: 0 } })
    const link = await screen.findByRole('link', { name: 'Add width, height and depth in Specifications first. The model is made to that size.' })
    expect(link).toHaveAttribute('href', '#specs')
    expect(screen.getByLabelText('Add photos')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send request' })).not.toBeInTheDocument()
  })

  it('final review: dimensions typed in the form but not saved ask to save the product, with a working Save', async () => {
    requests([])
    const saved = { ...product, dimensions: { ...product.dimensions, depth: 0 } }
    const h = { onSaveDraft: vi.fn(), onReload: vi.fn() }
    const { rerender } = render(
      <ToastProvider>
        <ModelRequestPanel product={saved} formDimensions={{ ...saved.dimensions, depth: 40 }} {...h} />
      </ToastProvider>,
    )
    expect(await screen.findByText('Save the product to use its dimensions.')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Add width, height and depth/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Send request' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(h.onSaveDraft).toHaveBeenCalledTimes(1)
    // Once saved, the panel's product carries the same dimensions and Send is back.
    const after = { ...saved, dimensions: { ...saved.dimensions, depth: 40 } }
    rerender(
      <ToastProvider>
        <ModelRequestPanel product={after} formDimensions={after.dimensions} {...h} />
      </ToastProvider>,
    )
    expect(await screen.findByRole('button', { name: 'Send request' })).toBeInTheDocument()
    expect(screen.queryByText('Save the product to use its dimensions.')).toBeNull()
  })

  it('final review: saved dimensions changed in the form also ask to save first; cleared ones show the missing line', async () => {
    requests([])
    const { rerender } = render(
      <ToastProvider>
        <ModelRequestPanel product={product} formDimensions={{ ...product.dimensions, width: product.dimensions.width + 10 }} onSaveDraft={vi.fn()} onReload={vi.fn()} />
      </ToastProvider>,
    )
    expect(await screen.findByText('Save the product to use its dimensions.')).toBeInTheDocument()
    rerender(
      <ToastProvider>
        <ModelRequestPanel product={product} formDimensions={{ ...product.dimensions, height: 0 }} onSaveDraft={vi.fn()} onReload={vi.fn()} />
      </ToastProvider>,
    )
    expect(await screen.findByRole('link', { name: 'Add width, height and depth in Specifications first. The model is made to that size.' })).toBeInTheDocument()
  })

  it('form: Model for lists the product, its saved options and New variant; the count line; Send needs 2 photos; an 11th, a 12 MB photo and a GIF are refused; a 900 px photo warns; the demo label', async () => {
    requests([])
    const { unmount } = render(
      <ToastProvider>
        <ModelRequestPanel product={product} onSaveDraft={vi.fn()} onReload={vi.fn()} />
      </ToastProvider>,
    )
    await screen.findByRole('button', { name: 'Send request' })
    // ADR-0068: with no saved options the choice is the product or a new variant.
    expect(within(screen.getByLabelText('Model for')).getAllByRole('option').map((o) => o.textContent)).toEqual(['The product', 'New variant'])
    expect(screen.getByLabelText('Model for')).toHaveValue('')
    expect(screen.queryByLabelText('Variant name (English)')).not.toBeInTheDocument()
    expect(screen.getByText('Demo: these photos are kept only until you reload.')).toBeInTheDocument()
    expect(screen.getByText('0 of 10 photos · add at least 2')).toBeInTheDocument()
    expect(picker()).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
    expect(picker()).toHaveAttribute('multiple')

    await pick(photos(1))
    expect(screen.getByText('1 of 10 photos · add at least 2')).toBeInTheDocument()
    expect(sendButton()).toBeDisabled()
    expect(screen.getByText('Add at least 2 photos.')).toBeInTheDocument()

    await pick([big('huge.jpg', 12 * 1024 * 1024)])
    expect(await screen.findByText(/huge\.jpg is 12(\.0)? MB\. Maximum is 10(\.0)? MB\./)).toBeInTheDocument()
    await pick([big('anim.gif', 1000, 'image/gif')])
    expect(await screen.findByText(/anim\.gif: unsupported file type/)).toBeInTheDocument()

    await pick([jpeg('small.jpg', 900, 600)])
    expect(await screen.findByText('small.jpg is small (900×600). A larger photo gives a better model.')).toBeInTheDocument()
    expect(sendButton()).toBeEnabled()

    await pick(photos(8, 3))
    expect(screen.getByText('10 of 10 photos · add at least 2')).toBeInTheDocument()
    await pick(photos(1, 11))
    expect(await screen.findByText('Up to 10 photos. Remove one to add another.')).toBeInTheDocument()
    expect(screen.getByText('10 of 10 photos · add at least 2')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Remove photo-1.jpg' }))
    expect(screen.getByText('9 of 10 photos · add at least 2')).toBeInTheDocument()
    expect(revoked).toEqual(['blob:photo-1'])
    unmount()
    expect(revoked).toHaveLength(10)

    vi.restoreAllMocks()
    requests([])
    renderPanel({ ...product, variants: [{ ...({} as Product['variants'][number]), id: 'v-oak', name: { en: 'Oak' } }] })
    const select = await screen.findByLabelText('Model for')
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['The product', 'Oak', 'New variant'])
  })

  it('sending: per-photo progress, the button busy, the form locked; then the toast and the form clears', async () => {
    requests([])
    let finish!: () => void
    const send = vi.spyOn(service, 'requestModel').mockImplementation(async (_input, onProgress) => {
      onProgress?.(0, 'done')
      onProgress?.(1, 'uploading')
      await new Promise<void>((r) => (finish = r))
      return ok(request({ status: 'requested' }))
    })
    renderPanel()
    await screen.findByRole('button', { name: 'Send request' })
    await pick(photos(2))
    await userEvent.type(screen.getByLabelText('Notes for the Sanctus team (optional)'), 'Oak legs')
    await userEvent.click(sendButton())
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: product.businessId, productId: product.id, note: 'Oak legs', photos: expect.any(Array) }),
      expect.any(Function),
    )
    expect(await screen.findByText('Uploaded')).toBeInTheDocument()
    expect(screen.getByText('Uploading…')).toBeInTheDocument()
    expect(sendButton()).toHaveAttribute('aria-busy', 'true')
    expect(screen.getByLabelText('Notes for the Sanctus team (optional)')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Remove photo-1.jpg' })).toBeDisabled()
    await act(async () => finish())
    expect(await screen.findByText("Request sent. We'll email you when the model is ready.")).toBeInTheDocument()
  })

  it('a service error shows the mapped copy and keeps the picked photos', async () => {
    requests([])
    vi.spyOn(service, 'requestModel').mockResolvedValue({ ok: false, error: { code: 'CONFLICT', message: 'This product already has an open 3D model request.', reason: 'model_request_open' } })
    renderPanel()
    await screen.findByRole('button', { name: 'Send request' })
    await pick(photos(2))
    await userEvent.click(sendButton())
    // The service sentence stays English for logs; the panel shows the translated sentence for the reason, which points to New variant (ADR-0068).
    expect(await screen.findByText('This already has an open 3D model request. For another version of the product, such as another colour or finish, choose New variant under Model for.')).toBeInTheDocument()
    expect(screen.getByText('2 of 10 photos · add at least 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remove photo-2.jpg' })).toBeEnabled()
  })

  it('requested: the status line and Cancel request, which cancels and toasts', async () => {
    requests([request({ status: 'requested' })])
    const cancel = vi.spyOn(service, 'cancelModelRequest').mockResolvedValue(ok({ status: 'cancelled' }))
    renderPanel()
    expect(await screen.findByText(/^Requested on .+\. The Sanctus team will start on it soon\.$/)).toBeInTheDocument()
    // ADR-0068: the only target left is a new variant, explained in one line.
    expect(screen.getByText(ALL_OPEN)).toBeInTheDocument()
    expect(within(screen.getByLabelText('Model for')).getAllByRole('option').map((o) => o.textContent)).toEqual(['New variant'])
    expect(screen.getByLabelText('Variant name (English)')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel request' }))
    expect(cancel).toHaveBeenCalledWith('r-requested-p')
    expect(await screen.findByText('Request cancelled.')).toBeInTheDocument()
  })

  it("final review: a cancel whose photo clean-up was partial also says 'Some photos couldn't be removed.'", async () => {
    requests([request({ status: 'requested' })])
    vi.spyOn(service, 'cancelModelRequest').mockResolvedValue(ok({ status: 'cancelled', cleanup: 'partial' }))
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel request' }))
    expect(await screen.findByText('Request cancelled.')).toBeInTheDocument()
    expect(await screen.findByText("Some photos couldn't be removed.")).toBeInTheDocument()
  })

  it('in progress: the status line and the contact line, no Cancel', async () => {
    requests([request({ status: 'in_progress', startedAt: '2026-10-22T10:00:00Z' })])
    renderPanel()
    expect(await screen.findByText(/^In progress since .+\. We'll email you when it's ready\.$/)).toBeInTheDocument()
    expect(screen.getByText('The Sanctus team has started on this model. To stop it, contact the Sanctus team.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cancel request' })).not.toBeInTheDocument()
  })

  it('delivered, declined (with Send a new request) and cancelled lines; Earlier requests (n) holds the older ones per target', async () => {
    requests([
      request({ id: 'r3', status: 'rejected', reason: 'Too dark', closedAt: '2026-10-24T10:00:00Z', createdAt: '2026-10-23T10:00:00Z' }),
      request({ id: 'r2', status: 'cancelled', closedAt: '2026-10-19T10:00:00Z', createdAt: '2026-10-18T10:00:00Z' }),
      request({ id: 'r1', status: 'delivered', deliveredAt: '2026-10-10T10:00:00Z', closedAt: '2026-10-10T10:00:00Z', createdAt: '2026-10-01T10:00:00Z' }),
    ])
    renderPanel()
    expect(await screen.findByText(/^Declined on .+\. Reason: Too dark$/)).toBeInTheDocument()
    expect(screen.getByText('Earlier requests (2)')).toBeInTheDocument()
    expect(screen.getByText(/^Cancelled on .+\.$/)).toBeInTheDocument()
    expect(screen.getByText(/^Ready since .+\. The 3D model is attached to the product\.$/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Send a new request' }))
    expect(screen.getByLabelText('Add photos')).toBeInTheDocument()
    expect(sendButton()).toBeInTheDocument()
  })

  it('a request that becomes delivered while open shows the Ready line, and Reload calls onReload', async () => {
    const spy = requests([request({ id: 'r1', status: 'in_progress', startedAt: '2026-10-22T10:00:00Z' })])
    const h = renderPanel()
    await screen.findByText(/^In progress since/)
    spy.mockResolvedValue(ok({ items: [request({ id: 'r1', status: 'delivered', deliveredAt: '2026-10-25T10:00:00Z', closedAt: '2026-10-25T10:00:00Z' })], total: 1 }))
    const later = Date.now() + 10 * 60_000
    vi.spyOn(Date, 'now').mockReturnValue(later)
    await act(async () => {
      fireEvent.focus(window)
    })
    expect(await screen.findByText('Ready. Reload to see the 3D model in this editor.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reload' }))
    expect(h.onReload).toHaveBeenCalled()
  })

  it('cancel failure shows the mapped copy as an error toast', async () => {
    requests([request({ status: 'requested' })])
    vi.spyOn(service, 'cancelModelRequest').mockResolvedValue({ ok: false, error: { code: 'CONFLICT', message: 'The Sanctus team has started on this model. To stop it, contact the Sanctus team.', reason: 'model_request_not_cancellable' } })
    renderPanel()
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel request' }))
    await waitFor(() => expect(screen.getAllByText('This request has already started and can no longer be cancelled.').length).toBeGreaterThan(0))
  })
})

const ALL_OPEN = 'Every 3D model above is already requested. For another version of this product, such as another colour or finish, request one for a new variant.'

describe('ADR-0068: a model request for a new variant', () => {
  const walnut = { id: 'v-walnut', name: { en: 'Walnut' }, colorHex: '#5a3e2b' }
  const chooseNew = async () => {
    await screen.findByRole('button', { name: 'Send request' })
    await userEvent.selectOptions(screen.getByLabelText('Model for'), 'New variant')
  }
  const added = (variant: Product['variants'][number] = walnut) => ok({ product: { ...product, variants: [...product.variants, variant] }, variantId: variant.id })

  it('New variant shows a required name (any text), an optional Portuguese name and an optional swatch; Send adds the variant, then requests its model', async () => {
    requests([])
    const add = vi.spyOn(service, 'addProductVariant').mockResolvedValue(added())
    const send = vi.spyOn(service, 'requestModel').mockResolvedValue(ok(request({ status: 'requested', variantId: walnut.id })))
    const onVariantAdded = vi.fn()
    render(
      <ToastProvider>
        <ModelRequestPanel product={product} onSaveDraft={vi.fn()} onReload={vi.fn()} onVariantAdded={onVariantAdded} />
      </ToastProvider>,
    )
    await chooseNew()
    expect(screen.getByText('For another version of this product, such as another colour, finish or size. It is added to Colours and variants with its own 3D model.')).toBeInTheDocument()
    expect(screen.getByLabelText('Variant name (English)')).toBeRequired()
    expect(screen.getByLabelText('Variant name in Portuguese (optional)')).not.toBeRequired()
    expect(screen.queryByLabelText('Swatch colour')).not.toBeInTheDocument()
    await pick(photos(2))
    // No name: the field says so and nothing is written.
    await userEvent.click(sendButton())
    expect(await screen.findByText('Enter a name for the new variant.')).toBeInTheDocument()
    expect(screen.getByLabelText('Variant name (English)')).toHaveAttribute('aria-invalid', 'true')
    expect(add).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText('Variant name (English)'), ' Walnut ')
    await userEvent.type(screen.getByLabelText('Variant name in Portuguese (optional)'), 'Nogueira')
    await userEvent.click(screen.getByLabelText('Show a colour swatch'))
    fireEvent.input(screen.getByLabelText('Swatch colour'), { target: { value: '#5a3e2b' } })
    await userEvent.click(sendButton())
    expect(add).toHaveBeenCalledWith(product.id, { name: { en: 'Walnut', pt: 'Nogueira' }, colorHex: '#5a3e2b' })
    await waitFor(() => expect(send).toHaveBeenCalledWith(expect.objectContaining({ productId: product.id, variantId: walnut.id }), expect.any(Function)))
    expect(onVariantAdded).toHaveBeenCalledWith(walnut)
    expect(await screen.findByText("Request sent. We'll email you when the model is ready.")).toBeInTheDocument()
    expect(screen.getByText('“Walnut” was added to Colours and variants.')).toBeInTheDocument()
  })

  it('a name that is only a size or a finish is fine, and without the swatch no colour is sent', async () => {
    requests([])
    const add = vi.spyOn(service, 'addProductVariant').mockResolvedValue(added({ id: 'v-200', name: { en: '200 cm' } }))
    vi.spyOn(service, 'requestModel').mockResolvedValue(ok(request({ status: 'requested', variantId: 'v-200' })))
    renderPanel()
    await chooseNew()
    await userEvent.type(screen.getByLabelText('Variant name (English)'), '200 cm')
    await pick(photos(2))
    await userEvent.click(sendButton())
    await waitFor(() => expect(add).toHaveBeenCalledWith(product.id, { name: { en: '200 cm' } }))
  })

  it('the variant is added but the request fails: says so, keeps the photos and selects the new variant, so a retry only sends the request', async () => {
    requests([])
    const add = vi.spyOn(service, 'addProductVariant').mockResolvedValue(added())
    const send = vi
      .spyOn(service, 'requestModel')
      .mockResolvedValueOnce({ ok: false, error: { code: 'UNKNOWN', message: 'network' } })
      .mockResolvedValueOnce(ok(request({ status: 'requested', variantId: walnut.id })))
    renderPanel()
    await chooseNew()
    await userEvent.type(screen.getByLabelText('Variant name (English)'), 'Walnut')
    await pick(photos(2))
    await userEvent.click(sendButton())
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent(/^“Walnut” was added to Colours and variants, but its 3D model request wasn't sent: .+ It is selected below, so you can send the request again\.$/)
    expect(screen.getByLabelText('Model for')).toHaveValue(walnut.id)
    expect(screen.queryByLabelText('Variant name (English)')).not.toBeInTheDocument()
    expect(screen.getByText('2 of 10 photos · add at least 2')).toBeInTheDocument()
    await userEvent.click(sendButton())
    await waitFor(() => expect(send).toHaveBeenCalledTimes(2))
    expect(send.mock.calls[1]![0]).toMatchObject({ variantId: walnut.id })
    expect(add).toHaveBeenCalledTimes(1)
    expect(await screen.findByText("Request sent. We'll email you when the model is ready.")).toBeInTheDocument()
  })

  it('adding the variant fails: the reason shows, no request is sent and the typed name stays', async () => {
    requests([])
    vi.spyOn(service, 'addProductVariant').mockResolvedValue({ ok: false, error: { code: 'VALIDATION', message: 'x', fieldErrors: { variants: { key: 'common.validation.product.variantsMax', vars: { n: 50 } } } } })
    const send = vi.spyOn(service, 'requestModel')
    renderPanel()
    await chooseNew()
    await userEvent.type(screen.getByLabelText('Variant name (English)'), 'Walnut')
    await pick(photos(2))
    await userEvent.click(sendButton())
    expect(await screen.findByText('Use 50 colours or options or fewer.')).toBeInTheDocument()
    expect(send).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Variant name (English)')).toHaveValue('Walnut')
  })

  it('a double click adds one variant and sends one request', async () => {
    requests([])
    let finish!: () => void
    const add = vi.spyOn(service, 'addProductVariant').mockImplementation(async () => {
      await new Promise<void>((r) => (finish = r))
      return added()
    })
    vi.spyOn(service, 'requestModel').mockResolvedValue(ok(request({ status: 'requested', variantId: walnut.id })))
    renderPanel()
    await chooseNew()
    await userEvent.type(screen.getByLabelText('Variant name (English)'), 'Walnut')
    await pick(photos(2))
    fireEvent.click(sendButton())
    fireEvent.click(sendButton())
    await act(async () => finish())
    expect(await screen.findByText("Request sent. We'll email you when the model is ready.")).toBeInTheDocument()
    expect(add).toHaveBeenCalledTimes(1)
    expect(service.requestModel).toHaveBeenCalledTimes(1)
  })

  it('every target open: the line explains New variant; a product at the variant cap offers no New variant', async () => {
    const oak = { id: 'v-oak', name: { en: 'Oak' } }
    requests([request({ status: 'requested' }), request({ status: 'in_progress', variantId: 'v-oak' })])
    const { unmount } = render(
      <ToastProvider>
        <ModelRequestPanel product={{ ...product, variants: [oak] }} onSaveDraft={vi.fn()} onReload={vi.fn()} />
      </ToastProvider>,
    )
    expect(await screen.findByText(ALL_OPEN)).toBeInTheDocument()
    expect(within(screen.getByLabelText('Model for')).getAllByRole('option').map((o) => o.textContent)).toEqual(['New variant'])
    unmount()

    const full = Array.from({ length: 50 }, (_, i) => ({ id: `v-${i}`, name: { en: `V${i}` } }))
    requests([request({ status: 'requested' })])
    renderPanel({ ...product, variants: full })
    await screen.findByRole('button', { name: 'Send request' })
    expect(within(screen.getByLabelText('Model for')).queryByRole('option', { name: 'New variant' })).toBeNull()
    expect(screen.queryByText(ALL_OPEN)).toBeNull()
  })
})
