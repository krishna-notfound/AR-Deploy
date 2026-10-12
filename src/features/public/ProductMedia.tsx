import { AlertTriangle, Box, ChevronLeft, ChevronRight, Images, RotateCw } from 'lucide-react'
import { type Ref, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { SegmentedControl } from '@/components/ui/Form'
import { SmartImage } from '@/components/ui/SmartImage'
import { type ArStatus, ModelViewer, type ModelViewerHandle } from '@/components/three/ModelViewer'
import type { Product, ProductImage } from '@/domain/types'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { isStaleSessionAsset } from '@/lib/files'
import type { MeasuredSize } from '@/lib/scale'

export type ModelState = 'none' | 'loading' | 'loaded' | 'error'

export function ProductMedia({
  product,
  viewerRef,
  onModelState,
  onArStatus,
}: {
  product: Product
  viewerRef: Ref<ModelViewerHandle>
  onModelState: (s: ModelState, info?: { canActivateAR: boolean; dimensions: MeasuredSize | null }) => void
  onArStatus: (s: ArStatus) => void
}) {
  const { t, localized } = useI18n()
  const glb = product.models.glb && !isStaleSessionAsset(product.models.glb) ? product.models.glb : undefined
  const usdz = product.models.usdz && !isStaleSessionAsset(product.models.usdz) ? product.models.usdz : undefined
  const gallery = product.images.filter((i) => i.kind === 'gallery')
  const [mode, setMode] = useState<'3d' | 'photos'>(glb ? '3d' : 'photos')
  const [state, setState] = useState<ModelState>(glb ? 'loading' : 'none')
  const [progress, setProgress] = useState(0)
  const [attempt, setAttempt] = useState(0)
  const name = localized(product.name)
  const poster = gallery.find((i) => i.isPrimary)?.url ?? gallery[0]?.url

  const update = (s: ModelState, info?: { canActivateAR: boolean; dimensions: MeasuredSize | null }) => {
    setState(s)
    onModelState(s, info)
  }

  return (
    <div>
      <div className="relative aspect-square overflow-hidden rounded-[var(--radius-stage)] bg-[radial-gradient(120%_90%_at_50%_35%,#ffffff_0%,#f1efea_62%,#e7e4dd_100%)] sm:aspect-[5/4] lg:aspect-square">
        {glb && (
          <div className={cn('absolute inset-0', mode !== '3d' && 'invisible')} aria-hidden={mode !== '3d'}>
            <ModelViewer
              key={attempt}
              ref={viewerRef}
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
            />
            {state === 'loading' && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 pb-5" role="status">
                <span className="rounded-full bg-surface/90 px-3 py-1 text-xs text-ink-muted shadow-sm">{t('viewer.loading')}</span>
                <div className="h-1 w-40 overflow-hidden rounded-full bg-line">
                  <div className="h-full bg-[var(--brand-accent)] transition-[width]" style={{ width: `${Math.max(6, Math.round(progress * 100))}%` }} />
                </div>
              </div>
            )}
            {state === 'loaded' && (
              <p className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-xs text-ink-muted">
                <RotateCw className="mr-1 inline size-3 align-[-1px]" aria-hidden />
                {t('viewer.hint')}
              </p>
            )}
            {state === 'error' && (
              <div className="absolute inset-0 grid place-items-center bg-canvas/85 p-6 text-center" role="alert">
                <div className="max-w-xs">
                  <AlertTriangle className="mx-auto size-6 text-warning" aria-hidden />
                  <p className="mt-2 text-sm font-medium">{t('viewer.errorTitle')}</p>
                  <p className="mt-1 text-[13px] text-ink-muted">{t('viewer.errorBody')}</p>
                  <div className="mt-4 flex justify-center gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        setAttempt((a) => a + 1)
                        update('loading')
                      }}
                    >
                      {t('viewer.retry')}
                    </Button>
                    {gallery.length > 0 && (
                      <Button size="sm" variant="ghost" onClick={() => setMode('photos')}>
                        {t('product.viewPhotos')}
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {mode === 'photos' && <Gallery images={gallery} name={name} />}
      </div>

      {glb ? (
        <div className="mt-3 flex justify-center">
          <SegmentedControl
            label={t('product.mediaLabel')}
            value={mode}
            onChange={setMode}
            options={[
              {
                value: '3d',
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <Box className="size-3.5" aria-hidden />
                    {t('product.view3d')}
                  </span>
                ),
              },
              {
                value: 'photos',
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <Images className="size-3.5" aria-hidden />
                    {t('product.viewPhotos')}
                  </span>
                ),
              },
            ]}
          />
        </div>
      ) : (
        <p className="mt-3 text-center text-xs text-ink-muted">{t('viewer.unavailable')}</p>
      )}
    </div>
  )
}

function Gallery({ images, name }: { images: ProductImage[]; name: string }) {
  const { t } = useI18n()
  const startIdx = Math.max(0, images.findIndex((i) => i.isPrimary))
  const [idx, setIdx] = useState(startIdx)
  const current = images[idx]
  const go = (d: number) => setIdx((i) => (i + d + images.length) % images.length)
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
      <SmartImage src={current?.url} alt={`${name}. ${t('product.photo', { n: idx + 1, total: images.length })}`} className="size-full object-cover" />
      {images.length > 1 && (
        <>
          <button type="button" aria-label="Previous photo" onClick={() => go(-1)} className="absolute top-1/2 left-3 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-surface/90 shadow-sm hover:bg-surface">
            <ChevronLeft className="size-4" aria-hidden />
          </button>
          <button type="button" aria-label="Next photo" onClick={() => go(1)} className="absolute top-1/2 right-3 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-surface/90 shadow-sm hover:bg-surface">
            <ChevronRight className="size-4" aria-hidden />
          </button>
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {images.map((img, i) => (
              <button
                key={img.id}
                type="button"
                aria-label={t('product.photo', { n: i + 1, total: images.length })}
                aria-current={i === idx}
                onClick={() => setIdx(i)}
                className={cn('h-1.5 rounded-full transition-all', i === idx ? 'w-5 bg-ink' : 'w-1.5 bg-ink/30')}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
