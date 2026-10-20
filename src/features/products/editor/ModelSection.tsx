import { AlertTriangle, Box, CheckCircle2, CircleSlash, FileBox, Info, Link2, Loader2, Trash2, Upload } from 'lucide-react'
import { useId, useState } from 'react'
import { AssetStatusBadge, Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Form'
import { InlineNotice } from '@/components/ui/States'
import { ModelViewer } from '@/components/three/ModelViewer'
import { type ReadinessItem, arReadiness } from '@/features/ar/readiness'
import type { Dimensions, ModelAsset, ModelFormat, Product } from '@/domain/types'
import { service } from '@/services'
import { MODEL_RULES, isHttpUrl, isStaleSessionAsset, modelAssetFromUrl, unsupportedForSceneViewer, validateModelFile } from '@/lib/files'
import { formatFileSize } from '@/lib/format'
import { type ScaleCheck, type ScaleMismatchReason, checkScale } from '@/lib/scale'
import { MODEL_OPTIMIZATION_ENABLED, optimizeModel } from './modelOptimizeClient'

const FORMAT_INFO: Record<ModelFormat, { title: string; use: string }> = {
  glb: { title: 'GLB model', use: 'Used for the interactive 3D viewer on every device and for AR on Android (Scene Viewer).' },
  usdz: { title: 'USDZ model', use: 'Used for AR on iPhone and iPad (AR Quick Look).' },
}

export function ModelSection({
  models,
  onChange,
  dimensions,
  poster,
  name,
  businessId,
}: {
  models: Product['models']
  onChange: (m: Product['models']) => void
  dimensions: Dimensions
  poster?: string
  name: string
  businessId?: string
}) {
  return (
    <div className="space-y-5">
      <InlineNotice icon={<Info className="mt-0.5 size-4 shrink-0" aria-hidden />}>
        Upload the files your 3D artist delivered. <strong className="font-medium">GLB</strong> powers the 3D viewer and Android AR.{' '}
        <strong className="font-medium">USDZ</strong> is used by iPhone and iPad AR. {MODEL_OPTIMIZATION_ENABLED ? 'GLB files are optimized for size before upload; USDZ files are stored as uploaded. Nothing is converted.' : 'Files are stored as uploaded: they are not converted or compressed.'}
      </InlineNotice>
      <div className="grid gap-4 lg:grid-cols-2">
        {(['glb', 'usdz'] as const).map((f) => (
          <ModelSlot key={f} format={f} businessId={businessId} asset={models[f]} onChange={(a) => onChange({ ...models, [f]: a })} />
        ))}
      </div>
      <ModelPreview glb={models.glb} usdz={models.usdz} dimensions={dimensions} poster={poster} name={name} />
    </div>
  )
}

function ModelSlot({
  format,
  asset,
  onChange,
  businessId,
}: {
  format: ModelFormat
  asset?: ModelAsset
  onChange: (a: ModelAsset | undefined) => void
  businessId?: string
}) {
  const id = useId()
  const [error, setError] = useState<string | null>(null)
  /** Non-blocking: the file works in the 3D viewer but may not open in Android AR (Scene Viewer). */
  const [arWarning, setArWarning] = useState<string | null>(null)
  const [checking, setChecking] = useState<false | 'checking' | 'optimizing'>(false)
  /** Result of the size optimization, and the untouched file so the admin can upload it instead. */
  const [optimizeNote, setOptimizeNote] = useState<{ text: string; original?: File } | null>(null)
  const [urlDraft, setUrlDraft] = useState('')
  const info = FORMAT_INFO[format]
  const stale = isStaleSessionAsset(asset)

  const onFile = async (original: File, opts: { keepOriginal?: boolean } = {}) => {
    setChecking('checking')
    const check = await validateModelFile(original, format)
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
          ? { text: `Optimized for faster loading: ${formatFileSize(r.originalBytes)} → ${formatFileSize(r.outputBytes)} (textures above 2048 px reduced, unused data removed; size and shape unchanged).`, original }
          : { text: r.reason ?? 'Kept the original file.' },
      )
    } else setOptimizeNote(opts.keepOriginal ? { text: 'Original file uploaded, not optimized.' } : null)
    const res = await service.uploadAsset({ kind: format, file, businessId })
    setChecking(false)
    if (!res.ok) return setError(res.error.message)
    setError(null)
    const unsupported = format === 'glb' ? await unsupportedForSceneViewer(file) : []
    setArWarning(
      unsupported.length
        ? `This GLB requires ${unsupported.join(', ')}, which Google Scene Viewer does not support. It works in the 3D viewer, but Android AR may fail. Ask for a file exported without it.`
        : null,
    )
    const { url, storagePath, status } = res.data
    onChange({ format, url, fileName: file.name, sizeBytes: file.size, status, ...(storagePath ? { storagePath } : {}) })
  }

  const onUrl = () => {
    const url = urlDraft.trim()
    if (!isHttpUrl(url)) return setError('Enter a full URL starting with https://')
    if (!url.toLowerCase().split('?')[0]?.endsWith(`.${format}`)) return setError(`The URL should point to a .${format} file.`)
    setError(null)
    setUrlDraft('')
    onChange(modelAssetFromUrl(url, format))
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-line p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">{info.title}</h4>
          <p className="mt-0.5 text-xs leading-5 text-ink-muted">{info.use}</p>
        </div>
        <Badge tone="neutral">.{format}</Badge>
      </div>

      {asset ? (
        <div className="mt-3 flex items-center gap-3 rounded-lg bg-canvas px-3 py-2.5">
          <FileBox className="size-5 shrink-0 text-ink-muted" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium" title={asset.fileName}>
              {asset.fileName}
            </p>
            <p className="flex flex-wrap items-center gap-x-2 text-xs text-ink-muted">
              {asset.sizeBytes ? formatFileSize(asset.sizeBytes) : asset.url.startsWith('blob:') ? 'Uploaded file' : 'Remote URL'}
              <AssetStatusBadge status={stale ? 'missing' : asset.status} />
            </p>
          </div>
          <Button size="sm" variant="ghost" icon={<Trash2 className="size-4" aria-hidden />} onClick={() => onChange(undefined)} aria-label={`Remove ${format.toUpperCase()} file`}>
            Remove
          </Button>
        </div>
      ) : (
        <div className="mt-3 rounded-lg border border-dashed border-line-strong px-3 py-4 text-center text-xs text-ink-muted">
          No {format.toUpperCase()} file yet.
        </div>
      )}
      {asset?.status === 'session-only' && !stale && (
        <p className="mt-2 text-xs text-info">Stored in this browser session only. Real hosting needs backend storage.</p>
      )}
      {stale && <p className="mt-2 text-xs text-warning">This uploaded file is no longer available after reloading. Upload it again (backend storage needed).</p>}

      <div className="mt-3 flex flex-col gap-2">
        <label
          htmlFor={id}
          className="inline-flex h-8 w-fit cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 text-[13px] font-medium hover:bg-subtle focus-within:outline-2 focus-within:outline-accent"
        >
          {checking ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
          {checking === 'optimizing' ? 'Optimizing model…' : checking ? 'Checking file…' : asset ? `Replace .${format} file` : `Upload .${format} file`}
          <input
            id={id}
            type="file"
            accept={MODEL_RULES[format].extension}
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onFile(f)
              e.target.value = ''
            }}
          />
        </label>
        <div className="flex gap-2">
          <Input
            aria-label={`${format.toUpperCase()} model URL`}
            placeholder={`Or paste a .${format} URL`}
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onUrl()
              }
            }}
            className="h-8 text-[13px]"
          />
          <Button size="sm" onClick={onUrl} disabled={!urlDraft.trim()} icon={<Link2 className="size-4" aria-hidden />}>
            Link
          </Button>
        </div>
        <p className="text-[11px] text-ink-faint">Max {formatFileSize(MODEL_RULES[format].maxBytes)}. The file header is checked to confirm the format.</p>
      </div>
      {optimizeNote && asset && (
        <p className="mt-2 text-xs text-ink-muted">
          {optimizeNote.text}{' '}
          {optimizeNote.original && (
            <button type="button" className="font-medium text-ink underline underline-offset-2" onClick={() => void onFile(optimizeNote.original!, { keepOriginal: true })}>
              Upload the original instead
            </button>
          )}
        </p>
      )}
      {arWarning && asset && <p className="mt-2 text-xs text-warning">{arWarning}</p>}
      {error && (
        <p role="alert" className="mt-2 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  )
}

/** Admin 3D preview (no AR) with the measured-vs-entered scale check (ADR-0006). */
export function ModelPreview({ glb, usdz, dimensions, poster, name }: { glb?: ModelAsset; usdz?: ModelAsset; dimensions: Dimensions; poster?: string; name: string }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading')
  const [progress, setProgress] = useState(0)
  const [measured, setMeasured] = useState<{ x: number; y: number; z: number } | null>(null)
  const [attempt, setAttempt] = useState(0)
  const stale = isStaleSessionAsset(glb)
  // Recomputed live, so editing the dimensions updates the check immediately.
  const scale: ScaleCheck = checkScale(measured, dimensions)
  const readiness = <ArReadiness items={arReadiness({ glb, usdz, preview: state, scale })} />

  if (!glb || stale) {
    return (
      <div className="flex flex-col items-center rounded-[var(--radius-card)] bg-canvas px-6 py-10 text-center">
        <Box className="size-6 text-ink-faint" aria-hidden />
        <p className="mt-3 text-sm font-medium">No 3D preview yet</p>
        <p className="mt-1 max-w-sm text-xs text-ink-muted">
          Add a GLB model to show the 3D viewer and the “View in AR” button. Without one, customers see the photo gallery only.
        </p>
        {readiness}
      </div>
    )
  }

  return (
    <div>
      <div className="relative aspect-[16/10] overflow-hidden rounded-[var(--radius-card)] bg-[radial-gradient(ellipse_at_center,#ffffff_0%,#efede8_100%)]">
        <ModelViewer
          key={`${glb.url}-${attempt}`}
          src={glb.url}
          iosSrc={usdz?.url}
          poster={poster}
          alt={`3D model of ${name}`}
          className="absolute inset-0"
          onProgress={setProgress}
          onLoad={({ dimensions: d }) => {
            setState('loaded')
            setMeasured(d)
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
              <p className="mt-2 text-sm font-medium">The model could not be loaded</p>
              <p className="mt-1 text-xs text-ink-muted">Check that the URL is reachable and allows cross-origin requests (CORS), or upload the file again.</p>
              <Button
                size="sm"
                className="mt-3"
                onClick={() => {
                  setState('loading')
                  setAttempt((a) => a + 1)
                }}
              >
                Try again
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
const LEVEL_TEXT = { ready: 'Ready', warning: 'Needs attention', missing: 'Not available' }

/** What customers get on each platform, so the admin knows before publishing (ADR-0018). */
function ArReadiness({ items }: { items: ReadinessItem[] }) {
  return (
    <section aria-label="AR readiness" className="mt-4 w-full rounded-[var(--radius-card)] border border-line p-4 text-left">
      <h4 className="text-sm font-semibold">AR readiness</h4>
      <ul className="mt-3 space-y-2.5">
        {items.map((i) => (
          <li key={i.key} className="flex items-start gap-2.5 text-xs">
            {LEVEL_ICON[i.level]}
            <div>
              <p className="font-medium text-ink">
                {i.label}
                <span className="sr-only"> ({LEVEL_TEXT[i.level]})</span>
              </p>
              <p className="mt-0.5 text-ink-muted">{i.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}

const MISMATCH_HINT: Record<ScaleMismatchReason, (k?: number) => string> = {
  'axis-swap': () => 'Likely cause: width and depth are swapped. The model is turned 90°; re-export it with its front facing forward (+Z).',
  'wrong-unit': () => 'Likely cause: the numbers are in the other unit. Check the centimetres / inches switch.',
  'model-units': (k) => `Likely cause: the file is not in metres (about ${k && k >= 1 ? Math.round(k) : `1/${Math.round(1 / (k ?? 1))}`}× too ${k && k >= 1 ? 'large' : 'small'}). Re-export it in metres.`,
  uniform: (k) => `The model is about ${k?.toFixed(2)}× the entered size on every axis. Check the file's export scale or the dimensions.`,
}

function ScaleReport({ scale }: { scale: ScaleCheck }) {
  const m = (v: number) => `${Math.round(v * 100)} cm`
  if (scale.status === 'unknown')
    return <p className="mt-2 text-xs text-ink-muted">Enter width, height and depth to compare them with the model’s real size.</p>
  const sizes = (s: { x: number; y: number; z: number }) => `${m(s.x)} × ${m(s.y)} × ${m(s.z)}`
  return (
    <div className="mt-3 flex items-start gap-2.5 text-xs">
      {scale.status === 'verified' ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
      ) : (
        <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      )}
      <div>
        <p className="font-medium text-ink">{scale.status === 'verified' ? 'Scale verified: the model matches the entered dimensions (within 5%, or 1 cm for small pieces).' : 'AR scale unverified: the model does not match the entered dimensions.'}</p>
        <p className="mt-0.5 text-ink-muted">
          Model measures W × H × D {sizes(scale.measured)}. Entered {sizes(scale.expected)}.
          {scale.status === 'mismatch' && ' The model is never rescaled automatically. Fix the model file or the dimensions.'}
        </p>
        {scale.status === 'mismatch' && scale.reason && <p className="mt-0.5 text-ink">{MISMATCH_HINT[scale.reason](scale.factor)}</p>}
      </div>
    </div>
  )
}
