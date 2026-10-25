import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Inbox } from 'lucide-react'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { DashboardContext } from '@/components/layout/dashboardContext'
import { Card, CardBody, CardHeader } from './Card'
import { EmptyState, ErrorState } from './States'
import { FormField, Input, Select, Textarea } from './Form'
import { Modal } from './Modal'
import { Skeleton, SkeletonRows } from './Skeleton'

function InDashboard({ children }: { children: ReactNode }) {
  return (
    <DashboardContext.Provider value={{ variant: 'business', home: 'Muse', homeTo: '/dashboard', eyebrow: 'Business dashboard' }}>
      {children}
    </DashboardContext.Provider>
  )
}

describe('FormField in the dashboard', () => {
  it('shows the error in place of the hint, with an alert icon', () => {
    render(
      <InDashboard>
        <FormField label="Name" hint="Shown in the catalog." error="Enter a name.">
          <Input />
        </FormField>
      </InDashboard>,
    )
    const err = screen.getByText('Enter a name.')
    expect(err).toHaveClass('text-danger')
    expect(err.querySelector('svg')).toBeTruthy()
    expect(screen.queryByText('Shown in the catalog.')).toBeNull()
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-describedby', err.id)
  })

  it('shows the hint when there is no error', () => {
    render(
      <InDashboard>
        <FormField label="Name" hint="Shown in the catalog.">
          <Input />
        </FormField>
      </InDashboard>,
    )
    const hint = screen.getByText('Shown in the catalog.')
    expect(hint).toHaveClass('text-ui-small', 'text-ink-muted')
    expect(screen.getByRole('textbox')).toHaveAttribute('aria-describedby', hint.id)
  })

  it('label is 14/500 sentence case and marks Required and Optional in words', () => {
    render(
      <InDashboard>
        <FormField label="Name" required>
          <Input />
        </FormField>
        <FormField label="Notes" optional>
          <Input />
        </FormField>
      </InDashboard>,
    )
    const label = screen.getByText('Name').closest('label')!
    expect(label.className).not.toMatch(/uppercase|text-label|text-eyebrow|tracking/)
    expect(label).toHaveClass('text-ui-body', 'font-medium')
    expect(label).toHaveTextContent('Name Required')
    expect(screen.getByText('Notes').closest('label')).toHaveTextContent('Notes Optional')
  })

  it('the field column keeps an 8px gap', () => {
    render(
      <InDashboard>
        <FormField label="Name">
          <Input />
        </FormField>
      </InDashboard>,
    )
    expect(screen.getByRole('textbox').parentElement).toHaveClass('gap-2')
  })

  it('controls are 40px, 16px under sm and 14px from sm, with a focus ring', () => {
    render(
      <InDashboard>
        <Input aria-label="a" />
        <Select aria-label="b">
          <option>x</option>
        </Select>
        <Textarea aria-label="c" />
      </InDashboard>,
    )
    const input = screen.getByLabelText('a')
    expect(input).toHaveClass('h-10', 'text-[16px]', 'sm:text-[14px]', 'focus-visible:outline-2')
    expect(screen.getByLabelText('b')).toHaveClass('h-10', 'text-[16px]', 'sm:text-[14px]')
    expect(screen.getByLabelText('c')).toHaveClass('text-[16px]', 'sm:text-[14px]')
  })
})

describe('forms outside the dashboard stay as they were', () => {
  it('keeps the asterisk, the 13px label and the text-sm control', () => {
    render(
      <FormField label="Name" required hint="Hint" error="Bad">
        <Input aria-label="n" />
      </FormField>,
    )
    const label = screen.getByText('Name').closest('label')!
    expect(label).toHaveClass('text-[13px]')
    expect(label).toHaveTextContent('Name *')
    expect(screen.getByLabelText('n')).toHaveClass('text-sm', 'focus-visible:outline-2')
    expect(screen.getByLabelText('n')).not.toHaveClass('text-[16px]')
    expect(screen.getByText('Bad')).toHaveClass('text-xs', 'font-medium', 'text-danger')
  })
})

