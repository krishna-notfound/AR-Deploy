import { Minus, Plus } from 'lucide-react'
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import Cropper, { type MediaSize } from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'
import { Button, IconButton } from '@/components/ui/Button'
import { Modal } from '@/components/ui/Modal'
import { useI18n } from '@/i18n/LanguageProvider'
import { ImageTooLargeError } from '@/lib/image'
import {
  type CropArea,
  type CropView,
  clampView,
  coversFrame,
  cropFromView,
  fillFrameCrop,
  fitWholeCrop,
  renderCrop,
  touchesPicture,
  viewFromCrop,
  zoomAroundCenter,
  zoomLimits,
} from '@/lib/imageCrop'

/**
 * ImageCropDialog: the one place a picture is moved and zoomed into its frame before it is uploaded (ADR-0063).
 * Used for product and option photos, and by the Website Editor, the logo and the profile photo. Mount it to open it
 * and unmount it on `onSave` / `onCancel`.
 *
 * Props
 * - `file`     a `File` or `Blob`: the picture just chosen.
 * - `src`      a URL (data:, blob: or https with CORS) to open instead of `file`: "Edit picture" on a stored original.
 *              Give one of `file` or `src`.
 * - `aspect`   the frame's width divided by its height, from `src/lib/imageFrames.ts` (`imageFrame('product').aspect`).
 * - `initialCrop`  the crop to start from (the stored `crop` of a picture being edited). Without it the dialog starts
 *              with the WHOLE picture fitted in the frame; nothing is cropped until the user chooses to.
 * - `title`    the dialog heading (already translated).
 * - `onSave({ blob, crop, whole })`  `blob` is the edited WebP (JPEG where WebP cannot be written), long side at most
 *              2000 px; `crop` is the rectangle of the ORIGINAL it was cut from, in the original's pixels (it may reach
 *              past the picture); `whole` is true when the picture does not fill the frame (margins stay transparent).
 *              May return a promise: the dialog shows "Saving…" until it settles, and stays open with an error if it throws.
 * - `onCancel` Escape, Cancel, the close button or a click outside.
 *
 * The original file is never changed. The caller uploads the original itself and keeps `crop` next to it.
 */
export interface ImageCropDialogProps {
  file?: File | Blob
  src?: string
  aspect: number
  initialCrop?: CropArea
  title: string
  /** Smaller output than the default (long side 2000, quality 0.85): the logo and the profile photo. */
  output?: { maxSide?: number; quality?: number }
  onSave: (result: { blob: Blob; crop: CropArea; whole: boolean }) => void | Promise<void>
  onCancel: () => void
}

/** Room around the frame inside the stage, so the part of the picture outside the frame can be seen (dimmed). */
const STAGE_PADDING = 16
/** Used before the stage has a size (the first paint) and where nothing is laid out. */
const FALLBACK_WIDTH = 320
/** How far past "Fill the frame" the zoom goes. */
const MAX_ZOOM_FACTOR = 4
/** The + and − buttons and keys change the zoom by this factor. */
const ZOOM_STEP = 1.25

const round2 = (n: number) => Math.round(n * 100) / 100
const roundCrop = (c: CropArea): CropArea => ({ x: round2(c.x), y: round2(c.y), width: round2(c.width), height: round2(c.height) })

/** The largest `aspect`-shaped box inside `box`. */
function frameIn(box: { width: number; height: number } | null, aspect: number) {
  const w = Math.max(1, (box?.width || FALLBACK_WIDTH) - STAGE_PADDING * 2)
  const h = Math.max(1, (box?.height || FALLBACK_WIDTH / aspect) - STAGE_PADDING * 2)
  return w / h > aspect ? { width: h * aspect, height: h } : { width: w, height: w / aspect }
}

