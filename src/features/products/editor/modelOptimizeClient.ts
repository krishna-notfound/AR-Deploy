// Entry point for model optimization (ADR-0019). Small on purpose: glTF-Transform is only downloaded
// (in a worker) when the feature is on and a GLB is uploaded.
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { type Vars, translate } from '@/i18n/translate'
import { formatFileSize } from '@/lib/format'
import type { OptimizeResult } from './modelOptimize'
import type { WorkerRequest } from './modelOptimize.worker'

type T = (key: TranslationKey, vars?: Vars) => string
const tEn: T = (key, vars) => translate('en', key, vars)

/** On by default (owner 2026-10-26, client question A-2, ADR-0038); `VITE_MODEL_OPTIMIZATION=off` switches it off. */
export const isOptimizationOn = (value: string | undefined): boolean => value !== 'off'
export const MODEL_OPTIMIZATION_ENABLED = isOptimizationOn(import.meta.env.VITE_MODEL_OPTIMIZATION)

/** What the uploader is told after an optimized upload: sizes, and the triangle reduction when there was one. */
export function optimizedNote(r: Pick<OptimizeResult, 'originalBytes' | 'outputBytes' | 'trianglesBefore' | 'trianglesAfter'>, t: T = tEn): string {
  const n = (v: number) => v.toLocaleString('en-US')
  const simplified = r.trianglesBefore != null && r.trianglesAfter != null && r.trianglesAfter < r.trianglesBefore
  const steps = [simplified ? t('products.model.optTriangles', { before: n(r.trianglesBefore!), after: n(r.trianglesAfter!) }) : null, t('products.model.optTextures'), t('products.model.optCleanup')].filter(Boolean).join(', ')
  return t('products.model.optimized', { before: formatFileSize(r.originalBytes), after: formatFileSize(r.outputBytes), steps })
}

/** The optimizer reports in English; this picks the matching sentence in the person's language. */
export function optimizeReasonText(reason: string | undefined, t: T = tEn): string {
  if (!reason) return t('products.model.keptOriginal')
  if (/already compact/.test(reason)) return t('products.model.keptCompact')
  if (/could not run in this browser/.test(reason)) return t('products.model.keptNoWorker')
  if (/would have meant/.test(reason)) return t('products.model.keptChanged')
  return t('products.model.keptUnsafe')
}

/** One request to a fresh worker; `fallback` is the answer when workers are missing or the worker fails. */
function inWorker<T>(request: WorkerRequest, fallback: () => T): Promise<T> {
  if (typeof Worker === 'undefined') return Promise.resolve(fallback())
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./modelOptimize.worker.ts', import.meta.url), { type: 'module' })
    const done = (r: T) => {
      worker.terminate()
      resolve(r)
    }
    worker.onmessage = (e: MessageEvent<T>) => done(e.data)
    worker.onerror = () => done(fallback())
    worker.postMessage(request)
  })
}

/** Optimizes in a worker. Any worker failure keeps the original file: the upload must never break. */
export function optimizeModel(file: File): Promise<OptimizeResult> {
  const keep = (): OptimizeResult => ({ file, optimized: false, originalBytes: file.size, outputBytes: file.size, reason: 'Kept the original: the optimizer could not run in this browser.' })
  return inWorker({ op: 'optimize', file }, keep)
}

/** The GLB's size in metres, or null when it cannot be measured (then no scale step is offered; the preview still checks). */
export function measureModel(file: File): Promise<{ x: number; y: number; z: number } | null> {
  return inWorker({ op: 'measure', file }, () => null)
}

/** The GLB scaled uniformly by `factor` (ADR-0058; only on the person's choice), or null when that failed. */
export function scaleModel(file: File, factor: number): Promise<File | null> {
  return inWorker<File | null>({ op: 'scale', file, factor }, () => null)
}
