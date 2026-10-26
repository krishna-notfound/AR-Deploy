import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import type { Product } from '@/domain/types'
import { service } from '@/services'
import { AR_TIPS_KEY } from './ArTips'
import { AR_PENDING_MAX_MS } from './ProductPage'

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
const arButton = () => screen.queryByRole('button', { name: 'View in my home' })

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
    expect(screen.getAllByText('True-to-size model').length).toBeGreaterThan(0) // scale note, and the badge beside the AR action

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

// Owner report 2026-10-26 "AR button missing": the obsidian call to action only opened the 3D view and the AR chip
// looked like a button. As on main, the primary action launches AR wherever AR can open, and nothing else says "AR".
describe('product page: the primary call to action opens AR where it can', () => {
  const primaryAr = (name = 'View in my home') => screen.queryAllByRole('button', { name })
  /** Controls that offer to start AR (the "AR tips" link opens the tips; the phone card's "Copy link" / "Show QR code" do not). */
  const arLabelled = () =>
    screen.queryAllByRole('button').filter((b) => b.textContent !== 'AR tips' && /\bAR\b|my home|minha casa/.test(b.textContent ?? ''))
  // jsdom has no scrollIntoView; the 3D action scrolls the stage into view.
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('launches AR from "View in my home": one activateAR call and one AR event per tap', async () => {
    const record = vi.spyOn(service, 'recordEvent')
    openApp('/products/nordhaus/sheen-lounge-chair')
    const el = await viewerFor(/SheenChair\.glb$/)
    loaded(el, true)
    expect(primaryAr()).toHaveLength(1) // exactly one AR entry point
    expect(arLabelled()).toHaveLength(1)
    const [button] = primaryAr()
    fireEvent.click(button!)
    fireEvent.click(button!) // impatient second tap while AR opens: ignored
    await waitFor(() => expect(el.activateAR).toHaveBeenCalledTimes(1))
    fireEvent.click(await screen.findByRole('button', { name: 'View in my home' })) // right after it settles: still guarded
    expect(el.activateAR).toHaveBeenCalledTimes(1)
    expect(record.mock.calls.filter(([e]) => e.type === 'ar_activation')).toHaveLength(1)
  })

  it('goes through the AR tips first when they were not dismissed, then launches once', async () => {
    localStorage.removeItem(AR_TIPS_KEY)
    const record = vi.spyOn(service, 'recordEvent')
    openApp('/products/nordhaus/sheen-lounge-chair')
    const el = await viewerFor(/SheenChair\.glb$/)
    loaded(el, true)
    fireEvent.click(primaryAr()[0]!)
    expect(el.activateAR).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Start AR' }))
    await waitFor(() => expect(el.activateAR).toHaveBeenCalledTimes(1))
    expect(record.mock.calls.filter(([e]) => e.type === 'ar_activation')).toHaveLength(1)
  })

  it('where AR cannot open, offers a working 3D action and no AR-labelled control', async () => {
    openApp('/products/nordhaus/sheen-lounge-chair')
    const el = await viewerFor(/SheenChair\.glb$/)
    expect(arLabelled()).toHaveLength(0) // still checking: nothing offers AR yet
    loaded(el, false)
    expect(arLabelled()).toHaveLength(0)
    expect(screen.getByText('View in your space on a phone')).toBeInTheDocument()
    const [primary] = screen.getAllByRole('button', { name: 'View in 3D' })
    fireEvent.click(primary!)
    expect(screen.getByText('Interactive 3D')).toBeInTheDocument()
    expect(el.activateAR).not.toHaveBeenCalled()
  })

  it('labels the AR and 3D actions in Portuguese', async () => {
    openApp('/products/nordhaus/sheen-lounge-chair?lang=pt')
    const el = await viewerFor(/SheenChair\.glb$/)
    loaded(el, true)
    expect(primaryAr('Ver na minha casa')).toHaveLength(1)
    loaded(el, false)
    expect(primaryAr('Ver na minha casa')).toHaveLength(0)
    expect(screen.getAllByRole('button', { name: 'Visualizar em 3D' }).length).toBeGreaterThan(0)
  })
})

