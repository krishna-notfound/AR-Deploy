import { ArrowLeft, Box, Check, Eye, Globe, HelpCircle, Loader2, Mail, MapPin, PackageX, Phone, Rotate3d } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useAccount } from '@/auth/AccountProvider'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { Modal } from '@/components/ui/Modal'
import { SmartImage } from '@/components/ui/SmartImage'
import { ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import type { ModelLoadInfo, ModelViewerHandle } from '@/components/three/ModelViewer'
import type { Business, LengthUnit, Product } from '@/domain/types'
import { nativeAr, nativeArRoute } from '@/features/ar/nativeAr'
import { arLaunchUrl, pickVariant, variantMedia } from '@/features/ar/variantMedia'
import { LocalizedSpan, useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { sceneViewerUnsupported } from '@/lib/files'
import { convertLength, formatMoney } from '@/lib/format'
import { type MeasuredSize, checkScale } from '@/lib/scale'
import { AR_FALLBACK_HASH, VARIANT_PARAM, catalogLocalPath, needsPreview, quickLookHref, sceneViewerIntentUrl, tenantCatalogPath, withVariantParam } from '@/lib/urls'
import { arBrowserName, detectInAppBrowser, isAndroid } from '@/lib/userAgent'
import { service } from '@/services'
import { MEDIA_URL_TTL_SECONDS } from '@/services/catalogService'
import { useRefreshWhenStale, useServiceQuery } from '@/services/hooks'
import { ArSection, arAvailability } from './ArSection'
import { ArTips, arTipsDismissed } from './ArTips'
import { DimensionDiagram } from './DimensionDiagram'
import { type MediaMode, type ModelState, ProductMedia, initialMediaMode } from './ProductMedia'
import { PublicMessage } from './PublicMessage'
import { PublicShell } from './PublicShell'
import { ShareButton } from './ShareActions'
import { TAP_TARGET } from './tapTarget'
import { VariantPicker } from './VariantPicker'

/** Ignore AR taps this soon after a launch settles (double taps, impatient re-taps while the native viewer opens). */
export const AR_RELAUNCH_MS = 2000
/** Clear "Preparing AR…" if the native hand-off never settles (the page may never hear back from the viewer). */
export const AR_PENDING_MAX_MS = 20_000
/** Signed media URLs last MEDIA_URL_TTL_SECONDS; refetch on return to the tab once half of that has passed. */
const MEDIA_REFRESH_MS = (MEDIA_URL_TTL_SECONDS * 1000) / 2

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

export default function ProductPage({ tenantSlug }: { tenantSlug?: string }) {
  const params = useParams()
  const businessSlug = tenantSlug ?? params.businessSlug ?? ''
  const productSlug = params.productSlug ?? ''
  const [search] = useSearchParams()
  const { user } = useAccount()
  const { t } = useI18n()

  // Draft preview: only with ?preview=1 AND a signed-in demo admin (UX rule, not security).
  const wantsPreview = search.get('preview') === '1'
  const canPreview = wantsPreview && !!user
  // While the account is still loading, a preview request waits: asking without allowDraft would answer
  // "Product not available" for a draft and only then switch to the preview (COR-09).
  const accountPending = wantsPreview && user === undefined
  const res = useServiceQuery(
    () => (accountPending ? new Promise<never>(() => {}) : service.getPublicProduct(businessSlug, productSlug, { allowDraft: canPreview })),
    [businessSlug, productSlug, canPreview, accountPending],
  )
  // Pages left open (mobile tab restore) must not hand an expired model URL to Scene Viewer / Quick Look.
  useRefreshWhenStale(res.refetch, MEDIA_REFRESH_MS, res.data)
  // R-W4-11: the way back keeps the owner preview.
  const catalogHref = tenantSlug ? tenantCatalogPath({ preview: canPreview }) : catalogLocalPath({ slug: businessSlug }, { preview: canPreview })
  // A business admin may only preview their own unpublished products.
  const hiddenFromPublic = !!res.data && needsPreview(res.data.product, res.data.business)
  const ownerMismatch = canPreview && hiddenFromPublic && user?.role === 'business_admin' && res.data?.business.id !== user.businessId

  if (res.status === 'loading' && !res.data)
    return (
      <PublicShell>
        <FullPageSpinner label={t('common.loading')} />
      </PublicShell>
    )

  // R-W4-8: a refetch that says NOT_FOUND (renamed, unpublished, deleted) outranks the kept-stale product and its AR button.
  const gone = res.status === 'error' && res.error.code === 'NOT_FOUND'
  if (!res.data || ownerMismatch || gone) {
    const notFound = gone || ownerMismatch
    return (
      <PublicShell>
        {notFound ? (
          <PublicMessage
            icon={PackageX}
            title={t('product.notFoundTitle')}
            body={t('product.notFoundBody')}
            action={
              <Link to={catalogHref} className="inline-flex h-12 items-center justify-center rounded-full bg-ink px-7 text-[16px] font-medium text-canvas transition-colors hover:bg-umber">
                {t('product.viewCatalog')}
              </Link>
            }
          />
        ) : (
          <ErrorState message={t('common.errorTitle')} onRetry={res.refetch} retryLabel={t('common.retry')} className="py-24" />
        )}
      </PublicShell>
    )
  }

  return <ProductView key={res.data.product.id} business={res.data.business} product={res.data.product} catalogHref={catalogHref} isPreview={canPreview && needsPreview(res.data.product, res.data.business)} />
}

function ProductView({ business, product, catalogHref, isPreview }: { business: Business; product: Product; catalogHref: string; isPreview: boolean }) {
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
  const { state: modelState, canAR, measured } = model
  const [tipsOpen, setTipsOpen] = useState<null | 'before-ar' | 'info'>(null)
  const [unit, setUnit] = useState<LengthUnit>(product.dimensions.unit)
  const [contactOpen, setContactOpen] = useState(false)
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
    if (recorded.current || isPreview) return
    recorded.current = true
    void service.recordEvent({ productId: product.id, businessId: product.businessId, type: 'view' })
  }, [product.id, product.businessId, isPreview])

  // One 3D-interaction event per page view, the first time the visitor turns or zooms the model.
  const interacted = useRef(false)
  const onModelInteract = () => {
    if (interacted.current || isPreview) return
    interacted.current = true
    void service.recordEvent({ productId: product.id, businessId: product.businessId, type: 'model_interaction' })
  }

  useEffect(() => {
    document.title = `${name} · ${business.name}`
  }, [name, business.name])

  const price = product.price + (variant?.priceDelta ?? 0)
  // Scale is checked per model: a variant's file is measured on its own, never credited with another's verdict.
  const scale = useMemo(() => checkScale(measured, product.dimensions), [measured, product.dimensions])
  const separateUsdz = !!media.models.usdz
  // Android hands the GLB to Scene Viewer, which cannot open files that require unsupported extensions (AR-01).
  const modelUnsupported = isAndroid() && sceneViewerUnsupported(model.required ?? media.models.glb?.requiredExtensions).length > 0
  const availability = arAvailability(modelState, canAR, modelUnsupported)
  const additional = product.images.filter((i) => i.kind === 'additional')

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
  const startAR = async () => {
    setTipsOpen(null)
    // The viewer can lose AR after a failed hand-off (e.g. the Google app is missing): no dead button, no event (AR-04).
    if (!viewerRef.current?.canActivateAR()) {
      setCanAR(false)
      toast.error(arFailedMessage())
      return
    }
    const now = performance.now()
    if (launchingRef.current || now - lastLaunch.current < AR_RELAUNCH_MS) return
    launchingRef.current = true
    setLaunching(true)
    lastLaunch.current = now
    setMode('3d') // if AR cannot start, the visitor is left on the 3D model rather than a photo
    if (!isPreview) void service.recordEvent({ productId: product.id, businessId: product.businessId, type: 'ar_activation' })
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
    try {
      await viewerRef.current?.activateAR()
    } catch {
      toast.error(arFailedMessage())
    } finally {
      done()
    }
  }

  // Scene Viewer could not start: Chrome opened the intent's fallback URL, this page with AR_FALLBACK_HASH (same
  // document, or a fresh load). Say so honestly, drop the marker, and leave AR off for this model as after any failed
  // hand-off (AR-04).
  const onArFallback = useRef<() => void>(() => {})
  useEffect(() => {
    onArFallback.current = () => {
      if (window.location.hash !== AR_FALLBACK_HASH) return
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search)
      settleLaunch.current()
      setCanAR(false)
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
  const priceText = formatMoney(price, product.currency, lang)
  // The scale verdict beside the size (AR-09): "true to size" once measured; a mismatch is flagged where AR starts.
  const verdict = modelState === 'loaded' && (scale.status === 'verified' || (scale.status === 'mismatch' && availability === 'available')) ? scale.status : null

  // Phones: AR starts from a bar fixed to the bottom of the screen (reachable without scrolling, AR audit AR-05). The
  // page keeps room for it under its last line.
  const showArBar = modelState === 'loaded' && availability === 'available'
  useEffect(() => {
    if (!showArBar) return
    document.body.classList.add(AR_BAR_SPACE)
    return () => document.body.classList.remove(AR_BAR_SPACE)
  }, [showArBar])

  const hasContact = !!(business.contact.email || business.contact.phone || business.contact.website || business.contact.address)
  const primaryCta =
    'inline-flex h-12 items-center justify-center gap-2.5 rounded-full bg-ink px-7 text-[16px] font-medium text-canvas transition-[background-color,transform] hover:bg-umber motion-safe:duration-200 motion-safe:active:scale-[0.98] lg:h-14 lg:w-full'
  const textAction = cn(TAP_TARGET, 'inline-flex items-center gap-2 text-[15px] font-medium text-ink transition-colors hover:text-accent-ink')
  const material = localized(product.material)
  const description = localized(product.description)
  const shortDescription = localized(product.shortDescription)

  return (
    <PublicShell business={business} catalogHref={catalogHref}>
      {isPreview && (
        <div className="bg-warning-soft">
          <p className="mx-auto flex max-w-[1320px] items-center gap-2 px-4 py-3 text-[14px] font-medium text-warning sm:px-10">
            <Eye className="size-4 shrink-0" aria-hidden />
            {business.status !== 'active' ? t('catalog.previewBanner') : t('product.draftPreview')}
          </p>
        </div>
      )}

      <div className="mx-auto max-w-[1320px] px-4 pt-5 pb-16 sm:px-10 sm:pt-8 lg:pb-24">
        <Link to={catalogHref} className={cn(TAP_TARGET, 'inline-flex items-center gap-2 text-[15px] text-ink-muted transition-colors hover:text-ink')}>
          <ArrowLeft className="size-4" strokeWidth={1.5} aria-hidden />
          {t('product.backToCatalogue', { name: business.name })}
        </Link>

        {/* Phones: name and price, the stage, then the finish, the text and the quiet actions (AR in the bottom bar).
            Desktop: the stage on the left (sticky), the name, price, finish and actions on the right. */}
        <div className="mt-4 grid lg:mt-8 lg:grid-cols-[minmax(0,58fr)_minmax(0,42fr)] lg:grid-rows-[auto_1fr] lg:gap-x-16">
          <header className="min-w-0 lg:col-start-2 lg:row-start-1">
            <LocalizedSpan as="h1" text={product.name} className="line-clamp-2 font-display text-piece font-normal text-balance break-words text-ink" />
            <div data-product-meta className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5 text-[17px] leading-6 text-ink lg:mt-6 lg:block">
              <p className="tabular-nums lg:text-[22px] lg:leading-7">{priceText}</p>
              {(dimsLine || verdict) && (
                <p className="contents text-ink lg:mt-3 lg:flex lg:flex-wrap lg:items-center lg:gap-x-2.5 lg:gap-y-1 lg:text-[16px] lg:text-ink-body">
                  {dimsLine && (
                    <>
                      <span className="text-ink-faint lg:hidden" aria-hidden>
                        ·
                      </span>
                      <span className="tabular-nums">{dimsLine}</span>
                    </>
                  )}
                  {verdict && (
                    <span className="inline-flex items-center gap-2.5 max-lg:basis-full">
                      {dimsLine && (
                        <span className="hidden text-ink-faint lg:inline" aria-hidden>
                          ·
                        </span>
                      )}
                      <ScaleBadge verified={verdict === 'verified'} separateUsdz={separateUsdz} />
                    </span>
                  )}
                </p>
              )}
            </div>
          </header>

          <div ref={stageRef} className="mt-6 min-w-0 scroll-mt-24 lg:sticky lg:top-24 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:mt-0 lg:self-start">
            <ProductMedia
              name={name}
              gallery={media.gallery}
              models={media.models}
              mode={mode}
              onModeChange={setMode}
              viewerRef={viewerRef}
              onArStatus={(s) => {
                if (s !== 'failed') return
                toast.error(arFailedMessage())
                // model-viewer turns AR off after a failed hand-off; follow it so the button goes away (AR-04).
                setCanAR(viewerRef.current?.canActivateAR() ?? false)
              }}
              onInteract={onModelInteract}
              onModelState={onModelState}
              modeSwitch
            />
            {media.fallback && has3d && variant && <p className="mt-3 text-[14px] leading-5 text-ink-muted">{t('ar.variantFallback', { name: localized(variant.name) })}</p>}
          </div>

          <div className="mt-8 flex min-w-0 flex-col gap-8 lg:col-start-2 lg:row-start-2">
            {shortDescription && <LocalizedSpan as="p" text={product.shortDescription} className="order-2 max-w-[38rem] text-body-public text-ink lg:order-1" />}
            <VariantPicker product={product} selectedId={variantId} onSelect={selectVariant} className="order-1 lg:order-2" />

            <div data-ar-cta className="order-3 flex flex-col gap-4">
              {/* Only for a model that loaded (AR-08). Where model-viewer can open AR, the primary action launches it
                  ("View in my home"; on phones in the bottom bar); elsewhere it opens the 3D view and ArSection explains
                  the phone hand-off. */}
              {modelState === 'loaded' &&
                (availability === 'available' ? (
                  <div
                    data-ar-bar
                    className="fixed inset-x-0 bottom-0 z-30 flex items-center justify-between gap-4 bg-surface px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-10 lg:static lg:z-auto lg:block lg:bg-transparent lg:p-0"
                  >
                    <p className="min-w-0 truncate font-display text-[1.625rem] leading-none text-ink tabular-nums lg:hidden" aria-hidden>
                      {priceText}
                    </p>
                    <button type="button" onClick={onActivate} disabled={launching} aria-busy={launching} className={cn(primaryCta, 'shrink-0 disabled:cursor-progress disabled:bg-umber')}>
                      {launching ? <Loader2 className="size-5 animate-spin" strokeWidth={1.5} aria-hidden /> : <Box className="size-5" strokeWidth={1.5} aria-hidden />}
                      {launching ? t('ar.preparing') : t('ar.button')}
                    </button>
                  </div>
                ) : (
                  <button type="button" onClick={open3d} className={cn(primaryCta, 'w-full')}>
                    <Rotate3d className="size-5" strokeWidth={1.5} aria-hidden />
                    {t('product.view3d')}
                  </button>
                ))}
              <ArSection
                availability={availability}
                onShowTips={() => setTipsOpen('info')}
                actions={
                  <>
                    {product.cta.url ? (
                      <a href={product.cta.url} target="_blank" rel="noopener noreferrer" className={textAction}>
                        {localized(product.cta.label).trim() ? <LocalizedSpan text={product.cta.label} /> : t('product.contactStore')}
                      </a>
                    ) : hasContact ? (
                      <button type="button" className={textAction} onClick={() => setContactOpen(true)}>
                        {t('product.contactStore')}
                      </button>
                    ) : null}
                    <ShareButton title={t('product.shareTitle', { name, business: business.name })} />
                  </>
                }
              />
            </div>
          </div>
        </div>

        {/* Details: dimensions with the drawing on the left, the material and the long text on the right. */}
        <div className="mt-12 grid gap-10 rounded-soft-sm bg-subtle p-5 sm:rounded-soft sm:p-8 lg:mt-20 lg:grid-cols-2 lg:gap-16 lg:p-12">
          <section className="min-w-0" aria-labelledby="dims-h">
            <div className="flex items-center justify-between gap-3">
              <h2 id="dims-h" className="text-[20px] leading-7 text-ink lg:text-[24px]">
                {t('product.dimensions')}
              </h2>
              <UnitSwitch value={unit} onChange={setUnit} label={t('product.unitToggle')} />
            </div>
            <div className="mt-5 rounded-soft-sm bg-surface p-5 sm:p-8">
              <DimensionDiagram dims={product.dimensions} unit={unit} />
              <dl className="mt-5 grid grid-cols-3 gap-3 text-center">
                {(['width', 'depth', 'height'] as const).map((k) => (
                  <div key={k}>
                    <dt className="text-[14px] leading-5 text-ink-muted">{t(`product.${k}`)}</dt>
                    <dd className="mt-1 text-[16px] leading-6 text-ink tabular-nums">
                      {fmtLen(product.dimensions[k])} {unit}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
            {scale.status !== 'unknown' && modelState === 'loaded' && <ScaleNote verified={scale.status === 'verified'} separateUsdz={separateUsdz} measured={scale.measured} unit={unit} />}
          </section>

          <div className="flex min-w-0 flex-col gap-8">
            {material && (
              <section aria-labelledby="material-h">
                <h2 id="material-h" className="text-[20px] leading-7 text-ink lg:text-[24px]">
                  {t('product.material')}
                </h2>
                <LocalizedSpan as="p" text={product.material} className="mt-2 text-body-public text-ink" />
              </section>
            )}
            {description && (
              <section aria-labelledby="desc-h">
                <h2 id="desc-h" className="text-[20px] leading-7 text-ink lg:text-[24px]">
                  {t('product.description')}
                </h2>
                <LocalizedSpan as="p" text={product.description} className="mt-2 max-w-prose text-body-public whitespace-pre-line text-ink" />
              </section>
            )}
            <dl className="flex flex-wrap gap-x-10 gap-y-4">
              {product.weight && (
                <div>
                  <dt className="text-[14px] leading-5 text-ink-muted">{t('product.weight')}</dt>
                  <dd className="mt-1 text-[16px] leading-6 text-ink tabular-nums">
                    {product.weight.value} {product.weight.unit}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-[14px] leading-5 text-ink-muted">{t('product.category')}</dt>
                <dd className="mt-1 text-[16px] leading-6 text-ink">{t(`category.${product.category}`)}</dd>
              </div>
            </dl>
          </div>
        </div>

        {additional.length > 0 && (
          <section className="mt-12 lg:mt-20" aria-labelledby="more-h">
            <h2 id="more-h" className="text-[20px] leading-7 text-ink lg:text-[24px]">
              {t('product.morePhotos')}
            </h2>
            <ul className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
              {additional.map((img) => (
                <li key={img.id}>
                  <SmartImage src={img.url} alt={img.alt || name} className="aspect-[4/3] w-full rounded-soft-sm bg-subtle sm:rounded-soft" />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <ArTips open={tipsOpen !== null} onClose={() => setTipsOpen(null)} onStart={tipsOpen === 'before-ar' ? () => void startAR() : undefined} />

      <Modal open={contactOpen} onClose={() => setContactOpen(false)} title={business.name} size="sm" closeLabel={t('common.close')}>
        <ul className="space-y-3 pb-2 text-[15px]">
          {business.contact.email && (
            <li className="flex items-center gap-3">
              <Mail className="size-4 text-ink-muted" aria-hidden />
              <a className="min-w-0 break-all text-accent-ink underline underline-offset-4" href={`mailto:${business.contact.email}?subject=${encodeURIComponent(name)}`}>
                {business.contact.email}
              </a>
            </li>
          )}
          {business.contact.phone && (
            <li className="flex items-center gap-3">
              <Phone className="size-4 text-ink-muted" aria-hidden />
              <a className="text-accent-ink underline underline-offset-4" href={`tel:${business.contact.phone.replace(/\s/g, '')}`}>
                {business.contact.phone}
              </a>
            </li>
          )}
          {business.contact.website && (
            <li className="flex items-center gap-3">
              <Globe className="size-4 text-ink-muted" aria-hidden />
              <a className="min-w-0 break-all text-accent-ink underline underline-offset-4" href={business.contact.website} target="_blank" rel="noopener noreferrer">
                {business.contact.website.replace(/^https?:\/\//, '')}
              </a>
            </li>
          )}
          {business.contact.address && (
            <li className="flex items-center gap-3">
              <MapPin className="size-4 text-ink-muted" aria-hidden />
              {business.contact.address}
            </li>
          )}
        </ul>
      </Modal>
    </PublicShell>
  )
}

/** Room under the page for the phone's AR bar (body class while the bar shows; desktop has no bar). */
const AR_BAR_SPACE = 'max-lg:pb-[calc(5.5rem+env(safe-area-inset-bottom))]'

/**
 * Copy for the scale note. Only the GLB is measured. Without a USDZ, iPhone Quick Look gets a file generated from
 * that GLB, so "true to size" holds for both AR viewers; an uploaded USDZ is never measured, so the claim is
 * limited to the 3D model (COR-10).
 */
export function scaleNoteKeys(verified: boolean, separateUsdz: boolean) {
  if (!verified) return { title: 'ar.scaleUnverified', help: 'ar.scaleUnverifiedHelp' } as const
  if (separateUsdz) return { title: 'ar.scaleVerifiedModel', help: 'ar.scaleVerifiedUsdzHelp' } as const
  return { title: 'ar.scaleVerified', help: 'ar.scaleVerifiedHelp' } as const
}

/** The quiet scale line under the dimensions: the verdict and why. */
function ScaleNote({ verified, separateUsdz, measured, unit }: { verified: boolean; separateUsdz: boolean; measured: MeasuredSize; unit: LengthUnit }) {
  const { t } = useI18n()
  const keys = scaleNoteKeys(verified, separateUsdz)
  const toUnit = (m: number) => {
    const v = unit === 'cm' ? m * 100 : (m * 100) / 2.54
    return Math.round(v)
  }
  const size = `${toUnit(measured.x)} × ${toUnit(measured.y)} × ${toUnit(measured.z)} ${unit}`
  const Icon = verified ? Check : HelpCircle
  return (
    <p className="mt-4 flex items-start gap-2 text-[14px] leading-5 text-ink-body">
      <Icon className="mt-0.5 size-4 shrink-0 text-ink" strokeWidth={1.5} aria-hidden />
      <span>
        <span className="font-medium text-ink">{t(keys.title)}</span> {t(keys.help)} {!verified && t('ar.modelMeasures', { size })}
      </span>
    </p>
  )
}

/**
 * The scale verdict on the size line (AR-09). "True to size in AR" only when no separate, unmeasured USDZ is used for
 * iPhone (COR-10); otherwise the same labels as the scale note.
 */
function ScaleBadge({ verified, separateUsdz }: { verified: boolean; separateUsdz: boolean }) {
  const { t } = useI18n()
  const label = verified && !separateUsdz ? t('product.trueToSizeAr') : t(scaleNoteKeys(verified, separateUsdz).title)
  const Icon = verified ? Check : HelpCircle
  return (
    <span className={cn('inline-flex items-center gap-1.5', verified ? 'text-ink' : 'text-ink-muted')}>
      <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
      {label}
    </span>
  )
}

/** cm / in as a pill switch (radio group). */
function UnitSwitch({ value, onChange, label }: { value: LengthUnit; onChange: (u: LengthUnit) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-full bg-surface p-1">
      {(['cm', 'in'] as const).map((u) => (
        <button
          key={u}
          type="button"
          role="radio"
          aria-checked={value === u}
          onClick={() => onChange(u)}
          className={cn(
            "relative inline-flex h-9 min-w-12 items-center justify-center rounded-full px-3.5 text-[14px] font-medium transition-colors before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] motion-safe:duration-200",
            value === u ? 'bg-ink text-canvas' : 'text-ink-muted hover:text-ink',
          )}
        >
          {u}
        </button>
      ))}
    </div>
  )
}
