import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { DashboardContext } from '@/components/layout/dashboardContext'
import { type Column, DataTable } from './DataTable'
import { DropdownMenu } from './Menu'
import { Pagination } from './Pagination'
import { SearchInput } from './SearchInput'

interface Row {
  id: string
  email: string
  views: number
}

const LONG_EMAIL = `${'a'.repeat(100)}@${'b'.repeat(19)}.pt`

const columns: Column<Row>[] = [
  { key: 'email', header: 'Applicant', cell: (r) => <span>{r.email}</span>, sortValue: (r) => r.email },
  { key: 'views', header: 'Views', align: 'right', cell: (r) => r.views, sortValue: (r) => r.views },
  { key: 'actions', header: 'Actions', srOnlyHeader: true, cell: () => <button type="button">Row actions</button> },
]

function inShell(ui: ReactNode) {
  return (
    <DashboardContext.Provider value={{ variant: 'admin', home: 'Sanctus Admin', homeTo: '/admin', eyebrow: 'Platform' }}>
      {ui}
    </DashboardContext.Provider>
  )
}

function table(rows: Row[]) {
  return (
    <div style={{ width: 390 }}>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        caption="Applications"
        noun="applications"
        mobileRow={(r) => <p>{r.email}</p>}
      />
    </div>
  )
}

describe('DataTable inside the dashboard shell', () => {
  it('header cells are sentence case (no uppercase class)', () => {
    render(inShell(table([{ id: '1', email: 'a@b.pt', views: 4 }])))
    const headers = screen.getAllByRole('columnheader')
    expect(headers.length).toBe(3)
    for (const th of headers) {
      expect(th.className).not.toMatch(/uppercase/)
      expect(th.parentElement?.className).not.toMatch(/uppercase/)
      for (const el of th.querySelectorAll('*')) expect(el.className.toString()).not.toMatch(/uppercase/)
    }
  })

  it('numeric columns are right-aligned with tabular numerals', () => {
    render(inShell(table([{ id: '1', email: 'a@b.pt', views: 4321 }])))
    const cell = screen.getAllByText('4321')[0]!.closest('td')!
    expect(cell.className).toMatch(/tabular-nums/)
    expect(cell.className).toMatch(/text-right/)
  })

  it('header is 40px, rows 52px, and the actions column is a fixed 48px', () => {
    render(inShell(table([{ id: '1', email: 'a@b.pt', views: 4 }])))
    const header = screen.getAllByRole('columnheader')[0]!
    expect(header.className).toMatch(/\bh-10\b/)
    const row = screen.getAllByRole('row')[1]!
    expect(row.className).toMatch(/h-\[52px\]/)
    const actions = within(row).getByText('Row actions').closest('td')!
    expect(actions.className).toMatch(/\bw-12\b/)
  })

  it('the identity column gets about 35% of the width', () => {
    render(inShell(table([{ id: '1', email: 'a@b.pt', views: 4 }])))
    const [first, second] = screen.getAllByRole('columnheader')
    expect(first!.className).toMatch(/w-\[35%\]/)
    expect(second!.className).not.toMatch(/w-\[35%\]/)
  })

  it('rows are 52px, or 60px when the identity has two lines', () => {
    const { unmount } = render(inShell(table([{ id: '1', email: 'a@b.pt', views: 4 }])))
    expect(screen.getAllByRole('row')[1]!.className).toMatch(/h-\[52px\]/)
    unmount()
    render(
      inShell(
        <DataTable rows={[{ id: '1', email: 'a@b.pt', views: 4 }]} columns={columns} rowKey={(r) => r.id} caption="Applications" mobileRow={(r) => <p>{r.email}</p>} twoLine />,
      ),
    )
    const row = screen.getAllByRole('row')[1]!
    expect(row.className).toMatch(/h-\[60px\]/)
    expect(row.className).not.toMatch(/h-\[52px\]/)
  })

  it('long identities do not overflow at 390', () => {
    render(inShell(table([{ id: '1', email: LONG_EMAIL, views: 4 }])))
    // The list item is what shows at 390.
    const item = within(screen.getByRole('list', { name: 'Applications' })).getByText(LONG_EMAIL).closest('li')!
    expect(item.className).toMatch(/\bmin-w-0\b/)
    expect(item.className).toMatch(/\[overflow-wrap:anywhere\]/)
    expect(item.className).toMatch(/break-words|truncate/)
    // And the identity cell in the table view.
    const cell = within(screen.getByRole('table', { hidden: true })).getByText(LONG_EMAIL).closest('td')!
    expect(cell.className).toMatch(/\bmin-w-0\b/)
    expect(cell.className).toMatch(/\[overflow-wrap:anywhere\]/)
    expect(cell.className).toMatch(/break-words|truncate/)
  })

  it('switches to the list layout below 640px (sm), not 768px', () => {
    render(inShell(table([{ id: '1', email: 'a@b.pt', views: 4 }])))
    expect(screen.getByRole('list', { name: 'Applications' }).className).toMatch(/\bsm:hidden\b/)
    expect(screen.getByRole('table', { hidden: true }).parentElement?.className).toMatch(/\bsm:block\b/)
  })
})

