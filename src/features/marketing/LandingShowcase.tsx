// The landing page's 3D/AR card: a real published product (the one the admin features, else the first with a 3D model),
// shown as a photograph that the visitor can switch to the live 3D model in place. AR is not started here: the "AR" chip
// opens the product page, where the AR modes (WebXR, Scene Viewer, Quick Look; ADR-0035) already run.
// Without any product with a model the card stays the labelled illustration (ADR-0023).
import { AlertTriangle } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ModelViewer } from '@/components/three/ModelViewer'
import type { Business, Product } from '@/domain/types'
import { arLaunchUrl, variantMedia } from '@/features/ar/variantMedia'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { primaryImage } from '@/lib/product'
import { useFormat } from '@/lib/useFormat'
import { productLocalPath } from '@/lib/urls'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'

export type FeaturedRef = { businessSlug: string; productSlug: string }
export type ShowcaseItem = { product: Product; business: Business }
export type ShowcaseState = {
  status: 'loading' | 'ready'
  item?: ShowcaseItem
  /** The product page of the resolved product; undefined for the illustration. */
  href?: string
}

const hasModel = (p: Product) => !!variantMedia(p).models.glb

/**
 * The featured product when it is published, its business is active and it can be shown; otherwise the first published
 * product with a 3D model (an armchair when there is one); otherwise nothing (the illustration).
 */
export function resolveShowcase(products: Product[], businesses: Business[], featured?: FeaturedRef): ShowcaseItem | undefined {
  const active = new Map(businesses.filter((b) => b.status === 'active').map((b) => [b.id, b]))
  const items: ShowcaseItem[] = products
    .filter((p) => p.status === 'published' && active.has(p.businessId))
    .map((p) => ({ product: p, business: active.get(p.businessId)! }))
    .sort((a, b) => a.business.name.localeCompare(b.business.name) || a.product.name.en.localeCompare(b.product.name.en))
  const picked = featured && items.find((i) => i.business.slug === featured.businessSlug && i.product.slug === featured.productSlug)
  if (picked) return picked
  const withModel = items.filter((i) => hasModel(i.product))
  return withModel.find((i) => i.product.category === 'chair') ?? withModel[0]
}