describe('states in the dashboard', () => {
  it('ErrorState keeps the "Try again" button and tints only the icon', async () => {
    const onRetry = vi.fn()
    render(
      <InDashboard>
        <ErrorState message="Could not load products." onRetry={onRetry} />
      </InDashboard>,
    )
    await userEvent.setup().click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
    expect(screen.getByRole('alert').querySelector('svg')).toHaveClass('text-danger')
    expect(screen.getByText('Could not load products.')).not.toHaveClass('text-danger')
  })

  it('EmptyState drops the icon tile and the serif title', () => {
    const { container } = render(
      <InDashboard>
        <EmptyState icon={Inbox} title="No products yet" body="Add your first product." action={<button type="button">Add product</button>} />
      </InDashboard>,
    )
    expect(container.querySelector('svg')).toBeNull()
    const title = screen.getByText('No products yet')
    expect(title.className).not.toMatch(/font-display/)
    expect(title).toHaveClass('text-ui-body', 'text-ink')
    expect(screen.getByText('Add your first product.')).toHaveClass('text-ui-body', 'text-ink-muted')
    expect(screen.getByRole('button', { name: 'Add product' })).toBeInTheDocument()
  })

  it('EmptyState outside the dashboard keeps its icon tile and serif title', () => {
    const { container } = render(<EmptyState icon={Inbox} title="No products yet" />)
    expect(container.querySelector('svg')).toBeTruthy()
    expect(screen.getByText('No products yet')).toHaveClass('font-display')
  })

  it('loading bars are flat in the dashboard and shimmer outside', () => {
    const { container, rerender } = render(
      <InDashboard>
        <Skeleton className="h-4" />
        <SkeletonRows rows={2} />
      </InDashboard>,
    )
    expect(container.querySelector('.animate-shimmer')).toBeNull()
    rerender(
      <>
        <Skeleton className="h-4" />
      </>,
    )
    expect(container.querySelector('.animate-shimmer')).toBeTruthy()
  })
})

describe('Card and dialogs in the dashboard', () => {
  it('Card header and body use 24px padding and a 16/600 title', () => {
    render(
      <InDashboard>
        <Card>
          <CardHeader title="Details" description="Shown to customers." />
          <CardBody>Body</CardBody>
        </Card>
      </InDashboard>,
    )
    const title = screen.getByRole('heading', { name: 'Details' })
    expect(title).toHaveClass('text-ui-card', 'font-semibold')
    expect(title.parentElement!.parentElement).toHaveClass('px-6')
    expect(screen.getByText('Body')).toHaveClass('px-6', 'pb-6')
    expect(screen.getByText('Shown to customers.')).toHaveClass('text-ui-small')
  })

  it('Card keeps its 20px padding outside the dashboard', () => {
    render(
      <Card>
        <CardHeader title="Details" />
        <CardBody>Body</CardBody>
      </Card>,
    )
    expect(screen.getByRole('heading', { name: 'Details' })).toHaveClass('text-[15px]')
    expect(screen.getByText('Body')).toHaveClass('px-5')
  })

  it('Modal title is 16/600 and body 14 in the dashboard', () => {
    render(
      <InDashboard>
        <Modal open onClose={() => {}} title="Invite member" description="They get an email.">
          <p>Content</p>
        </Modal>
      </InDashboard>,
    )
    expect(screen.getByRole('heading', { name: 'Invite member' })).toHaveClass('text-ui-card', 'font-semibold')
    expect(screen.getByText('They get an email.')).toHaveClass('text-ui-body')
  })

  it('Modal keeps its old title class outside the dashboard', () => {
    render(<Modal open onClose={() => {}} title="Hello" />)
    expect(screen.getByRole('heading', { name: 'Hello' })).toHaveClass('text-base')
  })
})
