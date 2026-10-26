import { AlertTriangle, Box, ChevronLeft, ChevronRight, Maximize, Rotate3d } from 'lucide-react'
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { SmartImage } from '@/components/ui/SmartImage'
import { type ArStatus, MODEL_STALL_TIMEOUT_MS, type ModelLoadInfo, ModelViewer, type ModelViewerHandle } from '@/components/three/ModelViewer'
import type { ProductImage, ProductModels } from '@/domain/types'
import { arLaunchUrl } from '@/features/ar/variantMedia'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'

export { MODEL_STALL_TIMEOUT_MS }

export type ModelState = 'none' | 'loading' | 'loaded' | 'error'
export type MediaMode = '3d' | 'photos'

/** The product page opens on the standard photograph; 3D only when there is no photo to show. */
export function initialMediaMode(media: { gallery: ProductImage[]; models: ProductModels }): MediaMode {
  return media.gallery.length || !media.models.glb ? 'photos' : '3d'
}

const primaryIndex = (images: ProductImage[]) =>
  Math.max(
    0,
    images.findIndex((i) => i.isPrimary),
  )

interface Load {
  url: string
  state: ModelState
  progress: number
  attempt: number
  timedOut: boolean
}
const freshLoad = (url: string): Load => ({ url, state: url ? 'loading' : 'none', progress: 0, attempt: 0, timedOut: false })

/** A pill on the stage (status chips and the small stage controls). */
const stagePill = 'inline-flex items-center gap-2 rounded-full bg-surface/90 px-3.5 py-2 text-[13px] leading-4 font-medium text-ink'

/**
 * Photo stage with thumbnails; the 3D viewer is mounted behind it from the start (hidden until chosen) so the
 * AR capability check and the scale check run while the visitor looks at the photograph. A new GLB (another
 * variant) starts a new load: nothing measured or reported for the previous file carries over.
 */
