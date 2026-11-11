import { ImagePlus, Pencil, Star, Trash2 } from 'lucide-react'
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

/** A photo being edited: where its original opens from, and the crop it started with. */
interface Editing {
  image: ProductImage
  src: string
}

/**
 * Multi-image picker: thumbnails, choose primary, edit picture, remove, and validation messages.
 * Every chosen photo opens the crop dialog first (ADR-0063): the untouched original and the edited copy are both uploaded,
 * the pages show the copy, and "Edit picture" reopens the original with the crop it had.
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
}) {
  const { t } = useI18n()
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  /** Chosen files waiting for the crop dialog: the first one is open. */
  const [queue, setQueue] = useState<File[]>([])
  const [editing, setEditing] = useState<Editing | null>(null)
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

  const next = () => setQueue((q) => q.slice(1))

  /** Uploads the original and the edited copy of a newly chosen photo, then adds it. */
  const saveNew = async (file: File, result: { blob: Blob; crop: ImageCrop }) => {
    setBusy(true)
    try {
      const original = await service.uploadAsset({ kind: 'image', file, businessId })
      if (!original.ok) return addError(errorText(original.error, t))
      const copy = await service.uploadAsset({ kind: 'image', file: editedFile(result.blob, file.name), businessId })
      if (!copy.ok) return addError(errorText(copy.error, t))
      const added: ProductImage = {
        id: newId('img'),
        url: copy.data.url,
        ...(copy.data.storagePath ? { storagePath: copy.data.storagePath } : {}),
        ...(original.data.storagePath ? { originalPath: original.data.storagePath } : {}),
        originalUrl: original.data.url,
        crop: result.crop,
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

  /** Uploads a new edited copy of a photo and points the photo at it; the original and the old copy are left in storage. */
  const saveEdit = async (target: ProductImage, result: { blob: Blob; crop: ImageCrop }) => {
    setBusy(true)
    try {
      const copy = await service.uploadAsset({ kind: 'image', file: editedFile(result.blob, target.alt || 'photo'), businessId })
      if (!copy.ok) return addError(errorText(copy.error, t))
      update((mine) =>
        mine.map((i) =>
          i.id !== target.id
            ? i
            : {
                ...i,
                url: copy.data.url,
                ...(copy.data.storagePath ? { storagePath: copy.data.storagePath } : {}),
                // A photo from before the crop dialog is its own original: from now on it is the original of the new copy.
                originalPath: i.originalPath ?? i.storagePath,
                originalUrl: i.originalUrl ?? i.url,
                crop: result.crop,
              },
        ),
      )
    } finally {
      setBusy(false)
      setEditing(null)
    }
  }

  /** Finds where the photo's original opens from (a fresh link in Supabase mode), then opens the dialog. */
  const startEdit = async (image: ProductImage) => {
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
      setEditing({ image, src: src || image.url })
    } finally {
      setBusy(false)
    }
  }

  const setPrimary = (id: string) => update((mine) => mine.map((i) => ({ ...i, isPrimary: i.id === id })))
  const remove = (id: string) => update((mine) => mine.filter((i) => i.id !== id))

  const queued = queue[0]
  return (
    <div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {own.map((img) => (
          <figure key={img.id} className="group relative">
            <SmartImage
              src={img.url}
              alt={img.alt ?? ''}
              className={cn('w-full rounded-lg object-contain', shape.aspectClass, img.isPrimary && allowPrimary && 'ring-2 ring-accent ring-offset-2 ring-offset-canvas')}
            />
            {img.isPrimary && allowPrimary && (
              <figcaption className="absolute bottom-1.5 left-1.5 rounded bg-obsidian/80 px-1.5 py-0.5 text-[12px] font-medium text-chalk">{t('ui.images.primary')}</figcaption>
            )}
            <div className="absolute top-1.5 right-1.5 flex gap-1 rounded-md bg-surface/95 p-0.5 opacity-100 shadow-sm sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
              <IconButton aria-label={t('ui.images.edit', { name: img.alt || t('ui.images.image') })} title={t('ui.images.editLabel')} size="sm" className="size-7" disabled={busy} onClick={() => void startEdit(img)}>
                <Pencil className="size-3.5" />
              </IconButton>
              {allowPrimary && !img.isPrimary && (
                <IconButton aria-label={t('ui.images.makePrimary', { name: img.alt || t('ui.images.image') })} size="sm" className="size-7" onClick={() => setPrimary(img.id)}>
                  <Star className="size-3.5" />
                </IconButton>
              )}
              <IconButton aria-label={t('ui.images.remove', { name: img.alt || t('ui.images.image') })} size="sm" className="size-7 hover:text-danger" onClick={() => remove(img.id)}>
                <Trash2 className="size-3.5" />
              </IconButton>
            </div>
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
        {` ${t('ui.images.cropHelp')}`}
        {allowPrimary && ` ${t('ui.images.primaryHelp')}`}
      </p>
      {errors.length > 0 && (
        <ul role="alert" className="mt-2 space-y-1 text-xs font-medium text-danger">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
      {queued && (
        <ImageCropDialog
          key={`${queued.name}-${queued.size}-${queued.lastModified}-${own.length}`}
          file={queued}
          aspect={shape.aspect}
          title={t('ui.images.cropTitle')}
          onCancel={next}
          onSave={(result) => saveNew(queued, result)}
        />
      )}
      {editing && (
        <ImageCropDialog
          key={editing.image.id}
          src={editing.src}
          aspect={shape.aspect}
          {...(editing.image.crop ? { initialCrop: editing.image.crop } : {})}
          title={t('ui.images.cropTitle')}
          onCancel={() => setEditing(null)}
          onSave={(result) => saveEdit(editing.image, result)}
        />
      )}
    </div>
  )
}
