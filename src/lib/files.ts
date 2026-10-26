// Client-side file validation. Real checks only: MIME/extension, size, and file structure.
import type { ModelAsset, ModelFormat } from '@/domain/types'
import { formatFileSize } from './format'

export const MB = 1024 * 1024

/** "15 MB", "16.4 MB": megabytes without a trailing ".0", so limits read the same in hints and errors. */
export function formatMb(bytes: number): string {
  return `${Math.round((bytes / MB) * 10) / 10} MB`
}

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

/**
 * Photos sent with a 3D model request (S4 R-S4-5): originals, never downscaled (the modeller needs them). Under
 * `minLongSide` px on the long side is a warning, not a refusal. No HEIC: iPhone Safari converts to JPEG.
 */
export const REQUEST_PHOTO_RULES = {
  accept: ['image/jpeg', 'image/png', 'image/webp'],
  extensions: ['.jpg', '.jpeg', '.png', '.webp'],
  maxBytes: 10 * MB,
  minLongSide: 1000,
}

/**
 * Upload limits for AR (AR audit 2026-10-26, AR-10; raised by the owner 2026-10-26 to 30 MB GLB and 40 MB USDZ).
 * Android AR now opens inside Chrome first (WebXR, ADR-0035), which handles larger GLBs than Google Scene Viewer
 * (it recommends 10 MB or less; the editor still warns above LARGE_MODEL_BYTES). A USDZ is opened by Quick Look on
 * the phone. Client-side only: the storage buckets keep their own 50 MB limit.
 */
export const MODEL_RULES: Record<ModelFormat, { extension: string; maxBytes: number; why: string }> = {
  glb: { extension: '.glb', maxBytes: 30 * MB, why: 'Larger files often fail to open in Android AR. Reduce the textures (2048 px or less) or the polygon count and export again.' },
  usdz: { extension: '.usdz', maxBytes: 40 * MB, why: 'Larger files are slow to open in iPhone AR (Quick Look). Reduce the textures (2048 px or less) and export again.' },
}

/** Textures above this many pixels on a side slow AR down and can run phones out of memory (Scene Viewer guidance). */
export const MAX_TEXTURE_PX = 2048

/** `warning`: the file is accepted, but something will make AR slow (shown to the admin, never blocks the upload). */
export type FileCheck = { ok: true; warning?: string } | { ok: false; message: string }

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

const GLB_MAGIC = 0x46546c67 // "glTF"
const CHUNK_JSON = 0x4e4f534a
const CHUNK_BIN = 0x004e4942
const ZIP_LOCAL = 0x04034b50
const ZIP_END = 0x06054b50

/** The GLB's JSON chunk, or a reason it is not a well-formed glTF 2.0 binary. Reads the header and JSON only. */
async function readGlb(file: Blob): Promise<{ ok: true; json: Record<string, unknown>; binStart: number } | { ok: false; problem: string }> {
  if (file.size < 20) return { ok: false, problem: 'header check failed' }
  const head = new DataView((await readHeader(file, 20)).buffer)
  if (head.getUint32(0, true) !== GLB_MAGIC) return { ok: false, problem: 'header check failed' }
  if (head.getUint32(4, true) !== 2) return { ok: false, problem: 'it is not glTF 2.0' }
  const declared = head.getUint32(8, true)
  if (declared !== file.size) return { ok: false, problem: `it declares ${formatFileSize(declared)} but the file is ${formatFileSize(file.size)}, so it is cut off or damaged` }
  const jsonLength = head.getUint32(12, true)
  if (head.getUint32(16, true) !== CHUNK_JSON || jsonLength === 0 || 20 + jsonLength > file.size) return { ok: false, problem: 'its JSON chunk is missing or damaged' }
  let json: Record<string, unknown>
  try {
    json = JSON.parse(new TextDecoder().decode(await readHeader(file.slice(20, 20 + jsonLength), jsonLength))) as Record<string, unknown>
  } catch {
    return { ok: false, problem: 'its JSON chunk cannot be read' }
  }
  const version = (json.asset as { version?: unknown } | undefined)?.version
  if (typeof version !== 'string' || !version.startsWith('2.')) return { ok: false, problem: 'it is not glTF 2.0' }
  const next = 20 + jsonLength
  if (next < file.size) {
    if (next + 8 > file.size) return { ok: false, problem: 'its binary chunk is damaged' }
    const bin = new DataView((await readHeader(file.slice(next, next + 8), 8)).buffer)
    if (bin.getUint32(4, true) !== CHUNK_BIN || next + 8 + bin.getUint32(0, true) > file.size) return { ok: false, problem: 'its binary chunk is damaged' }
  }
  return { ok: true, json, binStart: next + 8 }
}

