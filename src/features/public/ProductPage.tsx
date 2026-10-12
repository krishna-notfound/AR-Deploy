import { ArrowLeft, CheckCircle2, Eye, HelpCircle, Mail, MapPin, Phone, Globe, PackageX } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { useAccount } from '@/auth/AccountProvider'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { Button, ButtonLink, buttonClasses } from '@/components/ui/Button'
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
import { useServiceQuery } from '@/services/hooks'
import { ArSection, arAvailability } from './ArSection'
import { ArTips, arTipsDismissed } from './ArTips'
import { DimensionDiagram } from './DimensionDiagram'
import { InAppNotice } from './InAppNotice'
import { type ModelState, ProductMedia } from './ProductMedia'
import { PublicMessage } from './PublicMessage'
import { PublicShell } from './PublicShell'
import { ShareButton } from './ShareActions'

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
  const res = useServiceQuery(() => service.getPublicProduct(businessSlug, productSlug, { allowDraft: canPreview }), [businessSlug, productSlug, canPreview])
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
          <ErrorState message={res.status === 'error' ? res.error.message : t('common.errorTitle')} onRetry={res.refetch} className="py-24" />
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
  const [modelState, setModelState] = useState<ModelState>(product.models.glb ? 'loading' : 'none')
  const [canAR, setCanAR] = useState(false)
  const [measured, setMeasured] = useState<MeasuredSize | null>(null)
  const [tipsOpen, setTipsOpen] = useState<null | 'before-ar' | 'info'>(null)
  const [unit, setUnit] = useState<LengthUnit>(product.dimensions.unit)
  const [variantId, setVariantId] = useState(product.variants[0]?.id)
  const [contactOpen, setContactOpen] = useState(false)
  const name = localized(product.name)

  // Record one product view per page load (StrictMode-safe via ref).
  const recorded = useRef(false)
  useEffect(() => {
    if (recorded.current || isPreview) return
    recorded.current = true
    void service.recordEvent({ productId: product.id, businessId: product.businessId, type: 'view' })
  }, [product.id, product.businessId, isPreview])

  useEffect(() => {
    document.title = `${name} · ${business.name}`
  }, [name, business.name])

  const variant = product.variants.find((v) => v.id === variantId)
  const price = product.price + (variant?.priceDelta ?? 0)
  const scale = useMemo(() => checkScale(measured, product.dimensions), [measured, product.dimensions])
  const availability = arAvailability(modelState, canAR)
  const additional = product.images.filter((i) => i.kind === 'additional')

  const startAR = async () => {
    setTipsOpen(null)
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

  return (
    <PublicShell business={business} catalogHref={catalogHref}>
      <InAppNotice />
      {isPreview && (
        <div className="border-b border-warning/30 bg-warning-soft">
          <p className="mx-auto flex max-w-[1240px] items-center gap-2 px-5 py-2.5 text-[13px] font-medium text-warning sm:px-8">
            <Eye className="size-4 shrink-0" aria-hidden />
            {t('product.draftPreview')}
          </p>
        </div>
      )}

      <div className="mx-auto max-w-[1240px] px-5 pt-6 pb-20 sm:px-8">
        <Link to={catalogHref} className="inline-flex items-center gap-1.5 text-[13px] text-ink-muted hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden />
          {t('nav.backToCatalog', { name: business.name })}
        </Link>

        <div className="mt-5 grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:gap-16">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <ProductMedia
              product={product}
              viewerRef={viewerRef}
              onArStatus={(s) => s === 'failed' && toast.error(t('ar.failed'))}
              onModelState={(s, info) => {
                setModelState(s)
                if (info) {
                  setCanAR(info.canActivateAR)
                  setMeasured(info.dimensions)
                }
              }}
            />
          </div>

          <div className="min-w-0">
            <LocalizedSpan as="h1" text={product.name} className="text-[2rem] leading-[1.08] font-light tracking-[-0.03em] text-balance text-ink sm:text-[2.6rem]" />
            <p className="mt-3 text-xl text-ink tabular-nums">{formatMoney(price, product.currency, lang)}</p>
            <LocalizedSpan as="p" text={product.shortDescription} className="mt-3 text-[15px] leading-7 text-ink-muted" />

            <div className="mt-6 space-y-3">
              <ArSection availability={availability} onActivate={onActivate} onShowTips={() => setTipsOpen('info')} />
              <div className="flex flex-wrap items-center gap-2">
                {product.cta.url ? (
                  <a href={product.cta.url} target="_blank" rel="noopener noreferrer" className={buttonClasses(availability === 'available' ? 'secondary' : 'brand', 'lg', 'flex-1')}>
                    <LocalizedSpan text={product.cta.label} />
                  </a>
                ) : hasContact ? (
                  <Button size="lg" variant={availability === 'available' ? 'secondary' : 'brand'} className="flex-1" onClick={() => setContactOpen(true)}>
                    {t('product.contactStore')}
                  </Button>
                ) : null}
                <ShareButton title={t('product.shareTitle', { name, business: business.name })} />
              </div>
            </div>

            {product.variants.length > 0 && (
              <section className="mt-8" aria-labelledby="variants-h">
                <h2 id="variants-h" className="text-sm font-semibold">
                  {t('product.colors')}
                </h2>
                <div role="radiogroup" aria-labelledby="variants-h" className="mt-3 flex flex-wrap gap-2">
                  {product.variants.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      role="radio"
                      aria-checked={v.id === variantId}
                      onClick={() => setVariantId(v.id)}
                      className={cn(
                        'inline-flex h-10 items-center gap-2 rounded-full border px-3 pr-4 text-[13px] transition-colors',
                        v.id === variantId ? 'border-ink bg-surface font-medium' : 'border-line-strong bg-surface text-ink-muted hover:text-ink',
                      )}
                    >
                      <span className="size-5 rounded-full ring-1 ring-black/10" style={{ background: v.colorHex ?? '#ddd' }} aria-hidden />
                      <LocalizedSpan text={v.name} />
                      {v.priceDelta ? <span className="text-ink-faint tabular-nums">+{formatMoney(v.priceDelta, product.currency, lang)}</span> : null}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <section className="mt-8 rounded-[var(--radius-card)] bg-surface p-5 shadow-[var(--shadow-card)]" aria-labelledby="dims-h">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 id="dims-h" className="text-sm font-semibold">
                  {t('product.dimensions')}
                </h2>
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
              </div>
              <div className="mt-4 grid items-center gap-4 sm:grid-cols-[1fr_auto]">
                <DimensionDiagram dims={product.dimensions} unit={unit} />
                <dl className="grid grid-cols-3 gap-3 text-sm sm:grid-cols-1 sm:gap-2.5">
                  {(['width', 'height', 'depth'] as const).map((k) => (
                    <div key={k} className="sm:flex sm:items-baseline sm:justify-between sm:gap-6">
                      <dt className="text-xs text-ink-muted">{t(`product.${k}`)}</dt>
                      <dd className="font-semibold tabular-nums">
                        {fmtLen(product.dimensions[k])} {unit}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
              {scale.status !== 'unknown' && modelState === 'loaded' && <ScaleNote verified={scale.status === 'verified'} measured={scale.measured} unit={unit} />}
            </section>

            <dl className="mt-6 divide-y divide-line border-y border-line text-sm">
              {product.material.en && (
                <div className="flex justify-between gap-6 py-3">
                  <dt className="text-ink-muted">{t('product.material')}</dt>
                  <dd className="text-right">
                    <LocalizedSpan text={product.material} />
                  </dd>
                </div>
              )}
              {product.weight && (
                <div className="flex justify-between gap-6 py-3">
                  <dt className="text-ink-muted">{t('product.weight')}</dt>
                  <dd className="tabular-nums">
                    {product.weight.value} {product.weight.unit}
                  </dd>
                </div>
              )}
            </dl>

            {product.description.en && (
              <section className="mt-8" aria-labelledby="desc-h">
                <h2 id="desc-h" className="text-sm font-semibold">
                  {t('product.description')}
                </h2>
                <LocalizedSpan as="p" text={product.description} className="mt-2 max-w-prose text-[15px] leading-7 whitespace-pre-line text-ink-muted" />
              </section>
            )}
          </div>
        </div>

        {additional.length > 0 && (
          <section className="mt-14" aria-labelledby="more-h">
            <h2 id="more-h" className="text-lg font-semibold">
              {t('product.morePhotos')}
            </h2>
            <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {additional.map((img) => (
                <li key={img.id}>
                  <SmartImage src={img.url} alt={img.alt || name} className="aspect-[4/3] w-full rounded-[var(--radius-card)]" />
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <ArTips open={tipsOpen !== null} onClose={() => setTipsOpen(null)} onStart={tipsOpen === 'before-ar' ? () => void startAR() : undefined} />

      <Modal open={contactOpen} onClose={() => setContactOpen(false)} title={business.name} size="sm">
        <ul className="space-y-3 pb-2 text-sm">
          {business.contact.email && (
            <li className="flex items-center gap-3">
              <Mail className="size-4 text-ink-muted" aria-hidden />
              <a className="text-[var(--brand-accent)] underline" href={`mailto:${business.contact.email}?subject=${encodeURIComponent(name)}`}>
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
              <a className="text-[var(--brand-accent)] underline" href={business.contact.website} target="_blank" rel="noopener noreferrer">
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

function ScaleNote({ verified, measured, unit }: { verified: boolean; measured: MeasuredSize; unit: LengthUnit }) {
  const { t } = useI18n()
  const toUnit = (m: number) => {
    const v = unit === 'cm' ? m * 100 : (m * 100) / 2.54
    return Math.round(v)
  }
  const size = `${toUnit(measured.x)} × ${toUnit(measured.y)} × ${toUnit(measured.z)} ${unit}`
  return (
    <div className={cn('mt-4 flex items-start gap-2.5 rounded-lg px-3 py-2.5 text-[13px]', verified ? 'bg-success-soft text-success' : 'bg-subtle text-ink-muted')}>
      {verified ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> : <HelpCircle className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <div>
        <p className="font-medium">{verified ? t('ar.scaleVerified') : t('ar.scaleUnverified')}</p>
        <p className="mt-0.5 opacity-90">
          {verified ? t('ar.scaleVerifiedHelp') : t('ar.scaleUnverifiedHelp')} {!verified && t('ar.modelMeasures', { size })}
        </p>
      </div>
    </div>
  )
}
