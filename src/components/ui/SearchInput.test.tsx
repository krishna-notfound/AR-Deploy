import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { DashboardContext } from '@/components/layout/dashboardContext'
import { FormField } from './Form'
import { SearchInput } from './SearchInput'

function InDashboard({ children }: { children: ReactNode }) {
  return (
    <DashboardContext.Provider value={{ variant: 'admin', home: 'Sanctus', homeTo: '/admin', eyebrow: 'Admin console' }}>
      {children}
    </DashboardContext.Provider>
  )
}

describe('SearchInput', () => {
  it('inside a FormField it takes the field id, so the visible label names and focuses it', async () => {
    const user = userEvent.setup()
    render(
      <InDashboard>
        <FormField label="Search members" hint="Name or email.">
          <SearchInput value="" onChange={() => {}} label="Search members" placeholder="Name or email" />
        </FormField>
      </InDashboard>,
    )
    const input = screen.getByRole('searchbox', { name: 'Search members' })
    const label = screen.getByText('Search members', { selector: 'label' })
    expect(label).toHaveAttribute('for', input.id)
    expect(input).not.toHaveAttribute('aria-label')
    expect(input).toHaveAttribute('aria-describedby', `${input.id}-hint`)
    await user.click(label)
    expect(input).toHaveFocus()
  })

  it('on its own it keeps its aria-label and has no id', () => {
    render(<SearchInput value="" onChange={() => {}} label="Search products" />)
    const input = screen.getByRole('searchbox', { name: 'Search products' })
    expect(input).toHaveAttribute('aria-label', 'Search products')
    expect(input).not.toHaveAttribute('id')
  })
})
