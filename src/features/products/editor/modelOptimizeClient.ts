// Entry point for model optimization (ADR-0019). Small on purpose: glTF-Transform is only downloaded
// (in a worker) when the feature is on and a GLB is uploaded.
import { formatFileSize } from '@/lib/format'
import type { OptimizeResult } from './modelOptimize'

/** On by default (owner 2026-10-26, client question A-2, ADR-0038); `VITE_MODEL_OPTIMIZATION=off` switches it off. */
export const isOptimizationOn = (value: string | undefined): boolean => value !== 'off'
export const MODEL_OPTIMIZATION_ENABLED = isOptimizationOn(import.meta.env.VITE_MODEL_OPTIMIZATION)

/** What the uploader is told after an optimized upload: sizes, and the triangle reduction when there was one. */
export function optimizedNote(r: Pick<OptimizeResult, 'originalBytes' | 'outputBytes' | 'trianglesBefore' | 'trianglesAfter'>): string {
  const n = (v: number) => v.toLocaleString('en-US')
  const simplified = r.trianglesBefore != null && r.trianglesAfter != null && r.trianglesAfter < r.trianglesBefore
  const steps = [simplified ? `${n(r.trianglesBefore!)} → ${n(r.trianglesAfter!)} triangles` : null, 'textures above 2048 px reduced', 'unused data removed'].filter(Boolean).join(', ')
  return `Optimized for faster loading: ${formatFileSize(r.originalBytes)} → ${formatFileSize(r.outputBytes)} (${steps}; looks the same, true size unchanged).`
}

/** Optimizes in a worker. Any worker failure keeps the original file: the upload must never break. */
export function optimizeModel(file: File): Promise<OptimizeResult> {
  const keep = (): OptimizeResult => ({ file, optimized: false, originalBytes: file.size, outputBytes: file.size, reason: 'Kept the original: the optimizer could not run in this browser.' })
  if (typeof Worker === 'undefined') return Promise.resolve(keep())
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./modelOptimize.worker.ts', import.meta.url), { type: 'module' })
    const done = (r: OptimizeResult) => {
      worker.terminate()
      resolve(r)
    }
    worker.onmessage = (e: MessageEvent<OptimizeResult>) => done(e.data)
    worker.onerror = () => done(keep())
    worker.postMessage(file)
  })
}
