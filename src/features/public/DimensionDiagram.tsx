import type { Dimensions, LengthUnit } from '@/domain/types'
import { useI18n } from '@/i18n/LanguageProvider'
import { convertLength } from '@/lib/format'

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1))

/**
 * Architectural-style isometric outline of the product's bounding box with
 * W / H / D dimension lines, drawn to the product's real proportions.
 */
export function DimensionDiagram({ dims, unit }: { dims: Dimensions; unit: LengthUnit }) {
  const { t } = useI18n()
  const w = dims.width
  const h = dims.height
  const d = dims.depth
  if (!(w > 0 && h > 0 && d > 0)) return null

  // Isometric projection, normalised to fit a 260×190 drawing area.
  const cos = Math.cos(Math.PI / 6)
  const sin = 0.5
  const rawW = (w + d) * cos
  const rawH = h + (w + d) * sin
  const s = Math.min(220 / rawW, 150 / rawH)
  const W = w * s
  const H = h * s
  const D = d * s
  const ox = 40 + D * cos
  const oy = 30 + H + (W + D) * sin - W * sin

  // Front-bottom-left corner at (ox, oy). x axis → right-down, z axis (depth) → left-down… use classic iso.
  const p = (x: number, y: number, z: number): [number, number] => [ox + x * cos - z * cos, oy + x * sin + z * sin - y]
  const pt = (v: [number, number]) => `${v[0].toFixed(1)},${v[1].toFixed(1)}`

  const A = p(0, 0, 0)
  const B = p(W, 0, 0)
  const C = p(W, H, 0)
  const Dp = p(0, H, 0)
  const E = p(0, 0, -D)
  const F = p(W, 0, -D)
  const G = p(W, H, -D)
  const Hh = p(0, H, -D)

  // Visible faces: front (A B C D), top (D C G H), right (B F G C)
  const faces = [
    [A, B, C, Dp],
    [Dp, C, G, Hh],
    [B, F, G, C],
  ]

  const label = (v: number) => `${fmt(convertLength(v, dims.unit, unit))} ${unit}`
  const off = 14
  // width line along the bottom-front edge
  const wl1 = p(0, 0, 0)
  const wl2 = p(W, 0, 0)
  // depth line along the bottom-right edge
  const dl1 = p(W, 0, 0)
  const dl2 = p(W, 0, -D)
  // height line on the left-front vertical edge
  const hl1 = p(0, 0, 0)
  const hl2 = p(0, H, 0)

  const line = (a: [number, number], b: [number, number], dx: number, dy: number) => ({
    x1: a[0] + dx,
    y1: a[1] + dy,
    x2: b[0] + dx,
    y2: b[1] + dy,
  })
  const wLine = line(wl1, wl2, 0, off)
  const dLine = line(dl1, dl2, off * 0.9, off * 0.5)
  const hLine = line(hl1, hl2, -off, 0)
  const mid = (l: { x1: number; y1: number; x2: number; y2: number }) => [(l.x1 + l.x2) / 2, (l.y1 + l.y2) / 2] as const

  return (
    <figure className="select-none">
      <svg viewBox="0 0 320 230" className="h-auto w-full max-w-[320px]" role="img" aria-label={`${t('product.width')} ${label(w)}, ${t('product.height')} ${label(h)}, ${t('product.depth')} ${label(d)}`}>
        <defs>
          <marker id="dim-tick" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M2 8 L8 2" stroke="currentColor" strokeWidth="1.4" />
          </marker>
        </defs>
        <g className="text-ink-faint">
          {faces.map((f, i) => (
            <polygon key={i} points={f.map(pt).join(' ')} fill={i === 1 ? '#f2f0eb' : i === 2 ? '#ebe8e2' : '#f7f6f3'} stroke="#9a958c" strokeWidth="1" strokeLinejoin="round" />
          ))}
          {/* hidden edges */}
          <polyline points={[E, Hh].map(pt).join(' ')} fill="none" stroke="#cfccc5" strokeDasharray="3 3" />
          <polyline points={[A, E, F].map(pt).join(' ')} fill="none" stroke="#cfccc5" strokeDasharray="3 3" />
        </g>
        <g className="text-[var(--brand-accent)]" stroke="currentColor" strokeWidth="1.2">
          {[wLine, dLine, hLine].map((l, i) => (
            <line key={i} {...l} markerStart="url(#dim-tick)" markerEnd="url(#dim-tick)" />
          ))}
        </g>
        <g fontSize="11.5" fontWeight="600" fill="#23221f" fontFamily="inherit">
          <text x={mid(wLine)[0] - 4} y={mid(wLine)[1] + 16} textAnchor="middle">
            {label(w)}
          </text>
          <text x={mid(dLine)[0] + 10} y={mid(dLine)[1] + 14} textAnchor="start">
            {label(d)}
          </text>
          <text x={mid(hLine)[0] - 6} y={mid(hLine)[1] + 4} textAnchor="end">
            {label(h)}
          </text>
        </g>
      </svg>
    </figure>
  )
}
