// The landing page's 3D/AR card. It renders a ShowcaseView: one of the admin's own showcase pieces (ADR-0047, never a
// business's product) converted by productToShowcaseView, or, when there is no piece, the labelled illustration (ADR-0023).
// "3D" switches the picture to the live model in place; "AR" launches AR from the card with the same model-viewer setup as
// the product page (ar-modes webxr scene-viewer quick-look, ADR-0035; an iPhone uses the USDZ when given, else model-viewer
// builds one). Where AR is not available the card says so. With only a product page behind it, "AR" links there.
import { AlertTriangle } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router'
import { type ModelLoadInfo, ModelViewer, type ModelViewerHandle } from '@/components/three/ModelViewer'
import { HOUSE_BUSINESS_SLUG, type ProductRef } from '@/domain/siteContent'
import type { Product } from '@/domain/types'
import { arLaunchUrl, variantMedia } from '@/features/ar/variantMedia'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { initialPrice, primaryImage } from '@/lib/product'
import { useFormat } from '@/lib/useFormat'
import { showcaseProductPath } from '@/lib/urls'
import { hasGlb, useShowcasePieces } from './useShowcasePieces'

/** What the card shows: a showcase piece converted by productToShowcaseView. */
export interface ShowcaseView {
  eyebrow?: string
  title: string
  text?: string
  dimensions?: string
  materials?: string
  /** Already formatted. */
  priceLabel?: string
  imageUrl?: string
  /** The 3D model, plus the iPhone file. */
  glbUrl?: string
  usdzUrl?: string
  /** The piece's showcase page. */
  productHref?: string
}

/**
 * The piece the 3D card shows: the featured one when it is a published house piece; otherwise the newest piece with a 3D
 * model; otherwise nothing (the illustration). `pieces` are the admin's showcase pieces, newest first (ADR-0047).
 */
export function pickShowcasePiece(pieces: Product[], featured?: ProductRef): Product | undefined {
  const picked = featured && featured.businessSlug === HOUSE_BUSINESS_SLUG && pieces.find((p) => p.slug === featured.productSlug)
  return picked || pieces.find(hasGlb)
}

type Fmt = {
  t: ReturnType<typeof useI18n>['t']
  localized: ReturnType<typeof useI18n>['localized']
  money: ReturnType<typeof useFormat>['money']
}

/** A showcase piece as the card's view. */
export function productToShowcaseView(product: Product, { t, localized, money }: Fmt): ShowcaseView {
  const media = variantMedia(product)
  const image = primaryImage(product)
  const d = product.dimensions
  const hasDims = d.width > 0 && d.height > 0 && d.depth > 0
  // "W 60 × H 100 × D 60 cm", with the initials of the language's own words (L, A, P in Portuguese).
  const initial = (word: string) => word.charAt(0).toUpperCase()
  return {
    eyebrow: t(`category.${product.category}`),
    title: localized(product.name),
    dimensions: hasDims
      ? `${initial(t('product.width'))} ${d.width} × ${initial(t('product.height'))} ${d.height} × ${initial(t('product.depth'))} ${d.depth} ${d.unit}`
      : undefined,
    materials: localized(product.material) || undefined,
    priceLabel: money(initialPrice(product), product.currency),
    imageUrl: image?.url,
    glbUrl: media.models.glb ? arLaunchUrl(media.models.glb) : undefined,
    usdzUrl: media.models.usdz ? arLaunchUrl(media.models.usdz) : undefined,
    productHref: showcaseProductPath(product.slug),
  }
}

