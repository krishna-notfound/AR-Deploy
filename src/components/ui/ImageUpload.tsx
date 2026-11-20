import { ChevronLeft, ChevronRight, Crop, ImagePlus, Pencil, Star, Trash2 } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { ImageCropDialog } from '@/components/image/ImageCropDialog'
import type { ImageCrop, ProductImage } from '@/domain/types'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { IMAGE_RULES, demoSized, validateImageFile } from '@/lib/files'
import { formatFileSize } from '@/lib/format'
import { newId } from '@/lib/id'
import { editedFile } from '@/lib/imageCrop'
import { type ImageFrameKey, imageFrame } from '@/lib/imageFrames'
import { isDemoMode, service } from '@/services'
import { IconButton } from './Button'
import { SmartImage } from './SmartImage'

/** Which copy of a photo a crop is for: the catalogue card copy (`url`/`crop`) or the product page copy (`pageUrl`/`pageCrop`, ADR-0081). */
type CropTarget = 'card' | 'page'

/** A photo being edited: where its original opens from, and which of its crops is being changed. */
interface Editing {
  image: ProductImage
  src: string
  target: CropTarget
}

type CropResult = { blob: Blob; crop: ImageCrop }

/**
 * Multi-image picker: thumbnails, choose primary, edit picture, remove, and validation messages.
 * Every chosen photo opens the crop dialog first (ADR-0063): the untouched original and the edited copy are both uploaded,
 * the pages show the copy, and "Edit picture" reopens the original with the crop it had.
 * With `pageCrop` (main photos, ADR-0081) a chosen photo gets two crops from the same original: first the catalogue card
 * crop (the frame's shape), then the product page crop (any shape, Original by default). Cancelling the second keeps the
 * photo with the card copy only. Each crop has its own edit button.
 * Storage is up to the active service: data URLs in demo mode (ADR-0007), Supabase Storage otherwise.
 */
