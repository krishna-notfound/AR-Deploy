// Entry point for model optimization (ADR-0019). Small on purpose: glTF-Transform is only downloaded
// (in a worker) when the feature is on and a GLB is uploaded.
import type { OptimizeResult } from './modelOptimize'

/** Off until the client signs off on what "compression" means (System_arch/audit/APPROVAL_REQUIRED.md). */
export const MODEL_OPTIMIZATION_ENABLED = import.meta.env.VITE_MODEL_OPTIMIZATION === 'on'

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