/** The 3D card's view: a showcase piece, or undefined (the illustration) when there is none. `loading` while the pieces load. */
export function useShowcaseCardView(featured?: ProductRef): { view?: ShowcaseView; loading: boolean } {
  const { t, localized } = useI18n()
  const { money } = useFormat()
  const { status, pieces } = useShowcasePieces()
  const slug = featured?.businessSlug === HOUSE_BUSINESS_SLUG ? featured.productSlug : ''
  const view = useMemo(() => {
    const piece = pickShowcasePiece(pieces, slug ? { businessSlug: HOUSE_BUSINESS_SLUG, productSlug: slug } : undefined)
    return piece ? productToShowcaseView(piece, { t, localized, money }) : undefined
  }, [pieces, slug, t, localized, money])
  return { view, loading: status === 'loading' }
}

const SHOW_3D_EVENT = 'sanctus:showcase-3d'
const CARD_ID = 'landing-showcase'

/** The "Open a live piece in 3D" button: switches the card to its model in place; without a model, links to the product page. */
export function ShowcaseCta({ view, className, children }: { view?: ShowcaseView; className?: string; children: ReactNode }) {
  const { t } = useI18n()
  if (view?.glbUrl) {
    return (
      <button
        type="button"
        className={className}
        onClick={() => {
          window.dispatchEvent(new Event(SHOW_3D_EVENT))
          const card = document.getElementById(CARD_ID)
          const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
          card?.scrollIntoView?.({ behavior: calm ? 'auto' : 'smooth', block: 'center' })
        }}
      >
        {t('landing.xp.cta')}
        {children}
      </button>
    )
  }
  if (view?.productHref) {
    return (
      <Link to={view.productHref} className={className}>
        {t('landing.xp.cta')}
        {children}
      </Link>
    )
  }
  return null
}

const STALL_MS = 45_000
const CARD = 'border border-chalk/15 p-4 sm:p-6'
const STAGE = 'relative mt-4 aspect-[4/3] overflow-hidden bg-umber sm:mt-6'
const CHIP = 'border px-2.5 py-1.5 text-[10px] leading-none tracking-[0.2em] uppercase transition-colors select-none'

/** `view` is a showcase piece, else nothing (the labelled illustration). */
export function LandingShowcase({ view, loading }: { view?: ShowcaseView; loading?: boolean }) {
  if (loading) return <figure className={CARD} aria-busy="true"><div className={STAGE} aria-hidden /></figure>
  if (!view) return <IllustrationCard />
  return <ShowcaseCard view={view} />
}

