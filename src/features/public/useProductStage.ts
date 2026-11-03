import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useToast } from '@/components/ui/ToastProvider'
import type { ArStatus, ModelLoadInfo, ModelViewerHandle } from '@/components/three/ModelViewer'
import type { LengthUnit, Product } from '@/domain/types'
import { nativeAr, nativeArRoute } from '@/features/ar/nativeAr'
import { arLaunchUrl, pickVariant, variantMedia } from '@/features/ar/variantMedia'
import { useI18n } from '@/i18n/LanguageProvider'
import { sceneViewerUnsupported } from '@/lib/files'
import { convertLength, formatMoney } from '@/lib/format'
import { type MeasuredSize, checkScale } from '@/lib/scale'
import { AR_FALLBACK_HASH, MODEL_VIEWER_FALLBACK_HASH, VARIANT_PARAM, quickLookHref, sceneViewerIntentUrl, withVariantParam } from '@/lib/urls'
import { arBrowserName, detectInAppBrowser, isAndroid } from '@/lib/userAgent'
import { service } from '@/services'
import { MEDIA_URL_TTL_SECONDS } from '@/services/catalogService'
import { arAvailability } from './ArSection'
import { arTipsDismissed } from './ArTips'
import { type MediaMode, type ModelState, initialMediaMode } from './ProductMedia'

/** Ignore AR taps this soon after a launch settles (double taps, impatient re-taps while the native viewer opens). */
export const AR_RELAUNCH_MS = 2000
/** Clear "Preparing AR…" if the native hand-off never settles (the page may never hear back from the viewer). */
export const AR_PENDING_MAX_MS = 20_000
/** Signed media URLs last MEDIA_URL_TTL_SECONDS; refetch on return to the tab once half of that has passed. */
export const MEDIA_REFRESH_MS = (MEDIA_URL_TTL_SECONDS * 1000) / 2

/** What the page knows about the model on the stage. Keyed by its GLB URL: another variant's model starts afresh. */
interface ModelInfo {
  key: string
  state: ModelState
  canAR: boolean
  measured: MeasuredSize | null
  /** extensionsRequired of the loaded file (undefined until loaded). */
  required?: string[]
}
const freshModel = (key: string): ModelInfo => ({ key, state: key ? 'loading' : 'none', canAR: false, measured: null })

/**
 * Everything the product pages share about one product: the selected finish, its photos and 3D model, the AR
 * availability and launch (WebXR / Scene Viewer / Quick Look through model-viewer, ADR-0035), the scale check and the
 * units. The business page and the showcase page (ADR-0047) differ only in layout, so both call this hook.
 * `record` is false for an owner preview and for the showcase: no analytics event is written.
 */