describe('DataTable outside the shell', () => {
  it('keeps the original uppercase header and md breakpoint', () => {
    render(table([{ id: '1', email: 'a@b.pt', views: 4 }]))
    expect(screen.getAllByRole('columnheader')[0]!.parentElement?.className).toMatch(/uppercase/)
    expect(screen.getByRole('list', { name: 'Applications' }).className).toMatch(/\bmd:hidden\b/)
  })
})

describe('Pagination, SearchInput and Menu inside the shell', () => {
  it('pagination text is 14px', () => {
    render(inShell(<Pagination page={1} pageSize={10} total={45} onPage={() => {}} noun="applications" />))
    const nav = screen.getByRole('navigation', { name: 'Pagination' })
    expect(nav.className).toMatch(/\btext-sm\b/)
    expect(screen.getByRole('button', { name: 'Next page' }).className).toMatch(/\btext-sm\b/)
    expect(nav.className).not.toMatch(/text-\[13px\]/)
  })

  it('search input is 40px tall and about 320px wide', () => {
    render(inShell(<SearchInput value="" onChange={() => {}} label="Search" />))
    const input = screen.getByRole('searchbox', { name: 'Search' })
    expect(input.className).toMatch(/\bh-10\b/)
    expect(input.parentElement?.className).toMatch(/sm:w-80/)
  })

  it('menu items are 36px rows of 14px text', async () => {
    render(inShell(<DropdownMenu label="Actions" trigger="..." items={[{ label: 'Edit', onSelect: () => {} }]} />))
    await userEvent.click(screen.getByRole('button', { name: 'Actions' }))
    const item = screen.getByRole('menuitem', { name: 'Edit' })
    expect(item.className).toMatch(/\bh-9\b/)
    expect(item.className).toMatch(/\btext-sm\b/)
  })
})

// The expected strings are copied byte for byte from commit 70ac7ba (before Task 5): the Pagination and SearchInput literals,
// and for the page-number button its base literal joined with the unselected-state classes by cn().
describe('outside the shell the controls keep their original class lists', () => {
  it('Pagination', () => {
    render(<Pagination page={2} pageSize={10} total={45} onPage={() => {}} />)
    expect(screen.getByRole('navigation', { name: 'Pagination' }).className).toBe(
      'flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-[13px] text-ink-muted sm:px-6',
    )
    expect(screen.getByRole('button', { name: 'Next page' }).className).toBe(
      'inline-flex h-8 items-center gap-1 rounded-[var(--radius-control)] border border-line px-2.5 text-[12px] font-medium text-ink hover:bg-subtle disabled:pointer-events-none disabled:opacity-40 pointer-coarse:h-11',
    )
    expect(screen.getByRole('button', { name: 'Page 1' }).className).toBe(
      'grid h-8 min-w-8 place-items-center rounded-[var(--radius-control)] px-2 text-[12px] font-medium tabular-nums border border-line text-ink hover:bg-subtle',
    )
  })

  it('SearchInput', () => {
    render(<SearchInput value="" onChange={() => {}} label="Search" className="sm:w-72" />)
    const input = screen.getByRole('searchbox', { name: 'Search' })
    expect(input.className).toBe(
      'h-10 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface pr-9 pl-9 text-sm placeholder:text-ink-faint hover:border-ink-faint focus-visible:border-accent focus-visible:outline-offset-0 [&::-webkit-search-cancel-button]:hidden',
    )
    expect(input.parentElement?.className).toBe('relative sm:w-72')
  })
})
