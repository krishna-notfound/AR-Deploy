import { AlertTriangle, ChevronLeft, ChevronRight, Maximize, Rotate3d } from 'lucide-react'
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
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

const primaryIndex = (images: ProductImage[]) => Math.max(0, images.findIndex((i) => i.isPrimary))

interface Load {
  url: string
  state: ModelState
  progress: number
  attempt: number
  timedOut: boolean
}
const freshLoad = (url: string): Load => ({ url, state: url ? 'loading' : 'none', progress: 0, attempt: 0, timedOut: false })

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

  return (
    <div className={cn(fill && 'flex h-full flex-col')}>
      <div className={cn('relative overflow-hidden bg-subtle', fill ? 'min-h-0 flex-1' : 'aspect-square sm:aspect-[5/4]')}>
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
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2.5 pb-6" role="status">
                <span className="text-[12px] leading-[1.2] font-medium tracking-[0.08em] uppercase text-ink-muted">{t('viewer.loading')}</span>
                <div className="h-px w-40 overflow-hidden bg-line">
                  <div className="h-full bg-ink transition-[width]" style={{ width: `${Math.max(6, Math.round(progress * 100))}%` }} />
                </div>
              </div>
            )}
            {state === 'loaded' && (
              <>
                {/* Chips on the stage, as the landing's viewer card. */}
                <p className="pointer-events-none absolute bottom-3 left-3 inline-flex items-center gap-2 border border-line bg-surface px-2.5 py-1.5 text-xs leading-4 font-medium tracking-[0.08em] text-ink uppercase sm:bottom-4 sm:left-4">
                  <Rotate3d className="size-3.5" strokeWidth={1.4} aria-hidden />
                  {t('viewer.hint')}
                </p>
                <button
                  type="button"
                  onClick={() => innerRef.current?.resetCamera()}
                  className="absolute top-3 right-3 inline-flex items-center gap-1.5 border border-line bg-surface px-2.5 py-1.5 text-xs leading-4 font-medium tracking-[0.08em] text-ink uppercase transition-colors before:absolute before:-inset-y-1.5 before:inset-x-0 before:content-[''] hover:border-line-strong sm:top-4 sm:right-4"
                >
                  <Maximize className="size-3.5" strokeWidth={1.4} aria-hidden />
                  {t('viewer.reset')}
                </button>
              </>
            )}
            {state === 'error' && (
              <div className="absolute inset-0 grid place-items-center bg-canvas p-6 text-center" role="alert">
                <div className="max-w-xs">
                  <AlertTriangle className="mx-auto size-5 text-warning" strokeWidth={1.5} aria-hidden />
                  <p className="mt-3 font-display text-[1.35rem] leading-snug">{t('viewer.errorTitle')}</p>
                  <p className="mt-1 text-[13px] text-ink-muted">{timedOut ? t('viewer.timeout') : t('viewer.errorBody')}</p>
                  <div className="mt-4 flex justify-center gap-2">
                    <Button size="sm" onClick={retry}>
                      {t('viewer.retry')}
                    </Button>
                    {gallery.length > 0 && (
                      <Button size="sm" variant="ghost" onClick={() => onModeChange('photos')}>
                        {t('product.viewPhotos')}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {mode === 'photos' && <Gallery images={gallery} name={name} idx={Math.min(photoIdx, Math.max(0, gallery.length - 1))} onIdx={setPhotoIdx} />}
      </div>

      {gallery.length > 1 && (
        <ul className="mt-3 flex gap-2 overflow-x-auto pb-0.5" aria-label={t('product.mediaLabel')}>
          {gallery.map((img, i) => (
            <li key={img.id} className="shrink-0">
              <button
                type="button"
                aria-label={t('product.photo', { n: i + 1, total: gallery.length })}
                aria-current={mode === 'photos' && i === photoIdx}
                onClick={() => showPhoto(i)}
                className={cn('block size-16 overflow-hidden border bg-subtle p-0.5 transition-colors sm:size-20', mode === 'photos' && i === photoIdx ? 'border-ink' : 'border-line opacity-80 hover:border-line-strong hover:opacity-100')}
              >
                <SmartImage src={img.url} alt="" className="size-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!glb && <p className="mt-3 text-center text-[12px] text-ink-muted">{t('viewer.unavailable')}</p>}
      {/* A failed model is reported here too while the photos are shown: the 3D call to action is gone (AR-08). */}
      {glb && state === 'error' && mode !== '3d' && (
        <p className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs text-ink-muted" role="status">
          <AlertTriangle className="size-3.5 text-warning" aria-hidden />
          <span>{t('viewer.errorTitle')}</span>
          <button type="button" onClick={retry} className="font-medium text-ink underline underline-offset-2">
            {t('viewer.retry')}
          </button>
        </p>
      )}
    </div>
  )
}

function Gallery({ images, name, idx, onIdx }: { images: ProductImage[]; name: string; idx: number; onIdx: (i: number) => void }) {
  const { t } = useI18n()
  const current = images[idx]
  const go = (d: number) => onIdx((idx + d + images.length) % images.length)
  return (
    <div
      className="absolute inset-0"
      role="region"
      aria-roledescription="carousel"
      aria-label={name}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(1)
        if (e.key === 'ArrowLeft') go(-1)
      }}
    >
      <SmartImage src={current?.url} alt={`${name}. ${t('product.photo', { n: idx + 1, total: images.length })}`} className="size-full object-contain" />
      {images.length > 1 && (
        <>
          <button type="button" aria-label={t('product.prevPhoto')} onClick={() => go(-1)} className="absolute top-1/2 left-3 grid size-10 -translate-y-1/2 place-items-center border border-line bg-surface transition-colors hover:border-line-strong">
            <ChevronLeft className="size-4" strokeWidth={1.5} aria-hidden />
          </button>
          <button type="button" aria-label={t('product.nextPhoto')} onClick={() => go(1)} className="absolute top-1/2 right-3 grid size-10 -translate-y-1/2 place-items-center border border-line bg-surface transition-colors hover:border-line-strong">
            <ChevronRight className="size-4" strokeWidth={1.5} aria-hidden />
          </button>
        </>
      )}
    </div>
  )
}
