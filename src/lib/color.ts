function channel(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export function parseHex(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m?.[1]) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function contrastRatio(a: string, b: string): number {
  const ra = parseHex(a)
  const rb = parseHex(b)
  if (!ra || !rb) return 1
  const l = (rgb: [number, number, number]) => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])
  const [hi, lo] = [l(ra), l(rb)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

export const DEFAULT_ACCENT = '#7A5C45'

/** Business accent for public pages, falling back when contrast on white is too low. */
export function safeBrandAccent(hex: string | undefined): string {
  if (!hex || !parseHex(hex)) return DEFAULT_ACCENT
  return contrastRatio(hex, '#FFFFFF') >= 4.5 ? hex : DEFAULT_ACCENT
}