export function ImageCropDialog({ file, src, aspect, initialCrop, title, output, onSave, onCancel }: ImageCropDialogProps) {
  const { t } = useI18n()
  const hintId = useId()
  const stageRef = useRef<HTMLDivElement>(null)

  // ---- the picture: the chosen file, or the stored original fetched into a blob ----
  const [source, setSource] = useState<{ blob: Blob; url: string } | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    let objectUrl = ''
    void (async () => {
      try {
        const blob: Blob = file ?? (await fetch(src ?? '').then((r) => (r.ok ? r.blob() : Promise.reject(new Error('fetch')))))
        objectUrl = URL.createObjectURL(blob)
        if (!cancelled) setSource({ blob, url: objectUrl })
      } catch {
        if (!cancelled) setLoadFailed(true)
      }
    })()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [file, src])

  // ---- the stage and the frame in it ----
  const [stage, setStage] = useState<{ width: number; height: number } | null>(null)
  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => {
      const r = el.getBoundingClientRect()
      setStage((prev) => (prev && Math.abs(prev.width - r.width) < 1 && Math.abs(prev.height - r.height) < 1 ? prev : { width: r.width, height: r.height }))
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  const frame = frameIn(stage, aspect)
  // A new frame size remounts the cropper; it then restores the crop the user had (areaRef) in the new size.
  const frameKey = `${Math.round(frame.width)}x${Math.round(frame.height)}`

  // ---- the crop: view = where the cropper is; areaRef = the same as a rectangle of the picture (survives a remount) ----
  const [media, setMedia] = useState<MediaSize | null>(null)
  const [readyKey, setReadyKey] = useState('')
  const [view, setView] = useState<CropView>({ crop: { x: 0, y: 0 }, zoom: 1 })
  const viewRef = useRef(view)
  const mediaRef = useRef<MediaSize | null>(null)
  const frameRef = useRef(frame)
  frameRef.current = frame
  const areaRef = useRef<CropArea | null>(null)
  const startRef = useRef<CropArea | null>(null)

  const apply = useCallback((next: CropView) => {
    const m = mediaRef.current
    if (!m) return
    const clamped = clampView(next, m, frameRef.current)
    viewRef.current = clamped
    areaRef.current = cropFromView(clamped, m, frameRef.current)
    setView(clamped)
  }, [])
  const showArea = useCallback(
    (area: CropArea) => {
      const m = mediaRef.current
      if (m) apply(viewFromCrop(area, m, frameRef.current))
    },
    [apply],
  )

  const onMediaLoaded = (m: MediaSize) => {
    mediaRef.current = m
    setMedia(m)
    startRef.current ??= initialCrop ?? fitWholeCrop(m.naturalWidth, m.naturalHeight, aspect)
    showArea(areaRef.current ?? startRef.current)
    setReadyKey(frameKey)
  }

  const natural = media ? { width: media.naturalWidth, height: media.naturalHeight } : null
  const limits = media ? zoomLimits(media, frame) : { whole: 1, fill: 1 }
  const minZoom = limits.whole
  const maxZoom = limits.fill * MAX_ZOOM_FACTOR
  const area = media ? cropFromView(view, media, frame) : null
  const covers = !!(area && natural && coversFrame(area, natural.width, natural.height))
  const ready = !!media && readyKey === frameKey

  const zoomTo = (zoom: number) => apply(zoomAroundCenter(viewRef.current, Math.min(maxZoom, Math.max(minZoom, zoom))))
  const fill = () => natural && showArea(fillFrameCrop(natural.width, natural.height, aspect))
  const whole = () => natural && showArea(fitWholeCrop(natural.width, natural.height, aspect))
  const reset = () => startRef.current && showArea(startRef.current)

  // Arrow keys move the picture once the frame has focus: focus it as soon as the picture is shown.
  useEffect(() => {
    if (ready) stageRef.current?.querySelector<HTMLElement>('[data-testid="cropper"]')?.focus({ preventScroll: true })
  }, [ready])

  // ---- saving ----
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  const save = async () => {
    if (!source || !natural || !areaRef.current || busy) return
    const crop = roundCrop(areaRef.current)
    if (!touchesPicture(crop, natural.width, natural.height)) {
      setError(t('ui.crop.empty'))
      return
    }
    setBusy(true)
    setError('')
    try {
      const blob = await (output ? renderCrop(source.blob, crop, output) : renderCrop(source.blob, crop))
      await onSave({ blob, crop, whole: !coversFrame(crop, natural.width, natural.height) })
    } catch (e) {
      if (mounted.current) setError(e instanceof ImageTooLargeError ? t('ui.crop.tooLarge') : t('ui.crop.saveFailed'))
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  const cancel = () => {
    if (!busy) onCancel()
  }

  const zoomButton = 'pointer-coarse:size-11 max-sm:size-11'
  return (
    <Modal
      open
      onClose={cancel}
      title={title}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={cancel} disabled={busy}>
            {t('ui.crop.cancel')}
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={busy} disabled={!ready}>
            {busy ? t('ui.crop.saving') : t('ui.crop.save')}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div
          ref={stageRef}
          className="relative h-[min(52vh,26rem)] overflow-hidden rounded-[var(--radius-control)] bg-subtle"
          onKeyDown={(e) => {
            if (e.key === '+' || e.key === '=') {
              e.preventDefault()
              zoomTo(viewRef.current.zoom * ZOOM_STEP)
            } else if (e.key === '-' || e.key === '_') {
              e.preventDefault()
              zoomTo(viewRef.current.zoom / ZOOM_STEP)
            }
          }}
        >
          {loadFailed ? (
            <p role="alert" className="grid h-full place-items-center px-6 text-center text-sm font-medium text-danger">
              {t('ui.crop.loadFailed')}
            </p>
          ) : !source ? (
            <p role="status" className="grid h-full place-items-center text-sm text-ink-muted">
              {t('ui.crop.loading')}
            </p>
          ) : (
            <div className={ready ? 'size-full' : 'size-full opacity-0'}>
              <Cropper
                key={frameKey}
                image={source.url}
                crop={view.crop}
                zoom={view.zoom}
                aspect={aspect}
                cropSize={frame}
                minZoom={minZoom}
                maxZoom={maxZoom}
                restrictPosition={false}
                objectFit="contain"
                showGrid={false}
                keyboardStep={10}
                zoomSpeed={0.5}
                disableAutomaticStylesInjection
                onCropChange={(crop) => apply({ crop, zoom: viewRef.current.zoom })}
                onZoomChange={(zoom) => apply({ crop: viewRef.current.crop, zoom })}
                onMediaLoaded={onMediaLoaded}
                classes={{ cropAreaClassName: 'border-chalk/70! text-obsidian/60!' }}
                cropperProps={{ 'aria-label': t('ui.crop.stage'), 'aria-describedby': hintId }}
              />
            </div>
          )}
        </div>
        <p id={hintId} className="text-xs text-ink-muted">
          {t('ui.crop.hint')}
        </p>

        <div className="flex items-center gap-2">
          <IconButton aria-label={t('ui.crop.zoomOut')} className={zoomButton} onClick={() => zoomTo(viewRef.current.zoom / ZOOM_STEP)} disabled={!ready}>
            <Minus className="size-4" />
          </IconButton>
          <input
            type="range"
            aria-label={t('ui.crop.zoom')}
            className="h-11 min-w-0 flex-1 accent-[var(--color-accent)]"
            min={minZoom}
            max={maxZoom}
            step="any"
            value={Math.min(maxZoom, Math.max(minZoom, view.zoom))}
            disabled={!ready}
            onChange={(e) => zoomTo(Number(e.target.value))}
          />
          <IconButton aria-label={t('ui.crop.zoomIn')} className={zoomButton} onClick={() => zoomTo(viewRef.current.zoom * ZOOM_STEP)} disabled={!ready}>
            <Plus className="size-4" />
          </IconButton>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" onClick={fill} disabled={!ready}>
            {t('ui.crop.fill')}
          </Button>
          <Button size="sm" variant="secondary" onClick={whole} disabled={!ready}>
            {t('ui.crop.whole')}
          </Button>
          <Button size="sm" variant="ghost" onClick={reset} disabled={!ready}>
            {t('ui.crop.reset')}
          </Button>
          {ready && !covers && (
            <p role="status" className="text-xs font-medium text-accent-ink">
              {t('ui.crop.nudge')}
            </p>
          )}
        </div>
        {error && (
          <p role="alert" className="text-xs font-medium text-danger">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}
