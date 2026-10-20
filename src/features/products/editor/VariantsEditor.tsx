import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, ChevronDown, CircleSlash, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { Button, IconButton } from '@/components/ui/Button'
import { Input } from '@/components/ui/Form'
import { ImageUpload } from '@/components/ui/ImageUpload'
import { variantMediaSummary } from '@/features/ar/readiness'
import type { Currency, Dimensions, ModelAsset, ModelFormat, ProductImage, ProductVariant } from '@/domain/types'
import { cn } from '@/lib/cn'
import { minorToInput, parseMoneyInput } from '@/lib/format'
import { newId } from '@/lib/id'
import { MAX_VARIANT_IMAGES } from '@/services/validation'
import { ModelSection } from './ModelSection'

type Update = (variants: ProductVariant[]) => ProductVariant[]

/** Drops empty media so an option without its own files saves (and compares) exactly like before. */
function withMedia(v: ProductVariant, images: ProductImage[] | undefined, models: ProductVariant['models']): ProductVariant {
  const { images: _i, models: _m, ...rest } = v
  void [_i, _m]
  return { ...rest, ...(images?.length ? { images } : {}), ...(models?.glb || models?.usdz ? { models } : {}) }
}

/**
 * Colours/options list: name (EN + optional PT), swatch, SKU, price difference, and each option's own photos and
 * 3D files (shared ImageUpload and ModelSection). An option without its own files uses the product's.
 */