/** The product the card shows and where the call to action leads. `service.getBusinesses()`, not `getCatalogs()` (staff only). */
export function useShowcaseProduct(featured?: FeaturedRef): ShowcaseState {
  const products = useServiceQuery(() => service.getProducts({ status: 'published' }), [])
  const businesses = useServiceQuery(() => service.getBusinesses(), [])
  const loading = products.status === 'loading' || businesses.status === 'loading'
  const slugs = `${featured?.businessSlug ?? ''}/${featured?.productSlug ?? ''}`
  return useMemo(() => {
    if (loading) return { status: 'loading' }
    const item = resolveShowcase(products.data ?? [], businesses.data ?? [], featured)
    return { status: 'ready', item, href: item ? productLocalPath(item.business, item.product) : undefined }
    // `slugs` stands for `featured`, which callers may rebuild on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, products.data, businesses.data, slugs])
}

const STALL_MS = 45_000
const CARD = 'border border-chalk/15 p-4 sm:p-6'
const STAGE = 'relative mt-4 aspect-[4/3] overflow-hidden bg-umber sm:mt-6'
const CHIP = 'border px-2.5 py-1.5 text-[10px] leading-none tracking-[0.2em] uppercase transition-colors select-none'

export function LandingShowcase({ featured, resolved }: { featured?: FeaturedRef; resolved?: ShowcaseState }) {
  // `resolved` lets the section share one lookup between the card and its call to action.
  const own = useShowcaseProduct(resolved ? undefined : featured)
  const state = resolved ?? own
  if (state.status === 'loading') return <figure className={CARD} aria-busy="true"><div className={STAGE} aria-hidden /></figure>
  if (!state.item || !state.href) return <IllustrationCard />
  return <ProductCard item={state.item} href={state.href} />
}

function ProductCard({ item: { product, business }, href }: { item: ShowcaseItem; href: string }) {
  const { t, localized } = useI18n()
  const { money } = useFormat()
  const glb = variantMedia(product).models.glb
  const glbUrl = glb ? arLaunchUrl(glb) : ''
  const image = primaryImage(product)
  const name = localized(product.name)
  const material = localized(product.material)
  const d = product.dimensions
  const hasDims = d.width > 0 && d.height > 0 && d.depth > 0
  // "W 60 × H 100 × D 60 cm", with the initials of the language's own words (L, A, P in Portuguese).
  const initial = (word: string) => word.charAt(0).toUpperCase()
  const dims = `${initial(t('product.width'))} ${d.width} × ${initial(t('product.height'))} ${d.height} × ${initial(t('product.depth'))} ${d.depth} ${d.unit}`

  const [mode, setMode] = useState<'image' | '3d'>('image')
  const [load, setLoad] = useState<{ state: 'loading' | 'loaded' | 'error'; attempt: number; progress: number; timedOut: boolean }>({ state: 'loading', attempt: 0, progress: 0, timedOut: false })
  const retry = () => setLoad((l) => ({ state: 'loading', attempt: l.attempt + 1, progress: 0, timedOut: false }))
  const show3d = mode === '3d'

  // No endless spinner: a model that makes no progress for the whole window is treated as failed.
  useEffect(() => {
    if (!show3d || load.state !== 'loading') return
    const timer = setTimeout(() => setLoad((l) => ({ ...l, state: 'error', timedOut: true })), STALL_MS)
    return () => clearTimeout(timer)
  }, [show3d, load.state, load.attempt, load.progress])

  return (
    <figure className={CARD}>
      <div className="flex items-start justify-between gap-4 border-b border-chalk/15 pb-4">
        <div className="min-w-0">
          <p className="text-label text-chalk/60">{t(`category.${product.category}`)}</p>
          <p className="mt-1.5 font-display text-[1.75rem] leading-none break-words">{name}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          <div role="group" aria-label={t('landing.show.viewLabel')} className="flex gap-2">
            <button type="button" aria-pressed={!show3d} onClick={() => setMode('image')} className={cn(CHIP, !show3d ? 'border-chalk bg-chalk text-ink' : 'border-chalk/30 hover:border-chalk/70')}>
              {t('landing.show.image')}
            </button>
            {glbUrl && (
              <button type="button" aria-pressed={show3d} onClick={() => setMode('3d')} className={cn(CHIP, show3d ? 'border-chalk bg-chalk text-ink' : 'border-chalk/30 hover:border-chalk/70')}>
                3D
              </button>
            )}
          </div>
          {glbUrl && (
            <Link to={href} aria-label={t('landing.show.arLabel')} className={cn(CHIP, 'border-chalk/30 hover:border-chalk/70')}>
              AR
            </Link>
          )}
        </div>
      </div>

      <div className={STAGE}>
        {image && (
          <img
            src={image.url}
            alt={image.alt || name}
            loading="lazy"
            className={cn('absolute inset-0 size-full object-cover', show3d && 'invisible')}
          />
        )}
        {show3d && glbUrl && (
          <div className="absolute inset-0 bg-subtle text-ink">
            <ModelViewer
              key={`${glbUrl}#${load.attempt}`}
              src={glbUrl}
              poster={image?.url}
              alt={`${t('product.view3d')}: ${name}`}
              ar={false}
              className="absolute inset-0"
              onLoad={() => setLoad((l) => ({ ...l, state: 'loaded' }))}
              onError={() => setLoad((l) => ({ ...l, state: 'error' }))}
              onProgress={(p) => setLoad((l) => ({ ...l, progress: p }))}
            />
            {load.state === 'loading' && (
              <p className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-xs leading-4 font-medium tracking-[0.08em] uppercase" role="status">
                {t('viewer.loading')}
              </p>
            )}
            {load.state === 'loaded' && (
              <p className="pointer-events-none absolute bottom-3 left-3 border border-line bg-surface px-2.5 py-1.5 text-xs leading-4 font-medium tracking-[0.08em] uppercase">{t('viewer.hint')}</p>
            )}
            {load.state === 'error' && (
              <div className="absolute inset-0 grid place-items-center bg-canvas p-4 text-center" role="alert">
                <div className="max-w-xs">
                  <AlertTriangle className="mx-auto size-5 text-warning" strokeWidth={1.5} aria-hidden />
                  <p className="mt-2 font-display text-lg leading-snug">{t('viewer.errorTitle')}</p>
                  <p className="mt-1 text-[13px] text-ink-muted">{load.timedOut ? t('viewer.timeout') : t('viewer.errorBody')}</p>
                  <div className="mt-3 flex justify-center gap-4">
                    <button type="button" onClick={retry} className="text-label underline underline-offset-4">
                      {t('viewer.retry')}
                    </button>
                    <button type="button" onClick={() => setMode('image')} className="text-label underline underline-offset-4">
                      {t('landing.show.image')}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <figcaption className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <dl className="grid gap-4 text-[13px] sm:grid-cols-2">
          {hasDims && (
            <div>
              <dt className="text-label text-chalk/60">{t('landing.feature.dimsLabel')}</dt>
              <dd className="mt-1.5 tracking-[0.04em] text-chalk/85">{dims}</dd>
            </div>
          )}
          {material && (
            <div>
              <dt className="text-label text-chalk/60">{t('landing.feature.materialsLabel')}</dt>
              <dd className="mt-1.5 leading-5 text-chalk/85">{material}</dd>
            </div>
          )}
        </dl>
        <p className="font-display text-xl tracking-[0.04em] sm:text-right">{money(product.price, product.currency)}</p>
        <p className="text-xs leading-5 text-chalk/60 sm:col-span-2">{t('landing.show.by', { business: business.name })}</p>
      </figcaption>
    </figure>
  )
}

/** The Linden armchair from the brand references: no product record and no model, so it is labelled and never links. */
function IllustrationCard() {
  const { t } = useI18n()
  const { money } = useFormat()
  return (
    <figure className={CARD}>
      <div className="border-b border-chalk/15 pb-4">
        <p className="text-label text-chalk/60">{t('landing.feature.eyebrow')}</p>
        <p className="mt-1.5 font-display text-[1.75rem] leading-none">{t('landing.feature.name')}</p>
      </div>
      <div className={STAGE}>
        <img
          src="/images/sanctus/v2/armchair-walnut.webp"
          alt={t('landing.feature.imageAlt')}
          width={1200}
          height={896}
          loading="lazy"
          className="absolute inset-0 size-full object-cover"
        />
        <span className="absolute top-3 left-3 bg-obsidian px-2.5 py-1.5 text-[10px] leading-none tracking-[0.18em] text-chalk uppercase">
          {t('landing.xp.illustration')}
        </span>
      </div>
      <figcaption className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <dl className="grid gap-4 text-[13px] sm:grid-cols-2">
          <div>
            <dt className="text-label text-chalk/60">{t('landing.feature.dimsLabel')}</dt>
            <dd className="mt-1.5 tracking-[0.04em] text-chalk/85">{t('landing.feature.dims')}</dd>
          </div>
          <div>
            <dt className="text-label text-chalk/60">{t('landing.feature.materialsLabel')}</dt>
            <dd className="mt-1.5 leading-5 text-chalk/85">{t('landing.feature.materials')}</dd>
          </div>
        </dl>
        <p className="font-display text-xl tracking-[0.04em] sm:text-right">{money(249000, 'EUR')}</p>
        <p className="text-xs leading-5 text-chalk/60 sm:col-span-2">{t('landing.feature.illustrative')}</p>
      </figcaption>
    </figure>
  )
}
