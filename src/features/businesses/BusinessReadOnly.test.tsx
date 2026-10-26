import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Business } from '@/domain/types'
import { catalogPublicUrl } from '@/lib/urls'
import { BusinessReadOnly } from './BusinessReadOnly'

const business: Business = {
  id: 'biz_x',
  name: 'Oak & Ember Studio',
  slug: 'oak-ember',
  description: 'Handmade oak furniture.',
  contact: { email: 'hello@oak.example', phone: '+351 21 000 0000', address: 'Rua Augusta 1, Lisboa' },
  status: 'inactive',
  branding: { accentColor: '#7A5C45' },
  defaultCurrency: 'EUR',
  allowOwnModels: false,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
}

describe('S2 Task 2: BusinessReadOnly (R-W3-5)', () => {
  it('renders the name, catalog address, contact and status as text, with no input, textbox, select or button', () => {
    const { container } = render(<BusinessReadOnly business={business} />)
    expect(screen.getByText('Oak & Ember Studio')).toBeInTheDocument()
    expect(screen.getByText(catalogPublicUrl(business))).toBeInTheDocument()
    expect(screen.getByText('hello@oak.example')).toBeInTheDocument()
    expect(screen.getByText('+351 21 000 0000')).toBeInTheDocument()
    expect(screen.getByText('Rua Augusta 1, Lisboa')).toBeInTheDocument()
    expect(screen.getByText('Inactive')).toBeInTheDocument()
    expect(container.querySelector('input, textarea, select, button')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it("shows 'You can view this business. Editing needs 'Create and edit businesses'.'", () => {
    render(<BusinessReadOnly business={business} />)
    expect(screen.getByText("You can view this business. Editing needs 'Create and edit businesses'.")).toBeInTheDocument()
  })
})
