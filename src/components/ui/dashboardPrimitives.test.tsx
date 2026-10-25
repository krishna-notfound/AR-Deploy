import { render, screen } from '@testing-library/react'
import { Building2, Package } from 'lucide-react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router'
import { describe, expect, it } from 'vitest'
import { DashboardContext } from '@/components/layout/dashboardContext'
import { Badge } from './Badge'
import { Button, ButtonLink } from './Button'
import { StatGroup } from './StatGroup'
import { Tabs } from './Tabs'

function InShell({ children }: { children: ReactNode }) {
  return (
    <MemoryRouter>
      <DashboardContext.Provider value={{ variant: 'admin', home: 'Sanctus Admin', homeTo: '/admin', eyebrow: 'Platform admin' }}>{children}</DashboardContext.Provider>
    </MemoryRouter>
  )
}

const stats = [
  { label: 'Businesses', icon: Building2, value: '4', hint: '3 active' },
  { label: 'Products', icon: Package, value: '20' },
]

describe('stat strip (dashboard)', () => {
  it('renders no icons in the strip, even when a stat carries one', () => {
    const { container } = render(
      <InShell>
        <StatGroup stats={stats} />
      </InShell>,
    )
    expect(container.querySelector('svg')).toBeNull()
  })

  it('keeps the legacy icons outside the dashboard', () => {
    const { container } = render(<StatGroup stats={stats} />)
    expect(container.querySelectorAll('svg')).toHaveLength(2)
  })

  it('sets values tabular and labels in sentence case', () => {
    render(
      <InShell>
        <StatGroup stats={stats} />
      </InShell>,
    )
    expect(screen.getByText('4').className).toContain('tabular-nums')
    expect(screen.getByText('20').className).toContain('tabular-nums')
    expect(screen.getByText('Businesses').className).not.toContain('uppercase')
  })

  it('divides the columns and keeps the footer row inside the card', () => {
    const { container } = render(
      <InShell>
        <StatGroup stats={stats} footer={<span>Sample data</span>} />
      </InShell>,
    )
    expect(container.querySelector('dl')!.className).toContain('divide-line')
    expect(screen.getByText('Sample data').closest('section')).not.toBeNull()
  })
})

describe('Badge', () => {
  it('the same Badge renders legacy styles outside the dashboard', () => {
    const { rerender } = render(<Badge>Draft</Badge>)
    expect(screen.getByText('Draft').className).toContain('uppercase')
    rerender(
      <InShell>
        <Badge>Draft</Badge>
      </InShell>,
    )
    const cls = screen.getByText('Draft').className
    expect(cls).not.toContain('uppercase')
    expect(cls).not.toContain('tracking-[')
    expect(cls).toContain('h-5')
    expect(cls).toContain('normal-case')
  })
})

describe('Badge override', () => {
  it('a caller background replaces the tone inside the dashboard (Owner role pill)', () => {
    render(
      <InShell>
        <Badge className="bg-obsidian text-chalk">Owner</Badge>
      </InShell>,
    )
    const cls = screen.getByText('Owner').className
    expect(cls).toContain('bg-obsidian')
    expect(cls).not.toContain('bg-subtle')
  })
})

describe('Button', () => {
  it('has no uppercase or tracking inside the dashboard', () => {
    render(
      <InShell>
        <Button>Save</Button>
        <Button size="sm">Small</Button>
        <ButtonLink to="/x">Link</ButtonLink>
      </InShell>,
    )
    for (const name of ['Save', 'Small', 'Link']) {
      const cls = screen.getByText(name).className
      expect(cls).not.toMatch(/(^|\s)uppercase(\s|$)/)
      expect(cls).not.toMatch(/tracking-(?!normal)/)
      expect(cls).toContain('font-medium')
    }
  })

  it('keeps the editorial lg size outside the dashboard', () => {
    render(<Button size="lg">Send</Button>)
    expect(screen.getByText('Send').className).toContain('uppercase')
  })
})

describe('Tabs (pill)', () => {
  const tabs = [
    { value: 'a', label: 'All', badge: <span>3</span> },
    { value: 'b', label: 'Active' },
  ]
  it('is sentence case at 14px inside the dashboard, and unchanged outside', () => {
    const { rerender } = render(<Tabs tabs={tabs} value="a" onChange={() => {}} label="Filter" variant="pill" />)
    expect(screen.getByRole('tab', { name: /All/ }).className).toContain('uppercase')
    rerender(
      <InShell>
        <Tabs tabs={tabs} value="a" onChange={() => {}} label="Filter" variant="pill" />
      </InShell>,
    )
    const cls = screen.getByRole('tab', { name: /All/ }).className
    expect(cls).not.toMatch(/(^|\s)uppercase(\s|$)/)
    expect(cls).not.toMatch(/tracking-(?!normal)/)
    expect(cls).toContain('text-[14px]')
    expect(cls).toContain('tabular-nums')
  })
})
