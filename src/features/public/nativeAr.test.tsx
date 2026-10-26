import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { nativeAr, nativeArRoute } from '@/features/ar/nativeAr'
import { service } from '@/services'
import { AR_TIPS_KEY } from './ArTips'

// Owner 2026-10-26: "View in my home" opens the phone's own AR viewer directly (ADR-0021: Scene Viewer, Quick Look).
// The real web component needs WebGL: the element is a plain custom tag here, and the tests play its events.
vi.mock('@google/model-viewer', () => ({}))

type FakeViewer = HTMLElement & { canActivateAR?: boolean; activateAR?: () => Promise<void>; loaded?: boolean; getDimensions?: () => { x: number; y: number; z: number } }

const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const USDZ = 'https://cdn.test/sign/sheen.usdz?token=t1'

function openApp(url: string) {
  window.history.replaceState(null, '', url)
  return render(<App />)
}
const viewer = () => document.querySelector('model-viewer') as FakeViewer | null
async function viewerFor(file: RegExp): Promise<FakeViewer> {
  await waitFor(() => expect(viewer()?.getAttribute('src')).toMatch(file), { timeout: 10_000 })
  await act(async () => {}) // let the wrapper attach its event listeners
  return viewer()!
}
/** Plays a finished load; the default size matches the Sheen chair's listed dimensions (true to size). */
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
const asUserAgent = (ua: string) => vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ua)
const arEvents = (record: { mock: { calls: unknown[][] } }) => record.mock.calls.filter(([e]) => (e as { type: string }).type === 'ar_activation')
const mockNavigate = () => vi.spyOn(nativeAr, 'navigate').mockImplementation(() => {})
function captureClicks() {
  const clicked: HTMLAnchorElement[] = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    clicked.push(this)
  })
  return () => clicked.filter((a) => a.rel === 'ar')
}

/** Gives the product (and, when asked, each finish with its own GLB) an uploaded USDZ, as a business would. */
function withUsdz(variants = false) {
  const real = service.getPublicProduct.bind(service)
  vi.spyOn(service, 'getPublicProduct').mockImplementation(async (...args) => {
    const res = await real(...args)
    if (!res.ok) return res
    const usdz = { format: 'usdz' as const, url: USDZ, fileName: 'sheen.usdz', status: 'valid' as const }
    const product = { ...res.data.product, models: { ...res.data.product.models, usdz } }
    if (variants)
      product.variants = product.variants.map((v) => (v.models?.glb ? { ...v, models: { ...v.models, usdz: { ...usdz, url: `https://cdn.test/sign/${v.id}.usdz?token=t2` } } } : v))
    return { ...res, data: { ...res.data, product } }
  })
}

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  Element.prototype.scrollIntoView = vi.fn()
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem(AR_TIPS_KEY, '1') // straight to AR, no tips dialog
  await service.resetDemoData()
})

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('product page: AR on Android opens inside Chrome first (model-viewer WebXR, ADR-0035)', () => {
  it('the tap calls model-viewer activateAR once (no Scene Viewer intent from the page), one event', { timeout: 20_000 }, async () => {
    asUserAgent(ANDROID_CHROME)
    const navigate = mockNavigate()
    const record = vi.spyOn(service, 'recordEvent')
    openApp('/products/nordhaus/sheen-lounge-chair')
    const el = await viewerFor(/SheenChair\.glb$/)
    loaded(el, true)
    fireEvent.click(arButton()!)
    await waitFor(() => expect(el.activateAR).toHaveBeenCalledTimes(1))
    expect(navigate).not.toHaveBeenCalled()
    expect(arEvents(record)).toHaveLength(1)
    expect(await screen.findByRole('button', { name: 'View in my home' })).toBeEnabled()
  })

  it('goes through the AR tips first, then starts AR from "Start AR" (one event)', async () => {
    localStorage.removeItem(AR_TIPS_KEY)
    asUserAgent(ANDROID_CHROME)
    const record = vi.spyOn(service, 'recordEvent')
    openApp('/products/nordhaus/sheen-lounge-chair')
    const el = await viewerFor(/SheenChair\.glb$/)
    loaded(el, true)
    fireEvent.click(arButton()!)
    expect(el.activateAR).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Start AR' }))
    await waitFor(() => expect(el.activateAR).toHaveBeenCalledTimes(1))
    expect(arEvents(record)).toHaveLength(1)
  })

  it("a selected finish starts AR on that finish's own model (the 3D view shows it)", async () => {
    asUserAgent(ANDROID_CHROME)
    openApp('/products/nordhaus/sheen-lounge-chair')
    loaded(await viewerFor(/SheenChair\.glb$/), true)
    fireEvent.click(screen.getByRole('radio', { name: /Purple-Gold Damask/ }))
    const el = await viewerFor(/ChairDamaskPurplegold\.glb$/)
    loaded(el, true)
    fireEvent.click(arButton()!)
    await waitFor(() => expect(el.activateAR).toHaveBeenCalledTimes(1))
  })
})

