import { ArrowUpRight, Box, Images, PackageX } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useSearchParams } from 'react-router'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import type { ModelViewerHandle } from '@/components/three/ModelViewer'
import { ErrorState } from '@/components/ui/States'
import type { Business, Product } from '@/domain/types'
import { pickVariant, variantMedia } from '@/features/ar/variantMedia'
import { LocalizedSpan, useI18n } from '@/i18n/LanguageProvider'
import { safeBrandAccent } from '@/lib/color'
import { formatMoney } from '@/lib/format'
import { VARIANT_PARAM, embedProductPageUrl, withVariantParam } from '@/lib/urls'
import { service } from '@/services'
import { MEDIA_URL_TTL_SECONDS } from '@/services/catalogService'
import { useRefreshWhenStale, useServiceQuery } from '@/services/hooks'
import { type MediaMode, type ModelState, ProductMedia, initialMediaMode } from './ProductMedia'
import { PublicMessage } from './PublicMessage'
import { VariantPicker } from './VariantPicker'

const MEDIA_REFRESH_MS = (MEDIA_URL_TTL_SECONDS * 1000) / 2

/**
 * Chrome-less product view for other websites' iframes (ADR-0026). Published products of active businesses only,
 * never a draft preview, whoever is signed in. AR is not started here: native viewers need a top-level page, so the
 * AR action opens the full product page in a new tab.
 */
export default function EmbedProductPage({ tenantSlug }: { tenantSlug?: string }) {
  const params = useParams()
  const businessSlug = tenantSlug ?? params.businessSlug ?? ''
  const productSlug = params.productSlug ?? ''
  const { t } = useI18n()
  const res = useServiceQuery(() => service.getPublicProduct(businessSlug, productSlug), [businessSlug, productSlug])
  useRefreshWhenStale(res.refetch, MEDIA_REFRESH_MS, res.data)
  const isPublic = !!res.data && res.data.product.status === 'published' && res.data.business.status === 'active'

  if (res.status === 'loading' && !res.data)
    return (
      <EmbedFrame>
        <FullPageSpinner label={t('common.loading')} />
      </EmbedFrame>
    )

  if (!res.data || !isPublic) {
    const notFound = !!res.data || (res.status === 'error' && res.error.code === 'NOT_FOUND')
    return (
      <EmbedFrame>
        {notFound ? (
          <PublicMessage icon={PackageX} title={t('product.notFoundTitle')} body={t('product.notFoundBody')} />
        ) : (
          <ErrorState message={t('common.errorTitle')} onRetry={res.refetch} retryLabel={t('common.retry')} className="py-24" />
        )}
      </EmbedFrame>
    )
  }

  return <EmbedProductView key={res.data.product.id} business={res.data.business} product={res.data.product} tenant={!!tenantSlug} />
}

function EmbedFrame({ business, children }: { business?: Business; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-canvas text-ink" style={{ '--brand-accent': safeBrandAccent(business?.branding.accentColor) } as React.CSSProperties}>
      {children}
    </div>
  )
}