/** Width and height from a PNG or JPEG header, or null for other formats (or a header that cannot be read). */
function imageSize(b: Uint8Array): { w: number; h: number } | null {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
  if (b.length >= 24 && v.getUint32(0) === 0x89504e47 && v.getUint32(12) === 0x49484452) return { w: v.getUint32(16), h: v.getUint32(20) }
  if (b.length < 4 || v.getUint16(0) !== 0xffd8) return null
  for (let i = 2; i + 9 < b.length; ) {
    if (b[i] !== 0xff) return null
    const marker = b[i + 1]!
    // SOF0..SOF15, except DHT (C4), JPG (C8) and DAC (CC), carry the frame size.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { w: v.getUint16(i + 7), h: v.getUint16(i + 5) }
    i += 2 + v.getUint16(i + 2)
  }
  return null
}

/** The largest embedded texture (PNG/JPEG in the BIN chunk), read from the image headers only. */
async function largestTexture(file: Blob, json: Record<string, unknown>, binStart: number): Promise<{ w: number; h: number } | null> {
  const images = Array.isArray(json.images) ? (json.images as { bufferView?: unknown }[]) : []
  const views = Array.isArray(json.bufferViews) ? (json.bufferViews as { byteOffset?: unknown; byteLength?: unknown }[]) : []
  let largest: { w: number; h: number } | null = null
  for (const img of images.slice(0, 64)) {
    const view = typeof img.bufferView === 'number' ? views[img.bufferView] : undefined
    if (!view || typeof view.byteLength !== 'number') continue
    const start = binStart + (typeof view.byteOffset === 'number' ? view.byteOffset : 0)
    const length = Math.min(view.byteLength, 64 * 1024)
    if (start + length > file.size) continue
    const size = imageSize(await readHeader(file.slice(start, start + length), length))
    if (size && (!largest || Math.max(size.w, size.h) > Math.max(largest.w, largest.h))) largest = size
  }
  return largest
}

/** USDZ = an uncompressed zip whose first file is the USD scene (Apple's USDZ rules). Reads two small slices. */
async function usdzProblem(file: Blob): Promise<string | null> {
  if (file.size < 52) return 'header check failed'
  const head = new DataView((await readHeader(file, 30)).buffer)
  if (head.getUint32(0, true) !== ZIP_LOCAL) return 'header check failed'
  const nameLength = head.getUint16(26, true)
  const name = new TextDecoder().decode(await readHeader(file.slice(30, 30 + nameLength), nameLength)).toLowerCase()
  if (!/\.usd[ac]?$/.test(name)) return 'it does not start with a USD scene (.usdc or .usda file)'
  if (head.getUint16(8, true) !== 0) return 'its contents are compressed (USDZ must store files uncompressed)'
  const tailStart = Math.max(0, file.size - (22 + 0xffff))
  const tail = await readHeader(file.slice(tailStart), file.size - tailStart)
  const view = new DataView(tail.buffer)
  for (let i = tail.length - 22; i >= 0; i--) if (view.getUint32(i, true) === ZIP_END) return null
  return 'the end of the archive is missing, so it is cut off or damaged'
}

/**
 * Format check before upload: extension, size and structure (cheap, client-side; the server checks size and type only).
 * GLB: glTF 2.0 header, declared length = file size, JSON chunk (asset.version 2.x) and binary chunk inside the file.
 * USDZ: zip whose first entry is a .usdc/.usda scene, stored uncompressed, with an end-of-archive record.
 */
