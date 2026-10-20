import { ArrowLeft, Box, CheckCircle2, Eye, Globe, HelpCircle, Images, Mail, MapPin, PackageX, Phone } from 'lucide-react'
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
import type { ModelViewerHandle } from '@/components/three/ModelViewer'
import type { Business, LengthUnit, Product } from '@/domain/types'
import { LocalizedSpan, useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { convertLength, formatMoney } from '@/lib/format'
import { type MeasuredSize, checkScale } from '@/lib/scale'
import { service } from '@/services'
import { MEDIA_URL_TTL_SECONDS } from '@/services/catalogService'
import { useRefreshWhenStale, useServiceQuery } from '@/services/hooks'
import { ArSection, arAvailability } from './ArSection'
import { ArTips, arTipsDismissed } from './ArTips'
import { DimensionDiagram } from './DimensionDiagram'
import { type MediaMode, type ModelState, ProductMedia, initialMediaMode, usableModels } from './ProductMedia'
import { PublicMessage } from './PublicMessage'
import { PublicShell } from './PublicShell'
import { ShareButton } from './ShareActions'
import { TAP_TARGET } from './tapTarget'

/** Ignore AR taps this soon after a launch (double taps, impatient re-taps while the native viewer opens). */
export const AR_RELAUNCH_MS = 2000
/** Signed media URLs last MEDIA_URL_TTL_SECONDS; refetch on return to the tab once half of that has passed. */
const MEDIA_REFRESH_MS = (MEDIA_URL_TTL_SECONDS * 1000) / 2

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
  const catalogHref = tenantSlug ? '/' : `/catalog/${businessSlug}`
  // A business admin may only preview their own unpublished products.
  const hiddenFromPublic = !!res.data && (res.data.product.status !== 'published' || res.data.business.status !== 'active')
  const ownerMismatch = canPreview && hiddenFromPublic && user?.role === 'business_admin' && res.data?.business.id !== user.businessId

  if (res.status === 'loading' && !res.data)
    return (
      <PublicShell>
        <FullPageSpinner label={t('common.loading')} />
      </PublicShell>
    )

  if (!res.data || ownerMismatch) {
    const notFound = (res.status === 'error' && res.error.code === 'NOT_FOUND') || ownerMismatch
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

  return <ProductView key={res.data.product.id} business={res.data.business} product={res.data.product} catalogHref={catalogHref} isPreview={canPreview && (res.data.product.status !== 'published' || res.data.business.status !== 'active')} />
}

function ProductView({ business, product, catalogHref, isPreview }: { business: Business; product: Product; catalogHref: string; isPreview: boolean }) {
  const { t, lang, localized } = useI18n()
  const toast = useToast()
  const viewerRef = useRef<ModelViewerHandle>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<MediaMode>(() => initialMediaMode(product))
  const [modelState, setModelState] = useState<ModelState>(usableModels(product).glb ? 'loading' : 'none')
  const [canAR, setCanAR] = useState(false)
  const [measured, setMeasured] = useState<MeasuredSize | null>(null)
  const [tipsOpen, setTipsOpen] = useState<null | 'before-ar' | 'info'>(null)
  const [unit, setUnit] = useState<LengthUnit>(product.dimensions.unit)
  const [variantId, setVariantId] = useState(product.variants[0]?.id)
  const [contactOpen, setContactOpen] = useState(false)
  const name = localized(product.name)
  const has3d = modelState !== 'none'

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

  const variant = product.variants.find((v) => v.id === variantId)
  const price = product.price + (variant?.priceDelta ?? 0)
  const scale = useMemo(() => checkScale(measured, product.dimensions), [measured, product.dimensions])
  const separateUsdz = !!usableModels(product).usdz
  const availability = arAvailability(modelState, canAR)
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

  const hasContact = !!(business.contact.email || business.contact.phone || business.contact.website || business.contact.address)
  const textAction = cn(TAP_TARGET, 'inline-flex items-center border-b border-current pb-1 text-label text-ink transition-colors hover:text-accent-ink')

  return (
    <PublicShell business={business} catalogHref={catalogHref}>
      {isPreview && (
        <div className="border-b border-warning/30 bg-warning-soft">
          <p className="mx-auto flex max-w-[1320px] items-center gap-2 px-5 py-2.5 text-[13px] font-medium text-warning sm:px-10">
            <Eye className="size-4 shrink-0" aria-hidden />
            {t('product.draftPreview')}
          </p>
        </div>
      )}

      <div className="mx-auto max-w-[1320px] px-5 pt-6 pb-20 sm:px-10 sm:pt-8">
        <Link to={catalogHref} className={cn(TAP_TARGET, 'inline-flex items-center gap-2 py-1 text-label text-ink-muted hover:text-ink')}>
          <ArrowLeft className="size-3.5" strokeWidth={1.5} aria-hidden />
          {t('nav.backToCatalog', { name: business.name })}
        </Link>

        <div className="mt-6 grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.7fr)] lg:gap-14">
          {/* Stage + 3D/AR rail (reference: centre stage, round actions on the right). Shown first on phones. */}
          <div ref={stageRef} className="scroll-mt-24 lg:sticky lg:top-28 lg:order-2 lg:self-start">
            <div className="flex flex-col gap-5 lg:flex-row lg:gap-8">
              <div className="min-w-0 flex-1">
                <ProductMedia
                  product={product}
                  mode={mode}
                  onModeChange={setMode}
                  viewerRef={viewerRef}
                  onArStatus={(s) => s === 'failed' && toast.error(t('ar.failed'))}
                  onInteract={onModelInteract}
                  onModelState={(s, info) => {
                    setModelState(s)
                    if (info) {
                      setCanAR(info.canActivateAR)
                      setMeasured(info.dimensions)
                    }
                  }}
                />
              </div>
              {(has3d || availability === 'available') && (
                <ul className="flex justify-center gap-10 lg:flex-col lg:justify-start lg:gap-8 lg:pt-10">
                  {has3d && (
                    <li>
                      <RailAction
                        mark={mode === '3d' ? <Images className="size-4" strokeWidth={1.4} aria-hidden /> : '3D'}
                        label={mode === '3d' ? t('product.viewPhotos') : t('product.view3d')}
                        pressed={mode === '3d'}
                        onClick={() => (mode === '3d' ? setMode('photos') : open3d())}
                      />
                    </li>
                  )}
                  {availability === 'available' && (
                    <li>
                      <RailAction mark="AR" label={t('ar.button')} onClick={onActivate} />
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>

          <div className="min-w-0 lg:order-1">
            <LocalizedSpan as="h1" text={product.name} className="font-display text-[2.4rem] leading-[1.05] font-normal text-balance text-ink sm:text-[2.9rem]" />
            <p className="mt-4 text-[17px] tracking-[0.04em] text-ink tabular-nums">{formatMoney(price, product.currency, lang)}</p>
            <LocalizedSpan as="p" text={product.shortDescription} className="mt-4 max-w-md text-[15px] leading-7 text-ink-muted" />

            {product.variants.length > 0 && (
              <section className="mt-8" aria-labelledby="variants-h">
                <h2 id="variants-h" className="text-eyebrow text-ink">
                  {t('product.colors')}
                </h2>
                <div role="radiogroup" aria-labelledby="variants-h" className="mt-3 flex flex-wrap gap-3">
                  {product.variants.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      role="radio"
                      aria-checked={v.id === variantId}
                      aria-label={localized(v.name) + (v.priceDelta ? ` +${formatMoney(v.priceDelta, product.currency, lang)}` : '')}
                      title={localized(v.name)}
                      onClick={() => setVariantId(v.id)}
                      className={cn('grid size-10 place-items-center rounded-full border transition-colors', v.id === variantId ? 'border-ink' : 'border-transparent hover:border-line-strong')}
                    >
                      <span className="size-8 rounded-full ring-1 ring-black/10" style={{ background: v.colorHex ?? 'var(--color-limestone)' }} aria-hidden />
                    </button>
                  ))}
                </div>
                {variant && (
                  <p className="mt-2 text-[13px] text-ink-muted">
                    <LocalizedSpan text={variant.name} />
                    {variant.priceDelta ? <span className="ml-2 text-ink-faint tabular-nums">+{formatMoney(variant.priceDelta, product.currency, lang)}</span> : null}
                  </p>
                )}
              </section>
            )}

            <div className="mt-8 flex flex-col gap-5">
              {has3d && (
                <button type="button" onClick={open3d} className="inline-flex h-12 items-center justify-center gap-3 self-stretch bg-ink px-8 text-label text-chalk transition-colors hover:bg-umber sm:self-start">
                  {t('product.view3dAr')}
                  <Box className="size-4" strokeWidth={1.4} aria-hidden />
                </button>
              )}
              <ArSection availability={availability} onShowTips={() => setTipsOpen('info')} />
              <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                {product.cta.url ? (
                  <a href={product.cta.url} target="_blank" rel="noopener noreferrer" className={textAction}>
                    <LocalizedSpan text={product.cta.label} />
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
                <h2 id="dims-h" className="text-eyebrow text-ink">
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
                <dl className="grid grid-cols-3 gap-3 text-sm sm:grid-cols-1 sm:gap-2.5">
                  {(['width', 'height', 'depth'] as const).map((k) => (
                    <div key={k} className="sm:flex sm:items-baseline sm:justify-between sm:gap-6">
                      <dt className="text-xs text-ink-muted">{t(`product.${k}`)}</dt>
                      <dd className="font-medium tabular-nums">
                        {fmtLen(product.dimensions[k])} {unit}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              {scale.status !== 'unknown' && modelState === 'loaded' && <ScaleNote verified={scale.status === 'verified'} separateUsdz={separateUsdz} measured={scale.measured} unit={unit} />}
            </section>

            {(localized(product.material) || product.weight) && (
              <dl className="mt-6 space-y-5 border-t border-line pt-6">
                {localized(product.material) && (
                  <div>
                    <dt className="text-eyebrow text-ink">{t('product.material')}</dt>
                    <dd className="mt-1.5 text-[14px] text-ink-muted">
                      <LocalizedSpan text={product.material} />
                    </dd>
                  </div>
                )}
                {product.weight && (
                  <div>
                    <dt className="text-eyebrow text-ink">{t('product.weight')}</dt>
                    <dd className="mt-1.5 text-[14px] text-ink-muted tabular-nums">
                      {product.weight.value} {product.weight.unit}
                    </dd>
                  </div>
                )}
              </dl>
            )}

            {localized(product.description) && (
              <section className="mt-6 border-t border-line pt-6" aria-labelledby="desc-h">
                <h2 id="desc-h" className="text-eyebrow text-ink">
                  {t('product.description')}
                </h2>
                <LocalizedSpan as="p" text={product.description} className="mt-3 max-w-prose text-[15px] leading-7 whitespace-pre-line text-ink-muted" />
              </section>
            )}
          </div>
        </div>

        {additional.length > 0 && (
          <section className="mt-16" aria-labelledby="more-h">
            <h2 id="more-h" className="text-eyebrow text-ink">
              {t('product.morePhotos')}
            </h2>
            <ul className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {additional.map((img) => (
                <li key={img.id}>
                  <SmartImage src={img.url} alt={img.alt || name} className="aspect-[4/3] w-full" />
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
    <div className={cn('mt-4 flex items-start gap-2.5 px-3 py-2.5 text-[13px]', verified ? 'bg-success-soft text-success' : 'bg-subtle text-ink-muted')}>
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

/** A round action of the reference's right-hand rail ("3D · Visualizar em 3D", "AR · Ver em AR"). */
function RailAction({ mark, label, onClick, pressed }: { mark: ReactNode; label: string; onClick: () => void; pressed?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="group flex w-24 flex-col items-center gap-2.5 text-center">
      <span
        className={cn(
          'grid size-12 place-items-center rounded-full border text-[11px] font-medium tracking-[0.08em] transition-colors',
          pressed ? 'border-ink bg-ink text-chalk' : 'border-ink/70 text-ink group-hover:bg-ink group-hover:text-chalk',
        )}
        aria-hidden
      >
        {mark}
      </span>
      <span className="text-[12px] leading-4 text-ink-body">{label}</span>
    </button>
  )
}
