import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { squareResize } from './image'

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

const photo = () => new File([new Uint8Array(10)], 'me.jpg', { type: 'image/jpeg' })

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

  it('rejects a file that is not a readable image', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => Promise.reject(new Error('decode'))))
    await expect(squareResize(photo())).rejects.toThrow()
  })
})
