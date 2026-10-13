// Client-side file validation. Real checks only: MIME/extension, size, and magic bytes.
import type { ModelAsset, ModelFormat } from '@/domain/types'
import { formatFileSize } from './format'

export const MB = 1024 * 1024

export const IMAGE_RULES = {
  accept: ['image/jpeg', 'image/png', 'image/webp'],
  extensions: ['.jpg', '.jpeg', '.png', '.webp'],
  maxBytes: 5 * MB,
  /** Largest data URL we persist in localStorage (ADR-0007). */
  maxPersistBytes: 1.5 * MB,
}

// No SVG: the business-logos bucket refuses it (SVG can carry scripts; supabase/migrations storage).
export const LOGO_RULES = {
  accept: ['image/jpeg', 'image/png', 'image/webp'],
  extensions: ['.jpg', '.jpeg', '.png', '.webp'],
  maxBytes: 2 * MB,
}

export const MODEL_RULES: Record<ModelFormat, { extension: string; maxBytes: number }> = {
  glb: { extension: '.glb', maxBytes: 50 * MB },
  usdz: { extension: '.usdz', maxBytes: 50 * MB },
}

export type FileCheck = { ok: true } | { ok: false; message: string }

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
}

export function validateImageFile(file: File, rules: { accept: string[]; extensions: string[]; maxBytes: number } = IMAGE_RULES): FileCheck {
  const typeOk = rules.accept.includes(file.type) || rules.extensions.includes(extOf(file.name))
  if (!typeOk) return { ok: false, message: `${file.name}: unsupported file type. Use ${rules.extensions.join(', ')}.` }
  if (file.size > rules.maxBytes)
    return { ok: false, message: `${file.name} is ${formatFileSize(file.size)}. Maximum is ${formatFileSize(rules.maxBytes)}.` }
  return { ok: true }
}

async function readHeader(file: Blob, length: number): Promise<Uint8Array> {
  const slice = file.slice(0, length)
  if (typeof slice.arrayBuffer === 'function') return new Uint8Array(await slice.arrayBuffer())
  return new Uint8Array(
    await new Promise<ArrayBuffer>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result as ArrayBuffer)
      r.onerror = () => reject(r.error)
      r.readAsArrayBuffer(slice)
    }),
  )
}

/** GLB files start with ASCII "glTF"; USDZ files are zip archives ("PK\x03\x04"). */
export async function validateModelFile(file: File, format: ModelFormat): Promise<FileCheck> {
  const rule = MODEL_RULES[format]
  if (extOf(file.name) !== rule.extension)
    return { ok: false, message: `${file.name}: expected a ${rule.extension} file.` }
  if (file.size > rule.maxBytes)
    return { ok: false, message: `${file.name} is ${formatFileSize(file.size)}. Maximum is ${formatFileSize(rule.maxBytes)}.` }
  const head = await readHeader(file, 4)
  const magic =
    format === 'glb'
      ? head[0] === 0x67 && head[1] === 0x6c && head[2] === 0x54 && head[3] === 0x46
      : head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04
  if (!magic)
    return {
      ok: false,
      message: `${file.name} does not look like a valid ${format.toUpperCase()} file (header check failed).`,
    }
  return { ok: true }
}

/**
 * glTF extensions Google Scene Viewer documents as supported (developers.google.com/ar/develop/scene-viewer).
 * A GLB that *requires* any other extension (Draco, meshopt, KTX2, WebP, quantization...) may render in our
 * 3D viewer but fail in Android AR.
 */
export const SCENE_VIEWER_EXTENSIONS = ['KHR_materials_unlit', 'KHR_texture_transform', 'KHR_materials_pbrSpecularGlossiness']

/** Required glTF extensions of a GLB that Scene Viewer does not support. Empty when none or unreadable. */
export async function unsupportedForSceneViewer(file: Blob): Promise<string[]> {
  try {
    const head = new DataView((await readHeader(file, 20)).buffer)
    if (head.byteLength < 20 || head.getUint32(0, true) !== 0x46546c67 || head.getUint32(16, true) !== 0x4e4f534a) return []
    const jsonLength = head.getUint32(12, true)
    const json = JSON.parse(new TextDecoder().decode(await readHeader(file.slice(20), jsonLength))) as { extensionsRequired?: unknown }
    const required = Array.isArray(json.extensionsRequired) ? json.extensionsRequired.filter((x): x is string => typeof x === 'string') : []
    return required.filter((x) => !SCENE_VIEWER_EXTENSIONS.includes(x))
  } catch {
    return []
  }
}

export function readAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(r.error ?? new Error('Could not read file'))
    r.readAsDataURL(file)
  })
}

/**
 * Converts an image to a data URL small enough to persist. Large photos are downscaled
 * on a canvas; if the result is still too big the caller gets an error message.
 */
export async function imageToPersistableDataUrl(file: File, maxDim = 1600): Promise<{ ok: true; url: string } | { ok: false; message: string }> {
  try {
    if (file.type === 'image/svg+xml') {
      const url = await readAsDataUrl(file)
      return url.length <= IMAGE_RULES.maxPersistBytes ? { ok: true, url } : { ok: false, message: `${file.name} is too large to store in the demo.` }
    }
    const original = await readAsDataUrl(file)
    if (original.length <= IMAGE_RULES.maxPersistBytes && file.size < 400 * 1024) return { ok: true, url: original }
    const img = await loadImage(original)
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    const ctx = canvas.getContext('2d')
    if (!ctx) return { ok: true, url: original }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    for (const q of [0.85, 0.72, 0.6]) {
      const url = canvas.toDataURL('image/jpeg', q)
      if (url.length <= IMAGE_RULES.maxPersistBytes) return { ok: true, url }
    }
    return { ok: false, message: `${file.name} is too large to store in this demo even after resizing.` }
  } catch {
    return { ok: false, message: `${file.name} could not be read as an image.` }
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Image failed to load'))
    img.src = src
  })
}

// ---- Session-only registry for uploaded 3D files (ADR-0007) ----
const sessionBlobs = new Set<string>()

export function createSessionModelAsset(file: File, format: ModelFormat): ModelAsset {
  const url = URL.createObjectURL(file)
  sessionBlobs.add(url)
  return { format, url, fileName: file.name, sizeBytes: file.size, status: 'session-only' }
}

/** A blob: URL from a previous page load can no longer be resolved. */
export function isStaleSessionAsset(asset: ModelAsset | undefined): boolean {
  return !!asset && asset.url.startsWith('blob:') && !sessionBlobs.has(asset.url)
}

export function modelAssetFromUrl(url: string, format: ModelFormat): ModelAsset {
  const fileName = decodeURIComponent(url.split('?')[0]?.split('/').pop() || `model.${format}`)
  return { format, url, fileName, status: 'valid' }
}

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}
