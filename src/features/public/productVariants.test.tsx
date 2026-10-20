import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import type { Product } from '@/domain/types'
import { service } from '@/services'
import { AR_TIPS_KEY } from './ArTips'

// The real web component needs WebGL: the element is a plain custom tag here, and the tests play its events.
vi.mock('@google/model-viewer', () => ({}))

type FakeViewer = HTMLElement & { canActivateAR?: boolean; activateAR?: () => Promise<void>; loaded?: boolean; getDimensions?: () => { x: number; y: number; z: number } }

function openApp(url: string) {
  window.history.replaceState(null, '', url)
  return render(<App />)
}

const viewer = () => document.querySelector('model-viewer') as FakeViewer | null
/** The model-viewer element once it shows `file` (a variant switch mounts a new element). */
async function viewerFor(file: RegExp): Promise<FakeViewer> {
  await waitFor(() => expect(viewer()?.getAttribute('src')).toMatch(file), { timeout: 4000 })
  await act(async () => {}) // let the wrapper attach its event listeners
  return viewer()!
}
/** Plays a finished load: model-viewer then reports whether it can open AR here, and the model's size (metres). */
function loaded(el: FakeViewer, canActivateAR: boolean, size = { x: 0.828, y: 0.687, z: 0.571 }) {
  el.canActivateAR = canActivateAR
  el.loaded = true
  el.getDimensions = () => size
  el.activateAR = vi.fn(async () => {})
  act(() => {
    el.dispatchEvent(new Event('load'))
  })
}
const arButton = () => screen.queryByRole('button', { name: 'View in AR' })

async function sheenChair(): Promise<Product> {
  const res = await service.getProductById('prd_sheen_chair')
  if (!res.ok) throw new Error(res.error.message)
  return res.data
}

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem(AR_TIPS_KEY, '1') // straight to AR, no tips dialog
  await service.resetDemoData()
})

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('product page: variants switch photos, 3D model and AR target', () => {
  it("switches the photo, the GLB and the iPhone file together, and never offers AR for the previous variant's file", { timeout: 20_000 }, async () => {
    openApp('/products/nordhaus/sheen-lounge-chair')
    // The lazy product page can take longer than the default 1 s to appear on a fully loaded test run.
    await screen.findByRole('heading', { name: 'Sheen Lounge Chair', level: 1 }, { timeout: 10_000 })
    const first = await viewerFor(/SheenChair\.glb$/)
    expect(first.getAttribute('ios-src')).toBeNull() // no variant GLB is ever paired with another file's USDZ
    loaded(first, true)
    expect(arButton()).toBeInTheDocument()
    expect(screen.getByText('True-to-size model')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('radio', { name: /Purple-Gold Damask/ }))
    const second = await viewerFor(/ChairDamaskPurplegold\.glb$/)
    expect(second.getAttribute('ios-src')).toBeNull()
    // While the new model loads: no AR button (AR would open the old file), no scale claim carried over.
    expect(arButton()).toBeNull()
    expect(screen.getByText('Checking AR support…')).toBeInTheDocument()
    expect(screen.queryByText('True-to-size model')).toBeNull()
    expect(document.querySelector('img[src$="chair-damask.webp"]')).not.toBeNull()
    const { variants } = await sheenChair()
    expect(new URL(window.location.href).searchParams.get('variant')).toBe(variants[1]!.id)

    loaded(second, true)
    expect(arButton()).toBeInTheDocument()
  })

  it('opens the finish named in ?variant= (shared links and QR codes)', async () => {
    const { variants } = await sheenChair()
    openApp(`/products/nordhaus/sheen-lounge-chair?variant=${variants[1]!.id}`)
    await viewerFor(/ChairDamaskPurplegold\.glb$/)
    expect(screen.getByRole('radio', { name: /Purple-Gold Damask/ })).toHaveAttribute('aria-checked', 'true')
  })

  it("says honestly which model 3D and AR show when a variant has no model of its own", async () => {
    openApp('/products/casa-lisboa/glam-velvet-sofa')
    await viewerFor(/GlamVelvetSofa\.glb$/)
    expect(screen.getByText('The 3D view and AR show the standard model. The Sapphire finish may look different.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: /Emerald/ }))
    expect(screen.getByText('The 3D view and AR show the standard model. The Emerald finish may look different.')).toBeInTheDocument()
  })
})

describe('product page: AR fixes', () => {
  it('hides the AR button after a failed hand-off and records no event for a tap that cannot open AR (AR-04)', async () => {
    const record = vi.spyOn(service, 'recordEvent')
    openApp('/products/nordhaus/sheen-lounge-chair')
    const el = await viewerFor(/SheenChair\.glb$/)
    loaded(el, true)
    // model-viewer has turned AR off since the page last asked (e.g. the Google app is missing): the tap is refused.
    el.canActivateAR = false
    fireEvent.click(arButton()!)
    expect(record.mock.calls.filter(([e]) => e.type === 'ar_activation')).toHaveLength(0)
    expect(el.activateAR).not.toHaveBeenCalled()
    await waitFor(() => expect(arButton()).toBeNull())

    loaded(el, true)
    expect(arButton()).toBeInTheDocument()
    el.canActivateAR = false
    act(() => {
      el.dispatchEvent(new CustomEvent('ar-status', { detail: { status: 'failed' } }))
    })
    await waitFor(() => expect(arButton()).toBeNull())
  })

  it('a model that fails to load drops the 3D/AR call to action and says so (AR-08)', async () => {
    openApp('/products/casa-lisboa/tejo-side-table')
    const el = await viewerFor(/MissingSideTable\.glb$/)
    act(() => {
      el.dispatchEvent(new Event('error'))
    })
    expect(await screen.findAllByText('The 3D model could not be loaded')).not.toHaveLength(0)
    expect(screen.queryByRole('button', { name: /View in 3D/ })).toBeNull()
    expect(screen.queryByRole('button', { name: 'View in 3D / AR' })).toBeNull()
  })

  it('says "View in 3D" without "AR" where AR cannot open (AR-08)', async () => {
    openApp('/products/nordhaus/sheen-lounge-chair')
    loaded(await viewerFor(/SheenChair\.glb$/), false)
    expect(screen.getAllByRole('button', { name: 'View in 3D' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'View in 3D / AR' })).toBeNull()
  })

  it('does not offer Android AR for a GLB that requires an extension Scene Viewer cannot open (AR-01)', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36')
    openApp('/products/casa-lisboa/wood-leather-sofa')
    loaded(await viewerFor(/SheenWoodLeatherSofa\.glb$/), true)
    expect(arButton()).toBeNull()
    expect(screen.getByText('AR is not available for this model on Android. You can still explore it in 3D.')).toBeInTheDocument()
  })
})
