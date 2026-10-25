import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { ACCOUNT_KEY } from '@/auth/AccountProvider'
import { service } from '@/services'
import { DashboardContext } from './dashboardContext'
import { PageHeader, PanelHeader } from './PageHeader'

function openAsOwner(url: string) {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' }))
  window.history.replaceState(null, '', url)
  return render(<App />)
}

beforeAll(async () => {
  await Promise.all([import('@/features/admin/AdminOverviewPage'), import('@/features/team/RolePermissionsPage')])
}, 60_000)

beforeEach(async () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  localStorage.clear()
  await service.resetDemoData()
})

afterEach(() => {
  vi.restoreAllMocks()
  window.history.replaceState(null, '', '/')
})

describe('PageHeader inside the dashboard shell', () => {
  it('renders no uppercase or eyebrow text and a sentence-case medium serif title', { timeout: 20_000 }, async () => {
    openAsOwner('/admin')
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Overview' })
    // Scoped to the header: other blocks on the page (stat tiles, tables) are restyled by their own tasks.
    const header = h1.closest('.mb-8')!
    expect(header.querySelector('.uppercase, .text-eyebrow')).toBeNull()
    expect(header).not.toHaveTextContent('Platform admin')
    expect(h1).toHaveClass('font-display', 'font-medium')
    expect(h1.className).toContain('--text-ui-h1')
  })

  it('puts the breadcrumbs in the top bar, not in the page', { timeout: 20_000 }, async () => {
    openAsOwner('/admin/team/permissions')
    await screen.findByRole('heading', { level: 1 })
    const crumbs = await screen.findByRole('navigation', { name: 'Breadcrumb' })
    const header = document.querySelector('header')!
    expect(header).toContainElement(crumbs)
    expect(document.getElementById('main')).not.toContainElement(crumbs)
    expect(within(crumbs).getByRole('link', { name: 'Team & Access' })).toHaveAttribute('href', '/admin/team')
    expect(within(crumbs).getByText('Role permissions')).toHaveAttribute('aria-current', 'page')
    // One breadcrumb in the bar: the default "you are here" trail is replaced, not duplicated.
    expect(screen.queryByRole('navigation', { name: 'You are here' })).toBeNull()
  })

  it('keeps the default trail in the top bar when the page passes no breadcrumbs', { timeout: 20_000 }, async () => {
    openAsOwner('/admin')
    await screen.findByRole('heading', { level: 1, name: 'Overview' })
    expect(await screen.findByRole('navigation', { name: 'You are here' })).toBeInTheDocument()
  })
})

describe('PageHeader outside the shell', () => {
  it('renders as before: eyebrow, uppercase breadcrumbs and the original title classes', () => {
    render(
      <MemoryRouter>
        <PageHeader title="Plain" eyebrow="Eyebrow" description="Sub" meta={<span>Meta</span>} />
        <PageHeader title="Crumbed" breadcrumbs={[{ label: 'Parent', to: '/p' }, { label: 'Here' }]} />
      </MemoryRouter>,
    )
    const [plain, crumbed] = screen.getAllByRole('heading', { level: 1 }) as [HTMLElement, HTMLElement]
    expect(plain.className).toBe('font-display text-[2.125rem] leading-[1.08] font-normal text-ink sm:text-[2.75rem]')
    expect(crumbed.className).toBe(plain.className)
    expect(screen.getByText('Eyebrow')).toHaveClass('uppercase')
    expect(screen.getByRole('navigation', { name: 'Breadcrumb' }).querySelector('ol')).toHaveClass('uppercase')
  })

  it('PanelHeader keeps its serif title outside the shell', () => {
    render(<PanelHeader title="Panel" />)
    expect(screen.getByRole('heading', { name: 'Panel' }).className).toBe('font-display text-[1.5rem] leading-tight font-normal text-ink')
  })
})

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <MemoryRouter>
      <DashboardContext.Provider value={{ variant: 'admin', home: 'Sanctus Admin', homeTo: '/admin', eyebrow: 'Platform admin' }}>{children}</DashboardContext.Provider>
    </MemoryRouter>
  )
}

describe('PageHeader actions layout (dashboard)', () => {
  it('keeps the actions beside the title from lg: the title block grows and clamps, the actions do not wrap under it', () => {
    render(
      <Shell>
        <PageHeader title="A very long business name" actions={<button type="button">Open</button>} />
      </Shell>,
    )
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1).toHaveClass('lg:line-clamp-2')
    const titleBlock = h1.closest('[data-header-title]')!
    expect(titleBlock).toHaveClass('min-w-0', 'lg:flex-1')
    const actions = screen.getByRole('button', { name: 'Open' }).parentElement!
    expect(actions).toHaveClass('lg:shrink-0', 'lg:self-start')
    expect(actions.parentElement).toHaveClass('lg:flex-nowrap')
  })

  it('renders no More menu when the page passes no tertiary actions', () => {
    render(
      <Shell>
        <PageHeader title="Plain" actions={<button type="button">Open</button>} />
      </Shell>,
    )
    expect(screen.queryByRole('button', { name: 'More actions' })).toBeNull()
  })

  it('puts the tertiary actions in a "More actions" menu shown only below sm, with a full-width actions row', async () => {
    const user = userEvent.setup()
    const onDelete = vi.fn()
    render(
      <Shell>
        <PageHeader
          title="Nordhaus Living"
          actions={
            <>
              <button type="button">Open catalog</button>
              <button type="button" className="max-sm:hidden" onClick={onDelete}>
                Delete
              </button>
            </>
          }
          more={[{ label: 'Delete', destructive: true, onSelect: onDelete }]}
        />
      </Shell>,
    )
    const trigger = screen.getByRole('button', { name: 'More actions' })
    // The menu copy exists only below sm; the inline copy only from sm: one of each is ever in the accessibility tree.
    expect(trigger.closest('[class~="sm:hidden"]')).not.toBeNull()
    // Menu items are not rendered (so not focusable) until the menu opens.
    expect(screen.queryByRole('menuitem')).toBeNull()
    const actions = screen.getByRole('button', { name: 'Open catalog' }).parentElement!
    expect(actions).toHaveClass('max-sm:contents')
    expect(actions.className).toContain('max-sm:*:w-full')
    await user.click(trigger)
    await user.click(screen.getByRole('menuitem', { name: 'Delete' }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})
