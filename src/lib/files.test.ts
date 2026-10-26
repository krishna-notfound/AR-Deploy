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
