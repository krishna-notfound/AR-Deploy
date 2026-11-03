// The live 3D model shown in place of a picture, filling its positioned parent: the ModelViewer, the loading text, the
// "Drag to rotate" hint, the stall timeout, and the error with Retry and (when there is a picture) back to the picture.
// Shared by the landing 3D card (ShowcaseCard) and the landing hero (ADR-0049); the caller decides when to mount it, so
// nothing downloads before the person asks for 3D.
import { AlertTriangle } from 'lucide-react'
import { type Ref, useEffect, useState } from 'react'
import { type ModelLoadInfo, ModelViewer, type ModelViewerHandle } from '@/components/three/ModelViewer'
import { useI18n } from '@/i18n/LanguageProvider'

const STALL_MS = 45_000

interface Props {
  src: string
  /** The iPhone file for AR (only used when `ar`). */
  iosSrc?: string
  poster?: string
  /** The viewer's accessible name. */
  alt: string
  /** Offer AR from the viewer (false: 3D only). */
  ar?: boolean
  viewerRef?: Ref<ModelViewerHandle>
  onLoaded?: (info: ModelLoadInfo) => void
  /** The "back to the picture" action of the error state; absent: Retry only. */
  onShowImage?: () => void
  /** Label of that action (default: "Image"). */
  showImageLabel?: string
}

type Load = { state: 'loading' | 'loaded' | 'error'; attempt: number; progress: number; timedOut: boolean }

export function InPlaceModel({ src, iosSrc, poster, alt, ar = false, viewerRef, onLoaded, onShowImage, showImageLabel }: Props) {
  const { t } = useI18n()
  const [load, setLoad] = useState<Load>({ state: 'loading', attempt: 0, progress: 0, timedOut: false })
  const retry = () => setLoad((l) => ({ state: 'loading', attempt: l.attempt + 1, progress: 0, timedOut: false }))

  // No endless spinner: a model that makes no progress for the whole window is treated as failed.
  useEffect(() => {
    if (load.state !== 'loading') return
    const timer = setTimeout(() => setLoad((l) => ({ ...l, state: 'error', timedOut: true })), STALL_MS)
    return () => clearTimeout(timer)
  }, [load.state, load.attempt, load.progress])

  return (
    <div className="absolute inset-0 bg-subtle text-ink">
      <ModelViewer
        key={`${src}#${load.attempt}`}
        ref={viewerRef}
        src={src}
        iosSrc={ar ? iosSrc : undefined}
        poster={poster}
        alt={alt}
        ar={ar}
        className="absolute inset-0"
        onLoad={(info) => {
          setLoad((l) => ({ ...l, state: 'loaded' }))
          onLoaded?.(info)
        }}
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
              {onShowImage && (
                <button type="button" onClick={onShowImage} className="text-label underline underline-offset-4">
                  {showImageLabel ?? t('landing.show.image')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
