import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clampView,
  coversFrame,
  cropFromView,
  fillFrameCrop,
  fitWholeCrop,
  outputSize,
  renderCrop,
  touchesPicture,
  viewFromCrop,
  zoomAroundCenter,
  zoomLimits,
} from './imageCrop'

describe('fitWholeCrop (the whole picture, fitted)', () => {
  it('a wide picture in a 4:5 frame gets a taller crop that extends above and below it', () => {
    const c = fitWholeCrop(2000, 1000, 4 / 5)
    expect(c.width).toBeCloseTo(2000)
    expect(c.height).toBeCloseTo(2500)
    expect(c.x).toBeCloseTo(0)
    expect(c.y).toBeCloseTo(-750)
    expect(c.width / c.height).toBeCloseTo(4 / 5)
  })
  it('a tall picture gets a wider crop that extends left and right', () => {
    const c = fitWholeCrop(1000, 4000, 4 / 5)
    expect(c.height).toBeCloseTo(4000)
    expect(c.width).toBeCloseTo(3200)
    expect(c.x).toBeCloseTo(-1100)
    expect(c.y).toBeCloseTo(0)
  })
  it('a picture already in the frame shape is that crop exactly', () => {
    expect(fitWholeCrop(800, 1000, 4 / 5)).toEqual({ x: 0, y: 0, width: 800, height: 1000 })
  })
})

describe('fillFrameCrop (cover, centred)', () => {
  it('a landscape picture loses its sides', () => {
    const c = fillFrameCrop(2000, 1000, 4 / 5)
    expect(c.height).toBeCloseTo(1000)
    expect(c.width).toBeCloseTo(800)
    expect(c.x).toBeCloseTo(600)
    expect(c.y).toBeCloseTo(0)
  })
  it('a 1:4 portrait loses its top and bottom', () => {
    const c = fillFrameCrop(1000, 4000, 4 / 5)
    expect(c.width).toBeCloseTo(1000)
    expect(c.height).toBeCloseTo(1250)
    expect(c.x).toBeCloseTo(0)
    expect(c.y).toBeCloseTo(1375)
  })
  it('a square picture in a 1:1 frame is the whole picture', () => {
    expect(fillFrameCrop(500, 500, 1)).toEqual({ x: 0, y: 0, width: 500, height: 500 })
  })
})

describe('coversFrame', () => {
  it('is true for a crop inside the picture, with half a pixel of slack', () => {
    expect(coversFrame({ x: 600, y: 0, width: 800, height: 1000 }, 2000, 1000)).toBe(true)
    expect(coversFrame({ x: -0.4, y: 0, width: 800, height: 1000 }, 2000, 1000)).toBe(true)
  })
  it('is false when the crop reaches past any edge', () => {
    expect(coversFrame(fitWholeCrop(2000, 1000, 4 / 5), 2000, 1000)).toBe(false)
    expect(coversFrame({ x: 1300, y: 0, width: 800, height: 1000 }, 2000, 1000)).toBe(false)
  })
  it('is true for the fill crop of any picture', () => {
    for (const [w, h] of [[2000, 1000], [1000, 4000], [800, 1000], [4000, 1000]] as const) {
      expect(coversFrame(fillFrameCrop(w, h, 4 / 5), w, h)).toBe(true)
    }
  })
})

describe('touchesPicture', () => {
  it('needs some overlap with the picture', () => {
    expect(touchesPicture({ x: -50, y: 0, width: 100, height: 100 }, 200, 200)).toBe(true)
    expect(touchesPicture({ x: 200, y: 0, width: 100, height: 100 }, 200, 200)).toBe(false)
    expect(touchesPicture({ x: -100, y: 0, width: 100, height: 100 }, 200, 200)).toBe(false)
  })
})

