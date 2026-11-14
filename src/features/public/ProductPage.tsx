import { ArrowLeft, Eye, Globe, Mail, MapPin, PackageX, Phone } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router'
import { useAccount } from '@/auth/AccountProvider'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { ButtonLink } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { ErrorState } from '@/components/ui/States'
import type { Business, Product } from '@/domain/types'
import { HOUSE_BUSINESS_SLUG } from '@/domain/siteContent'
import { LocalizedSpan, useI18n } from '@/i18n/LanguageProvider'
import { useCategoryLabel } from '@/services/listsHooks'
import { cn } from '@/lib/cn'
import { catalogLocalPath, needsPreview, showcaseProductPath, tenantCatalogPath } from '@/lib/urls'
import { service } from '@/services'
import { useRefreshWhenStale, useServiceQuery } from '@/services/hooks'
import { ArSection } from './ArSection'
import { ArTips } from './ArTips'
import { ArPrimaryAction, ArScaleBadge, DimensionsSection, MorePhotos, ProductLinkButton, ProductSpecs, scaleNoteKeys } from './ProductParts'
import { ProductMedia } from './ProductMedia'
import { PublicMessage } from './PublicMessage'
import { PublicShell } from './PublicShell'
import { ShareButton } from './ShareActions'
import { StickyActionBar } from './StickyActionBar'
import { TAP_TARGET } from './tapTarget'
import { AR_PENDING_MAX_MS, AR_RELAUNCH_MS, MEDIA_REFRESH_MS, useProductStage } from './useProductStage'
import { VariantPicker } from './VariantPicker'

// Kept importable from here (tests and callers); the code lives in useProductStage and ProductParts.
export { AR_PENDING_MAX_MS, AR_RELAUNCH_MS, scaleNoteKeys }

export default function ProductPage({ tenantSlug }: { tenantSlug?: string }) {
  const params = useParams()
  const { search, hash } = useLocation()
  // The platform's own showcase pieces live at /showcase/:slug in the site's style (ADR-0047). An old link here goes there.
  if (!tenantSlug && params.businessSlug === HOUSE_BUSINESS_SLUG && params.productSlug) return <Navigate replace to={`${showcaseProductPath(params.productSlug)}${search}${hash}`} />
  return <BusinessProductPage tenantSlug={tenantSlug} />
}

function BusinessProductPage({ tenantSlug }: { tenantSlug?: string }) {
  const params = useParams()
  const businessSlug = tenantSlug ?? params.businessSlug ?? ''
  const productSlug = params.productSlug ?? ''
  const [searchParams] = useSearchParams()
  const { user } = useAccount()
  const { t } = useI18n()

  // Draft preview: only with ?preview=1 AND a signed-in demo admin (UX rule, not security).
  const wantsPreview = searchParams.get('preview') === '1'
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
            action={<ProductNotFoundAction businessSlug={businessSlug} catalogHref={catalogHref} tenant={!!tenantSlug} />}
          />
        ) : (
          <ErrorState message={t('common.errorTitle')} onRetry={res.refetch} retryLabel={t('common.retry')} className="py-24" />
        )}
      </PublicShell>
    )
  }

  return <ProductView key={res.data.product.id} business={res.data.business} product={res.data.product} catalogHref={catalogHref} isPreview={canPreview && needsPreview(res.data.product, res.data.business)} />
}

/**
 * The way out of "Product not available". When the business itself is unknown, its catalogue would be another "not
 * found", so the link goes to the home page instead (QA #20). On a business subdomain the catalogue is the site's own.
 */
function ProductNotFoundAction({ businessSlug, catalogHref, tenant }: { businessSlug: string; catalogHref: string; tenant: boolean }) {
  const { t } = useI18n()
  if (tenant)
    return (
      <ButtonLink to={catalogHref} variant="brand">
        {t('product.viewCatalog')}
      </ButtonLink>
    )
  return <PlatformNotFoundAction businessSlug={businessSlug} catalogHref={catalogHref} />
}

function PlatformNotFoundAction({ businessSlug, catalogHref }: { businessSlug: string; catalogHref: string }) {
  const { t } = useI18n()
  const business = useServiceQuery(() => service.getBusinessBySlug(businessSlug), [businessSlug])
  // Offered once we know where it leads.
  if (business.status === 'loading') return null
  const unknown = business.status === 'error' && business.error.code === 'NOT_FOUND'
  return (
    <ButtonLink to={unknown ? '/' : catalogHref} variant="brand">
      {t(unknown ? 'catalog.goHome' : 'product.viewCatalog')}
    </ButtonLink>
  )
}