export async function validateModelFile(file: File, format: ModelFormat): Promise<FileCheck> {
  const rule = MODEL_RULES[format]
  if (extOf(file.name) !== rule.extension)
    return { ok: false, message: `${file.name}: expected a ${rule.extension} file.` }
  if (file.size > rule.maxBytes)
    return { ok: false, message: `${file.name} is ${formatMb(file.size)}. Maximum is ${formatMb(rule.maxBytes)}. ${rule.why}` }
  const glb = format === 'glb' ? await readGlb(file) : null
  const problem = glb ? (glb.ok ? null : glb.problem) : await usdzProblem(file)
  if (problem) return { ok: false, message: `${file.name} does not look like a valid ${format.toUpperCase()} file: ${problem}. Export it again.` }
  const texture = glb?.ok ? await largestTexture(file, glb.json, glb.binStart).catch(() => null) : null
  if (texture && Math.max(texture.w, texture.h) > MAX_TEXTURE_PX)
    return { ok: true, warning: `${file.name} has a ${texture.w} × ${texture.h} px texture. Textures above ${MAX_TEXTURE_PX} px make AR slow and can fail on phones; export with textures of ${MAX_TEXTURE_PX} px or less.` }
  return { ok: true }
}

/**
 * glTF extensions Google Scene Viewer documents as supported (developers.google.com/ar/develop/scene-viewer).
 * A GLB that *requires* any other extension (Draco, meshopt, KTX2, WebP, quantization...) may render in our
 * 3D viewer but fail in Android AR.
 */
export const SCENE_VIEWER_EXTENSIONS = ['KHR_materials_unlit', 'KHR_texture_transform', 'KHR_materials_pbrSpecularGlossiness']

/** The GLB's `extensionsRequired` (empty when none), or undefined when the file cannot be read. */
export async function readRequiredExtensions(file: Blob): Promise<string[] | undefined> {
  try {
    const r = await readGlb(file)
    if (!r.ok) return undefined
    return Array.isArray(r.json.extensionsRequired) ? r.json.extensionsRequired.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return undefined
  }
}

/** Required extensions Scene Viewer does not support. */
export function sceneViewerUnsupported(required: readonly string[] | undefined): string[] {
  return (required ?? []).filter((x) => !SCENE_VIEWER_EXTENSIONS.includes(x))
}

/**
 * The `extensionsRequired` of a linked GLB, reading only its header and JSON chunk from the stream (the rest of the
 * download is cancelled). Undefined when the link cannot be read here (CORS, network, not a GLB).
 */
export async function fetchRequiredExtensions(url: string): Promise<string[] | undefined> {
  try {
    const res = await fetch(url)
    if (!res.ok || !res.body) return undefined
    const reader = res.body.getReader()
    const parts: Uint8Array[] = []
    let size = 0
    let need = 20
    while (size < need) {
      const { done, value } = await reader.read()
      if (done) break
      parts.push(value)
      size += value.length
      if (need === 20 && size >= 20) {
        const head = new DataView(concat(parts, 20).buffer)
        if (head.getUint32(0, true) !== GLB_MAGIC || head.getUint32(16, true) !== CHUNK_JSON) break
        need = 20 + head.getUint32(12, true)
      }
    }
    void reader.cancel().catch(() => {})
    if (size < need || need === 20) return undefined
    const json = JSON.parse(new TextDecoder().decode(concat(parts, need).subarray(20))) as { extensionsRequired?: unknown }
    return Array.isArray(json.extensionsRequired) ? json.extensionsRequired.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return undefined
  }
}

function concat(parts: Uint8Array[], length: number): Uint8Array {
  const out = new Uint8Array(length)
  let at = 0
  for (const p of parts) {
    if (at >= length) break
    const take = p.subarray(0, length - at)
    out.set(take, at)
    at += take.length
  }
  return out
}

/** Required glTF extensions of a GLB that Scene Viewer does not support. Empty when none or unreadable. */
export async function unsupportedForSceneViewer(file: Blob): Promise<string[]> {
  return sceneViewerUnsupported(await readRequiredExtensions(file))
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

/** Model links must be https: Scene Viewer opens them with scheme=https and an http file is mixed content (AR-09). */
export function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}
