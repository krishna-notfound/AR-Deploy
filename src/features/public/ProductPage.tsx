import { ArrowLeft, Box, CheckCircle2, Eye, Globe, HelpCircle, Images, Mail, MapPin, PackageX, Phone, Smartphone } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useAccount } from '@/auth/AccountProvider'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { ButtonLink } from '@/components/ui/Button'
import { SegmentedControl } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { SmartImage } from '@/components/ui/SmartImage'
import { ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import type { ModelLoadInfo, ModelViewerHandle } from '@/components/three/ModelViewer'
import type { Business, LengthUnit, Product } from '@/domain/types'
import { pickVariant, variantMedia } from '@/features/ar/variantMedia'
import { LocalizedSpan, useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { sceneViewerUnsupported } from '@/lib/files'
import { convertLength, formatMoney } from '@/lib/format'
import { type MeasuredSize, checkScale } from '@/lib/scale'
import { VARIANT_PARAM, catalogLocalPath, needsPreview, tenantCatalogPath, withVariantParam } from '@/lib/urls'
import { isAndroid } from '@/lib/userAgent'
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

/** Ignore AR taps this soon after a launch (double taps, impatient re-taps while the native viewer opens). */
export const AR_RELAUNCH_MS = 2000
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
              <ButtonLink to={catalogHref} variant="brand">
                {t('product.viewCatalog')}
              </ButtonLink>
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
  const modelKey = media.models.glb?.url ?? ''
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

  // One launch attempt (and one 'ar_activation' event) per tap; taps within AR_RELAUNCH_MS of a launch are ignored.
  // The event means "visitor tried to open AR", never "the piece was placed".
  const lastLaunch = useRef(-Infinity)
  const startAR = async () => {
    setTipsOpen(null)
    // The viewer can lose AR after a failed hand-off (e.g. the Google app is missing): no dead button, no event (AR-04).
    if (!viewerRef.current?.canActivateAR()) {
      setCanAR(false)
      toast.error(t('ar.failed'))
      return
    }
    const now = performance.now()
    if (now - lastLaunch.current < AR_RELAUNCH_MS) return
    lastLaunch.current = now
    setMode('3d') // if AR cannot start, the visitor is left on the 3D model rather than a photo
    if (!isPreview) void service.recordEvent({ productId: product.id, businessId: product.businessId, type: 'ar_activation' })
    try {
      await viewerRef.current?.activateAR()
    } catch {
      toast.error(t('ar.failed'))
    }
  }

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
  // Status labels, not controls: no border, so they never read as buttons that do nothing.
  const stageChip = 'px-1 text-xs leading-4 font-medium tracking-[0.08em] text-ink-muted'

  const hasContact = !!(business.contact.email || business.contact.phone || business.contact.website || business.contact.address)
  const textAction = cn(TAP_TARGET, 'inline-flex items-center border-b border-current pb-1 text-[12px] leading-[1.2] font-medium tracking-[0.08em] uppercase text-ink transition-colors hover:text-accent-ink')

  return (
    <PublicShell business={business} catalogHref={catalogHref}>
      {isPreview && (
        <div className="border-b border-warning/30 bg-warning-soft">
          <p className="mx-auto flex max-w-[1320px] items-center gap-2 px-5 py-2.5 text-[13px] font-medium text-warning sm:px-10">
            <Eye className="size-4 shrink-0" aria-hidden />
            {business.status !== 'active' ? t('catalog.previewBanner') : t('product.draftPreview')}
          </p>
        </div>
      )}

      <div className="mx-auto max-w-[1320px] px-5 pt-6 pb-20 sm:px-10 sm:pt-8">
        <Link to={catalogHref} className={cn(TAP_TARGET, 'inline-flex items-center gap-2 py-1 text-[12px] leading-[1.2] font-medium tracking-[0.08em] uppercase text-ink-muted hover:text-ink')}>
          <ArrowLeft className="size-3.5" strokeWidth={1.5} aria-hidden />
          {t('nav.backToCatalog', { name: business.name })}
        </Link>

        <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.7fr)] lg:gap-14">
          {/* Stage + 3D/AR rail (reference: centre stage, round actions on the right). Shown first on phones. */}
          <div ref={stageRef} className="scroll-mt-24 lg:sticky lg:top-28 lg:order-2 lg:self-start">
            <div className="flex flex-col gap-5 lg:flex-row lg:gap-6">
              {/* Framed viewer card, as the landing's 3D section: a slim top bar of chips, the stage, a dimensions line. */}
              <figure className="min-w-0 flex-1 border border-line bg-surface">
                <div className="flex min-h-11 items-center justify-between gap-3 border-b border-line px-3 py-2 sm:px-4">
                  <p className="flex min-w-0 items-center gap-2.5 text-xs leading-4 font-medium tracking-[0.08em] uppercase">
                    <span className={cn('size-1.5 shrink-0 rounded-full', mode === '3d' && modelState === 'loaded' ? 'bg-success' : 'bg-accent')} aria-hidden />
                    <span className="shrink-0 text-ink">{mode === '3d' ? t('product.stage3d') : t('product.stagePhotos')}</span>
                    <span className="hidden h-3 w-px shrink-0 bg-line sm:block" aria-hidden />
                    <span className="hidden truncate text-ink-muted sm:block">{name}</span>
                  </p>
                  {(modelState === 'loaded' || availability === 'available') && (
                    <p className="flex shrink-0 items-center gap-1.5">
                      {modelState === 'loaded' && <span className={stageChip}>3D</span>}
                      {availability === 'available' && <span className={stageChip}>AR</span>}
                    </p>
                  )}
                </div>
                <div className="p-2.5 sm:p-4">
                <ProductMedia
                  name={name}
                  gallery={media.gallery}
                  models={media.models}
                  mode={mode}
                  onModeChange={setMode}
                  viewerRef={viewerRef}
                  onArStatus={(s) => {
                    if (s !== 'failed') return
                    toast.error(t('ar.failed'))
                    // model-viewer turns AR off after a failed hand-off; follow it so the button goes away (AR-04).
                    setCanAR(viewerRef.current?.canActivateAR() ?? false)
                  }}
                  onInteract={onModelInteract}
                  onModelState={onModelState}
                />
                {media.fallback && has3d && variant && (
                  <p className="mt-3 text-center text-xs text-ink-muted">{t('ar.variantFallback', { name: localized(variant.name) })}</p>
                )}
                </div>
                {dimsLine && (
                  <figcaption className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line px-3 py-3 sm:px-4">
                    <span className="text-xs leading-4 font-medium tracking-[0.08em] text-ink-muted uppercase">{t('product.dimensions')}</span>
                    <span className="text-[13px] text-ink-body tabular-nums">{dimsLine}</span>
                  </figcaption>
                )}
              </figure>
              {/* AR starts from the primary call to action only: one obvious AR entry point, as on main. */}
              {has3d && (
                <ul className="flex justify-center gap-10 lg:flex-col lg:justify-start lg:gap-7 lg:pt-14">
                  <li>
                    <RailAction
                      mark={mode === '3d' ? <Images className="size-4" strokeWidth={1.4} aria-hidden /> : '3D'}
                      label={mode === '3d' ? t('product.viewPhotos') : t('product.view3d')}
                      pressed={mode === '3d'}
                      onClick={() => (mode === '3d' ? setMode('photos') : open3d())}
                    />
                  </li>
                </ul>
              )}
            </div>
          </div>

          <div className="min-w-0 lg:order-1 lg:pt-2">
            <p className="text-[12px] leading-[1.4] font-medium tracking-[0.08em] uppercase text-accent-ink">{t(`category.${product.category}`)}</p>
            <LocalizedSpan as="h1" text={product.name} className="mt-3 font-display text-[2.4rem] leading-[1.05] font-light text-balance break-words text-ink sm:text-[2.9rem]" />
            <p className="mt-4 text-[17px] tracking-[0.04em] text-ink tabular-nums">{formatMoney(price, product.currency, lang)}</p>
            <LocalizedSpan as="p" text={product.shortDescription} className="mt-5 max-w-md text-[15px] leading-7 text-ink-muted" />

            <VariantPicker product={product} selectedId={variantId} onSelect={selectVariant} className="mt-8 border-t border-line pt-6" />

            <div className="mt-8 flex flex-col gap-5">
              {/* Only for a model that loaded (AR-08). Where model-viewer can open AR, the primary action launches it
                  ("View in my home", as on main); elsewhere it opens the 3D view and ArSection explains the phone hand-off. */}
              {modelState === 'loaded' && (
                <button type="button" onClick={availability === 'available' ? onActivate : open3d} className="inline-flex h-12 items-center justify-center gap-3 self-stretch rounded-[2px] bg-obsidian px-8 text-[12px] leading-[1.2] font-medium tracking-[0.08em] uppercase text-chalk transition-colors hover:bg-umber sm:self-start">
                  {availability === 'available' ? t('ar.button') : t('product.view3d')}
                  {availability === 'available' ? <Smartphone className="size-4" strokeWidth={1.4} aria-hidden /> : <Box className="size-4" strokeWidth={1.4} aria-hidden />}
                </button>
              )}
              <ArSection availability={availability} onShowTips={() => setTipsOpen('info')} />
              <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
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
              </div>
            </div>

            <section className="mt-10 border-t border-line pt-6" aria-labelledby="dims-h">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="dims-h" className="text-[12px] leading-[1.4] font-medium tracking-[0.08em] uppercase text-ink">
                  {t('product.dimensions')}
                </h2>
                {/* Hit areas grown to 44px tall on the small control; its look is unchanged. */}
                <span className="[&_button]:relative [&_button]:before:absolute [&_button]:before:inset-x-0 [&_button]:before:-inset-y-2 [&_button]:before:content-['']">
                  <SegmentedControl
                    size="sm"
                    label={t('product.unitToggle')}
                    value={unit}
                    onChange={setUnit}
                    options={[
                      { value: 'cm', label: 'cm' },
                      { value: 'in', label: 'in' },
                    ]}
                  />
                </span>
              </div>
              <div className="mt-4 grid items-center gap-4 sm:grid-cols-[1fr_auto]">
                <DimensionDiagram dims={product.dimensions} unit={unit} />
                <dl className="grid grid-cols-3 gap-3 text-sm sm:min-w-44 sm:grid-cols-1 sm:gap-0 sm:divide-y sm:divide-line">
                  {(['width', 'height', 'depth'] as const).map((k) => (
                    <div key={k} className="sm:flex sm:items-baseline sm:justify-between sm:gap-6 sm:py-2.5">
                      <dt className="text-xs leading-4 font-medium tracking-[0.08em] text-ink-muted uppercase">{t(`product.${k}`)}</dt>
                      <dd className="mt-1 text-[14px] text-ink tabular-nums sm:mt-0">
                        {fmtLen(product.dimensions[k])} {unit}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              {scale.status !== 'unknown' && modelState === 'loaded' && <ScaleNote verified={scale.status === 'verified'} separateUsdz={separateUsdz} measured={scale.measured} unit={unit} />}
            </section>

            {(localized(product.material) || product.weight) && (
              <dl className="mt-8 divide-y divide-line border-y border-line">
                {localized(product.material) && (
                  <div className="flex items-baseline justify-between gap-6 py-4">
                    <dt className="shrink-0 text-[12px] leading-[1.4] font-medium tracking-[0.08em] uppercase text-ink">{t('product.material')}</dt>
                    <dd className="min-w-0 text-right text-[14px] text-ink-muted">
                      <LocalizedSpan text={product.material} />
                    </dd>
                  </div>
                )}
                {product.weight && (
                  <div className="flex items-baseline justify-between gap-6 py-4">
                    <dt className="shrink-0 text-[12px] leading-[1.4] font-medium tracking-[0.08em] uppercase text-ink">{t('product.weight')}</dt>
                    <dd className="text-right text-[14px] text-ink-muted tabular-nums">
                      {product.weight.value} {product.weight.unit}
                    </dd>
                  </div>
                )}
              </dl>
            )}

            {localized(product.description) && (
              <section className={cn('pt-6', localized(product.material) || product.weight ? 'mt-0' : 'mt-8 border-t border-line')} aria-labelledby="desc-h">
                <h2 id="desc-h" className="text-[12px] leading-[1.4] font-medium tracking-[0.08em] uppercase text-ink">
                  {t('product.description')}
                </h2>
                <LocalizedSpan as="p" text={product.description} className="mt-3 max-w-prose text-[15px] leading-7 whitespace-pre-line text-ink-muted" />
              </section>
            )}
          </div>
        </div>

        {additional.length > 0 && (
          <section className="mt-20 border-t border-line pt-8" aria-labelledby="more-h">
            <h2 id="more-h" className="text-[12px] leading-[1.4] font-medium tracking-[0.08em] uppercase text-ink">
              {t('product.morePhotos')}
            </h2>
            <ul className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6">
              {additional.map((img) => (
                <li key={img.id} className="border border-line bg-surface p-2.5 sm:p-3">
                  <SmartImage src={img.url} alt={img.alt || name} className="aspect-[4/3] w-full bg-subtle" />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <ArTips open={tipsOpen !== null} onClose={() => setTipsOpen(null)} onStart={tipsOpen === 'before-ar' ? () => void startAR() : undefined} />

      <Modal open={contactOpen} onClose={() => setContactOpen(false)} title={business.name} size="sm" closeLabel={t('common.close')}>
        <ul className="space-y-3 pb-2 text-sm">
          {business.contact.email && (
            <li className="flex items-center gap-3">
              <Mail className="size-4 text-ink-muted" aria-hidden />
              <a className="min-w-0 break-all text-[var(--brand-accent)] underline" href={`mailto:${business.contact.email}?subject=${encodeURIComponent(name)}`}>
                {business.contact.email}
              </a>
            </li>
          )}
          {business.contact.phone && (
            <li className="flex items-center gap-3">
              <Phone className="size-4 text-ink-muted" aria-hidden />
              <a className="text-[var(--brand-accent)] underline" href={`tel:${business.contact.phone.replace(/\s/g, '')}`}>
                {business.contact.phone}
              </a>
            </li>
          )}
          {business.contact.website && (
            <li className="flex items-center gap-3">
              <Globe className="size-4 text-ink-muted" aria-hidden />
              <a className="min-w-0 break-all text-[var(--brand-accent)] underline" href={business.contact.website} target="_blank" rel="noopener noreferrer">
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

function ScaleNote({ verified, separateUsdz, measured, unit }: { verified: boolean; separateUsdz: boolean; measured: MeasuredSize; unit: LengthUnit }) {
  const { t } = useI18n()
  const keys = scaleNoteKeys(verified, separateUsdz)
  const toUnit = (m: number) => {
    const v = unit === 'cm' ? m * 100 : (m * 100) / 2.54
    return Math.round(v)
  }
  const size = `${toUnit(measured.x)} × ${toUnit(measured.y)} × ${toUnit(measured.z)} ${unit}`
  return (
    <div className={cn('mt-5 flex items-start gap-2.5 border px-3.5 py-3 text-[13px]', verified ? 'border-success/20 bg-success-soft text-success' : 'border-line bg-subtle text-ink-muted')}>
      {verified ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> : <HelpCircle className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <div>
        <p className="font-medium">{t(keys.title)}</p>
        <p className="mt-0.5 opacity-90">
          {t(keys.help)} {!verified && t('ar.modelMeasures', { size })}
        </p>
      </div>
    </div>
  )
}

/** An action of the stage's rail ("3D · Visualizar em 3D"): a hairline square, as the Sanctus chips. */
function RailAction({ mark, label, onClick, pressed }: { mark: ReactNode; label: string; onClick: () => void; pressed?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="group flex w-24 flex-col items-center gap-2.5 text-center">
      <span
        className={cn(
          'grid size-12 place-items-center rounded-[2px] border text-xs font-medium tracking-[0.08em] transition-colors',
          pressed ? 'border-obsidian bg-obsidian text-chalk' : 'border-line-strong bg-surface text-ink group-hover:border-obsidian group-hover:bg-obsidian group-hover:text-chalk',
        )}
        aria-hidden
      >
        {mark}
      </span>
      <span className="text-xs leading-4 font-medium tracking-[0.08em] text-ink-body uppercase">{label}</span>
    </button>
  )
}
