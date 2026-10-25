// Browser-side image helpers (canvas only, no dependency).

/** Largest image we decode: 100 megapixels (phones take 12 to 50 MP photos; beyond this is a decode bomb). */
export const MAX_PIXELS = 100_000_000
const UNREADABLE = "The image couldn't be read."

/** The image is readable but bigger than MAX_PIXELS, so it is not decoded. */
export class ImageTooLargeError extends Error {
  constructor() {
    super('The image is too large to process.')
    this.name = 'ImageTooLargeError'
  }
}
/** The size header sits near the start; JPEG metadata (EXIF, ICC) can push it a few hundred KB in. */
const HEAD_BYTES = 8 * 1024 * 1024

/**
 * Crops an image to its centre square and scales it to `size` x `size` px, for profile photos. The result is WebP at
 * quality 0.9, or JPEG at 0.9 where the browser cannot write WebP (it then hands back PNG, which we do not keep).
 * Rejects with ImageTooLargeError above MAX_PIXELS (read from the header, before decoding), and with a plain Error
 * when the file cannot be decoded as an image.
 */
export async function squareResize(file: File, size = 256): Promise<Blob> {
  // Read the size from the header first: a small file can still claim a huge canvas (a decode bomb).
  const dims = readImageSize(await readHead(file))
  if (!dims || !dims.width || !dims.height) throw new Error(UNREADABLE)
  if (dims.width * dims.height > MAX_PIXELS) throw new ImageTooLargeError()
  const source = await decode(file).catch(() => {
    throw new Error(UNREADABLE)
  })
  try {
    const side = Math.min(source.width, source.height)
    if (!side) throw new Error('The image has no pixels.')
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas is not available.')
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(source.image, Math.round((source.width - side) / 2), Math.round((source.height - side) / 2), side, side, 0, 0, size, size)
    const webp = await encode(canvas, 'image/webp')
    if (webp?.type === 'image/webp') return webp
    const jpeg = await encode(canvas, 'image/jpeg')
    if (jpeg?.type === 'image/jpeg') return jpeg
    throw new Error('The image could not be encoded.')
  } finally {
    source.close()
  }
}

interface Decoded {
  image: CanvasImageSource
  width: number
  height: number
  close: () => void
}

async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    const fromBitmap = (bmp: ImageBitmap): Decoded => ({ image: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() })
    try {
      // Honours the photo's EXIF orientation, so phone portraits are not drawn sideways.
      return fromBitmap(await createImageBitmap(file, { imageOrientation: 'from-image' }))
    } catch {
      // Older engines refuse the options argument: try the plain form, then an <img>.
    }
    try {
      return fromBitmap(await createImageBitmap(file))
    } catch {
      // Fall through to <img>.
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('The image could not be read.'))
      el.src = url
    })
    return { image: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} }
  } finally {
    URL.revokeObjectURL(url)
  }
}

function encode(canvas: HTMLCanvasElement, type: 'image/webp' | 'image/jpeg'): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, 0.9))
}

async function readHead(file: Blob): Promise<Uint8Array> {
  const head = file.slice(0, HEAD_BYTES)
  if (typeof head.arrayBuffer === 'function') return new Uint8Array(await head.arrayBuffer())
  return new Uint8Array(
    await new Promise<ArrayBuffer>((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result as ArrayBuffer)
      r.onerror = () => reject(r.error)
      r.readAsArrayBuffer(head)
    }),
  )
}

/** Width and height from a PNG, JPEG or WebP header, without decoding the pixels; null when there is none. */
export function readImageSize(b: Uint8Array): { width: number; height: number } | null {
  const be16 = (i: number) => (b[i]! << 8) | b[i + 1]!
  const be32 = (i: number) => ((b[i]! << 24) | (b[i + 1]! << 16) | (b[i + 2]! << 8) | b[i + 3]!) >>> 0
  const le16 = (i: number) => b[i]! | (b[i + 1]! << 8)
  const le24 = (i: number) => b[i]! | (b[i + 1]! << 8) | (b[i + 2]! << 16)
  const ascii = (i: number, n: number) => String.fromCharCode(...b.subarray(i, i + n))

  // PNG: signature, then the IHDR chunk.
  if (b.length >= 24 && b[0] === 0x89 && ascii(1, 3) === 'PNG' && ascii(12, 4) === 'IHDR') return { width: be32(16), height: be32(20) }

  // JPEG: walk the segments to the first start-of-frame.
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2
    while (i + 9 <= b.length) {
      if (b[i] !== 0xff) return null
      const marker = b[i + 1]!
      if (marker === 0xff) {
        i += 1 // fill byte
        continue
      }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) {
        i += 2 // markers without a length
        continue
      }
      if (marker === 0xd9 || marker === 0xda) return null // end of image or scan data before any frame
      const isFrame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
      if (isFrame) return { width: be16(i + 7), height: be16(i + 5) }
      i += 2 + be16(i + 2)
    }
    return null
  }

  // WebP: RIFF container; lossy (VP8), lossless (VP8L) or extended (VP8X).
  if (b.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') {
    const kind = ascii(12, 4)
    if (kind === 'VP8X') return { width: 1 + le24(24), height: 1 + le24(27) }
    if (kind === 'VP8L' && b[20] === 0x2f) {
      const [b1, b2, b3, b4] = [b[21]!, b[22]!, b[23]!, b[24]!]
      return { width: 1 + (((b2 & 0x3f) << 8) | b1), height: 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)) }
    }
    if (kind === 'VP8 ' && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) return { width: le16(26) & 0x3fff, height: le16(28) & 0x3fff }
  }
  return null
}
