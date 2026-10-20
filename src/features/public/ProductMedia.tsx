import { AlertTriangle, ChevronLeft, ChevronRight, Hand, Maximize } from 'lucide-react'
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { SmartImage } from '@/components/ui/SmartImage'
import { type ArStatus, ModelViewer, type ModelViewerHandle } from '@/components/three/ModelViewer'
import type { Product, ProductImage } from '@/domain/types'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { isStaleSessionAsset } from '@/lib/files'
import type { MeasuredSize } from '@/lib/scale'

export type ModelState = 'none' | 'loading' | 'loaded' | 'error'
export type MediaMode = '3d' | 'photos'

/** A model that makes no download progress for this long is treated as failed (no endless spinner). */
export const MODEL_STALL_TIMEOUT_MS = 45_000

/** The product page opens on the standard photograph; 3D only when there is no photo to show. */
export function initialMediaMode(product: Product): MediaMode {
  return product.images.some((i) => i.kind === 'gallery') || !usableModels(product).glb ? 'photos' : '3d'
}

export function usableModels(product: Product) {
  return {
    glb: product.models.glb && !isStaleSessionAsset(product.models.glb) ? product.models.glb : undefined,
    usdz: product.models.usdz && !isStaleSessionAsset(product.models.usdz) ? product.models.usdz : undefined,
  }
}

/**
 * Photo stage with thumbnails; the 3D viewer is mounted behind it from the start (hidden until chosen) so the
 * AR capability check and the scale check run while the visitor looks at the photograph.
 */
