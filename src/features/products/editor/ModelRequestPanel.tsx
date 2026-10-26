// The "Request a 3D model" panel of the shared product editor (S4 R-S4-7, R-S4-8). Photos are picked and previewed
// locally; the service uploads them only on Send (upload on send), so an abandoned form leaves no files.
import { type ChangeEvent, type JSX, useEffect, useId, useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { FormField, Select, Textarea } from '@/components/ui/Form'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorState, InlineNotice } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import { type ModelRequest, OPEN_REQUEST_STATUSES, REQUEST_PHOTOS_MAX, REQUEST_PHOTOS_MIN, REQUEST_TEXT_MAX } from '@/domain/modelRequests'
import type { ID, Product } from '@/domain/types'
import { ModelRequestStatusBadge } from '@/features/modelRequests/ModelRequestStatusBadge'
import { DEMO_SESSION_PHOTOS, LOAD_ERROR, statusLine } from '@/features/modelRequests/copy'
import { useModelRequests } from '@/features/modelRequests/hooks'
import { REQUEST_PHOTO_RULES, validateImageFile } from '@/lib/files'
import { imageSize } from '@/lib/image'
import { isDemoMode, service } from '@/services'
import { useRefreshWhenStale } from '@/services/hooks'

export interface ModelRequestPanelProps {
  product: Product | undefined
  onSaveDraft: () => void
  onReload: () => void
}

/** Status is re-read on focus once it is this old. */
const STALE_MS = 60_000
const PRODUCT_TARGET = ''
const NOT_CANCELLABLE = 'The Sanctus team has started on this model. To stop it, contact the Sanctus team.'

const INTRO =
  'Send us 2 to 10 photos of this product, and the Sanctus team makes its 3D model. Customers see the 3D view and AR once the model is ready. Until then the product shows its photos only.'
const TIPS =
  'Photograph the product from the front, the back, both sides and at an angle, plus close-ups of the material. Use even light and keep people out of the photos. JPG, PNG or WebP, up to 10 MB each. Only the Sanctus team sees these photos; they are not added to your catalog.'

interface Picked {
  key: string
  file: File
  url: string
  warning?: string
}
type Progress = 'uploading' | 'done'

function objectUrl(file: File): string {
  return typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : ''
}
function revoke(url: string): void {
  if (url && typeof URL.revokeObjectURL === 'function') URL.revokeObjectURL(url)
}

export function ModelRequestPanel({ product, onSaveDraft, onReload }: ModelRequestPanelProps): JSX.Element | null {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="space-y-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5">
      <div>
        <h3 id={titleId} className="text-[15px] leading-5 font-semibold text-ink">
          Request a 3D model
        </h3>
        <p className="mt-1 text-[13px] leading-[18px] text-ink-muted">{INTRO}</p>
      </div>
      {product ? (
        <SavedProductPanel product={product} onReload={onReload} />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[14px] text-ink-body">Save this product first, then request its 3D model.</p>
          <Button size="sm" onClick={onSaveDraft}>
            Save draft
          </Button>
        </div>
      )}
    </section>
  )
}