// AR audit 2026-10-26 quick wins (docs/audits/2026-10-26-ar/AR-AUDIT.md). No AR-mode or model-viewer attribute change.
describe('product page: AR audit quick wins', () => {
  const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
  const ANDROID_FIREFOX = 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0'
  const IPHONE_TIKTOK = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_33.0.0'
  const ANDROID_LINKEDIN = `${ANDROID_CHROME} [LinkedInApp]/4.1`
  const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
  const asUserAgent = (ua: string) => vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua)
  const cta = () => document.querySelector('[data-ar-cta]') as HTMLElement
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn()
  })

  it('puts the AR action directly after the stage, before the title and the finish picker (AR-05)', async () => {
    openApp('/products/nordhaus/sheen-lounge-chair')
    const el = await viewerFor(/SheenChair\.glb$/)
    loaded(el, true)
    const button = arButton()!
    const title = screen.getByRole('heading', { name: 'Sheen Lounge Chair', level: 1 })
    const firstSwatch = screen.getByRole('radio', { name: /Purple-Gold Damask/ })
    const follows = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING)
    expect(follows(el, button)).toBe(true)
    expect(follows(button, title)).toBe(true)
    expect(follows(button, firstSwatch)).toBe(true)
    // Desktop keeps the old layout: the block is placed in the text column, under the finish picker.
    expect(cta().className).toMatch(/lg:col-start-1/)
    expect(cta().className).toMatch(/lg:row-start-2/)
  })

  it('shows "Preparing AR…" from the tap until the hand-off settles, and ignores taps meanwhile (AR-06)', async () => {
    const record = vi.spyOn(service, 'recordEvent')
    openApp('/products/nordhaus/sheen-lounge-chair')
    const el = await viewerFor(/SheenChair\.glb$/)
    loaded(el, true)
    let settle: () => void = () => {}
    el.activateAR = vi.fn(() => new Promise<void>((r) => (settle = r)))
    fireEvent.click(arButton()!)
    const busy = await screen.findByRole('button', { name: /Preparing AR/ })
    expect(busy).toHaveAttribute('aria-busy', 'true')
    expect(busy).toBeDisabled()
    fireEvent.click(busy)
    expect(el.activateAR).toHaveBeenCalledTimes(1)
    await act(async () => settle())
    expect(await screen.findByRole('button', { name: 'View in my home' })).toBeEnabled()
    expect(record.mock.calls.filter(([e]) => e.type === 'ar_activation')).toHaveLength(1)
  })

  it('on a phone browser without AR, says which browser to use instead of "open this page on your mobile device" (AR-07)', async () => {
    asUserAgent(ANDROID_FIREFOX)
    openApp('/products/nordhaus/sheen-lounge-chair')
    loaded(await viewerFor(/SheenChair\.glb$/), false)
    expect(screen.queryByText(/Open this page on your mobile device/)).toBeNull()
    expect(screen.getByText("AR isn't available in this browser")).toBeInTheDocument()
    expect(screen.getByText(/Open this page in Chrome to place the piece in your room/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Copy link/ }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Show QR code' })).toBeNull()
  })

  it('in an in-app browser, says to open the page in Safari / Chrome, with a copy-link action (AR-08)', async () => {
    asUserAgent(IPHONE_TIKTOK)
    openApp('/products/nordhaus/sheen-lounge-chair')
    loaded(await viewerFor(/SheenChair\.glb$/), false)
    expect(screen.getByText('Open this page in Safari to use AR')).toBeInTheDocument()
    expect(screen.getByText(/TikTok opens links in its own browser/)).toBeInTheDocument()
    expect(screen.queryByText(/Open this page on your mobile device/)).toBeNull()
    expect(screen.getAllByRole('button', { name: /Copy link/ }).length).toBeGreaterThan(0)
  })

  it('after a failed hand-off in an in-app browser, the message points to Chrome, not the phone (AR-08)', async () => {
    asUserAgent(ANDROID_LINKEDIN)
    openApp('/products/nordhaus/sheen-lounge-chair')
    const el = await viewerFor(/SheenChair\.glb$/)
    loaded(el, true)
    el.canActivateAR = false
    act(() => {
      el.dispatchEvent(new CustomEvent('ar-status', { detail: { status: 'failed' } }))
    })
    expect((await screen.findAllByText('Open this page in Chrome to use AR')).length).toBeGreaterThan(0)
    expect(screen.queryByText(/AR could not start on this device/)).toBeNull()
  })

  it('in Portuguese, the in-app message is translated (AR-08)', async () => {
    asUserAgent(IPHONE_TIKTOK)
    openApp('/products/nordhaus/sheen-lounge-chair?lang=pt')
    loaded(await viewerFor(/SheenChair\.glb$/), false)
    expect(screen.getByText('Abra esta página no Safari para usar a RA')).toBeInTheDocument()
  })

  it("in the phone's own AR browser, does not tell the visitor to open that same browser (AR-07, review)", async () => {
    asUserAgent(IPHONE_SAFARI)
    openApp('/products/nordhaus/sheen-lounge-chair')
    loaded(await viewerFor(/SheenChair\.glb$/), false)
    expect(screen.queryByText(/Open this page in Safari/)).toBeNull()
    expect(screen.getByText("This phone can't start AR. You can still explore the piece in 3D.")).toBeInTheDocument()
  })

  it("in Portuguese, the same neutral line in the phone's own AR browser (AR-07, review)", async () => {
    asUserAgent(IPHONE_SAFARI)
    openApp('/products/nordhaus/sheen-lounge-chair?lang=pt')
    loaded(await viewerFor(/SheenChair\.glb$/), false)
    expect(screen.getByText('Este telemóvel não consegue iniciar a RA. Pode explorar a peça em 3D.')).toBeInTheDocument()
  })

  it('clears "Preparing AR…" after a safety timeout when the hand-off never settles (AR-06, review)', async () => {
    openApp('/products/nordhaus/sheen-lounge-chair')
    const el = await viewerFor(/SheenChair\.glb$/)
    loaded(el, true)
    el.activateAR = vi.fn(() => new Promise<void>(() => {}))
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      fireEvent.click(arButton()!)
      expect(screen.getByRole('button', { name: /Preparing AR/ })).toBeDisabled()
      act(() => {
        vi.advanceTimersByTime(AR_PENDING_MAX_MS - 1)
      })
      expect(screen.getByRole('button', { name: /Preparing AR/ })).toBeDisabled()
      act(() => {
        vi.advanceTimersByTime(1)
      })
      expect(screen.getByRole('button', { name: 'View in my home' })).toBeEnabled()
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows the scale label next to the AR action, and flags a model that does not match (AR-09)', async () => {
    openApp('/products/nordhaus/sheen-lounge-chair')
    const el = await viewerFor(/SheenChair\.glb$/)
    loaded(el, true)
    expect(within(cta()).getByText('True-to-size model')).toBeInTheDocument()
    loaded(el, true, { x: 2, y: 2, z: 2 })
    expect(within(cta()).getByText('AR scale unverified')).toBeInTheDocument()
    expect(within(cta()).queryByText('True-to-size model')).toBeNull()
  })
})
