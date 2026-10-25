import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ImageTooLargeError, squareResize } from './image'

// jsdom has no canvas and no image decoding: both are mocked here, and the test checks what is asked of them.
let drawImage: ReturnType<typeof vi.fn>
let canvases: HTMLCanvasElement[]
let encodes: { type: string; quality?: number }[]
/** Which output types the mocked canvas can encode (Safari before 17 could not write WebP and returns PNG). */
let encodable: Set<string>

beforeEach(() => {
  drawImage = vi.fn()
  canvases = []
  encodes = []
  encodable = new Set(['image/webp', 'image/jpeg'])
  const create = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string, opts?: ElementCreationOptions) => {
    const el = create(tag, opts)
    if (tag === 'canvas') canvases.push(el as HTMLCanvasElement)
    return el
  }) as typeof document.createElement)
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({ drawImage, imageSmoothingQuality: 'low' })) as never)
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback, type?: string, quality?: number) {
    encodes.push({ type: type ?? 'image/png', quality })
    const out = type && encodable.has(type) ? type : 'image/png'
    cb(new Blob([new Uint8Array(1000)], { type: out }))
  })
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn(async () => ({ width: 800, height: 600, close: vi.fn() })),
  )
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

/** A minimal JPEG header: SOI, an APP0 segment, then a baseline SOF0 frame of the given size. */
function jpeg(w: number, h: number): File {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 255, w >> 8, w & 255, 0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]
  return new File([new Uint8Array([0xff, 0xd8, ...app0, ...sof0, 0xff, 0xd9])], 'me.jpg', { type: 'image/jpeg' })
}
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]
const le24 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255]
function png(w: number, h: number): File {
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  const ihdr = [...be32(13), 0x49, 0x48, 0x44, 0x52, ...be32(w), ...be32(h), 8, 6, 0, 0, 0, 0, 0, 0, 0]
  return new File([new Uint8Array([...sig, ...ihdr])], 'me.png', { type: 'image/png' })
}
function webpVp8x(w: number, h: number): File {
  const ascii = (t: string) => [...t].map((c) => c.charCodeAt(0))
  const chunk = [...ascii('VP8X'), 10, 0, 0, 0, 0, 0, 0, 0, ...le24(w - 1), ...le24(h - 1)]
  return new File([new Uint8Array([...ascii('RIFF'), 22, 0, 0, 0, ...ascii('WEBP'), ...chunk])], 'me.webp', { type: 'image/webp' })
}
const photo = () => jpeg(800, 600)

describe('squareResize', () => {
  it('squareResize crops to a square of the requested size', async () => {
    const out = await squareResize(photo(), 128)
    const canvas = canvases.at(-1)!
    expect([canvas.width, canvas.height]).toEqual([128, 128])
    // 800 x 600 landscape: the centre 600 x 600 square, drawn over the whole canvas.
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 100, 0, 600, 600, 0, 0, 128, 128)
    expect(out.type).toBe('image/webp')
    expect(encodes[0]).toEqual({ type: 'image/webp', quality: 0.9 })
  })

  it('defaults to 256 px and crops a portrait photo from the middle', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 300, height: 500, close: vi.fn() })))
    await squareResize(photo())
    const canvas = canvases.at(-1)!
    expect([canvas.width, canvas.height]).toEqual([256, 256])
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 100, 300, 300, 0, 0, 256, 256)
  })

  it('falls back to JPEG when the browser cannot write WebP', async () => {
    encodable = new Set(['image/jpeg'])
    const out = await squareResize(photo())
    expect(out.type).toBe('image/jpeg')
    expect(encodes.map((e) => e.type)).toEqual(['image/webp', 'image/jpeg'])
    expect(encodes[1]!.quality).toBe(0.9)
  })

  it('rejects a file that is not a readable image (both createImageBitmap forms and <img> fail)', async () => {
    const decode = vi.fn(async () => Promise.reject(new Error('decode')))
    vi.stubGlobal('createImageBitmap', decode)
    // jsdom never loads or fails an <img>; a browser fires error for a broken file.
    class BrokenImage {
      onerror: (() => void) | null = null
      onload: (() => void) | null = null
      set src(_v: string) {
        queueMicrotask(() => this.onerror?.())
      }
    }
    vi.stubGlobal('Image', BrokenImage)
    await expect(squareResize(photo())).rejects.toThrow(/couldn't be read/)
    expect(decode).toHaveBeenCalledTimes(2)
  })

  it('refuses an image over 100 megapixels from its header as too large, before decoding it', async () => {
    const decode = vi.fn(async () => ({ width: 10, height: 10, close: vi.fn() }))
    vi.stubGlobal('createImageBitmap', decode)
    for (const bomb of [jpeg(12_000, 9000), png(20_000, 20_000), webpVp8x(16_383, 16_383)]) {
      const err = await squareResize(bomb).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(ImageTooLargeError)
    }
    expect(decode).not.toHaveBeenCalled()
  })

  it('accepts phone-size photos up to 100 megapixels', async () => {
    await expect(squareResize(jpeg(8160, 6120))).resolves.toBeInstanceOf(Blob) // 50 MP
    await expect(squareResize(png(10_000, 10_000))).resolves.toBeInstanceOf(Blob) // exactly 100 MP
  })

  it('a corrupt file is unreadable, not too large', async () => {
    const corrupt = new File([new Uint8Array([0xff, 0xd8, 0x12, 0x34, 0, 0, 0, 0, 0, 0, 0])], 'x.jpg', { type: 'image/jpeg' })
    const err = await squareResize(corrupt).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(ImageTooLargeError)
    expect((err as Error).message).toMatch(/couldn't be read/)
  })

  it('refuses a file whose header has no image size', async () => {
    const decode = vi.fn(async () => ({ width: 10, height: 10, close: vi.fn() }))
    vi.stubGlobal('createImageBitmap', decode)
    await expect(squareResize(new File([new Uint8Array(64)], 'x.jpg', { type: 'image/jpeg' }))).rejects.toThrow(/couldn't be read/)
    expect(decode).not.toHaveBeenCalled()
  })

  it('tries createImageBitmap with options, then without, when the options form is not supported', async () => {
    const decode = vi.fn(async (_f: Blob, opts?: unknown) => {
      if (opts) throw new TypeError('options not supported')
      return { width: 400, height: 400, close: vi.fn() }
    })
    vi.stubGlobal('createImageBitmap', decode)
    await expect(squareResize(webpVp8x(400, 400))).resolves.toBeInstanceOf(Blob)
    expect(decode).toHaveBeenCalledTimes(2)
    expect(decode.mock.calls[0]![1]).toEqual({ imageOrientation: 'from-image' })
    expect(decode.mock.calls[1]).toHaveLength(1)
  })
})