export function ProductMedia({
  product,
  mode,
  onModeChange,
  viewerRef,
  onModelState,
  onArStatus,
  onInteract,
}: {
  product: Product
  mode: MediaMode
  onModeChange: (m: MediaMode) => void
  viewerRef: Ref<ModelViewerHandle>
  onModelState: (s: ModelState, info?: { canActivateAR: boolean; dimensions: MeasuredSize | null }) => void
  onArStatus: (s: ArStatus) => void
  onInteract?: () => void
}) {
  const { t, localized } = useI18n()
  const { glb, usdz } = usableModels(product)
  const gallery = product.images.filter((i) => i.kind === 'gallery')
  const [photoIdx, setPhotoIdx] = useState(Math.max(0, gallery.findIndex((i) => i.isPrimary)))
  const [state, setState] = useState<ModelState>(glb ? 'loading' : 'none')
  const [progress, setProgress] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const [timedOut, setTimedOut] = useState(false)
  const innerRef = useRef<ModelViewerHandle>(null)
  useImperativeHandle(viewerRef, () => ({
    activateAR: () => innerRef.current?.activateAR() ?? Promise.resolve(),
    canActivateAR: () => innerRef.current?.canActivateAR() ?? false,
    getDimensions: () => innerRef.current?.getDimensions() ?? null,
    resetCamera: () => innerRef.current?.resetCamera(),
  }))
  const name = localized(product.name)
  const poster = gallery.find((i) => i.isPrimary)?.url ?? gallery[0]?.url

  const update = (s: ModelState, info?: { canActivateAR: boolean; dimensions: MeasuredSize | null }) => {
    setState(s)
    onModelState(s, info)
  }
  const updateRef = useRef(update)
  updateRef.current = update

  // Restart the stall timer on every progress tick; fail only when nothing has arrived for the whole window.
  useEffect(() => {
    if (state !== 'loading') return
    const timer = setTimeout(() => {
      setTimedOut(true)
      updateRef.current('error')
    }, MODEL_STALL_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [state, progress, attempt])

  const showPhoto = (i: number) => {
    setPhotoIdx(i)
    onModeChange('photos')
  }

  return (
    <div>
      <div className="relative aspect-square overflow-hidden bg-subtle sm:aspect-[5/4]">
        {glb && (
          <div className={cn('absolute inset-0', mode !== '3d' && 'invisible')} aria-hidden={mode !== '3d'}>
            <ModelViewer
              key={attempt}
              ref={innerRef}
              src={glb.url}
              iosSrc={usdz?.url}
              poster={poster}
              alt={t('product.view3d') + ': ' + name}
              ar
              className="absolute inset-0"
              onProgress={setProgress}
              onLoad={(info) => update('loaded', info)}
              onError={() => update('error')}
              onArStatus={onArStatus}
              onInteract={onInteract}
            />
            {state === 'loading' && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 pb-6" role="status">
                <span className="text-xs text-ink-muted">{t('viewer.loading')}</span>
                <div className="h-px w-40 overflow-hidden bg-line">
                  <div className="h-full bg-ink transition-[width]" style={{ width: `${Math.max(6, Math.round(progress * 100))}%` }} />
                </div>
              </div>
            )}
            {state === 'loaded' && (
              <>
                <p className="pointer-events-none absolute inset-x-0 bottom-5 flex items-center justify-center gap-2 text-xs text-ink-muted">
                  <Hand className="size-4" strokeWidth={1.4} aria-hidden />
                  {t('viewer.hint')}
                </p>
                <button
                  type="button"
                  onClick={() => innerRef.current?.resetCamera()}
                  className="absolute top-4 right-4 inline-flex items-center gap-1.5 border border-line-strong/40 bg-surface/90 px-3 py-1.5 text-xs text-ink hover:bg-surface"
                >
                  <Maximize className="size-3.5" aria-hidden />
                  {t('viewer.reset')}
                </button>
              </>
            )}
            {state === 'error' && (
              <div className="absolute inset-0 grid place-items-center bg-canvas/90 p-6 text-center" role="alert">
                <div className="max-w-xs">
                  <AlertTriangle className="mx-auto size-6 text-warning" aria-hidden />
                  <p className="mt-2 text-sm font-medium">{t('viewer.errorTitle')}</p>
                  <p className="mt-1 text-[13px] text-ink-muted">{timedOut ? t('viewer.timeout') : t('viewer.errorBody')}</p>
                  <div className="mt-4 flex justify-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setTimedOut(false)
                        setProgress(0)
                        setAttempt((a) => a + 1)
                        update('loading')
                      }}
                    >
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
        {mode === 'photos' && <Gallery images={gallery} name={name} idx={photoIdx} onIdx={setPhotoIdx} />}
      </div>

      {gallery.length > 1 && (
        <ul className="mt-3 flex gap-2 overflow-x-auto" aria-label={t('product.mediaLabel')}>
          {gallery.map((img, i) => (
            <li key={img.id} className="shrink-0">
              <button
                type="button"
                aria-label={t('product.photo', { n: i + 1, total: gallery.length })}
                aria-current={mode === 'photos' && i === photoIdx}
                onClick={() => showPhoto(i)}
                className={cn('block size-16 overflow-hidden border transition-colors sm:size-20', mode === 'photos' && i === photoIdx ? 'border-ink' : 'border-transparent opacity-80 hover:opacity-100')}
              >
                <SmartImage src={img.url} alt="" className="size-full object-cover" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {!glb && <p className="mt-3 text-center text-xs text-ink-muted">{t('viewer.unavailable')}</p>}
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
          <button type="button" aria-label={t('product.prevPhoto')} onClick={() => go(-1)} className="absolute top-1/2 left-3 grid size-9 -translate-y-1/2 place-items-center bg-surface/85 hover:bg-surface">
            <ChevronLeft className="size-4" strokeWidth={1.5} aria-hidden />
          </button>
          <button type="button" aria-label={t('product.nextPhoto')} onClick={() => go(1)} className="absolute top-1/2 right-3 grid size-9 -translate-y-1/2 place-items-center bg-surface/85 hover:bg-surface">
            <ChevronRight className="size-4" strokeWidth={1.5} aria-hidden />
          </button>
        </>
      )}
    </div>
  )
}