export function ShowcaseCard({ view }: { view: ShowcaseView }) {
  const { t } = useI18n()
  const { title, eyebrow, text, dimensions, materials, priceLabel, imageUrl, glbUrl, usdzUrl, productHref } = view

  const [mode, setMode] = useState<'image' | '3d'>(!imageUrl && glbUrl ? '3d' : 'image')
  const [load, setLoad] = useState<{ state: 'loading' | 'loaded' | 'error'; attempt: number; progress: number; timedOut: boolean }>({ state: 'loading', attempt: 0, progress: 0, timedOut: false })
  const [arHint, setArHint] = useState(false)
  const viewerRef = useRef<ModelViewerHandle>(null)
  const wantAr = useRef(false)
  const retry = () => setLoad((l) => ({ state: 'loading', attempt: l.attempt + 1, progress: 0, timedOut: false }))
  const show3d = mode === '3d' && !!glbUrl

  // "Open a live piece in 3D" in the section's call to action.
  useEffect(() => {
    const on = () => glbUrl && setMode('3d')
    window.addEventListener(SHOW_3D_EVENT, on)
    return () => window.removeEventListener(SHOW_3D_EVENT, on)
  }, [glbUrl])

  // No endless spinner: a model that makes no progress for the whole window is treated as failed.
  useEffect(() => {
    if (!show3d || load.state !== 'loading') return
    const timer = setTimeout(() => setLoad((l) => ({ ...l, state: 'error', timedOut: true })), STALL_MS)
    return () => clearTimeout(timer)
  }, [show3d, load.state, load.attempt, load.progress])

  const startAr = () => {
    viewerRef.current?.activateAR().catch(() => setArHint(true))
  }
  const onLoaded = (info: ModelLoadInfo) => {
    setLoad((l) => ({ ...l, state: 'loaded' }))
    if (info.canActivateAR) {
      setArHint(false)
      if (wantAr.current) startAr()
      wantAr.current = false
    } else if (wantAr.current) {
      setArHint(true)
    }
  }
  const launchAr = () => {
    setArHint(false)
    if (!show3d) {
      wantAr.current = true
      setMode('3d')
    } else if (load.state === 'loaded') {
      if (viewerRef.current?.canActivateAR()) startAr()
      else setArHint(true)
    } else {
      wantAr.current = true
    }
  }

  const chipOn = (on: boolean) => cn(CHIP, on ? 'border-chalk bg-chalk text-ink' : 'border-chalk/30 hover:border-chalk/70')

  return (
    <figure id={CARD_ID} className={CARD}>
      <div className="flex items-start justify-between gap-4 border-b border-chalk/15 pb-4">
        <div className="min-w-0">
          {eyebrow && <p className="text-label text-chalk/60">{eyebrow}</p>}
          <p className="mt-1.5 font-display text-[1.75rem] leading-none break-words">{title}</p>
        </div>
        <div className="flex shrink-0 gap-2">
          {imageUrl && glbUrl && (
            <div role="group" aria-label={t('landing.show.viewLabel')} className="flex gap-2">
              <button type="button" aria-pressed={!show3d} onClick={() => setMode('image')} className={chipOn(!show3d)}>
                {t('landing.show.image')}
              </button>
              <button type="button" aria-pressed={show3d} onClick={() => setMode('3d')} className={chipOn(show3d)}>
                3D
              </button>
            </div>
          )}
          {glbUrl ? (
            <button type="button" aria-label={t('landing.show.arLabel')} onClick={launchAr} className={cn(CHIP, 'border-chalk/30 hover:border-chalk/70')}>
              AR
            </button>
          ) : (
            productHref && (
              <Link to={productHref} aria-label={t('landing.show.arLabel')} className={cn(CHIP, 'border-chalk/30 hover:border-chalk/70')}>
                AR
              </Link>
            )
          )}
        </div>
      </div>
      {arHint && (
        <p role="status" className="mt-3 text-xs leading-5 text-chalk/75">
          {t('landing.show.arHint')}
        </p>
      )}

      <div className={STAGE}>
        {imageUrl && <img src={imageUrl} alt={title} loading="lazy" className={cn('absolute inset-0 size-full object-cover', show3d && 'invisible')} />}
        {show3d && glbUrl && (
          <div className="absolute inset-0 bg-subtle text-ink">
            <ModelViewer
              key={`${glbUrl}#${load.attempt}`}
              ref={viewerRef}
              src={glbUrl}
              iosSrc={usdzUrl}
              poster={imageUrl}
              alt={`${t('product.view3d')}: ${title}`}
              ar
              className="absolute inset-0"
              onLoad={onLoaded}
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
                    {imageUrl && (
                      <button type="button" onClick={() => setMode('image')} className="text-label underline underline-offset-4">
                        {t('landing.show.image')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <figcaption className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-[minmax(0,1fr)_auto]">
        <dl className="grid gap-4 text-[13px] sm:grid-cols-2">
          {dimensions && (
            <div>
              <dt className="text-label text-chalk/60">{t('landing.feature.dimsLabel')}</dt>
              <dd className="mt-1.5 tracking-[0.04em] text-chalk/85">{dimensions}</dd>
            </div>
          )}
          {materials && (
            <div>
              <dt className="text-label text-chalk/60">{t('landing.feature.materialsLabel')}</dt>
              <dd className="mt-1.5 leading-5 text-chalk/85">{materials}</dd>
            </div>
          )}
        </dl>
        {priceLabel && <p className="font-display text-xl tracking-[0.04em] sm:text-right">{priceLabel}</p>}
        {text && <p className="text-[13px] leading-5 text-chalk/80 sm:col-span-2">{text}</p>}
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
