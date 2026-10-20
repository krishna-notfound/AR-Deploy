import { ImagePlus, Star, Trash2 } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import type { ProductImage } from '@/domain/types'
import { cn } from '@/lib/cn'
import { IMAGE_RULES, validateImageFile } from '@/lib/files'
import { formatFileSize } from '@/lib/format'
import { newId } from '@/lib/id'
import { service } from '@/services'
import { IconButton } from './Button'
import { SmartImage } from './SmartImage'

/**
 * Multi-image picker: thumbnails, choose primary, remove, and validation messages.
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
}: {
  images: ProductImage[]
  /** Receives an updater, so uploads that finish later never overwrite changes made meanwhile. */
  onChange: (update: (images: ProductImage[]) => ProductImage[]) => void
  kind: ProductImage['kind']
  label: string
  allowPrimary?: boolean
  max?: number
  businessId?: string
}) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const own = images.filter((i) => i.kind === kind)
  /** Applies a change to this kind's images in the latest list, keeping every other kind as it is. */
  const update = (fn: (mine: ProductImage[]) => ProductImage[]) =>
    onChange((latest) => {
      const next = fn(latest.filter((i) => i.kind === kind))
      if (allowPrimary && next.length && !next.some((i) => i.isPrimary) && next[0]) next[0] = { ...next[0], isPrimary: true }
      return [...latest.filter((i) => i.kind !== kind), ...next]
    })

  const addFiles = async (files: FileList | File[]) => {
    if (busy) return
    const list = [...files]
    const errs: string[] = []
    const added: ProductImage[] = []
    setBusy(true)
    for (const file of list) {
      if (own.length + added.length >= max) {
        errs.push(`You can add up to ${max} images here.`)
        break
      }
      const check = validateImageFile(file)
      if (!check.ok) {
        errs.push(check.message)
        continue
      }
      const res = await service.uploadAsset({ kind: 'image', file, businessId })
      if (!res.ok) {
        errs.push(res.error.message)
        continue
      }
      const { url, storagePath } = res.data
      added.push({ id: newId('img'), url, ...(storagePath ? { storagePath } : {}), alt: file.name.replace(/\.[^.]+$/, ''), isPrimary: false, kind })
    }
    setBusy(false)
    setErrors(errs)
    if (added.length) update((mine) => [...mine, ...added])
  }

  const setPrimary = (id: string) => update((mine) => mine.map((i) => ({ ...i, isPrimary: i.id === id })))
  const remove = (id: string) => update((mine) => mine.filter((i) => i.id !== id))

  return (
    <div>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {own.map((img) => (
          <figure key={img.id} className="group relative">
            <SmartImage src={img.url} alt={img.alt ?? ''} className={cn('aspect-square w-full rounded-lg', img.isPrimary && allowPrimary && 'ring-2 ring-accent ring-offset-2')} />
            {img.isPrimary && allowPrimary && (
              <figcaption className="absolute bottom-1.5 left-1.5 rounded bg-ink/80 px-1.5 py-0.5 text-[11px] font-medium text-white">Primary</figcaption>
            )}
            <div className="absolute top-1.5 right-1.5 flex gap-1 rounded-md bg-surface/95 p-0.5 opacity-100 shadow-sm sm:opacity-0 sm:group-focus-within:opacity-100 sm:group-hover:opacity-100">
              {allowPrimary && !img.isPrimary && (
                <IconButton aria-label={`Make ${img.alt || 'image'} the primary image`} size="sm" className="size-7" onClick={() => setPrimary(img.id)}>
                  <Star className="size-3.5" />
                </IconButton>
              )}
              <IconButton aria-label={`Remove ${img.alt || 'image'}`} size="sm" className="size-7 hover:text-danger" onClick={() => remove(img.id)}>
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
            'flex aspect-square cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-line-strong text-center text-xs text-ink-muted transition-colors hover:border-accent hover:text-accent-ink focus-within:border-accent',
            busy && 'pointer-events-none opacity-60',
          )}
        >
          <ImagePlus className="size-5" aria-hidden />
          <span className="px-2">{busy ? 'Adding…' : 'Add images'}</span>
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
        JPG, PNG or WebP, up to {formatFileSize(IMAGE_RULES.maxBytes)} each. Large photos are resized for this demo.
        {allowPrimary && ' The primary image is used as the catalog thumbnail and 3D poster.'}
      </p>
      {errors.length > 0 && (
        <ul role="alert" className="mt-2 space-y-1 text-xs font-medium text-danger">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
