import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect } from 'react'
import { RouterProvider, createMemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ACCOUNT_KEY, AccountProvider } from '@/auth/AccountProvider'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import type { ModelAsset } from '@/domain/types'
import { formatFileSize } from '@/lib/format'
import { service } from '@/services'
import { fail } from '@/services/catalogService'
import { resetMockAccount } from '@/services/mock/mockAccount'
import { store } from '@/services/mock/store'
import ModelRequestDetailPage from './ModelRequestDetailPage'

// The real viewer needs WebGL: this one reports a loaded model once.
vi.mock('@/components/three/ModelViewer', () => ({
  MODEL_STALL_TIMEOUT_MS: 45_000,
  ModelViewer: ({ onLoad }: { onLoad?: (i: { dimensions: { x: number; y: number; z: number } }) => void }) => {
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, like a real load
    useEffect(() => onLoad?.({ dimensions: { x: 1.1, y: 0.75, z: 1.1 } }), [])
    return <div data-testid="viewer" />
  },
}))

/** Seeded Casa Lisboa requests (seed.ts). */
const REQUESTED = 'mrq_bookcase'
const IN_PROGRESS = 'mrq_table'
const glb: ModelAsset = { format: 'glb', url: 'blob:demo/table.glb', fileName: 'table.glb', sizeBytes: 4096, status: 'session-only' }

beforeEach(async () => {
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole: 'owner' }))
  resetMockAccount()
  await service.resetDemoData()
})
afterEach(() => {
  vi.restoreAllMocks()
})

function renderPage(id: string) {
  const router = createMemoryRouter([{ path: '/admin/model-requests/:requestId', element: <ModelRequestDetailPage /> }], { initialEntries: [`/admin/model-requests/${id}`] })
  render(
    <AccountProvider>
      <ToastProvider>
        <ConfirmProvider>
          <RouterProvider router={router} />
        </ConfirmProvider>
      </ToastProvider>
    </AccountProvider>,
  )
}

const loaded = () => screen.findByRole('heading', { level: 1 })

