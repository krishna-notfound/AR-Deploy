// Runs the GLB work (optimizing, measuring, uniform scaling) off the main thread so the editor stays responsive on large files.
import { applyUniformScale, measureGlb, optimizeGlb } from './modelOptimize'

export type WorkerRequest = { op: 'optimize'; file: File } | { op: 'measure'; file: File } | { op: 'scale'; file: File; factor: number }

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data
  try {
    if (req.op === 'optimize') return self.postMessage(await optimizeGlb(req.file))
    const bytes = new Uint8Array(await req.file.arrayBuffer())
    if (req.op === 'measure') return self.postMessage(await measureGlb(bytes))
    const scaled = await applyUniformScale(bytes, req.factor)
    self.postMessage(new File([scaled as BlobPart], req.file.name, { type: req.file.type }))
  } catch {
    self.postMessage(null) // the caller treats null as "could not": measure shows no panel, scale reports the failure
  }
}