describe('product page: Scene Viewer could not start (model-viewer fallback)', () => {
  // AR audit 2026-10-26: when WebXR falls back to Scene Viewer and that fails, Chrome reopens the page with
  // model-viewer's own marker. The page must say so and not offer the same dead button again.
  it('a page opened with #model-viewer-no-ar-fallback drops the marker, shows no AR button and says AR failed', async () => {
    asUserAgent(ANDROID_CHROME)
    openApp('/products/nordhaus/sheen-lounge-chair#model-viewer-no-ar-fallback')
    const el = await viewerFor(/SheenChair\.glb$/)
    loaded(el, true)
    await waitFor(() => expect(window.location.hash).toBe(''))
    expect(arButton()).toBeNull()
    expect(await screen.findByText('AR could not start on this device. You can still explore the 3D model.')).toBeInTheDocument()
  })
})

describe('nativeArRoute', () => {
  it('Android: model-viewer (WebXR first) by default; the direct Scene Viewer route only when WebXR first is off', () => {
    expect(nativeArRoute(false, ANDROID_CHROME)).toBe('model-viewer')
    expect(nativeArRoute(true, ANDROID_CHROME)).toBe('model-viewer')
    expect(nativeArRoute(false, ANDROID_CHROME, false)).toBe('scene-viewer')
  })
  it('iPhone: Quick Look with a USDZ, model-viewer without', () => {
    expect(nativeArRoute(true, IPHONE_SAFARI)).toBe('quick-look')
    expect(nativeArRoute(false, IPHONE_SAFARI)).toBe('model-viewer')
  })
})

describe('product page: direct native AR launch on iPhone (Quick Look)', () => {
  it('with an uploaded USDZ: clicks an a[rel=ar] holding an img, with the USDZ href', async () => {
    asUserAgent(IPHONE_SAFARI)
    withUsdz(true) // the chair's first finish has its own GLB, so it brings its own USDZ
    const arLinks = captureClicks()
    const record = vi.spyOn(service, 'recordEvent')
    openApp('/products/nordhaus/sheen-lounge-chair')
    const el = await viewerFor(/SheenChair\.glb$/)
    loaded(el, true)
    fireEvent.click(arButton()!)
    expect(arLinks()).toHaveLength(1)
    expect(arLinks()[0]!.firstElementChild?.tagName).toBe('IMG')
    const res = await service.getProductById('prd_sheen_chair')
    const first = res.ok ? res.data.variants[0]!.id : ''
    expect(arLinks()[0]!.getAttribute('href')).toBe(`https://cdn.test/sign/${first}.usdz?token=t2#allowsContentScaling=0`)
    expect(el.activateAR).not.toHaveBeenCalled()
    expect(arEvents(record)).toHaveLength(1)
  })

  it("a selected finish opens that finish's own USDZ", async () => {
    asUserAgent(IPHONE_SAFARI)
    withUsdz(true)
    const arLinks = captureClicks()
    openApp('/products/nordhaus/sheen-lounge-chair')
    loaded(await viewerFor(/SheenChair\.glb$/), true)
    fireEvent.click(screen.getByRole('radio', { name: /Purple-Gold Damask/ }))
    loaded(await viewerFor(/ChairDamaskPurplegold\.glb$/), true)
    fireEvent.click(arButton()!)
    const res = await service.getProductById('prd_sheen_chair')
    const second = res.ok ? res.data.variants[1]!.id : ''
    expect(arLinks()[0]!.getAttribute('href')).toContain(`/sign/${second}.usdz?token=t2`)
  })

  it('without a USDZ: model-viewer builds one (activateAR), with "Preparing AR…"', async () => {
    asUserAgent(IPHONE_SAFARI)
    const navigate = vi.spyOn(nativeAr, 'navigate')
    const arLinks = captureClicks()
    openApp('/products/nordhaus/sheen-lounge-chair')
    const el = await viewerFor(/SheenChair\.glb$/)
    loaded(el, true)
    let settle: () => void = () => {}
    el.activateAR = vi.fn(() => new Promise<void>((r) => (settle = r)))
    fireEvent.click(arButton()!)
    expect(await screen.findByRole('button', { name: /Preparing AR/ })).toBeDisabled()
    expect(el.activateAR).toHaveBeenCalledTimes(1)
    expect(navigate).not.toHaveBeenCalled()
    expect(arLinks()).toHaveLength(0)
    await act(async () => settle())
    expect(await screen.findByRole('button', { name: 'View in my home' })).toBeEnabled()
  })
})