describe('zoomLimits (cropper zoom: 1 = the picture fitted in the stage)', () => {
  const frame = { width: 320, height: 400 }
  it('whole fits all of the picture in the frame, fill covers the frame', () => {
    expect(zoomLimits({ width: 640, height: 320 }, frame)).toEqual({ whole: 0.5, fill: 1.25 })
    expect(zoomLimits({ width: 160, height: 640 }, frame)).toEqual({ whole: 0.625, fill: 2 })
  })
  it('a picture already in the frame shape has the same whole and fill zoom', () => {
    const z = zoomLimits({ width: 400, height: 500 }, frame)
    expect(z.whole).toBeCloseTo(0.8)
    expect(z.fill).toBeCloseTo(0.8)
  })
})
describe('view <-> crop (the cropper position and zoom)', () => {
  const frame = { width: 320, height: 400 }
  // A 2000x1000 picture shown at 640x320 (fitted in the stage): k = 0.32 display px per picture px.
  const media = { width: 640, height: 320, naturalWidth: 2000, naturalHeight: 1000 }

  it('the whole-picture view gives the whole-picture crop', () => {
    const zoom = frame.width / media.width // the picture is as wide as the frame
    const crop = cropFromView({ crop: { x: 0, y: 0 }, zoom }, media, frame)
    const whole = fitWholeCrop(2000, 1000, 4 / 5)
    expect(crop.x).toBeCloseTo(whole.x, 3)
    expect(crop.y).toBeCloseTo(whole.y, 3)
    expect(crop.width).toBeCloseTo(whole.width, 3)
    expect(crop.height).toBeCloseTo(whole.height, 3)
  })

  it('round-trips an arbitrary crop', () => {
    const area = { x: 420, y: 80, width: 640, height: 800 }
    const view = viewFromCrop(area, media, frame)
    const back = cropFromView(view, media, frame)
    expect(back.x).toBeCloseTo(area.x, 3)
    expect(back.y).toBeCloseTo(area.y, 3)
    expect(back.width).toBeCloseTo(area.width, 3)
    expect(back.height).toBeCloseTo(area.height, 3)
  })

  it('the fill view (zoom to cover, centred) gives the fill crop', () => {
    const zoom = frame.height / media.height // the picture is as tall as the frame
    const crop = cropFromView({ crop: { x: 0, y: 0 }, zoom }, media, frame)
    const fill = fillFrameCrop(2000, 1000, 4 / 5)
    expect(crop.x).toBeCloseTo(fill.x, 3)
    expect(crop.y).toBeCloseTo(fill.y, 3)
    expect(crop.width).toBeCloseTo(fill.width, 3)
  })
})

describe('zoomAroundCenter and clampView', () => {
  const frame = { width: 320, height: 400 }
  const media = { width: 640, height: 320 }
  it('zooming keeps the same picture point under the frame centre', () => {
    const m = { ...media, naturalWidth: 2000, naturalHeight: 1000 }
    const view = { crop: { x: 40, y: -20 }, zoom: 1 }
    const before = cropFromView(view, m, frame)
    const after = cropFromView(zoomAroundCenter(view, 2), m, frame)
    expect(after.x + after.width / 2).toBeCloseTo(before.x + before.width / 2, 6)
    expect(after.y + after.height / 2).toBeCloseTo(before.y + before.height / 2, 6)
    expect(after.width).toBeCloseTo(before.width / 2, 6)
  })
  it('lets the picture move around the frame but not out of it', () => {
    const far = clampView({ crop: { x: 5000, y: -5000 }, zoom: 1 }, media, frame)
    expect(far.crop.x).toBe((640 + 320) / 2 - 24)
    expect(far.crop.y).toBe(-((320 + 400) / 2 - 24))
    const near = { crop: { x: 10, y: -10 }, zoom: 1.5 }
    expect(clampView(near, media, frame)).toEqual(near)
  })
})

describe('outputSize', () => {
  it('keeps small crops as they are and caps the long side', () => {
    expect(outputSize({ x: 0, y: 0, width: 800, height: 1000 }, 2000)).toEqual({ width: 800, height: 1000 })
    expect(outputSize({ x: 0, y: 0, width: 3200, height: 4000 }, 2000)).toEqual({ width: 1600, height: 2000 })
    expect(outputSize({ x: 0, y: 0, width: 4000, height: 1000 }, 2000)).toEqual({ width: 2000, height: 500 })
  })
  it('never returns 0', () => {
    expect(outputSize({ x: 0, y: 0, width: 1, height: 4000 }, 2000)).toEqual({ width: 1, height: 2000 })
  })
})

// ---- renderCrop with a mocked canvas and decoder ----