function SavedProductPanel({ product, onReload }: { product: Product; onReload: () => void }) {
  const query = useModelRequests({ productId: product.id })
  useRefreshWhenStale(query.refetch, STALE_MS, query.data)
  const toast = useToast()
  const [cancelling, setCancelling] = useState<ID | null>(null)
  const [preferredTarget, setPreferredTarget] = useState<string | null>(null)
  const formRef = useRef<HTMLDivElement>(null)

  // R-S4-17: a request seen open in this editor that is now delivered asks for a reload.
  // The ids seen open are updated while rendering a new load (React's "adjust state on a prop change" pattern).
  const [seenOpen, setSeenOpen] = useState<{ data: unknown; ids: ReadonlySet<ID> }>({ data: undefined, ids: new Set() })
  const items = query.data?.items ?? []
  const deliveredWhileOpen = items.some((r) => r.status === 'delivered' && seenOpen.ids.has(r.id))
  if (query.data && query.data !== seenOpen.data) {
    const ids = new Set(seenOpen.ids)
    for (const r of items) if (OPEN_REQUEST_STATUSES.includes(r.status)) ids.add(r.id)
    setSeenOpen({ data: query.data, ids })
  }

  if (!query.data) {
    if (query.status === 'error') return <ErrorState message={LOAD_ERROR} onRetry={query.refetch} retryLabel="Retry" />
    return (
      <div data-testid="model-request-loading" className="space-y-2" aria-busy="true">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  const optionName = (variantId: ID | undefined) => (variantId ? product.variants.find((v) => v.id === variantId)?.name.en : undefined)
  const targets: { value: string; label: string }[] = [
    { value: PRODUCT_TARGET, label: 'The product' },
    ...product.variants.map((v) => ({ value: v.id, label: v.name.en })),
  ]
  // Newest first per target (the service returns newest first).
  const byTarget = new Map<string, ModelRequest[]>()
  for (const r of [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const key = r.variantId ?? PRODUCT_TARGET
    byTarget.set(key, [...(byTarget.get(key) ?? []), r])
  }
  const freeTargets = targets.filter((t) => !byTarget.get(t.value)?.some((r) => OPEN_REQUEST_STATUSES.includes(r.status)))

  const cancel = async (id: ID) => {
    setCancelling(id)
    const res = await service.cancelModelRequest(id)
    setCancelling(null)
    if (!res.ok) {
      toast.error(res.error.message)
      return
    }
    toast.success('Request cancelled.')
    query.refetch()
  }
  const newRequestFor = (target: string) => {
    setPreferredTarget(target)
    formRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="space-y-4">
      {deliveredWhileOpen && (
        <InlineNotice tone="info">
          <span className="flex flex-wrap items-center gap-3">
            <span>Ready. Reload to see the 3D model in this editor.</span>
            <Button size="sm" onClick={onReload}>
              Reload
            </Button>
          </span>
        </InlineNotice>
      )}
      {[...byTarget.entries()].map(([target, list]) => {
        const [latest, ...earlier] = list
        if (!latest) return null
        const name = optionName(latest.variantId)
        return (
          <div key={target || 'product'} className="rounded-[var(--radius-control)] border border-line bg-subtle/60 px-3 py-3">
            {product.variants.length > 0 && <p className="text-[13px] font-medium text-ink">{name ?? 'The product'}</p>}
            <RequestLine request={latest} optionName={name} />
            {latest.status === 'in_progress' && <p className="mt-1 text-[13px] text-ink-muted">{NOT_CANCELLABLE}</p>}
            {latest.status === 'requested' && (
              <Button size="sm" variant="ghost" className="mt-2" loading={cancelling === latest.id} onClick={() => void cancel(latest.id)}>
                Cancel request
              </Button>
            )}
            {latest.status === 'rejected' && (
              <Button size="sm" className="mt-2" onClick={() => newRequestFor(target)}>
                Send a new request
              </Button>
            )}
            {earlier.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-[13px] text-ink-muted">Earlier requests ({earlier.length})</summary>
                <ul className="mt-2 space-y-2">
                  {earlier.map((r) => (
                    <li key={r.id}>
                      <RequestLine request={r} optionName={name} />
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )
      })}
      {freeTargets.length > 0 && (
        <div ref={formRef}>
          <RequestForm
            key={preferredTarget ?? 'form'}
            product={product}
            targets={freeTargets}
            showTargets={product.variants.length > 0}
            initialTarget={preferredTarget && freeTargets.some((t) => t.value === preferredTarget) ? preferredTarget : freeTargets[0]!.value}
            onSent={() => {
              toast.success("Request sent. We'll email you when the model is ready.")
              setPreferredTarget(null)
              query.refetch()
            }}
          />
        </div>
      )}
    </div>
  )
}

function RequestLine({ request, optionName }: { request: ModelRequest; optionName?: string }) {
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
      <ModelRequestStatusBadge status={request.status} />
      <p className="text-[13px] text-ink-body">{statusLine(request, optionName)}</p>
    </div>
  )
}

function RequestForm({
  product,
  targets,
  showTargets,
  initialTarget,
  onSent,
}: {
  product: Product
  targets: { value: string; label: string }[]
  showTargets: boolean
  initialTarget: string
  onSent: () => void
}) {
  const [target, setTarget] = useState(initialTarget)
  const [note, setNote] = useState('')
  const [picked, setPicked] = useState<Picked[]>([])
  const [pickError, setPickError] = useState<string | null>(null)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [progress, setProgress] = useState<Record<number, Progress>>({})
  const inputId = useId()
  const counter = useRef(0)

  // Revoke every preview URL on unmount.
  const pickedRef = useRef(picked)
  useEffect(() => {
    pickedRef.current = picked
  }, [picked])
  useEffect(() => () => pickedRef.current.forEach((p) => revoke(p.url)), [])

  const d = product.dimensions
  const hasDimensions = d.width > 0 && d.height > 0 && d.depth > 0
  const enough = picked.length >= REQUEST_PHOTOS_MIN

  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])]
    e.target.value = ''
    setPickError(null)
    setSendError(null)
    const added: Picked[] = []
    let message: string | null = null
    for (const file of files) {
      if (picked.length + added.length >= REQUEST_PHOTOS_MAX) {
        message = 'Up to 10 photos. Remove one to add another.'
        break
      }
      const check = validateImageFile(file, REQUEST_PHOTO_RULES)
      if (!check.ok) {
        message = check.message
        continue
      }
      added.push({ key: `p${++counter.current}`, file, url: objectUrl(file) })
    }
    if (message) setPickError(message)
    if (!added.length) return
    setPicked((prev) => [...prev, ...added])
    // A small photo is a warning, not a refusal (R-S4-5).
    for (const p of added) {
      const size = await imageSize(p.file)
      if (size && Math.max(size.width, size.height) < REQUEST_PHOTO_RULES.minLongSide) {
        const warning = `${p.file.name} is small (${size.width}×${size.height}). A larger photo gives a better model.`
        setPicked((prev) => prev.map((x) => (x.key === p.key ? { ...x, warning } : x)))
      }
    }
  }

  const remove = (key: string) => {
    setPicked((prev) => {
      const gone = prev.find((p) => p.key === key)
      if (gone) revoke(gone.url)
      return prev.filter((p) => p.key !== key)
    })
    setPickError(null)
  }

  const send = async () => {
    setSending(true)
    setSendError(null)
    setProgress({})
    const res = await service.requestModel(
      {
        businessId: product.businessId,
        productId: product.id,
        ...(target !== PRODUCT_TARGET ? { variantId: target } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
        photos: picked.map((p) => p.file),
      },
      (i, state) => setProgress((prev) => ({ ...prev, [i]: state })),
    )
    setSending(false)
    if (!res.ok) {
      // The picked photos stay so the owner can try again.
      setSendError(res.error.message)
      setProgress({})
      return
    }
    picked.forEach((p) => revoke(p.url))
    setPicked([])
    setNote('')
    setProgress({})
    onSent()
  }

  return (
    <fieldset disabled={sending} className="min-w-0 space-y-4">
      {showTargets && (
        <FormField label="Model for">
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            {targets.map((t) => (
              <option key={t.value || 'product'} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </FormField>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] text-ink-muted tabular-nums">{picked.length} of 10 photos · add at least 2</p>
          <label htmlFor={inputId} className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-subtle">
            <ImagePlus className="size-4" aria-hidden />
            Add photos
          </label>
          <input id={inputId} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" multiple aria-label="Add photos" onChange={(e) => void onFiles(e)} />
        </div>
        <p className="text-[13px] leading-[18px] text-ink-muted">{TIPS}</p>
        {isDemoMode && <p className="text-[13px] text-info">{DEMO_SESSION_PHOTOS}</p>}
        {pickError && (
          <p role="alert" className="text-[13px] text-danger">
            {pickError}
          </p>
        )}
        {picked.length > 0 && (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-5">
            {picked.map((p, i) => (
              <li key={p.key} className="relative min-w-0 overflow-hidden rounded-[var(--radius-control)] border border-line bg-subtle">
                {p.url ? <img src={p.url} alt="" className="aspect-square w-full object-cover" /> : <div className="aspect-square w-full" />}
                <div className="flex items-center justify-between gap-1 px-2 py-1">
                  <span className="truncate text-[12px] text-ink-body" title={p.file.name}>
                    {p.file.name}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 rounded p-1 text-ink-muted hover:bg-danger-soft hover:text-danger disabled:opacity-50"
                    aria-label={`Remove ${p.file.name}`}
                    onClick={() => remove(p.key)}
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </div>
                {progress[i] && <p className="px-2 pb-1 text-[12px] text-ink-muted">{progress[i] === 'done' ? 'Uploaded' : 'Uploading…'}</p>}
              </li>
            ))}
          </ul>
        )}
        {picked
          .filter((p) => p.warning)
          .map((p) => (
            <p key={p.key} className="text-[13px] text-warning">
              {p.warning}
            </p>
          ))}
      </div>

      <FormField label="Notes for the Sanctus team (optional)">
        <Textarea
          rows={3}
          maxLength={REQUEST_TEXT_MAX}
          value={note}
          placeholder="For example: the legs are oak and the cushion is removable."
          onChange={(e) => setNote(e.target.value)}
        />
      </FormField>

      {sendError && (
        <p role="alert" className="text-[13px] text-danger">
          {sendError}
        </p>
      )}
      {hasDimensions ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" loading={sending} disabled={!enough} onClick={() => void send()}>
            Send request
          </Button>
          {!enough && <p className="text-[13px] text-ink-muted">Add at least 2 photos.</p>}
        </div>
      ) : (
        <a href="#specs" className="text-[13px] font-medium text-accent-ink underline underline-offset-2">
          Add width, height and depth above first. The model is made to that size.
        </a>
      )}
    </fieldset>
  )
}