describe('S4 Task 6: request detail page', () => {
  it('header links to the admin product editor and the business detail, shows target, status, requested by and on', async () => {
    renderPage(IN_PROGRESS)
    expect(await loaded()).toHaveTextContent('Atlantic Round Dining Table')
    expect(screen.getByRole('link', { name: 'Atlantic Round Dining Table' })).toHaveAttribute('href', '/admin/products/prd_round_table/edit')
    expect(screen.getByRole('link', { name: 'Casa Lisboa Interiors' })).toHaveAttribute('href', '/admin/businesses/biz_casa')
    expect(screen.getByText('Target: Product')).toBeInTheDocument()
    expect(screen.getAllByText('In progress').length).toBeGreaterThan(0)
    expect(screen.getByText(/Requested by Business owner on /)).toBeInTheDocument()
  })

  it("Photos ({n}) thumbnails; the viewer opens on click, moves with ArrowLeft/ArrowRight, closes with Escape and returns focus to the thumbnail, shows the file name and size and 'Download original'", async () => {
    renderPage(IN_PROGRESS)
    await loaded()
    const count = store.get().modelRequests!.find((r) => r.id === IN_PROGRESS)!.photos.length
    expect(screen.getByRole('heading', { name: `Photos (${count})` })).toBeInTheDocument()
    expect(screen.getByText('Sample photos')).toBeInTheDocument()
    const first = screen.getByRole('button', { name: /^Open photo 1:/ })
    await userEvent.click(first)
    const dialog = screen.getByRole('dialog', { name: `Photo 1 of ${count}` })
    expect(within(dialog).getByText('sample-photo-1.jpg')).toBeInTheDocument()
    expect(within(dialog).getByText(formatFileSize(2_400_000))).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Download original' })).toBeInTheDocument()
    await userEvent.keyboard('{ArrowRight}')
    expect(screen.getByRole('dialog', { name: `Photo 2 of ${count}` })).toBeInTheDocument()
    await userEvent.keyboard('{ArrowLeft}')
    expect(screen.getByRole('dialog', { name: `Photo 1 of ${count}` })).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(first).toHaveFocus()
  })

  it("a photo that fails to load shows 'This photo couldn't be loaded.' with Retry", async () => {
    renderPage(IN_PROGRESS)
    await loaded()
    const thumb = screen.getByRole('button', { name: /^Open photo 1:/ })
    fireEvent.error(thumb.querySelector('img')!)
    expect(await screen.findByText("This photo couldn't be loaded.")).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(screen.getByRole('button', { name: /^Open photo 1:/ })).toBeInTheDocument()
  })

  it('Product facts with width, height and depth and the unit, material, category, the note, current 3D files and readiness', async () => {
    renderPage(REQUESTED)
    await loaded()
    const facts = screen.getByRole('region', { name: 'Product facts' })
    expect(within(facts).getByText('60 cm')).toBeInTheDocument()
    expect(within(facts).getByText('200 cm')).toBeInTheDocument()
    expect(within(facts).getByText('32 cm')).toBeInTheDocument()
    expect(within(facts).getByText('Oak veneer')).toBeInTheDocument()
    expect(within(facts).getByText('Storage')).toBeInTheDocument()
    expect(within(facts).getByText('The shelves are oak veneer; the back panel is painted white.')).toBeInTheDocument()
    expect(within(facts).getByText('No 3D files yet')).toBeInTheDocument()
    expect(within(facts).getByText('Photos only')).toBeInTheDocument()
  })

  it('History lists the audit events with actor labels', async () => {
    await service.startModelRequest(REQUESTED)
    renderPage(REQUESTED)
    await loaded()
    const history = screen.getByRole('region', { name: 'History' })
    expect(within(history).getByText('3D model requested')).toBeInTheDocument()
    expect(within(history).getByText('3D model work started')).toBeInTheDocument()
    expect(within(history).getByText(/Business owner/)).toBeInTheDocument()
    expect(within(history).getByText(/Owner ·|· Owner/)).toBeInTheDocument()
  })

  it("loading; not found 'This request doesn't exist or was removed with its product.'; error with Retry", async () => {
    let release: () => void = () => {}
    const real = service.getModelRequest.bind(service)
    const spy = vi.spyOn(service, 'getModelRequest').mockImplementationOnce((id) => new Promise((resolve) => (release = () => void real(id).then(resolve))))
    renderPage(IN_PROGRESS)
    expect(screen.getByRole('status')).toBeInTheDocument()
    await act(async () => release())
    await loaded()
    spy.mockRestore()
  })

  it('not found and error states', async () => {
    renderPage('mrq_missing')
    expect(await screen.findByText("This request doesn't exist or was removed with its product.")).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to 3D requests' })).toHaveAttribute('href', '/admin/model-requests')
  })

  it('an error offers Retry', async () => {
    const spy = vi.spyOn(service, 'getModelRequest').mockResolvedValueOnce(fail('UNKNOWN', 'Network down.'))
    renderPage(IN_PROGRESS)
    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await loaded()).toHaveTextContent('Atlantic Round Dining Table')
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('Start work shows only for requested; Deliver model only for in_progress with a staged GLB; Decline for requested and in_progress', async () => {
    renderPage(REQUESTED)
    await loaded()
    expect(screen.getByRole('button', { name: 'Start work' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Deliver model' })).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Start work' }))
    expect(await screen.findByText('Work started.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Start work' })).toBeNull())
    expect(screen.queryByRole('button', { name: 'Deliver model' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Decline' })).toBeInTheDocument()
  })

  it('delivering a staged GLB: the dialog, the demo toast, and the request closes', async () => {
    await service.stageModelFile(IN_PROGRESS, 'glb', glb)
    renderPage(IN_PROGRESS)
    await loaded()
    await userEvent.click(screen.getByRole('button', { name: 'Deliver model' }))
    const dialog = screen.getByRole('dialog', { name: 'Deliver the 3D model for Atlantic Round Dining Table?' })
    expect(within(dialog).getByText(/no USDZ file/)).toBeInTheDocument()
    await userEvent.click(within(dialog).getByRole('button', { name: 'Deliver model' }))
    expect(await screen.findByText('Model delivered. Demo: no email was sent.')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Decline' })).toBeNull())
    expect(store.get().products.find((p) => p.id === 'prd_round_table')!.models.glb?.fileName).toBe('table.glb')
  })

  it('declining: the reason dialog and the demo toast', async () => {
    renderPage(IN_PROGRESS)
    await loaded()
    await userEvent.click(screen.getByRole('button', { name: 'Decline' }))
    await userEvent.type(screen.getByRole('textbox', { name: /Reason \(sent to the business\)/ }), 'Too dark')
    await userEvent.click(screen.getByRole('button', { name: 'Decline request' }))
    expect(await screen.findByText('Request declined. Demo: no email was sent.')).toBeInTheDocument()
  })

  it("demo labels: 'Sample photos' and 'Demo: these photos are kept only until you reload.'", async () => {
    store.update((d) => {
      d.modelRequests = d.modelRequests!.map((r) => (r.id === REQUESTED ? { ...r, photos: r.photos.map((p) => ({ ...p, sample: false, sessionOnly: true })) } : r))
    })
    renderPage(REQUESTED)
    await loaded()
    expect(screen.getByText('Demo: these photos are kept only until you reload.')).toBeInTheDocument()
    expect(screen.queryByText('Sample photos')).toBeNull()
  })
})
