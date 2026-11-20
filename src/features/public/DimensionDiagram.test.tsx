import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Dimensions } from '@/domain/types'
import { LanguageProvider } from '@/i18n/LanguageProvider'
import { DimensionDiagram, labelWidth } from './DimensionDiagram'

// Client report (18 Nov): measurements cut off. Every label must sit inside the drawing's viewBox, whatever the
// product's proportions, or the browser clips it.
function boxOf(dims: Dimensions) {
  const { container } = render(
    <LanguageProvider>
      <DimensionDiagram dims={dims} unit="cm" />
    </LanguageProvider>,
  )
  const svg = container.querySelector('svg')!
  const [x, y, w, h] = svg.getAttribute('viewBox')!.split(' ').map(Number) as [number, number, number, number]
  const labels = [...svg.querySelectorAll('text')].map((el) => {
    const tx = Number(el.getAttribute('x'))
    const ty = Number(el.getAttribute('y'))
    const width = labelWidth(el.textContent ?? '')
    const anchor = el.getAttribute('text-anchor')
    const left = anchor === 'end' ? tx - width : anchor === 'middle' ? tx - width / 2 : tx
    return { text: el.textContent, left, right: left + width, top: ty - 11, bottom: ty + 3 }
  })
  return { x, y, w, h, labels }
}

const cases: [string, Dimensions][] = [
  ['tall and thin (floor lamp)', { width: 30, height: 245.5, depth: 30, unit: 'cm' }],
  ['long and shallow (sideboard)', { width: 320.5, height: 45, depth: 12.5, unit: 'cm' }],
  ['deep and low (bed)', { width: 160, height: 25, depth: 210.5, unit: 'cm' }],
  ['cube', { width: 100, height: 100, depth: 100, unit: 'cm' }],
]

describe('DimensionDiagram', () => {
  it.each(cases)('keeps every measurement inside the drawing: %s', (_name, dims) => {
    const b = boxOf(dims)
    expect(b.labels).toHaveLength(3)
    for (const l of b.labels) {
      expect(l.left, `${l.text} left`).toBeGreaterThanOrEqual(b.x)
      expect(l.right, `${l.text} right`).toBeLessThanOrEqual(b.x + b.w)
      expect(l.top, `${l.text} top`).toBeGreaterThanOrEqual(b.y)
      expect(l.bottom, `${l.text} bottom`).toBeLessThanOrEqual(b.y + b.h)
    }
  })
})