export function VariantsEditor({
  variants,
  onChange,
  currency,
  businessId,
  dimensions,
  poster,
}: {
  variants: ProductVariant[]
  /** Receives an updater, so uploads that finish later never overwrite changes made meanwhile. */
  onChange: (update: Update) => void
  currency: Currency
  businessId?: string
  dimensions: Dimensions
  poster?: string
}) {
  const [open, setOpen] = useState<string | null>(null)
  const set = (id: string, fn: (v: ProductVariant) => ProductVariant) => onChange((list) => list.map((v) => (v.id === id ? fn(v) : v)))
  const update = (id: string, patch: Partial<ProductVariant>) => set(id, (v) => ({ ...v, ...patch }))
  const move = (i: number, d: -1 | 1) =>
    onChange((list) => {
      const next = [...list]
      const [item] = next.splice(i, 1)
      if (item) next.splice(i + d, 0, item)
      return next
    })
  const summary = variantMediaSummary(variants)

  return (
    <div>
      {variants.length > 0 && (
        <ul className="space-y-2">
          {variants.map((v, i) => {
            const label = v.name.en || 'option'
            const photos = v.images?.length ?? 0
            const files = [photos ? `${photos} photo${photos === 1 ? '' : 's'}` : null, v.models?.glb ? 'GLB' : null, v.models?.usdz ? 'USDZ' : null].filter(Boolean)
            const expanded = open === v.id
            const panelId = `${v.id}-media`
            return (
              <li key={v.id} className="rounded-lg border border-line">
                <div className="grid grid-cols-[auto_1fr_auto] items-start gap-2 p-2.5 sm:grid-cols-[auto_1fr_1fr_8rem_7rem_auto]">
                  <input
                    type="color"
                    aria-label={`Colour swatch for ${label}`}
                    value={v.colorHex ?? '#cccccc'}
                    onChange={(e) => update(v.id, { colorHex: e.target.value })}
                    className="size-10 cursor-pointer rounded-md border border-line-strong bg-surface p-1"
                  />
                  <Input aria-label="Option name (English)" placeholder="Name (English)" value={v.name.en} onChange={(e) => update(v.id, { name: { ...v.name, en: e.target.value } })} />
                  <Input
                    aria-label="Option name (Portuguese)"
                    placeholder="Nome (Português)"
                    lang="pt-PT"
                    className="col-span-3 sm:col-span-1"
                    value={v.name.pt ?? ''}
                    onChange={(e) => update(v.id, { name: { ...v.name, pt: e.target.value || undefined } })}
                  />
                  <Input aria-label="SKU" placeholder="SKU (optional)" className="col-span-2 sm:col-span-1" value={v.sku ?? ''} onChange={(e) => update(v.id, { sku: e.target.value || undefined })} />
                  <Input
                    aria-label={`Price difference in ${currency}`}
                    placeholder={`+ ${currency}`}
                    inputMode="decimal"
                    defaultValue={v.priceDelta ? minorToInput(v.priceDelta) : ''}
                    aria-invalid={Number.isNaN(v.priceDelta) || undefined}
                    aria-describedby={Number.isNaN(v.priceDelta) ? `${v.id}-delta-error` : undefined}
                    onBlur={(e) => {
                      // Unparseable or negative text becomes NaN so save validation blocks it instead of silently dropping it.
                      const delta = e.target.value.trim() ? (parseMoneyInput(e.target.value) ?? NaN) : 0
                      update(v.id, { priceDelta: delta === 0 ? undefined : delta })
                    }}
                  />
                  <div className="col-start-3 row-start-1 flex sm:col-start-auto sm:row-start-auto">
                    <IconButton aria-label="Move option up" size="sm" disabled={i === 0} onClick={() => move(i, -1)}>
                      <ArrowUp className="size-4" />
                    </IconButton>
                    <IconButton aria-label="Move option down" size="sm" disabled={i === variants.length - 1} onClick={() => move(i, 1)}>
                      <ArrowDown className="size-4" />
                    </IconButton>
                    <IconButton aria-label={`Remove ${label}`} size="sm" className="hover:text-danger" onClick={() => onChange((list) => list.filter((x) => x.id !== v.id))}>
                      <Trash2 className="size-4" />
                    </IconButton>
                  </div>
                  {Number.isNaN(v.priceDelta) && (
                    <p id={`${v.id}-delta-error`} className="col-span-full text-xs font-medium text-danger">
                      Enter the price difference as an amount such as 25.00. Negative amounts are not supported.
                    </p>
                  )}
                  <button
                    type="button"
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => setOpen(expanded ? null : v.id)}
                    className="col-span-full inline-flex w-fit items-center gap-1.5 py-1 text-[13px] font-medium text-ink hover:text-accent-ink"
                  >
                    <ChevronDown className={cn('size-4 transition-transform', expanded && 'rotate-180')} aria-hidden />
                    Photos and 3D for {label}
                    <span className="font-normal text-ink-muted">· {files.length ? `own ${files.join(', ')}` : 'uses the product’s photos and model'}</span>
                  </button>
                </div>
                {expanded && (
                  <div id={panelId} className="min-w-0 space-y-5 border-t border-line p-3 sm:p-4">
                    <div>
                      <h4 className="text-sm font-semibold">Photos for {label}</h4>
                      <p className="mb-3 text-xs text-ink-muted">
                        {photos ? 'Shown in the gallery when a customer picks this option.' : 'No photos yet: customers who pick this option see the product’s photos.'}
                      </p>
                      <ImageUpload
                        label={`Upload photos for ${label}`}
                        kind="gallery"
                        allowPrimary={false}
                        max={MAX_VARIANT_IMAGES}
                        businessId={businessId}
                        images={v.images ?? []}
                        onChange={(fn) => set(v.id, (cur) => withMedia(cur, fn(cur.images ?? []), cur.models))}
                      />
                    </div>
                    <div className="border-t border-line pt-4">
                      <h4 className="mb-3 text-sm font-semibold">3D models for {label}</h4>
                      <ModelSection
                        context="variant"
                        businessId={businessId}
                        models={v.models ?? {}}
                        onChange={(format: ModelFormat, asset: ModelAsset | undefined) => set(v.id, (cur) => withMedia(cur, cur.images, { ...cur.models, [format]: asset }))}
                        dimensions={dimensions}
                        poster={v.images?.find((x) => x.isPrimary)?.url ?? v.images?.[0]?.url ?? poster}
                        name={`${label}`}
                      />
                    </div>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      <Button size="sm" className="mt-3" icon={<Plus className="size-4" aria-hidden />} onClick={() => onChange((list) => [...list, { id: newId('var'), name: { en: '' }, colorHex: '#c8c2b8' }])}>
        Add colour or option
      </Button>
      <p className="mt-2 text-xs text-ink-muted">The price difference is added to the base price when a customer selects the option.</p>
      {summary.total > 0 && (
        <section aria-label="Options: photos and 3D" className="mt-4 rounded-[var(--radius-card)] border border-line p-4">
          <h4 className="text-sm font-semibold">
            {summary.withModel} of {summary.total} option{summary.total === 1 ? '' : 's'} have their own 3D model
          </h4>
          <p className="mt-0.5 text-xs text-ink-muted">Never required to publish. Options without their own files show the product’s photos and model, with a note on the page.</p>
          <ul className="mt-3 space-y-2">
            {summary.lines.map((l) => (
              <li key={l.id} className="flex items-start gap-2.5 text-xs">
                {l.level === 'ready' ? (
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                ) : l.level === 'warning' ? (
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                ) : (
                  <CircleSlash className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden />
                )}
                <p>
                  <span className="font-medium text-ink">{l.name}</span>
                  <span className="text-ink-muted">: {l.detail}</span>
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
