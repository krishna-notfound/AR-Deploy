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
import type { Dimensions, ID, Product } from '@/domain/types'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { useFormat } from '@/lib/useFormat'
import { ModelRequestStatusBadge } from '@/features/modelRequests/ModelRequestStatusBadge'
import { statusLine } from '@/features/modelRequests/copy'
import { useModelRequests } from '@/features/modelRequests/hooks'
import { REQUEST_PHOTO_RULES, validateImageFile } from '@/lib/files'
import { imageSize } from '@/lib/image'
import { isDemoMode, service } from '@/services'
import { useRefreshWhenStale } from '@/services/hooks'

export interface ModelRequestPanelProps {
  product: Product | undefined
  onSaveDraft: () => void
  onReload: () => void
  /** The dimensions on screen (parsed from the form). The request uses the saved ones, so differing ones ask to save. */
  formDimensions?: Dimensions
  /** The editor is saving (the Save action shows as busy). */
  saving?: boolean
}

/** Status is re-read on focus once it is this old. */
const STALE_MS = 60_000
const PRODUCT_TARGET = ''

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

export function ModelRequestPanel({ product, onSaveDraft, onReload, formDimensions, saving }: ModelRequestPanelProps): JSX.Element | null {
  const { t } = useI18n()
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="space-y-4 rounded-[var(--radius-card)] border border-line bg-surface p-4 sm:p-5">
      <div>
        <h3 id={titleId} className="text-[15px] leading-5 font-semibold text-ink">
          {t('products.requestPanel.title')}
        </h3>
        <p className="mt-1 text-[13px] leading-[18px] text-ink-muted">{t('products.requestPanel.intro')}</p>
      </div>
      {product ? (
        <SavedProductPanel product={product} onReload={onReload} onSave={onSaveDraft} formDimensions={formDimensions} saving={saving} />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[14px] text-ink-body">{t('products.requestPanel.saveFirst')}</p>
          <Button size="sm" onClick={onSaveDraft}>
            {t('products.editor.saveDraft')}
          </Button>
        </div>
      )}
    </section>
  )
}