export function useProductStage(product: Product, { record }: { record: boolean }) {
  const { t, lang, localized } = useI18n()
  const toast = useToast()
  const viewerRef = useRef<ModelViewerHandle>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [search, setSearch] = useSearchParams()
  // ?variant=<id> opens the page on that finish (shared links, QR codes); unknown ids fall back to the first.
  const [variantId, setVariantId] = useState(() => pickVariant(product.variants, search.get(VARIANT_PARAM))?.id)
  const variant = product.variants.find((v) => v.id === variantId)
  // Photos, 3D model and AR target of the selected variant, never a mix of two sources.
  const media = useMemo(() => variantMedia(product, variant), [product, variant])
  const modelKey = media.models.glb ? arLaunchUrl(media.models.glb) : '' // the URL ProductMedia loads (public copy first)
  const [mode, setMode] = useState<MediaMode>(() => initialMediaMode(media))
  const [storedModel, setModel] = useState<ModelInfo>(() => freshModel(modelKey))
  // A variant switch resets loading, AR and scale state, so "View in my home" never opens the previous file.
  const model = storedModel.key === modelKey ? storedModel : freshModel(modelKey)
  if (model !== storedModel) setModel(model)
  // A Scene Viewer fallback that came back failed (the page reopened with its marker) means this phone cannot open
  // the native viewer: keep AR off for the visit, even after the model loads again (AR audit 2026-10-26).
  const [arHandOffFailed, setArHandOffFailed] = useState(false)
  const { state: modelState, measured } = model
  const canAR = model.canAR && !arHandOffFailed
  const [tipsOpen, setTipsOpen] = useState<null | 'before-ar' | 'info'>(null)
  const [unit, setUnit] = useState<LengthUnit>(product.dimensions.unit)
  const name = localized(product.name)
  const has3d = modelState === 'loading' || modelState === 'loaded'
  const setCanAR = (value: boolean) => setModel((m) => (m.key === modelKey ? { ...m, canAR: value } : m))
  // In an in-app browser the hand-off fails because of the app, not the phone: say which browser to use (AR-08).
  const arFailedMessage = () => (detectInAppBrowser() ? t('ar.inAppTitle', { browser: arBrowserName() }) : t('ar.failed'))

  const selectVariant = (id: string) => {
    setVariantId(id)
    setSearch((prev) => withVariantParam(prev, id), { replace: true, preventScrollReset: true })
  }

  const onModelState = (url: string, s: ModelState, info?: ModelLoadInfo) =>
    setModel((m) => {
      if (m.key !== url) return m // a late report about another variant's model
      if (info) return { ...m, state: s, canAR: info.canActivateAR, measured: info.dimensions, required: info.requiredExtensions }
      return s === 'loaded' ? { ...m, state: s } : { ...m, state: s, canAR: false, measured: null }
    })

  // Record one product view per page load (StrictMode-safe via ref).
  const recorded = useRef(false)
  useEffect(() => {
    if (recorded.current || !record) return
    recorded.current = true
    void service.recordEvent({ productId: product.id, businessId: product.businessId, type: 'view' })
  }, [product.id, product.businessId, record])

  // One 3D-interaction event per page view, the first time the visitor turns or zooms the model.
  const interacted = useRef(false)
  const onModelInteract = () => {
    if (interacted.current || !record) return
    interacted.current = true
    void service.recordEvent({ productId: product.id, businessId: product.businessId, type: 'model_interaction' })
  }

  const price = product.price + (variant?.priceDelta ?? 0)
  // Scale is checked per model: a variant's file is measured on its own, never credited with another's verdict.
  const scale = useMemo(() => checkScale(measured, product.dimensions), [measured, product.dimensions])
  const separateUsdz = !!media.models.usdz
  // Android hands the GLB to Scene Viewer, which cannot open files that require unsupported extensions (AR-01).
  const modelUnsupported = isAndroid() && sceneViewerUnsupported(model.required ?? media.models.glb?.requiredExtensions).length > 0
  const availability = arAvailability(modelState, canAR, modelUnsupported)
  const additional = product.images.filter((i) => i.kind === 'additional')
  const hasCta = modelState === 'loaded' || availability !== 'none'

  const open3d = () => {
    setMode('3d')
    stageRef.current?.scrollIntoView({ block: 'nearest' })
  }

  // One launch attempt (and one 'ar_activation' event) per tap. Taps are ignored while a launch is pending (iPhone
  // builds the USDZ first, which can take seconds) and for AR_RELAUNCH_MS after it settles (AR audit AR-06).
  // The event means "visitor tried to open AR", never "the piece was placed".
  const lastLaunch = useRef(-Infinity)
  const launchingRef = useRef(false)
  /** Ends the pending launch ("Preparing AR…"); set by each launch. */
  const settleLaunch = useRef<() => void>(() => {})
  const [launching, setLaunching] = useState(false)
  const activateInFlight = useRef(false)
  const startAR = async () => {
    setTipsOpen(null)
    // The viewer can lose AR after a failed hand-off (e.g. the Google app is missing): no dead button, no event (AR-04).
    if (!viewerRef.current?.canActivateAR()) {
      setCanAR(false)
      toast.error(arFailedMessage())
      return
    }
    const now = performance.now()
    if (launchingRef.current || activateInFlight.current || now - lastLaunch.current < AR_RELAUNCH_MS) return
    launchingRef.current = true
    setLaunching(true)
    lastLaunch.current = now
    setMode('3d') // if AR cannot start, the visitor is left on the 3D model rather than a photo
    if (record) void service.recordEvent({ productId: product.id, businessId: product.businessId, type: 'ar_activation' })
    let unlisten = () => {}
    const done = () => {
      clearTimeout(safety)
      unlisten()
      if (!launchingRef.current) return
      launchingRef.current = false
      setLaunching(false)
      lastLaunch.current = performance.now()
    }
    settleLaunch.current = done
    const safety = setTimeout(done, AR_PENDING_MAX_MS)
    // The phone's own viewer, opened directly and synchronously inside the tap (owner 2026-10-26, ADR-0021). The
    // file is the one the 3D view shows: the selected finish's own GLB/USDZ (variantMedia).
    const trueToSize = scale.status === 'verified'
    const pageUrl = window.location.href
    const route = nativeArRoute(!!media.models.usdz)
    if (route === 'scene-viewer' && media.models.glb) {
      // The intent leaves the page: "Preparing AR…" ends when the page is hidden or shown again, on the fallback
      // (AR_FALLBACK_HASH), or by the safety timeout.
      const onVisibility = () => document.visibilityState === 'visible' && done()
      window.addEventListener('pagehide', done)
      window.addEventListener('pageshow', done)
      document.addEventListener('visibilitychange', onVisibility)
      unlisten = () => {
        window.removeEventListener('pagehide', done)
        window.removeEventListener('pageshow', done)
        document.removeEventListener('visibilitychange', onVisibility)
      }
      try {
        nativeAr.navigate(sceneViewerIntentUrl({ file: arLaunchUrl(media.models.glb), title: name, pageUrl, trueToSize }))
      } catch {
        toast.error(arFailedMessage())
        done()
      }
      return
    }
    if (route === 'quick-look' && media.models.usdz) {
      try {
        nativeAr.openQuickLook(quickLookHref(arLaunchUrl(media.models.usdz), { trueToSize, pageUrl }))
      } catch {
        toast.error(arFailedMessage())
      } finally {
        done()
      }
      return
    }
    // model-viewer may be building the iPhone file from the GLB, which can outlast the safety timeout: no second
    // build until this one settles (AR audit 2026-10-26, M3).
    activateInFlight.current = true
    try {
      await viewerRef.current?.activateAR()
    } catch {
      toast.error(arFailedMessage())
    } finally {
      activateInFlight.current = false
      done()
    }
  }

  // Scene Viewer could not start: Chrome opened the intent's fallback URL, this page with AR_FALLBACK_HASH or, from
  // model-viewer's own Scene Viewer fallback, MODEL_VIEWER_FALLBACK_HASH (same
  // document, or a fresh load). Say so honestly, drop the marker, and leave AR off for this model as after any failed
  // hand-off (AR-04).
  const onArFallback = useRef<() => void>(() => {})
  useEffect(() => {
    onArFallback.current = () => {
      if (window.location.hash !== AR_FALLBACK_HASH && window.location.hash !== MODEL_VIEWER_FALLBACK_HASH) return
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
      settleLaunch.current()
      setCanAR(false)
      setArHandOffFailed(true)
      toast.error(arFailedMessage())
    }
  })
  useEffect(() => {
    const check = () => onArFallback.current()
    check()
    window.addEventListener('hashchange', check)
    return () => window.removeEventListener('hashchange', check)
  }, [])

  const onActivate = () => {
    if (arTipsDismissed()) void startAR()
    else setTipsOpen('before-ar')
  }

  const fmtLen = (v: number) => {
    const c = convertLength(v, product.dimensions.unit, unit)
    return Number.isInteger(c) ? String(c) : c.toFixed(1)
  }
  const { width: dw, height: dh, depth: dd } = product.dimensions
  const dimsLine = dw > 0 && dh > 0 && dd > 0 ? t('product.dimsLine', { w: fmtLen(dw), d: fmtLen(dd), h: fmtLen(dh), unit }) : ''

  return {
    name,
    variantId,
    variant,
    selectVariant,
    media,
    mode,
    stageRef,
    modelState,
    has3d,
    availability,
    hasCta,
    scale,
    separateUsdz,
    launching,
    onActivate,
    open3d,
    priceText: formatMoney(price, product.currency, lang),
    additional,
    unit,
    setUnit,
    fmtLen,
    dimsLine,
    /** Props of the ArTips dialog. */
    tips: { open: tipsOpen !== null, onClose: () => setTipsOpen(null), onStart: tipsOpen === 'before-ar' ? () => void startAR() : undefined },
    showTips: () => setTipsOpen('info'),
    /** Props that connect ProductMedia to this state. */
    mediaProps: {
      name,
      gallery: media.gallery,
      models: media.models,
      mode,
      onModeChange: setMode,
      viewerRef,
      onArStatus: (s: ArStatus) => {
        if (s !== 'failed') return
        toast.error(arFailedMessage())
        // model-viewer turns AR off after a failed hand-off; follow it so the button goes away (AR-04).
        setCanAR(viewerRef.current?.canActivateAR() ?? false)
      },
      onInteract: onModelInteract,
      onModelState,
    },
  }
}

export type ProductStage = ReturnType<typeof useProductStage>