function ProductView({ business, product, catalogHref, isPreview }: { business: Business; product: Product; catalogHref: string; isPreview: boolean }) {
  const { t, localized } = useI18n()
  const categoryLabel = useCategoryLabel()
  const stage = useProductStage(product, { record: !isPreview })
  const [contactOpen, setContactOpen] = useState(false)
  // The row of actions, watched so the phone's sticky bar shows only while the row is still below the screen.
  const [actionRow, setActionRow] = useState<HTMLElement | null>(null)
  const { name, hasCta } = stage

  useEffect(() => {
    document.title = `${name} · ${business.name}`
  }, [name, business.name])

  const hasContact = !!(business.contact.email || business.contact.phone || business.contact.website || business.contact.address)
  // Status labels, not controls: no border, so they never read as buttons that do nothing.
  const stageChip = 'px-1 text-xs leading-4 font-medium tracking-[0.08em] text-ink-muted'
  const textAction = cn(TAP_TARGET, 'inline-flex items-center self-start border-b border-current pb-1 text-[12px] leading-[1.2] font-medium tracking-[0.08em] uppercase text-ink transition-colors hover:text-accent-ink')

  return (
    <PublicShell business={business}>
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

        {/* Phones: stage, then the AR call to action (reachable without scrolling, AR audit AR-05), then the text.
            Desktop: the text column on the left with the call to action under the finish picker, the sticky stage on
            the right. The last row takes any height the stage adds, so the left column never gains gaps. */}
        <div className="mt-6 grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.7fr)] lg:grid-rows-[auto_auto_1fr] lg:gap-x-14">
          {/* The stage. Shown first on phones. The Photos | 3D switch sits inside it (ADR-0047). */}
          <div ref={stage.stageRef} className="scroll-mt-24 lg:sticky lg:top-28 lg:col-start-2 lg:row-span-3 lg:row-start-1 lg:self-start">
            {/* Framed viewer card, as the landing's 3D section: a slim top bar of chips, the stage, a dimensions line. */}
            <figure className="min-w-0 overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
              <div className="flex min-h-11 items-center justify-between gap-3 border-b border-line px-3 py-2 sm:px-4">
                <p className="flex min-w-0 items-center gap-2.5 text-xs leading-4 font-medium tracking-[0.08em] uppercase">
                  <span className={cn('size-1.5 shrink-0 rounded-full', stage.mode === '3d' && stage.modelState === 'loaded' ? 'bg-success' : 'bg-accent')} aria-hidden />
                  <span className="shrink-0 text-ink">{stage.mode === '3d' ? t('product.stage3d') : t('product.stagePhotos')}</span>
                  <span className="hidden h-3 w-px shrink-0 bg-line sm:block" aria-hidden />
                  <span className="hidden truncate text-ink-muted sm:block">{name}</span>
                </p>
                {(stage.modelState === 'loaded' || stage.availability === 'available') && (
                  <p className="flex shrink-0 items-center gap-1.5">
                    {stage.modelState === 'loaded' && <span className={stageChip}>3D</span>}
                    {stage.availability === 'available' && <span className={stageChip}>AR</span>}
                  </p>
                )}
              </div>
              <div className="p-2.5 sm:p-4">
                <ProductMedia {...stage.mediaProps} switcher />
                {stage.media.fallback && stage.has3d && stage.variant && (
                  <p className="mt-3 text-center text-xs text-ink-muted">{t('ar.variantFallback', { name: localized(stage.variant.name) })}</p>
                )}
              </div>
              {stage.dimsLine && (
                <figcaption className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-line px-3 py-3 sm:px-4">
                  <span className="text-xs leading-4 font-medium tracking-[0.08em] text-ink-muted uppercase">{t('product.dimensions')}</span>
                  <span className="text-[13px] text-ink-body tabular-nums">{stage.dimsLine}</span>
                </figcaption>
              )}
            </figure>
          </div>

          {hasCta && (
            <div ref={setActionRow} data-ar-cta className="mt-6 flex min-w-0 flex-col gap-5 lg:col-start-1 lg:row-start-2 lg:mt-8">
              {/* The AR / 3D button and the product's own link side by side: both 48px tall, the link outlined. */}
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <ArPrimaryAction stage={stage} arLabel={t('ar.button')} />
                <ProductLinkButton product={product} outlined />
              </div>
              {/* Where AR starts, the scale verdict too (AR-09): a model that does not match the listed size is flagged. */}
              <ArScaleBadge stage={stage} />
              <ArSection availability={stage.availability} onShowTips={stage.showTips} />
            </div>
          )}

          <div className="mt-10 min-w-0 lg:col-start-1 lg:row-start-1 lg:mt-0 lg:pt-2">
            <p className="text-[12px] leading-[1.4] font-medium tracking-[0.08em] uppercase text-accent-ink">{categoryLabel(product.category)}</p>
            <LocalizedSpan as="h1" text={product.name} className="mt-3 font-display text-[2.4rem] leading-[1.05] font-light text-balance break-words text-ink sm:text-[2.9rem]" />
            <LocalizedSpan as="p" text={product.shortDescription} className="mt-4 max-w-md text-[15px] leading-7 text-ink-muted" />

            <VariantPicker product={product} selectedId={stage.variantId} onSelect={stage.selectVariant} className="mt-8 border-t border-line pt-6" />
          </div>

          <div className="min-w-0 lg:col-start-1 lg:row-start-3">
            {/* Desktop spacing as before: gap-5 under the call to action, mt-8 under the finish picker when there is none. */}
            <div className={cn('mt-8', hasCta ? 'lg:mt-5' : 'lg:mt-8')}>
              <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                {/* With a model, the product's own link sits beside the AR button above; without one it is the main action. */}
                {!hasCta && <ProductLinkButton product={product} outlined={false} />}
                {!product.cta.url && !product.cta.hidden && hasContact && (
                  <button type="button" className={textAction} onClick={() => setContactOpen(true)}>
                    {t('product.contactStore')}
                  </button>
                )}
                {business.shareEnabled && <ShareButton title={t('product.shareTitle', { name, business: business.name })} />}
              </div>
            </div>

            <DimensionsSection product={product} stage={stage} />
            <ProductSpecs product={product} />
          </div>
        </div>

        <MorePhotos stage={stage} />
      </div>

      <StickyActionBar stage={stage} arLabel={t('ar.button')} row={actionRow} />
      <ArTips {...stage.tips} />

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
