// Safe GLB size optimization before upload (contract: "automatic model compression"; ADR-0019).
// Scene Viewer only accepts a few glTF extensions, so nothing here adds one: no Draco, meshopt, KTX2,
// WebP or quantization. Only lossless cleanup plus downscaling textures larger than 2048 px (Google's
// limit for Android AR), in the texture's own format. The output is re-read and compared with the input;
// on any doubt the original file is kept.
// Loaded only through modelOptimizeClient.ts, which is off unless VITE_MODEL_OPTIMIZATION=on (client sign-off pending).
import { type Document, WebIO, getBounds } from '@gltf-transform/core'
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, prune, resample } from '@gltf-transform/functions'

/** Scene Viewer's maximum texture size (developers.google.com/ar/develop/scene-viewer). */
export const MAX_TEXTURE_PX = 2048
/** Keep the original unless the result is at least 5% smaller. */
const MIN_SAVING = 0.05

export interface OptimizeResult {
  file: File
  optimized: boolean
  originalBytes: number
  outputBytes: number
  /** Why the original was kept (when optimized is false). */
  reason?: string
}

/** Returns a smaller encoding of the image in the same format, or null to leave it unchanged. */
export type ImageResizer = (image: Uint8Array, mimeType: string, maxPx: number) => Promise<Uint8Array | null>

export interface ModelSummary {
  min: number[]
  max: number[]
  triangles: number
  materials: number
  extensions: string[]
}

export function summarize(doc: Document): ModelSummary {
  const root = doc.getRoot()
  const scene = root.getDefaultScene() ?? root.listScenes()[0]
  const { min, max } = scene ? getBounds(scene) : { min: [0, 0, 0], max: [0, 0, 0] }
  let triangles = 0
  for (const mesh of root.listMeshes())
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMode() !== 4) continue // TRIANGLES; other modes are counted as-is by vertex count below
      triangles += (prim.getIndices()?.getCount() ?? prim.getAttribute('POSITION')?.getCount() ?? 0) / 3
    }
  return { min, max, triangles, materials: root.listMaterials().length, extensions: root.listExtensionsUsed().map((e) => e.extensionName).sort() }
}

/** Reason the optimized model is not equivalent to the original, or null when it is. */
export function compareSummaries(before: ModelSummary, after: ModelSummary): string | null {
  const off = [...before.min, ...before.max].some((v, i) => Math.abs(v - [...after.min, ...after.max][i]!) > 0.001)
  if (off) return 'its size changed'
  if (before.triangles !== after.triangles) return 'its geometry changed'
  if (after.materials > before.materials) return 'its materials changed'
  if (after.extensions.some((e) => !before.extensions.includes(e))) return 'it would need a new glTF extension'
  return null
}

/** Browser resizer: OffscreenCanvas, same MIME type. Skips images with transparency (canvas premultiplies alpha). */
export const canvasResizer: ImageResizer = async (image, mimeType, maxPx) => {
  if (typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap !== 'function') return null
  const bmp = await createImageBitmap(new Blob([image as BlobPart], { type: mimeType }), { premultiplyAlpha: 'none', colorSpaceConversion: 'none' })
  const scale = maxPx / Math.max(bmp.width, bmp.height)
  if (scale >= 1) return null
  const w = Math.round(bmp.width * scale)
  const h = Math.round(bmp.height * scale)
  if (mimeType === 'image/png') {
    // Alpha channels (cut-outs, packed data) would lose precision through the 2D canvas: leave them alone.
    const probe = new OffscreenCanvas(bmp.width, bmp.height).getContext('2d')!
    probe.drawImage(bmp, 0, 0)
    const px = probe.getImageData(0, 0, bmp.width, bmp.height).data
    for (let i = 3; i < px.length; i += 4) if (px[i]! < 255) return null
  }
  const canvas = new OffscreenCanvas(w, h)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bmp, 0, 0, w, h)
  const blob = await canvas.convertToBlob({ type: mimeType, quality: mimeType === 'image/jpeg' ? 0.9 : undefined })
  return blob.type === mimeType ? new Uint8Array(await blob.arrayBuffer()) : null // encoder missing: keep original
}

export async function optimizeGlb(file: File, resize: ImageResizer = canvasResizer): Promise<OptimizeResult> {
  const originalBytes = file.size
  const keep = (reason: string): OptimizeResult => ({ file, optimized: false, originalBytes, outputBytes: originalBytes, reason })
  try {
    const io = new WebIO().registerExtensions(KHRONOS_EXTENSIONS)
    const doc = await io.readBinary(new Uint8Array(await file.arrayBuffer()))
    const before = summarize(doc)
    await doc.transform(dedup(), prune(), resample())
    for (const texture of doc.getRoot().listTextures()) {
      const mime = texture.getMimeType()
      const size = texture.getSize()
      const image = texture.getImage()
      if (!image || !size || Math.max(...size) <= MAX_TEXTURE_PX || (mime !== 'image/png' && mime !== 'image/jpeg')) continue
      const resized = await resize(image, mime, MAX_TEXTURE_PX)
      if (resized && resized.byteLength < image.byteLength) texture.setImage(resized)
    }
    const out = await io.writeBinary(doc)
    const problem = compareSummaries(before, summarize(await io.readBinary(out)))
    if (problem) return keep(`Kept the original: optimizing would have meant ${problem}.`)
    if (out.byteLength > originalBytes * (1 - MIN_SAVING)) return keep('Kept the original: it is already compact.')
    return {
      file: new File([out as BlobPart], file.name, { type: file.type }),
      optimized: true,
      originalBytes,
      outputBytes: out.byteLength,
    }
  } catch {
    return keep('Kept the original: the file could not be optimized safely.')
  }
}
