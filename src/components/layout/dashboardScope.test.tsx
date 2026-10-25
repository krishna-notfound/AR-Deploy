import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { ACCOUNT_KEY } from '@/auth/AccountProvider'
import { service } from '@/services'
import { DashboardContext, useInDashboard } from './dashboardContext'

/** Renders the whole app at `url` as the demo platform Owner. */
function openAsOwner(url: string) {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' }))
  window.history.replaceState(null, '', url)
  return render(<App />)
}

beforeAll(async () => {
  await Promise.all([import('@/features/admin/AdminOverviewPage'), import('@/features/team/TeamPage')])
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

function Probe() {
  return <p>{useInDashboard() ? 'inside' : 'outside'}</p>
}

describe('dashboard scope (data-surface)', () => {
  it('the dashboard root and body carry the dashboard surface', { timeout: 20_000 }, async () => {
    openAsOwner('/admin')
    await screen.findByRole('heading', { level: 1, name: 'Overview' })
    expect(document.querySelector('[data-surface="dashboard"]')).toBeTruthy()
    expect(document.body.dataset.surface).toBe('dashboard')
  })

  it('public pages do not', { timeout: 20_000 }, async () => {
    localStorage.clear()
    window.history.replaceState(null, '', '/catalog/nordhaus')
    render(<App />)
    await screen.findByRole('heading', { level: 1 })
    expect(document.body.dataset.surface).toBeUndefined()
    expect(document.querySelector('[data-surface="dashboard"]')).toBeNull()
  })

  it('leaving the dashboard removes the body surface', { timeout: 20_000 }, async () => {
    const view = openAsOwner('/admin')
    await screen.findByRole('heading', { level: 1, name: 'Overview' })
    expect(document.body.dataset.surface).toBe('dashboard')
    view.unmount()
    expect(document.body.dataset.surface).toBeUndefined()
  })

  it('a dialog opened in the dashboard gets the dashboard font', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    openAsOwner('/admin/team')
    const row = (await within(await screen.findByRole('table')).findByText('marta.lopes@sanctus.example')).closest('tr')!
    await user.click(within(row).getByRole('button', { name: /^Actions for/ }))
    await user.click(await screen.findByRole('menuitem', { name: 'Revoke invitation' }))
    const dialog = await screen.findByRole('dialog')
    // The dialog is portalled to <body>, which carries the surface, so the Inter rule reaches it.
    expect(dialog.closest('[data-surface]')?.getAttribute('data-surface')).toBe('dashboard')
  })

  it('useInDashboard is true inside the dashboard context and false outside', () => {
    const { unmount } = render(<Probe />)
    expect(screen.getByText('outside')).toBeInTheDocument()
    unmount()
    render(
      <DashboardContext.Provider value={{ variant: 'admin', home: 'Sanctus Admin', homeTo: '/admin', eyebrow: 'Platform admin' }}>
        <Probe />
      </DashboardContext.Provider>,
    )
    expect(screen.getByText('inside')).toBeInTheDocument()
  })
})
