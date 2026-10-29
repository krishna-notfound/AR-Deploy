import { AlertTriangle, Box, CheckCircle2, CircleSlash, FileBox, Info, Link2, Loader2, Trash2, Upload, Wand2 } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { AssetStatusBadge, Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Form'
import { InlineNotice } from '@/components/ui/States'
import { MODEL_STALL_TIMEOUT_MS, ModelViewer } from '@/components/three/ModelViewer'
import { type ReadinessItem, arReadiness, sceneViewerWarning } from '@/features/ar/readiness'
import type { Dimensions, ModelAsset, ModelFormat, ProductModels } from '@/domain/types'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import type { Vars } from '@/i18n/translate'
import { service } from '@/services'
import { MODEL_RULES, fetchRequiredExtensions, formatMb, isHttpsUrl, isStaleSessionAsset, modelAssetFromUrl, readRequiredExtensions, sceneViewerUnsupported, validateModelFile } from '@/lib/files'
import { cn } from '@/lib/cn'
import { formatFileSize } from '@/lib/format'
import { useFormat } from '@/lib/useFormat'
import { type ScaleCheck, type ScaleMismatchReason, checkScale } from '@/lib/scale'
import { MODEL_OPTIMIZATION_ENABLED, optimizeModel, optimizeReasonText, optimizedNote } from './modelOptimizeClient'

type ModelContext = 'product' | 'variant' | 'request'

const FORMAT_INFO: Record<ModelFormat, { title: TranslationKey; use: TranslationKey }> = {
  glb: { title: 'products.model.glbTitle', use: 'products.model.glbUse' },
  usdz: { title: 'products.model.usdzTitle', use: 'products.model.usdzUse' },
}

type T = (key: TranslationKey, vars?: Vars) => string

/**
 * GLB + USDZ slots with the 3D preview, scale check and AR readiness. Used for the product and, with
 * context="variant", for each colour or option (upload only: variant files are always stored owner uploads).
 * context="request" is the staff side of a 3D model request (S4 R-S4-12): upload only, the same checks, preview and
 * readiness, against the product's dimensions; the files are staged on the request until it is delivered.
 */
export function ModelSection({
  models,
  onChange,
  dimensions,
  poster,
  name,
  businessId,
  context = 'product',
  onRefreshUrls,
}: {
  models: ProductModels
  /** One format at a time, so the caller merges it into its latest state and parallel uploads both land. */
  onChange: (format: ModelFormat, asset: ModelAsset | undefined) => void
  dimensions: Dimensions
  poster?: string
  name: string
  businessId?: string
  context?: ModelContext
  /** Fetches fresh signed URLs for the stored files (they expire); "Try again" in the preview calls it. */
  onRefreshUrls?: () => void
}) {
  const { t } = useI18n()
  return (
    <div className="space-y-5">
      {context === 'product' && (
        <InlineNotice tone="neutral" className="border border-line text-ink-body" icon={<Info className="mt-0.5 size-4 shrink-0" aria-hidden />}>
          {t('products.model.intro')} <strong className="font-medium">GLB</strong> {t('products.model.introGlb')}{' '}
          <strong className="font-medium">USDZ</strong> {t('products.model.introUsdz')} {t(MODEL_OPTIMIZATION_ENABLED ? 'products.model.introOptOn' : 'products.model.introOptOff')}
        </InlineNotice>
      )}
      {context === 'request' && (
        <InlineNotice tone="neutral" className="border border-line text-ink-body" icon={<Info className="mt-0.5 size-4 shrink-0" aria-hidden />}>
          {t('products.model.requestIntro')}
        </InlineNotice>
      )}
      {/* GLB and USDZ side by side, stacked on phones (BRIEF section 6). */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {(['glb', 'usdz'] as const).map((f) => (
          <ModelSlot key={f} format={f} businessId={businessId} asset={models[f]} onChange={(a) => onChange(f, a)} allowLink={context === 'product'} buildFrom={f === 'usdz' ? models.glb : undefined} />
        ))}
      </div>
      {/* Keyed by the GLB: a replaced file never shows the previous file's measurement or readiness (AR-07). */}
      <ModelPreview key={models.glb?.url ?? 'none'} glb={models.glb} usdz={models.usdz} dimensions={dimensions} poster={poster} name={name} context={context} onRefreshUrls={onRefreshUrls} />
    </div>
  )
}

function ModelSlot({
  format,
  asset,
  onChange,
  businessId,
  allowLink,
  buildFrom,
}: {
  format: ModelFormat
  asset?: ModelAsset
  onChange: (a: ModelAsset | undefined) => void
  businessId?: string
  allowLink: boolean
  /** The USDZ slot: the GLB an iPhone file can be built from (ADR-0039). */
  buildFrom?: ModelAsset
}) {
  const { t } = useI18n()
  const fmt = useFormat()
  const id = useId()
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState<false | 'checking' | 'optimizing' | 'building'>(false)
  /** Result of the size optimization, and the untouched file so the admin can upload it instead. */
  const [optimizeNote, setOptimizeNote] = useState<{ text: string; original?: File } | null>(null)
  const [urlDraft, setUrlDraft] = useState('')
  const info = FORMAT_INFO[format]
  const stale = isStaleSessionAsset(asset)

  const onFile = async (original: File, opts: { keepOriginal?: boolean; built?: boolean } = {}) => {
    if (checking) return
    setChecking('checking')
    const check = await validateModelFile(original, format, t)
    if (!check.ok) {
      setChecking(false)
      return setError(check.message)
    }
    let file = original
    if (MODEL_OPTIMIZATION_ENABLED && format === 'glb' && !opts.keepOriginal) {
      setChecking('optimizing')
      const r = await optimizeModel(original)
      file = r.file
      setOptimizeNote(
        r.optimized
          ? { text: optimizedNote(r, t), original }
          : { text: optimizeReasonText(r.reason, t) },
      )
    } else {
      // Large textures are accepted but flagged: they make AR slow on phones (AR audit AR-10).
      const notes = [opts.keepOriginal ? t('products.model.originalUploaded') : '', opts.built ? t('products.model.builtNote', { date: fmt.date(new Date().toISOString()) }) : '', check.warning ?? ''].filter(Boolean)
      setOptimizeNote(notes.length ? { text: notes.join(' ') } : null)
    }
    const res = await service.uploadAsset({ kind: format, file, businessId })
    setChecking(false)
    if (!res.ok) return setError(errorText(res.error, t))
    setError(null)
    // Stored with the asset so the Android AR warning and readiness survive a reload (AR-01/02).
    const requiredExtensions = format === 'glb' ? await readRequiredExtensions(file) : undefined
    const { url, storagePath, status } = res.data
    onChange({ format, url, fileName: file.name, sizeBytes: file.size, status, ...(storagePath ? { storagePath } : {}), ...(requiredExtensions ? { requiredExtensions } : {}) })
  }

  // "Build from GLB" (owner 2026-10-27, ADR-0039): a real USDZ made in this browser from the stored GLB (already made
  // lighter on upload), then uploaded exactly like a picked USDZ, with the same checks.
  const canBuild = format === 'usdz' && !asset && !!buildFrom?.url && !isStaleSessionAsset(buildFrom)
  const onBuild = async () => {
    if (checking || !buildFrom) return
    setChecking('building')
    setError(null)
    try {
      const res = await fetch(buildFrom.url)
      if (!res.ok) throw new Error(`GLB download failed (${res.status})`)
      const { buildUsdzFromGlb, usdzNameFor } = await import('./usdzFromGlb')
      const usdz = await buildUsdzFromGlb(await res.arrayBuffer())
      setChecking(false)
      await onFile(new File([usdz as BlobPart], usdzNameFor(buildFrom.fileName), { type: 'model/vnd.usdz+zip' }), { built: true })
    } catch {
      setChecking(false)
      setError(t('products.model.buildFailed'))
    }
  }

  const onUrl = async () => {
    const url = urlDraft.trim()
    if (checking) return
    if (!isHttpsUrl(url)) return setError(t('common.validation.urlInvalid'))
    if (!url.toLowerCase().split('?')[0]?.endsWith(`.${format}`)) return setError(t('products.model.urlExtension', { format }))
    setError(null)
    setChecking('checking')
    // Reads only the header of a linked GLB; when the host does not allow it, the 3D preview checks it on load.
    const requiredExtensions = format === 'glb' ? await fetchRequiredExtensions(url) : undefined
    setChecking(false)
    setUrlDraft('')
    onChange({ ...modelAssetFromUrl(url, format), ...(requiredExtensions ? { requiredExtensions } : {}) })
  }

  /** Non-blocking: the file works in the 3D viewer but may not open in Android AR (Scene Viewer). */
  const unsupported = format === 'glb' ? sceneViewerUnsupported(asset?.requiredExtensions) : []

  return (
    <div className="min-w-0 rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-[14px] leading-5 font-semibold text-ink">{t(info.title)}</h4>
          <p className="mt-1 text-[13px] leading-[18px] text-ink-muted">{t(info.use)}</p>
        </div>
        <Badge tone="neutral">.{format}</Badge>
      </div>

      {asset ? (
        <div className="mt-3 flex items-center gap-3 rounded-[var(--radius-control)] border border-line bg-subtle/60 px-3 py-2.5">
          <FileBox className="size-4 shrink-0 text-ink-muted" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[14px] font-medium text-ink" title={asset.fileName}>
              {asset.fileName}
            </p>
            <p className="flex flex-wrap items-center gap-x-2 text-[13px] text-ink-muted tabular-nums">
              {asset.sizeBytes ? formatFileSize(asset.sizeBytes) : asset.url.startsWith('blob:') ? t('products.model.uploadedFile') : t('products.model.remoteUrl')}
              <AssetStatusBadge status={stale ? 'missing' : asset.status} />
            </p>
          </div>
          <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden />} disabled={!!checking} onClick={() => onChange(undefined)} aria-label={t('products.model.removeFile', { format: format.toUpperCase() })} className="shrink-0 text-danger! hover:bg-danger-soft">
            {t('products.model.remove')}
          </Button>
        </div>
      ) : (
        <div className="mt-3 rounded-[var(--radius-control)] border border-dashed border-line-strong px-3 py-5 text-center text-[13px] text-ink-muted">
          {t('products.model.noFile', { format: format.toUpperCase() })}
          {canBuild && (
            <div className="mt-3 flex flex-col items-center gap-2">
              <Button size="sm" disabled={!!checking} onClick={() => void onBuild()} icon={checking === 'building' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Wand2 className="size-4" aria-hidden />}>
                {t(checking === 'building' ? 'products.model.building' : 'products.model.build')}
              </Button>
              <span className="max-w-xs text-[12px] leading-4">{t('products.model.buildHint')}</span>
            </div>
          )}
        </div>
      )}
      {asset?.status === 'session-only' && !stale && (
        <p className="mt-2 text-[13px] text-info">{t('products.model.sessionOnly')}</p>
      )}
      {stale && <p className="mt-2 text-[13px] text-warning">{t('products.model.staleFile')}</p>}

      <div className="mt-3 flex flex-col gap-2">
        <label
          htmlFor={id}
          className={cn(
            'inline-flex h-9 w-fit items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 text-[14px] font-medium text-ink focus-within:outline-2 focus-within:outline-ink max-sm:h-11 pointer-coarse:h-11',
            checking ? 'cursor-wait opacity-60' : 'cursor-pointer hover:bg-subtle',
          )}
        >
          {checking ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
          {checking === 'optimizing'
            ? t('products.model.optimizing')
            : checking
              ? t('products.model.checking')
              : t(asset ? 'products.model.replaceFile' : 'products.model.uploadFile', { format })}
          <input
            id={id}
            type="file"
            accept={MODEL_RULES[format].extension}
            disabled={!!checking}
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onFile(f)
              e.target.value = ''
            }}
          />
        </label>
        {allowLink && (
        <div className="flex gap-2">
          <Input
            aria-label={t('products.model.urlLabel', { format: format.toUpperCase() })}
            placeholder={t('products.model.urlPlaceholder', { format })}
            value={urlDraft}
            disabled={!!checking}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                void onUrl()
              }
            }}
            className="h-9 max-sm:h-11"
          />
          <Button size="sm" onClick={() => void onUrl()} disabled={!!checking || !urlDraft.trim()} icon={<Link2 className="size-4" aria-hidden />}>
            {t('products.model.link')}
          </Button>
        </div>
        )}
        <p className="text-[13px] text-ink-muted">{t('products.model.maxSize', { size: formatMb(MODEL_RULES[format].maxBytes) })}</p>
      </div>
      {optimizeNote && asset && (
        <p className="mt-2 text-[13px] text-ink-muted">
          {optimizeNote.text}{' '}
          {optimizeNote.original && (
            <button type="button" disabled={!!checking} className="font-medium text-ink underline underline-offset-2" onClick={() => void onFile(optimizeNote.original!, { keepOriginal: true })}>
              {t('products.model.uploadOriginal')}
            </button>
          )}
        </p>
      )}
      {unsupported.length > 0 && asset && <p className="mt-2 text-[13px] leading-[1.45] text-ink-muted">{sceneViewerWarning(unsupported)}</p>}
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