function SavedProductPanel({
  product,
  onReload,
  onSave,
  formDimensions,
  saving,
}: {
  product: Product
  onReload: () => void
  onSave: () => void
  formDimensions?: Dimensions
  saving?: boolean
}) {
  const { t } = useI18n()
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
    if (query.status === 'error') return <ErrorState message={t('business.modelRequests.loadError')} onRetry={query.refetch} retryLabel={t('business.modelRequests.photo.retry')} />
    return (
      <div data-testid="model-request-loading" className="space-y-2" aria-busy="true">
        <Skeleton className="h-5 w-1/2" />
        <Skeleton className="h-16 w-full" />
      </div>
    )
  }

  const optionName = (variantId: ID | undefined) => (variantId ? product.variants.find((v) => v.id === variantId)?.name.en : undefined)
  const targets: { value: string; label: string }[] = [
    { value: PRODUCT_TARGET, label: t('products.requestPanel.theProduct') },
    ...product.variants.map((v) => ({ value: v.id, label: v.name.en })),
  ]
  // Newest first per target (the service returns newest first).
  const byTarget = new Map<string, ModelRequest[]>()
  for (const r of [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))) {
    const key = r.variantId ?? PRODUCT_TARGET
    byTarget.set(key, [...(byTarget.get(key) ?? []), r])
  }
  const freeTargets = targets.filter((target) => !byTarget.get(target.value)?.some((r) => OPEN_REQUEST_STATUSES.includes(r.status)))

  const cancel = async (id: ID) => {
    setCancelling(id)
    const res = await service.cancelModelRequest(id)
    setCancelling(null)
    if (!res.ok) {
      toast.error(errorText(res.error, t))
      return
    }
    toast.success(t('products.requestPanel.cancelled'))
    if (res.data.cleanup === 'partial') toast.info(t('products.requestPanel.photosNotRemoved'))
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
            <span>{t('products.requestPanel.ready')}</span>
            <Button size="sm" onClick={onReload}>
              {t('products.editor.reload')}
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
            {product.variants.length > 0 && <p className="text-[13px] font-medium text-ink">{name ?? t('products.requestPanel.theProduct')}</p>}
            <RequestLine request={latest} optionName={name} />
            {latest.status === 'in_progress' && <p className="mt-1 text-[13px] text-ink-muted">{t('products.requestPanel.notCancellable')}</p>}
            {latest.status === 'requested' && (
              <Button size="sm" variant="ghost" className="mt-2" loading={cancelling === latest.id} onClick={() => void cancel(latest.id)}>
                {t('products.requestPanel.cancel')}
              </Button>
            )}
            {latest.status === 'rejected' && (
              <Button size="sm" className="mt-2" onClick={() => newRequestFor(target)}>
                {t('products.requestPanel.sendNew')}
              </Button>
            )}
            {earlier.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-[13px] text-ink-muted">{t('products.requestPanel.earlier', { n: earlier.length })}</summary>
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
            formDimensions={formDimensions}
            onSave={onSave}
            saving={saving}
            targets={freeTargets}
            showTargets={product.variants.length > 0}
            initialTarget={preferredTarget && freeTargets.some((target) => target.value === preferredTarget) ? preferredTarget : freeTargets[0]!.value}
            onSent={() => {
              toast.success(t('products.requestPanel.sent'))
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
  const { t } = useI18n()
  const fmt = useFormat()
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
      <ModelRequestStatusBadge status={request.status} />
      <p className="text-[13px] text-ink-body">{statusLine(request, optionName, fmt.date, t)}</p>
    </div>
  )
}

function RequestForm({
  product,
  formDimensions,
  onSave,
  saving,
  targets,
  showTargets,
  initialTarget,
  onSent,
}: {
  product: Product
  formDimensions?: Dimensions
  onSave: () => void
  saving?: boolean
  targets: { value: string; label: string }[]
  showTargets: boolean
  initialTarget: string
  onSent: () => void
}) {
  const { t } = useI18n()
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

  // The request is made to the saved size, so on-screen dimensions that differ from it are saved first.
  const saved = product.dimensions
  const shown = formDimensions ?? saved
  const hasDimensions = shown.width > 0 && shown.height > 0 && shown.depth > 0
  const unsavedDimensions =
    hasDimensions && (shown.width !== saved.width || shown.height !== saved.height || shown.depth !== saved.depth || shown.unit !== saved.unit)
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
        message = t('products.requestPanel.maxPhotos')
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
        const warning = t('products.requestPanel.smallPhoto', { name: p.file.name, width: size.width, height: size.height })
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
      setSendError(errorText(res.error, t))
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
        <FormField label={t('products.requestPanel.modelFor')}>
          <Select value={target} onChange={(e) => setTarget(e.target.value)}>
            {targets.map((opt) => (
              <option key={opt.value || 'product'} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </Select>
        </FormField>
      )}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[13px] text-ink-muted tabular-nums">{t('products.requestPanel.counter', { n: picked.length })}</p>
          <label htmlFor={inputId} className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-line bg-surface px-3 py-1.5 text-[13px] font-medium text-ink hover:bg-subtle">
            <ImagePlus className="size-4" aria-hidden />
            {t('products.requestPanel.addPhotos')}
          </label>
          <input id={inputId} type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" multiple aria-label={t('products.requestPanel.addPhotos')} onChange={(e) => void onFiles(e)} />
        </div>
        <p className="text-[13px] leading-[18px] text-ink-muted">{t('products.requestPanel.tips')}</p>
        {isDemoMode && <p className="text-[13px] text-info">{t('business.modelRequests.demoSessionPhotos')}</p>}
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
                    aria-label={t('products.requestPanel.removePhoto', { name: p.file.name })}
                    onClick={() => remove(p.key)}
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </div>
                {progress[i] && <p className="px-2 pb-1 text-[12px] text-ink-muted">{t(progress[i] === 'done' ? 'products.requestPanel.uploaded' : 'products.requestPanel.uploading')}</p>}
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

      <FormField label={t('products.requestPanel.notes')}>
        <Textarea
          rows={3}
          maxLength={REQUEST_TEXT_MAX}
          value={note}
          placeholder={t('products.requestPanel.notesPlaceholder')}
          onChange={(e) => setNote(e.target.value)}
        />
      </FormField>

      {sendError && (
        <p role="alert" className="text-[13px] text-danger">
          {sendError}
        </p>
      )}
      {unsavedDimensions ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[13px] text-ink-body">{t('products.requestPanel.saveToUse')}</p>
          <Button size="sm" loading={saving} onClick={onSave}>
            {t('products.editor.saveChanges')}
          </Button>
        </div>
      ) : hasDimensions ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary" loading={sending} disabled={!enough} onClick={() => void send()}>
            {t('products.requestPanel.send')}
          </Button>
          {!enough && <p className="text-[13px] text-ink-muted">{t('products.requestPanel.addAtLeast')}</p>}
        </div>
      ) : (
        <a href="#specs" className="text-[13px] font-medium text-accent-ink underline underline-offset-2">
          {t('products.requestPanel.addDims')}
        </a>
      )}
    </fieldset>
  )
}
