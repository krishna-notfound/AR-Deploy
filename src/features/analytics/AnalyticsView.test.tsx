import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { BusinessBars } from './AnalyticsView'

describe('Views by business bars', () => {
  it('lists businesses with views in descending order, one row each, and folds zero-view ones into one muted line', () => {
    render(
      <BusinessBars
        rows={[
          { label: 'Quiet One', value: 0 },
          { label: 'Small Co', value: 5 },
          { label: 'Big Co', value: 40 },
          { label: 'Quiet Two', value: 0 },
        ]}
      />,
    )
    const list = screen.getByRole('list', { name: 'Views by business' })
    const items = within(list).getAllByRole('listitem') as [HTMLElement, HTMLElement]
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Big Co')
    expect(items[0]).toHaveTextContent('40')
    expect(items[1]).toHaveTextContent('Small Co')
    // Label, track and value share one row; the value is tabular and right-aligned.
    expect(items[0].className).toContain('flex')
    expect(within(items[0]).getByText('40').className).toContain('tabular-nums')
    expect(screen.getByText('2 businesses with no views')).toBeInTheDocument()
    expect(screen.queryByText('Quiet One')).toBeNull()
  })

  it('uses the singular for one zero-view business and omits the line when every business has views', () => {
    const { rerender } = render(<BusinessBars rows={[{ label: 'A', value: 3 }, { label: 'B', value: 0 }]} />)
    expect(screen.getByText('1 business with no views')).toBeInTheDocument()
    rerender(<BusinessBars rows={[{ label: 'A', value: 3 }]} />)
    expect(screen.queryByText(/with no views/)).toBeNull()
  })

  it('says so when no business has any views', () => {
    render(<BusinessBars rows={[{ label: 'A', value: 0 }, { label: 'B', value: 0 }]} />)
    expect(screen.getByText('2 businesses with no views')).toBeInTheDocument()
  })

  it('shows a muted "No views yet" line when there are no rows at all', () => {
    render(<BusinessBars rows={[]} />)
    expect(screen.getByText('No views yet')).toBeInTheDocument()
  })
})