/** Admin 3D preview (no AR) with the measured-vs-entered scale check (ADR-0006). */
export function ModelPreview({
  glb,
  usdz,
  dimensions,
  poster,
  name,
  context = 'product',
  onRefreshUrls,
}: {
  glb?: ModelAsset
  usdz?: ModelAsset
  dimensions: Dimensions
  poster?: string
  name: string
  context?: ModelContext
  onRefreshUrls?: () => void
}) {
  const { t } = useI18n()
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [progress, setProgress] = useState(0)
  const [measured, setMeasured] = useState<{ x: number; y: number; z: number } | null>(null)
  /** Read from the loaded file, so linked and older models get the Scene Viewer check too (AR-02). */
  const [detected, setDetected] = useState<string[] | undefined>(undefined)
  const [attempt, setAttempt] = useState(0)
  const stale = isStaleSessionAsset(glb)
  /** No usable URL (e.g. signing the stored file failed): the viewer would only stall, so it is not shown. */
  const unavailable = !!glb && !stale && (!glb.url || glb.status === 'invalid')
  // Recomputed live, so editing the dimensions updates the check immediately.
  const scale: ScaleCheck = checkScale(measured, dimensions)
  const readiness = <ArReadiness items={arReadiness({ glb, usdz, preview: state, scale, requiredExtensions: detected })} />

  // No progress for the whole window: treat it as failed rather than keep an endless "Checking" verdict.
  useEffect(() => {
    if (state !== 'loading' || !glb || stale || unavailable) return
    const timer = setTimeout(() => setState('error'), MODEL_STALL_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [state, progress, attempt, glb, stale, unavailable])

  /** Gets fresh signed URLs when the caller can (a new URL remounts this preview), then loads again. */
  const retry = () => {
    onRefreshUrls?.()
    setState('loading')
    setProgress(0)
    setAttempt((a) => a + 1)
  }

  if (unavailable) {
    return (
      <div className="flex flex-col items-center rounded-[var(--radius-card)] border border-line bg-subtle/50 px-4 py-10 text-center sm:px-6">
        <AlertTriangle className="size-6 text-warning" aria-hidden />
        <p className="mt-3 text-[14px] font-medium text-ink">{t('products.model.unavailable')}</p>
        <p className="mt-1 max-w-md text-[13px] leading-[1.45] text-ink-muted">{t('products.model.unavailableBody')}</p>
        {onRefreshUrls && (
          <Button size="sm" className="mt-3" onClick={onRefreshUrls}>
            {t('products.model.checkAgain')}
          </Button>
        )}
        {readiness}
      </div>
    )
  }

  if (!glb || stale) {
    return (
      <div className="flex flex-col items-center rounded-[var(--radius-card)] border border-line bg-subtle/50 px-4 py-10 text-center sm:px-6">
        <Box className="size-6 text-ink-muted" aria-hidden />
        <p className="mt-3 text-[14px] font-medium text-ink">{t(context === 'variant' ? 'products.model.noModelOption' : 'products.model.noPreview')}</p>
        <p className="mt-1 max-w-md text-[13px] leading-[1.45] text-ink-muted">
          {t(context === 'variant' ? 'products.model.emptyVariant' : context === 'request' ? 'products.model.emptyRequest' : 'products.model.emptyProduct')}
        </p>
        {context !== 'variant' || usdz ? readiness : null}
      </div>
    )
  }

  return (
    <div>
      <div className="relative aspect-[16/10] overflow-hidden rounded-[var(--radius-card)] border border-line bg-subtle">
        <ModelViewer
          key={`${glb.url}-${attempt}`}
          src={glb.url}
          iosSrc={usdz?.url}
          poster={poster}
          alt={t('products.model.alt', { name })}
          className="absolute inset-0"
          onProgress={setProgress}
          onLoad={({ dimensions: d, requiredExtensions }) => {
            setState('loaded')
            setMeasured(d)
            setDetected(requiredExtensions)
          }}
          onError={() => setState('error')}
        />
        {state === 'loading' && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1 bg-line">
            <div className="h-full bg-accent transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
        )}
        {state === 'error' && (
          <div className="absolute inset-0 grid place-items-center bg-canvas/90 p-6 text-center" role="alert">
            <div>
              <AlertTriangle className="mx-auto size-6 text-danger" aria-hidden />
              <p className="mt-2 text-[14px] font-medium text-ink">{t('products.model.previewFailed')}</p>
              <p className="mt-1 text-[13px] text-ink-muted">{t('products.model.previewFailedBody')}</p>
              <Button size="sm" className="mt-3" onClick={retry}>
                {t('common.retry')}
              </Button>
            </div>
          </div>
        )}
      </div>
      {state === 'loaded' && <ScaleReport scale={scale} />}
      {readiness}
    </div>
  )
}

const LEVEL_ICON = {
  ready: <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />,
  warning: <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />,
  missing: <CircleSlash className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden />,
}
const LEVEL_TEXT = { ready: 'products.model.levelReady', warning: 'products.model.levelWarning', missing: 'products.model.levelMissing' } as const
const LEVEL_TONE = { ready: 'success', warning: 'warning', missing: 'neutral' } as const

/** What customers get on each platform, so the admin knows before publishing (ADR-0018). */
function ArReadiness({ items }: { items: ReadinessItem[] }) {
  const { t } = useI18n()
  return (
    <section aria-label={t('products.model.readiness')} className="mt-4 w-full rounded-[var(--radius-card)] border border-line bg-surface p-4 text-left">
      <h4 className="text-[14px] font-semibold text-ink">{t('products.model.readiness')}</h4>
      <ul className="mt-3 space-y-3">
        {items.map((i) => (
          <li key={i.key} className="flex items-start gap-2.5 text-[13px] leading-[1.45]">
            {LEVEL_ICON[i.level]}
            <div className="min-w-0 flex-1">
              <p className="text-ink">{i.label}</p>
              <p className="mt-0.5 text-ink-muted">{i.detail}</p>
            </div>
            <Badge tone={LEVEL_TONE[i.level]} className="shrink-0">
              {t(LEVEL_TEXT[i.level])}
            </Badge>
          </li>
        ))}
      </ul>
    </section>
  )
}

const MISMATCH_HINT: Record<ScaleMismatchReason, (t: T, k?: number) => string> = {
  'axis-swap': (t) => t('products.model.hint.axisSwap'),
  'wrong-unit': (t) => t('products.model.hint.wrongUnit'),
  'model-units': (t, k) =>
    k && k >= 1 ? t('products.model.hint.modelUnitsLarge', { k: Math.round(k) }) : t('products.model.hint.modelUnitsSmall', { k: Math.round(1 / (k ?? 1)) }),
  uniform: (t, k) => t('products.model.hint.uniform', { k: k?.toFixed(2) ?? '' }),
}

function ScaleReport({ scale }: { scale: ScaleCheck }) {
  const { t } = useI18n()
  const m = (v: number) => `${Math.round(v * 100)} cm`
  if (scale.status === 'unknown')
    return <p className="mt-3 text-[13px] text-ink-muted">{t('products.model.scaleUnknown')}</p>
  const sizes = (s: { x: number; y: number; z: number }) => `${m(s.x)} × ${m(s.y)} × ${m(s.z)}`
  return (
    <div className="mt-3 flex items-start gap-2.5 text-[13px] leading-[1.45]">
      {scale.status === 'verified' ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
      ) : (
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      )}
      <div>
        <p className="font-medium text-ink">{t(scale.status === 'verified' ? 'products.model.scaleVerified' : 'products.model.scaleUnverified')}</p>
        <p className="mt-0.5 text-ink-muted">
          {t('products.model.scaleMeasures', { measured: sizes(scale.measured), entered: sizes(scale.expected) })}
          {scale.status === 'mismatch' && ` ${t('products.model.scaleNever')}`}
        </p>
        {scale.status === 'mismatch' && scale.reason && <p className="mt-0.5 text-ink">{MISMATCH_HINT[scale.reason](t, scale.factor)}</p>}
      </div>
    </div>
  )
}