function EmbedProductView({ business, product, tenant }: { business: Business; product: Product; tenant: boolean }) {
  const { t, lang, localized } = useI18n()
  const viewerRef = useRef<ModelViewerHandle>(null)
  const [search, setSearch] = useSearchParams()
  const [variantId, setVariantId] = useState(() => pickVariant(product.variants, search.get(VARIANT_PARAM))?.id)
  const variant = product.variants.find((v) => v.id === variantId)
  const media = useMemo(() => variantMedia(product, variant), [product, variant])
  // The primary photograph only: the embed is a compact card, the full page has the gallery.
  const photos = useMemo(() => {
    const primary = media.gallery.find((i) => i.isPrimary) ?? media.gallery[0]
    return primary ? [primary] : []
  }, [media.gallery])
  const modelKey = media.models.glb?.url ?? ''
  const [mode, setMode] = useState<MediaMode>(() => initialMediaMode({ gallery: photos, models: media.models }))
  const [stored, setModelState] = useState<{ key: string; state: ModelState }>({ key: modelKey, state: modelKey ? 'loading' : 'none' })
  const modelState = stored.key === modelKey ? stored.state : modelKey ? 'loading' : 'none'
  const has3d = modelState === 'loading' || modelState === 'loaded'
  const name = localized(product.name)

  const selectVariant = (id: string) => {
    setVariantId(id)
    setSearch((prev) => withVariantParam(prev, id), { replace: true, preventScrollReset: true })
  }

  // The same analytics as the public product page: one view per load, one 3D interaction. Never 'ar_activation':
  // the AR link only opens the product page, where a real launch is recorded.
  const recorded = useRef(false)
  useEffect(() => {
    if (recorded.current) return
    recorded.current = true
    void service.recordEvent({ productId: product.id, businessId: product.businessId, type: 'view' })
  }, [product.id, product.businessId])
  const interacted = useRef(false)
  const onModelInteract = () => {
    if (interacted.current) return
    interacted.current = true
    void service.recordEvent({ productId: product.id, businessId: product.businessId, type: 'model_interaction' })
  }

  useEffect(() => {
    document.title = `${name} · ${business.name}`
  }, [name, business.name])

  const price = product.price + (variant?.priceDelta ?? 0)
  const pageUrl = embedProductPageUrl(business, product, { tenant, variantId, lang })
  const linkClass = 'inline-flex min-h-11 w-full items-center justify-center gap-2 border border-ink px-4 py-2 text-center text-[12px] leading-[1.2] font-medium tracking-[0.08em] uppercase text-ink transition-colors hover:bg-ink hover:text-chalk'

  return (
    <EmbedFrame business={business}>
      <div className="flex h-dvh min-h-[440px] flex-col sm:flex-row">
        <div className="relative min-h-[200px] flex-1 sm:min-w-0">
          <ProductMedia
            fill
            ar={false}
            name={name}
            gallery={photos}
            models={media.models}
            mode={mode}
            onModeChange={setMode}
            viewerRef={viewerRef}
            onArStatus={() => {}}
            onInteract={onModelInteract}
            onModelState={(url, s) => setModelState((m) => (url === modelKey ? { key: url, state: s } : m))}
          />
          {/* On the stage, so the card stays short enough for a phone-width frame. */}
          {has3d && (
            <button
              type="button"
              onClick={() => setMode(mode === '3d' ? 'photos' : '3d')}
              aria-pressed={mode === '3d'}
              className="absolute top-3 left-3 inline-flex h-10 items-center gap-2 bg-ink px-4 text-[12px] leading-[1.2] font-medium tracking-[0.08em] uppercase text-chalk transition-colors hover:bg-umber"
            >
              {mode === '3d' ? <Images className="size-4" strokeWidth={1.4} aria-hidden /> : <Box className="size-4" strokeWidth={1.4} aria-hidden />}
              {mode === '3d' ? t('product.viewPhotos') : t('product.view3d')}
            </button>
          )}
        </div>
        <div className="shrink-0 px-4 py-4 sm:flex sm:w-[min(42%,380px)] sm:flex-col sm:justify-center sm:px-7">
          <p className="truncate text-[12px] leading-[1.4] font-medium tracking-[0.08em] uppercase text-ink-muted">{business.name}</p>
          <LocalizedSpan as="h1" text={product.name} className="mt-1 font-display text-[1.5rem] leading-[1.1] font-normal text-balance text-ink sm:text-[2rem]" />
          <p className="mt-1.5 text-[15px] tracking-[0.04em] text-ink tabular-nums">{formatMoney(price, product.currency, lang)}</p>
          <VariantPicker product={product} selectedId={variantId} onSelect={selectVariant} className="mt-4" />
          <div className="mt-4">
            <a href={pageUrl} target="_blank" rel="noopener" className={linkClass}>
              {media.models.glb ? t('embed.arLink') : t('embed.fullPage')}
              <ArrowUpRight className="size-4" strokeWidth={1.4} aria-hidden />
            </a>
          </div>
          {media.models.glb && <p className="mt-2 text-xs text-ink-muted">{t('embed.arNote')}</p>}
        </div>
      </div>
    </EmbedFrame>
  )
}
