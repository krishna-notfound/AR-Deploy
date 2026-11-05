import { describe, expect, it } from 'vitest'
import * as files from './files'

/** A file that reports `size` bytes without allocating them. */
const sized = (name: string, type: string, size: number) => {
  const f = new File(['x'], name, { type })
  Object.defineProperty(f, 'size', { value: size })
  return f
}

describe('S4 Task 2: REQUEST_PHOTO_RULES', () => {
  it('a 10 MB + 1 byte JPEG is refused with the size message; a .gif with the type message; a .heic is refused', () => {
    const rules = files.REQUEST_PHOTO_RULES
    expect(rules).toEqual({ accept: ['image/jpeg', 'image/png', 'image/webp'], extensions: ['.jpg', '.jpeg', '.png', '.webp'], maxBytes: 10 * files.MB, minLongSide: 1000 })
    expect(files.validateImageFile(sized('ok.jpg', 'image/jpeg', 10 * files.MB), rules)).toEqual({ ok: true })
    const big = files.validateImageFile(sized('big.jpg', 'image/jpeg', 10 * files.MB + 1), rules)
    expect(big.ok === false && big.message).toMatch(/^big\.jpg is .*Maximum is 10\.0 MB\.$/)
    const gif = files.validateImageFile(sized('a.gif', 'image/gif', 100), rules)
    expect(gif.ok === false && gif.message).toBe('a.gif: unsupported file type. Use .jpg, .jpeg, .png, .webp.')
    expect(files.validateImageFile(sized('IMG_1.heic', 'image/heic', 100), rules).ok).toBe(false)
  })
})

describe('ADR-0050: checkCataloguePdf', () => {
  const pdf = (name: string, type = 'application/pdf') => new File(['%PDF-1.7\n1 0 obj'], name, { type })
  it('accepts a real PDF, also when the browser gives no type', async () => {
    expect(files.CATALOGUE_MAX_BYTES).toBe(20 * files.MB)
    expect(await files.checkCataloguePdf(pdf('range.pdf'))).toEqual({ ok: true })
    expect(await files.checkCataloguePdf(pdf('range.PDF', ''))).toEqual({ ok: true })
  })
  it('refuses a file that is not a PDF: wrong type or name, or a PDF name on other content', async () => {
    expect(await files.checkCataloguePdf(new File(['x'], 'a.png', { type: 'image/png' }))).toEqual({ ok: false, reason: 'notPdf' })
    expect(await files.checkCataloguePdf(new File(['not a pdf at all'], 'a.pdf', { type: 'application/pdf' }))).toEqual({ ok: false, reason: 'notPdf' })
    expect(await files.checkCataloguePdf(new File([], 'empty.pdf', { type: 'application/pdf' }))).toEqual({ ok: false, reason: 'notPdf' })
  })
  it('refuses more than 20 MB (20 MB itself is fine)', async () => {
    expect(await files.checkCataloguePdf(Object.defineProperty(pdf('ok.pdf'), 'size', { value: 20 * files.MB }))).toEqual({ ok: true })
    expect(await files.checkCataloguePdf(Object.defineProperty(pdf('big.pdf'), 'size', { value: 20 * files.MB + 1 }))).toEqual({ ok: false, reason: 'tooBig' })
  })
})