export function ImageUpload({
  images,
  onChange,
  kind,
  label,
  allowPrimary = true,
  max = 12,
  businessId,
  frame = 'product',
  shapes = false,
  pageCrop = false,
}: {
  images: ProductImage[]
  /** Receives an updater, so uploads that finish later never overwrite changes made meanwhile. */
  onChange: (update: (images: ProductImage[]) => ProductImage[]) => void
  kind: ProductImage['kind']
  label: string
  allowPrimary?: boolean
  max?: number
  businessId?: string
  /** The picture frame the photos are cropped to and shown in (src/lib/imageFrames.ts). */
  frame?: ImageFrameKey
  /** Lets the crop dialog offer frame shapes (the "more photos"); without it every photo is cropped to the frame's own shape. */
  shapes?: boolean
  /** Main photos (ADR-0081): each photo also gets a product page crop, chosen after the card crop and edited on its own. */
  pageCrop?: boolean
}) {
  const { t } = useI18n()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  /** Read out after a photo moves, so a screen-reader user hears where it landed. */
  const [moved, setMoved] = useState('')
  /** Chosen files waiting for the crop dialog: the first one is open. */
  const [queue, setQueue] = useState<File[]>([])
  const [editing, setEditing] = useState<Editing | null>(null)
  /** With `pageCrop`: the card crop of the first queued file, kept while the product page crop dialog is open. */
  const [cardCrop, setCardCrop] = useState<CropResult | null>(null)
  const shape = imageFrame(frame)
  const own = images.filter((i) => i.kind === kind)
  /** Applies a change to this kind's images in the latest list, keeping every other kind as it is. */
  const update = (fn: (mine: ProductImage[]) => ProductImage[]) =>
    onChange((latest) => {
      const next = fn(latest.filter((i) => i.kind === kind))
      if (allowPrimary && next.length && !next.some((i) => i.isPrimary) && next[0]) next[0] = { ...next[0], isPrimary: true }
      return [...latest.filter((i) => i.kind !== kind), ...next]
    })

  const addError = (message: string) => setErrors((prev) => (prev.includes(message) ? prev : [...prev, message]))

  /** Checks the chosen files and opens the crop dialog for each valid one, one after the other. */
  const addFiles = async (files: FileList | File[]) => {
    if (busy || queue.length || editing) return
    const errs: string[] = []
    const valid: File[] = []
    for (const file of files) {
      if (own.length + valid.length >= max) {
        errs.push(t('ui.images.maxCount', { max }))
        break
      }
      const check = validateImageFile(file, undefined, t)
      if (!check.ok) errs.push(check.message)
      else valid.push(file)
    }
    setErrors(errs)
    if (isDemoMode && valid.length) {
      // Demo pictures are kept as small data URLs. Resize first, so the crop is measured on the very file that is kept.
      setBusy(true)
      const ready: File[] = []
      for (const file of valid) {
        const small = await demoSized(file, t)
        if (small.ok) ready.push(small.file)
        else errs.push(small.message)
      }
      setErrors([...errs])
      setBusy(false)
      setQueue(ready)
      return
    }
    setQueue(valid)
  }

  const next = () => {
    setCardCrop(null)
    setQueue((q) => q.slice(1))
  }

  /**
   * Uploads the original and the edited copy (copies) of a newly chosen photo, then adds it.
   * `page` is the product page crop (ADR-0081); without it the product page shows the card copy.
   */
  const saveNew = async (file: File, card: CropResult, page?: CropResult) => {
    setBusy(true)
    try {
      const original = await service.uploadAsset({ kind: 'image', file, businessId })
      if (!original.ok) return addError(errorText(original.error, t))
      const copy = await service.uploadAsset({ kind: 'image', file: editedFile(card.blob, file.name), businessId })
      if (!copy.ok) return addError(errorText(copy.error, t))
      const pageCopy = page ? await service.uploadAsset({ kind: 'image', file: editedFile(page.blob, file.name), businessId }) : null
      if (pageCopy && !pageCopy.ok) return addError(errorText(pageCopy.error, t))
      const added: ProductImage = {
        id: newId('img'),
        url: copy.data.url,
        ...(copy.data.storagePath ? { storagePath: copy.data.storagePath } : {}),
        ...(original.data.storagePath ? { originalPath: original.data.storagePath } : {}),
        originalUrl: original.data.url,
        crop: card.crop,
        ...(page && pageCopy?.ok
          ? { pageUrl: pageCopy.data.url, ...(pageCopy.data.storagePath ? { pagePath: pageCopy.data.storagePath } : {}), pageCrop: page.crop }
          : {}),
        alt: file.name.replace(/\.[^.]+$/, ''),
        isPrimary: false,
        kind,
      }
      update((mine) => [...mine, added])
    } finally {
      setBusy(false)
      next()
    }
  }

  /**
   * Uploads a new edited copy of a photo and points the photo at it; the original and the old copy are left in storage.
   * A card edit changes `url`/`storagePath`/`crop`; a page edit changes only `pageUrl`/`pagePath`/`pageCrop` (ADR-0081).
   */
  const saveEdit = async (target: ProductImage, to: CropTarget, result: CropResult) => {
    setBusy(true)
    try {
      const copy = await service.uploadAsset({ kind: 'image', file: editedFile(result.blob, target.alt || 'photo'), businessId })
      if (!copy.ok) return addError(errorText(copy.error, t))
      update((mine) =>
        mine.map((i) => {
          if (i.id !== target.id) return i
          // A photo from before the crop dialog is its own original: from now on it is the original of the new copy.
          const originals = { originalPath: i.originalPath ?? i.storagePath, originalUrl: i.originalUrl ?? i.url }
          if (to === 'card') return { ...i, url: copy.data.url, ...(copy.data.storagePath ? { storagePath: copy.data.storagePath } : {}), ...originals, crop: result.crop }
          // The page copy's path always belongs to the new copy: a stale one would point at the old picture.
          const { pagePath: _stale, ...rest } = i
          return { ...rest, ...originals, pageUrl: copy.data.url, ...(copy.data.storagePath ? { pagePath: copy.data.storagePath } : {}), pageCrop: result.crop }
        }),
      )
    } finally {
      setBusy(false)
      setEditing(null)
    }
  }

  /** Finds where the photo's original opens from (a fresh link in Supabase mode), then opens the dialog for one of its crops. */
  const startEdit = async (image: ProductImage, target: CropTarget = 'card') => {
    if (busy || queue.length || editing) return
    setErrors([])
    setBusy(true)
    try {
      let src = image.originalUrl
      if (!src && image.originalPath) {
        const res = await service.getMediaUrl(image.originalPath)
        if (!res.ok) return addError(t('ui.images.openFailed', { name: image.alt || t('ui.images.image') }))
        src = res.data
      }
      setEditing({ image, src: src || image.url, target })
    } finally {
      setBusy(false)
    }
  }

  const setPrimary = (id: string) => update((mine) => mine.map((i) => ({ ...i, isPrimary: i.id === id })))
  const remove = (id: string) => update((mine) => mine.filter((i) => i.id !== id))
  /** Swaps a photo with its neighbour. The order is saved as it is (sort_order), and the primary photo stays the primary. */
  const move = (id: string, by: -1 | 1) => {
    const from = own.findIndex((i) => i.id === id)
    const to = from + by
    if (from < 0 || to < 0 || to >= own.length) return
    setMoved(t('ui.images.moved', { name: own[from]?.alt || t('ui.images.image'), n: to + 1, total: own.length }))
    update((mine) => {
      const a = mine.findIndex((i) => i.id === id)
      const b = a + by
      if (a < 0 || b < 0 || b >= mine.length) return mine
      const next = [...mine]
      ;[next[a], next[b]] = [next[b]!, next[a]!]
      return next
    })
  }

  const queued = queue[0]
  return (
    <div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {own.map((img, idx) => (
          <figure key={img.id} className="group relative">
            <SmartImage
              src={img.url}
              alt={img.alt ?? ''}
              className={cn('w-full rounded-lg object-contain', shape.aspectClass, img.isPrimary && allowPrimary && 'ring-2 ring-accent ring-offset-2 ring-offset-canvas')}
            />
            {img.isPrimary && allowPrimary && (
              <figcaption className="absolute bottom-1.5 left-1.5 rounded bg-obsidian/80 px-1.5 py-0.5 text-[12px] font-medium text-chalk">{t('ui.images.primary')}</figcaption>
            )}
            <div className="absolute top-1.5 right-1.5 flex max-w-[calc(100%-0.75rem)] flex-wrap justify-end gap-1 rounded-md bg-surface/95 p-0.5 opacity-100 shadow-sm sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
              <IconButton
                aria-label={t(pageCrop ? 'ui.images.editCard' : 'ui.images.edit', { name: img.alt || t('ui.images.image') })}
                title={t(pageCrop ? 'ui.images.editCardLabel' : 'ui.images.editLabel')}
                size="sm"
                className="size-7"
                disabled={busy}
                onClick={() => void startEdit(img, 'card')}
              >
                <Pencil className="size-3.5" />
              </IconButton>
              {pageCrop && (
                <IconButton aria-label={t('ui.images.editPage', { name: img.alt || t('ui.images.image') })} title={t('ui.images.editPageLabel')} size="sm" className="size-7" disabled={busy} onClick={() => void startEdit(img, 'page')}>
                  <Crop className="size-3.5" />
                </IconButton>
              )}
              {allowPrimary && !img.isPrimary && (
                <IconButton aria-label={t('ui.images.makePrimary', { name: img.alt || t('ui.images.image') })} size="sm" className="size-7" onClick={() => setPrimary(img.id)}>
                  <Star className="size-3.5" />
                </IconButton>
              )}
              <IconButton aria-label={t('ui.images.remove', { name: img.alt || t('ui.images.image') })} size="sm" className="size-7 hover:text-danger" onClick={() => remove(img.id)}>
                <Trash2 className="size-3.5" />
              </IconButton>
            </div>
            {own.length > 1 && (
              <div className="mt-1.5 flex justify-center gap-1">
                <IconButton aria-label={t('ui.images.moveEarlier', { name: img.alt || t('ui.images.image') })} title={t('ui.images.moveEarlier', { name: img.alt || t('ui.images.image') })} size="sm" className="size-7" disabled={idx === 0} onClick={() => move(img.id, -1)}>
                  <ChevronLeft className="size-3.5" />
                </IconButton>
                <IconButton aria-label={t('ui.images.moveLater', { name: img.alt || t('ui.images.image') })} title={t('ui.images.moveLater', { name: img.alt || t('ui.images.image') })} size="sm" className="size-7" disabled={idx === own.length - 1} onClick={() => move(img.id, 1)}>
                  <ChevronRight className="size-3.5" />
                </IconButton>
              </div>
            )}
          </figure>
        ))}
        <label
          htmlFor={inputId}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            if (!busy && e.dataTransfer.files.length) void addFiles(e.dataTransfer.files)
          }}
          className={cn(
            'flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong text-center text-xs text-ink-muted transition-colors hover:border-accent hover:text-accent-ink focus-within:border-accent',
            shape.aspectClass,
            busy && 'pointer-events-none opacity-60',
          )}
        >
          <ImagePlus className="size-5" aria-hidden />
          <span className="px-2">{busy ? t('ui.images.adding') : t('ui.images.add')}</span>
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            multiple
            disabled={busy}
            accept={IMAGE_RULES.accept.join(',')}
            aria-label={label}
            className="sr-only"
            onChange={(e) => {
              if (e.target.files?.length) void addFiles(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        {t('ui.images.rules', { size: formatFileSize(IMAGE_RULES.maxBytes) })}
        {isDemoMode && ` ${t('ui.images.demoResize')}`}
        {` ${t(pageCrop ? 'ui.images.cropHelpTwo' : 'ui.images.cropHelp')}`}
        {allowPrimary && ` ${t('ui.images.primaryHelp')}`}
        {own.length > 1 && ` ${t('ui.images.orderHelp')}`}
      </p>
      <p role="status" className="sr-only">
        {moved}
      </p>
      {errors.length > 0 && (
        <ul role="alert" className="mt-2 space-y-1 text-xs font-medium text-danger">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {queued && !cardCrop && (
        <ImageCropDialog
          key={`${queued.name}-${queued.size}-${queued.lastModified}-${own.length}`}
          file={queued}
          aspect={shape.aspect}
          {...(shapes ? { shapes } : {})}
          {...(pageCrop ? { title: t('ui.crop.cardTitle'), note: t('ui.crop.cardStep') } : { title: t('ui.images.cropTitle') })}
          onCancel={next}
          // With a page crop to come, the card crop waits for it; the uploads start after the second dialog.
          onSave={(result) => (pageCrop ? setCardCrop(result) : saveNew(queued, result))}
        />
      )}
      {queued && cardCrop && (
        <ImageCropDialog
          key={`${queued.name}-${queued.size}-${queued.lastModified}-${own.length}-page`}
          file={queued}
          aspect={shape.aspect}
          shapes
          title={t('ui.crop.pageTitle')}
          note={t('ui.crop.pageStep')}
          // Cancel keeps the photo with its card copy: the product page then shows that copy. The dialog stays up while
          // that upload runs, so `busy` stops a second Cancel or a Save from adding the photo twice.
          onCancel={() => {
            if (!busy) void saveNew(queued, cardCrop)
          }}
          onSave={(result) => (busy ? undefined : saveNew(queued, cardCrop, result))}
        />
      )}
      {editing && (
        <ImageCropDialog
          key={`${editing.image.id}-${editing.target}`}
          src={editing.src}
          aspect={shape.aspect}
          {...(shapes || editing.target === 'page' ? { shapes: true } : {})}
          {...(editing.target === 'page'
            ? { ...(editing.image.pageCrop ? { initialCrop: editing.image.pageCrop } : {}), title: t('ui.crop.pageTitle'), note: t('ui.crop.pageHint') }
            : { ...(editing.image.crop ? { initialCrop: editing.image.crop } : {}), title: t(pageCrop ? 'ui.crop.cardTitle' : 'ui.images.cropTitle'), ...(pageCrop ? { note: t('ui.crop.cardHint') } : {}) })}
          onCancel={() => setEditing(null)}
          onSave={(result) => saveEdit(editing.image, editing.target, result)}
        />
      )}
    </div>
  )
}
