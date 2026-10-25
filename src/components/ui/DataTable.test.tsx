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

  it('long identities do not overflow at 390', () => {
    render(inShell(table([{ id: '1', email: LONG_EMAIL, views: 4 }])))
    const cell = within(screen.getByRole('table', { hidden: true })).getByText(LONG_EMAIL).closest('td')!
    expect(cell.className).toMatch(/\bmin-w-0\b/)
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