export function ProductMedia({
  name,
  gallery,
  models,
  mode,
  onModeChange,
  viewerRef,
  onModelState,
  onArStatus,
  onInteract,
  ar = true,
  fill = false,
  modeSwitch = false,
}: {
  name: string
  gallery: ProductImage[]
  /** One GLB/USDZ pair from one source (see variantMedia). */
  models: ProductModels
  mode: MediaMode
  onModeChange: (m: MediaMode) => void
  viewerRef: Ref<ModelViewerHandle>
  /** `url` is the GLB the state belongs to, so a late report about a previous model can be ignored. */
  onModelState: (url: string, s: ModelState, info?: ModelLoadInfo) => void
  onArStatus: (s: ArStatus) => void
  onInteract?: () => void
  /** False in the embed: AR never starts inside an iframe, the full product page handles it (ADR-0026). */
  ar?: boolean
  /** Stage fills the parent's height instead of a fixed aspect ratio (embed). */
  fill?: boolean
  /** The "Photos | 3D" switch in the stage's top-left corner (product page; the embed has its own toggle). */
  modeSwitch?: boolean
}) {
  const { t } = useI18n()
  const { glb, usdz } = models
  // A published product's public copy (site /ar/ path) when it has one: model-viewer's AR (WebXR, and its Scene Viewer
  // fallback, which cannot open a private signed link) uses this same URL (ADR-0035).
  const glbUrl = glb ? arLaunchUrl(glb) : ''

  // Photo index and model load are tied to what they show; a variant switch starts both afresh.
  const galleryKey = gallery.map((i) => i.id).join('|')
  const [photo, setPhoto] = useState({ key: galleryKey, idx: primaryIndex(gallery) })
  const photoIdx = photo.key === galleryKey ? photo.idx : primaryIndex(gallery)
  const setPhotoIdx = (idx: number) => setPhoto({ key: galleryKey, idx })
  const [stored, setLoad] = useState<Load>(() => freshLoad(glbUrl))
  const load = stored.url === glbUrl ? stored : freshLoad(glbUrl)
  if (stored !== load) setLoad(load)
  const { state, progress, attempt, timedOut } = load

  const innerRef = useRef<ModelViewerHandle>(null)
  useImperativeHandle(viewerRef, () => ({
    activateAR: () => innerRef.current?.activateAR() ?? Promise.resolve(),
    canActivateAR: () => innerRef.current?.canActivateAR() ?? false,
    getDimensions: () => innerRef.current?.getDimensions() ?? null,
    resetCamera: () => innerRef.current?.resetCamera(),
  }))
  const poster = gallery.find((i) => i.isPrimary)?.url ?? gallery[0]?.url

  const update = (s: ModelState, info?: ModelLoadInfo, patch: Partial<Load> = {}) => {
    setLoad((l) => (l.url === glbUrl ? { ...l, ...patch, state: s } : l))
    onModelState(glbUrl, s, info)
  }
  const updateRef = useRef(update)
  updateRef.current = update

  // Restart the stall timer on every progress tick; fail only when nothing has arrived for the whole window.
  useEffect(() => {
    if (state !== 'loading') return
    const timer = setTimeout(() => updateRef.current('error', undefined, { timedOut: true }), MODEL_STALL_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [state, progress, attempt, glbUrl])

  const retry = () => update('loading', undefined, { timedOut: false, progress: 0, attempt: attempt + 1 })

  const showPhoto = (i: number) => {
    setPhotoIdx(i)
    onModeChange('photos')
  }
  const idx = Math.min(photoIdx, Math.max(0, gallery.length - 1))
  // The switch appears once there is both a photo and a model that is (being) loaded; a failed model says so instead.
  const showSwitch = modeSwitch && !!glb && gallery.length > 0 && (state === 'loading' || state === 'loaded')

  return (
    <div className={cn(fill && 'flex h-full flex-col')}>
      <div className={cn('relative overflow-hidden rounded-soft-sm bg-subtle sm:rounded-soft', fill ? 'min-h-0 flex-1' : 'aspect-square sm:aspect-[5/4]')}>
        {glb && (
          <div className={cn('absolute inset-0', mode !== '3d' && 'invisible')} aria-hidden={mode !== '3d'}>
            <ModelViewer
              key={`${glbUrl}#${attempt}`}
              ref={innerRef}
              src={glbUrl}
              // Only the USDZ that belongs to this GLB; none means iPhone generates one from this GLB.
              iosSrc={usdz ? arLaunchUrl(usdz) : undefined}
              poster={poster}
              alt={t('product.view3d') + ': ' + name}
              ar={ar}
              className="absolute inset-0"
              onProgress={(p) => setLoad((l) => (l.url === glbUrl ? { ...l, progress: p } : l))}
              onLoad={(info) => update('loaded', info)}
              onError={() => update('error')}
              onArStatus={onArStatus}
              onInteract={onInteract}
            />
            {state === 'loading' && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-3 pb-7" role="status">
                <span className="text-[14px] leading-5 font-medium text-ink-body">{t('viewer.loading')}</span>
                <div className="h-1 w-40 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full bg-ink transition-[width]" style={{ width: `${Math.max(6, Math.round(progress * 100))}%` }} />
                </div>
              </div>
            )}
            {state === 'loaded' && (
              <>
                <p className={cn(stagePill, 'pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 whitespace-nowrap sm:bottom-6')}>
                  <Rotate3d className="size-4" strokeWidth={1.5} aria-hidden />
                  {t('viewer.hint')}
                </p>
                <button
                  type="button"
                  onClick={() => innerRef.current?.resetCamera()}
                  className={cn(
                    stagePill,
                    "absolute top-3.5 right-3.5 transition-colors before:absolute before:-inset-y-1 before:inset-x-0 before:content-[''] hover:bg-surface sm:top-6 sm:right-6",
                  )}
                >
                  <Maximize className="size-3.5" strokeWidth={1.5} aria-hidden />
                  {t('viewer.reset')}
                </button>
              </>
            )}
            {state === 'error' && (
              <div className="absolute inset-0 grid place-items-center bg-subtle p-6 text-center" role="alert">
                <div className="max-w-xs">
                  <AlertTriangle className="mx-auto size-5 text-warning" strokeWidth={1.5} aria-hidden />
                  <p className="mt-3 font-display text-[1.5rem] leading-snug text-ink">{t('viewer.errorTitle')}</p>
                  <p className="mt-1.5 text-[15px] leading-6 text-ink-body">{timedOut ? t('viewer.timeout') : t('viewer.errorBody')}</p>
                  <div className="mt-5 flex justify-center gap-2">
                    <button
                      type="button"
                      onClick={retry}
                      className="inline-flex h-11 items-center rounded-full bg-ink px-5 text-[15px] font-medium text-canvas transition-colors hover:bg-umber"
                    >
                      {t('viewer.retry')}
                    </button>
                    {gallery.length > 0 && (
                      <button
                        type="button"
                        onClick={() => onModeChange('photos')}
                        className="inline-flex h-11 items-center rounded-full bg-surface px-5 text-[15px] font-medium text-ink transition-colors hover:bg-canvas"
                      >
                        {t('product.viewPhotos')}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {mode === 'photos' && <Gallery images={gallery} name={name} idx={idx} onIdx={setPhotoIdx} inset={modeSwitch ? (showSwitch ? 'switch' : 'even') : 'none'} />}
        {showSwitch && (
          <div role="group" aria-label={t('product.mediaLabel')} className="absolute top-3.5 left-3.5 z-10 inline-flex rounded-full bg-surface p-1 sm:top-6 sm:left-6">
            {(['photos', '3d'] as const).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                onClick={() => onModeChange(m)}
                className={cn(
                  'inline-flex h-10 items-center rounded-full px-4 text-[14px] font-medium transition-colors motion-safe:duration-200',
                  mode === m ? 'bg-ink text-canvas' : 'text-ink-muted hover:text-ink',
                )}
              >
                {m === '3d' ? '3D' : t('product.viewPhotos')}
              </button>
            ))}
          </div>
        )}
        {/* Phones: dots for the photos, inside the stage (thumbnails from sm up). */}
        {mode === 'photos' && gallery.length > 1 && (
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-0.5 sm:hidden">
            {gallery.map((img, i) => (
              <button
                key={img.id}
                type="button"
                aria-label={t('product.photo', { n: i + 1, total: gallery.length })}
                aria-current={i === idx}
                onClick={() => showPhoto(i)}
                className="grid size-7 place-items-center"
              >
                <span className={cn('size-2 rounded-full transition-colors', i === idx ? 'bg-ink' : 'bg-ink/25')} aria-hidden />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Thumbnails from sm up: on the product page a "3D" tile leads the row while the model is (being) loaded. */}
      {(gallery.length > 1 || showSwitch) && (
        <ul className={cn('hidden gap-3 p-1', modeSwitch ? 'mt-3 grid-cols-4 sm:grid' : 'mt-4 overflow-x-auto sm:flex')} aria-label={t('product.mediaLabel')}>
          {showSwitch && (
            <li>
              <button
                type="button"
                aria-label={t('product.tile3d')}
                aria-current={mode === '3d'}
                onClick={() => onModeChange('3d')}
                className={cn(
                  'flex aspect-[3/2] w-full flex-col items-center justify-center gap-2 rounded-soft-sm bg-subtle text-[13px] font-medium text-ink transition-opacity',
                  mode === '3d' ? 'ring-2 ring-accent ring-offset-2 ring-offset-canvas' : 'opacity-75 hover:opacity-100',
                )}
              >
                <span className="grid size-8 place-items-center rounded-full bg-surface" aria-hidden>
                  <Box className="size-4" strokeWidth={1.5} />
                </span>
                <span aria-hidden>3D</span>
              </button>
            </li>
          )}
          {gallery.map((img, i) => {
            const current = mode === 'photos' && i === idx
            return (
              <li key={img.id} className="shrink-0">
                <button
                  type="button"
                  aria-label={t('product.photo', { n: i + 1, total: gallery.length })}
                  aria-current={current}
                  onClick={() => showPhoto(i)}
                  className={cn(
                    'block overflow-hidden rounded-soft-sm bg-subtle transition-opacity',
                    modeSwitch ? 'aspect-[3/2] w-full' : 'size-24 lg:size-28',
                    current ? 'ring-2 ring-accent ring-offset-2 ring-offset-canvas' : 'opacity-75 hover:opacity-100',
                  )}
                >
                  <SmartImage src={img.url} alt="" className="size-full object-cover" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {!glb && <p className="mt-3 text-[14px] leading-5 text-ink-muted">{t('viewer.unavailable')}</p>}
      {/* A failed model is reported here too while the photos are shown: the 3D call to action is gone (AR-08). */}
      {glb && state === 'error' && mode !== '3d' && (
        <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-ink-body" role="status">
          <AlertTriangle className="size-4 text-warning" aria-hidden />
          <span>{t('viewer.errorTitle')}</span>
          <button type="button" onClick={retry} className="font-medium text-ink underline underline-offset-4">
            {t('viewer.retry')}
          </button>
        </p>
      )}
    </div>
  )
}

/** `inset`: room around the photo on the product page ('switch' leaves the top-left corner to the Photos | 3D switch). */
function Gallery({ images, name, idx, onIdx, inset }: { images: ProductImage[]; name: string; idx: number; onIdx: (i: number) => void; inset: 'none' | 'even' | 'switch' }) {
  const { t } = useI18n()
  const current = images[idx]
  const go = (d: number) => onIdx((idx + d + images.length) % images.length)
  const touchX = useRef<number | null>(null)
  const arrow =
    'absolute top-1/2 hidden size-11 -translate-y-1/2 place-items-center rounded-full bg-surface/90 text-ink transition-opacity hover:bg-surface focus-visible:opacity-100 motion-safe:duration-200 sm:grid sm:opacity-0 sm:group-hover:opacity-100'
  return (
    <div
      className="group absolute inset-0"
      role="region"
      aria-roledescription="carousel"
      aria-label={name}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(1)
        if (e.key === 'ArrowLeft') go(-1)
      }}
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null
      }}
      onTouchEnd={(e) => {
        const start = touchX.current
        const end = e.changedTouches[0]?.clientX
        touchX.current = null
        if (images.length < 2 || start == null || end == null || Math.abs(end - start) < 40) return
        go(end < start ? 1 : -1)
      }}
    >
      <SmartImage
        src={current?.url}
        alt={`${name}. ${t('product.photo', { n: idx + 1, total: images.length })}`}
        className={cn('size-full bg-transparent object-contain', { none: '', even: 'p-4 pb-10 sm:p-10', switch: 'px-4 pt-16 pb-10 sm:px-12 sm:pt-20 sm:pb-12' }[inset])}
      />
      {images.length > 1 && (
        <>
          <button type="button" aria-label={t('product.prevPhoto')} onClick={() => go(-1)} className={cn(arrow, 'left-4')}>
            <ChevronLeft className="size-4" strokeWidth={1.5} aria-hidden />
          </button>
          <button type="button" aria-label={t('product.nextPhoto')} onClick={() => go(1)} className={cn(arrow, 'right-4')}>
            <ChevronRight className="size-4" strokeWidth={1.5} aria-hidden />
          </button>
        </>
      )}
    </div>
  )
}
