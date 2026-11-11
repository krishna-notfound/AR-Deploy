import { afterEach, describe, expect, it, vi } from 'vitest'
import { decode, imageSize } from './image'

// jsdom has no image decoding: createImageBitmap is mocked, and the tests check what is asked of it.
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

describe('decode', () => {
  it('tries createImageBitmap with options, then without, when the options form is not supported', async () => {
    const bitmap = vi.fn(async (_f: Blob, opts?: unknown) => {
      if (opts) throw new TypeError('options not supported')
      return { width: 400, height: 400, close: vi.fn() }
    })
    vi.stubGlobal('createImageBitmap', bitmap)
    const out = await decode(webpVp8x(400, 400))
    expect([out.width, out.height]).toEqual([400, 400])
    expect(bitmap).toHaveBeenCalledTimes(2)
    expect(bitmap.mock.calls[0]![1]).toEqual({ imageOrientation: 'from-image' })
    expect(bitmap.mock.calls[1]).toHaveLength(1)
  })

  it('rejects a file that cannot be decoded (both createImageBitmap forms and <img> fail)', async () => {
    const bitmap = vi.fn(async () => Promise.reject(new Error('decode')))
    vi.stubGlobal('createImageBitmap', bitmap)
    // jsdom never loads or fails an <img>; a browser fires error for a broken file.
    class BrokenImage {
      onerror: (() => void) | null = null
      onload: (() => void) | null = null
      set src(_v: string) {
        queueMicrotask(() => this.onerror?.())
      }
    }
    vi.stubGlobal('Image', BrokenImage)
    await expect(decode(jpeg(800, 600))).rejects.toThrow(/could not be read/)
    expect(bitmap).toHaveBeenCalledTimes(2)
  })
})

describe('S4 Task 4: imageSize', () => {
  it('reads the width and height of a JPEG and a PNG from the header, and gives null for a file that is not an image', async () => {
    expect(await imageSize(jpeg(900, 600))).toEqual({ width: 900, height: 600 })
    expect(await imageSize(png(2400, 1600))).toEqual({ width: 2400, height: 1600 })
    expect(await imageSize(new Blob(['GIF89a not read']))).toBeNull()
  })

  it('reads the size of an extended WebP, and of a header that claims more than 100 megapixels', async () => {
    expect(await imageSize(webpVp8x(400, 300))).toEqual({ width: 400, height: 300 })
    expect(await imageSize(png(20_000, 20_000))).toEqual({ width: 20_000, height: 20_000 })
  })
})