interface FakeCtx {
  calls: unknown[][]
  fills: string[]
  drawImage: (...a: unknown[]) => void
  fillRect: () => void
  fillStyle: string
  imageSmoothingQuality: string
}

function installCanvas(opts: { webp: boolean; image: { width: number; height: number } }) {
  const contexts: FakeCtx[] = []
  const sizes: { width: number; height: number }[] = []
  const requested: string[] = []
  class FakeOffscreen {
    width: number
    height: number
    ctx: FakeCtx
    constructor(w: number, h: number) {
      this.width = w
      this.height = h
      sizes.push({ width: w, height: h })
      const calls: unknown[][] = []
      const fills: string[] = []
      const ctx: FakeCtx = {
        calls,
        fills,
        drawImage: (...a) => void calls.push(a),
        fillRect: () => void fills.push(ctx.fillStyle),
        fillStyle: '',
        imageSmoothingQuality: '',
      }
      this.ctx = ctx
      contexts.push(ctx)
    }
    getContext() {
      return this.ctx
    }
    async convertToBlob({ type }: { type: string }) {
      requested.push(type)
      const actual = type === 'image/webp' && !opts.webp ? 'image/png' : type
      return new Blob(['x'], { type: actual })
    }
  }
  vi.stubGlobal('OffscreenCanvas', FakeOffscreen)
  const close = vi.fn()
  vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: opts.image.width, height: opts.image.height, close })))
  return { contexts, sizes, requested, close }
}

afterEach(() => vi.unstubAllGlobals())

describe('renderCrop', () => {
  const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' })

  it('draws the crop scaled so the long side is at most 2000, as WebP', async () => {
    const m = installCanvas({ webp: true, image: { width: 4000, height: 3000 } })
    const blob = await renderCrop(file, { x: 0, y: 0, width: 3200, height: 3000 }, { maxSide: 2000 })
    expect(blob.type).toBe('image/webp')
    expect(m.sizes[0]).toEqual({ width: 2000, height: 1875 })
    expect(m.requested).toEqual(['image/webp'])
    expect(m.close).toHaveBeenCalled()
    // the source rect is the crop, the destination fills the canvas
    expect(m.contexts[0]!.calls[0]!.slice(1)).toEqual([0, 0, 3200, 3000, 0, 0, 2000, 1875])
  })

  it('a whole-picture crop that extends past the image leaves the margins transparent (draws only the image part)', async () => {
    const m = installCanvas({ webp: true, image: { width: 2000, height: 1000 } })
    const crop = fitWholeCrop(2000, 1000, 4 / 5) // y from -750 to 1750
    const blob = await renderCrop(file, crop, {})
    expect(blob.type).toBe('image/webp')
    expect(m.sizes[0]).toEqual({ width: 1600, height: 2000 })
    const [, sx, sy, sw, sh, dx, dy, dw, dh] = m.contexts[0]!.calls[0]!
    expect([sx, sy, sw, sh]).toEqual([0, 0, 2000, 1000])
    expect(dx).toBe(0)
    expect(dy).toBeCloseTo(600) // 750 / 2500 * 2000
    expect(dw).toBeCloseTo(1600)
    expect(dh).toBeCloseTo(800)
    expect(m.contexts[0]!.fills).toEqual([]) // nothing painted white for WebP
  })

  it('falls back to JPEG and flattens transparency to white when WebP cannot be written', async () => {
    const m = installCanvas({ webp: false, image: { width: 2000, height: 1000 } })
    const blob = await renderCrop(file, fitWholeCrop(2000, 1000, 4 / 5), {})
    expect(blob.type).toBe('image/jpeg')
    expect(m.requested).toEqual(['image/webp', 'image/jpeg'])
    expect(m.contexts[0]!.fills).toContain('#ffffff')
  })

  it('refuses a picture over 100 megapixels', async () => {
    installCanvas({ webp: true, image: { width: 12000, height: 9000 } })
    await expect(renderCrop(file, { x: 0, y: 0, width: 100, height: 100 }, {})).rejects.toThrow(/too large/i)
  })

  it('refuses a crop that does not touch the picture', async () => {
    installCanvas({ webp: true, image: { width: 100, height: 100 } })
    await expect(renderCrop(file, { x: 500, y: 500, width: 80, height: 100 }, {})).rejects.toThrow()
  })
})