describe('product page: native AR opens the public copy (ar-models) when the model has one', () => {
  const PUBLIC = 'https://ref.supabase.co/storage/v1/object/public/ar-models/'
  /** Gives every GLB (product and finishes) a publicUrl, and the product and finishes a USDZ with one, as sync-ar-models would. */
  function withPublicCopies() {
    const real = service.getPublicProduct.bind(service)
    vi.spyOn(service, 'getPublicProduct').mockImplementation(async (...args) => {
      const res = await real(...args)
      if (!res.ok) return res
      const p = res.data.product
      const usdz = (key: string) => ({ format: 'usdz' as const, url: `https://cdn.test/sign/${key}.usdz?token=t3`, publicUrl: `${PUBLIC}${key}.usdz`, fileName: `${key}.usdz`, status: 'valid' as const })
      const glb = <T extends { url: string }>(m: T | undefined, key: string) => (m ? { ...m, publicUrl: `${PUBLIC}${key}.glb` } : m)
      const product = {
        ...p,
        models: { ...p.models, glb: glb(p.models.glb, 'base'), usdz: usdz('base') },
        variants: p.variants.map((v) => (v.models?.glb ? { ...v, models: { ...v.models, glb: glb(v.models.glb, v.id), usdz: usdz(v.id) } } : v)),
      }
      return { ...res, data: { ...res.data, product } }
    })
  }
  const firstFinish = async () => {
    const res = await service.getProductById('prd_sheen_chair')
    return res.ok ? res.data.variants[0]!.id : ''
  }

  it('iPhone: the Quick Look href is the public USDZ URL', async () => {
    asUserAgent(IPHONE_SAFARI)
    withPublicCopies()
    const arLinks = captureClicks()
    openApp('/products/nordhaus/sheen-lounge-chair')
    loaded(await viewerFor(/\/ar-models\/.+\.glb$/), true)
    fireEvent.click(arButton()!)
    expect(arLinks()).toHaveLength(1)
    expect(arLinks()[0]!.getAttribute('href')).toBe(`${PUBLIC}${await firstFinish()}.usdz#allowsContentScaling=0`)
  })

})

describe('product page: the 3D view and its AR use the public copy when the model has one (ADR-0035)', () => {
  it('model-viewer src is the public GLB, so its WebXR and Scene Viewer fallback never get a private signed link', async () => {
    asUserAgent(ANDROID_CHROME)
    const PUBLIC = 'https://ref.supabase.co/storage/v1/object/public/ar-models/'
    const real = service.getPublicProduct.bind(service)
    vi.spyOn(service, 'getPublicProduct').mockImplementation(async (...args: Parameters<typeof service.getPublicProduct>) => {
      const res = await real(...args)
      if (!res.ok) return res
      const p = res.data.product
      const product = { ...p, variants: p.variants.map((v) => (v.models?.glb ? { ...v, models: { ...v.models, glb: { ...v.models.glb, publicUrl: `${PUBLIC}${v.id}.glb` } } } : v)) }
      return { ...res, data: { ...res.data, product } }
    })
    openApp('/products/nordhaus/sheen-lounge-chair')
    const el = await viewerFor(/\/ar-models\/.+\.glb$/)
    expect(el.getAttribute('src')).toMatch(new RegExp(`^${PUBLIC}`))
  })
})
