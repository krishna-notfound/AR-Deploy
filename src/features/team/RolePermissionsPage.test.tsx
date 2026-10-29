import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '@/app/App'
import { ACCOUNT_KEY } from '@/auth/AccountProvider'
import { service } from '@/services'
import { fail } from '@/services/catalogService'

function open(url = '/admin/team/permissions') {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' }))
  window.history.replaceState(null, '', url)
  return render(<App />)
}
const box = (role: 'Admin' | 'Team', label: string) => screen.getByRole('checkbox', { name: `${role}: ${label}` })

beforeAll(async () => {
  await import('@/features/team/RolePermissionsPage')
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

describe('Role permissions (ADR-0029)', () => {
  it('lists the 17 permissions in four groups for Admin and Team; the Owner has everything', { timeout: 20_000 }, async () => {
    open()
    await screen.findByRole('heading', { level: 1, name: 'Role permissions' })
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(34))
    for (const g of ['Businesses & applications', 'Products & catalogues', 'Insight & records', 'Website content']) expect(screen.getByRole('heading', { name: g })).toBeInTheDocument()
    expect(box('Team', 'View businesses')).toBeChecked()
    expect(box('Team', 'Publish and unpublish')).not.toBeChecked()
    expect(screen.getAllByText("Deletes the product and its media. This can't be undone.").length).toBeGreaterThan(0)
  })

  it('shows the save bar only while there are unsaved changes', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    open()
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(34))
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
    expect(screen.queryByText('All changes saved')).toBeNull()
    await user.click(box('Team', 'Publish and unpublish'))
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull()
  })

  it('keeps one always-mounted polite live region that holds the full status text, even when the bar is hidden', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    open()
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(34))
    const region = document.querySelector('[aria-live="polite"][data-save-status]') as HTMLElement
    expect(region).not.toBeNull()
    expect(region).toHaveTextContent('')
    await user.click(box('Team', 'Publish and unpublish'))
    // The same node is updated (never remounted), so assistive tech announces the change.
    expect(document.querySelector('[aria-live="polite"][data-save-status]')).toBe(region)
    expect(region).toHaveTextContent('1 unsaved change')
    // The visual copies (short and full) are hidden from assistive tech.
    for (const el of screen.getAllByText(/unsaved/).filter((e) => e !== region)) expect(el.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('keeps the bar visible with an error when a save fails', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    vi.spyOn(service, 'setRolePermissions').mockResolvedValue(fail('UNKNOWN', 'Network down.'))
    open()
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(34))
    await user.click(box('Team', 'Publish and unpublish'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Permissions not saved')).toBeInTheDocument()
    expect(screen.getByText('Network down.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled()
  })

  it('moves focus to the page heading when a successful save removes the bar', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    open()
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(34))
    await user.click(box('Team', 'Publish and unpublish'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull())
    const h1 = screen.getByRole('heading', { level: 1, name: 'Role permissions' })
    await waitFor(() => expect(h1).toHaveFocus())
    expect(h1).toHaveAttribute('tabindex', '-1')
  })

  it('counts unsaved changes, and Cancel puts them back', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    open()
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(34))
    await user.click(box('Team', 'Publish and unpublish'))
    expect(screen.getAllByText('1 unsaved change').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(box('Team', 'Publish and unpublish')).not.toBeChecked()
    expect(screen.queryByText(/unsaved change/)).toBeNull()
  })

  it('confirms a removal, listing what is taken away, then saves', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    const spy = vi.spyOn(service, 'setRolePermissions')
    // Reads take a moment, as in the browser (the demo service adds latency outside tests).
    const read = service.getRolePermissions.bind(service)
    vi.spyOn(service, 'getRolePermissions').mockImplementation(async () => {
      const r = await read()
      await new Promise((res) => setTimeout(res, 120))
      return r
    })
    open()
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(34))
    await user.click(box('Team', 'Create and edit products'))
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/Create and edit products/)).toBeInTheDocument()
    expect(within(dialog).getByText(/1 active Team member/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith('team', ['businesses.view', 'applications.view', 'products.view', 'analytics.view']))
    await waitFor(() => expect(screen.queryByText(/unsaved change/)).toBeNull())
    // The saved state stays on screen (regression: the old set came back until the page reloaded).
    await new Promise((r) => setTimeout(r, 400))
    expect(box('Team', 'Create and edit products')).not.toBeChecked()
  })

  it('reset to defaults restores the default sets without saving', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' }))
    expect((await service.setRolePermissions('team', ['products.view'])).ok).toBe(true)
    open()
    await waitFor(() => expect(box('Team', 'View businesses')).not.toBeChecked())
    await user.click(screen.getByRole('button', { name: 'Reset to defaults' }))
    expect(box('Team', 'View businesses')).toBeChecked()
    expect(screen.getAllByText(/unsaved change/).length).toBeGreaterThan(0)
    // Nothing was dirty before, so the reset itself reveals the save bar.
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument()
  })

  it('asks before leaving with unsaved changes', { timeout: 20_000 }, async () => {
    const user = userEvent.setup()
    open()
    await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(34))
    await user.click(box('Admin', 'Delete businesses'))
    await user.click(within(screen.getByRole('navigation', { name: 'Main' })).getByRole('link', { name: /Overview/ }))
    expect(await screen.findByRole('dialog', { name: 'Leave without saving?' })).toBeInTheDocument()
  })

  describe('a permission includes the permissions it needs (R-W3-3)', () => {
    /** The demo Team set, saved as the Owner before the page opens. */
    async function openWithTeam(perms: Parameters<typeof service.setRolePermissions>[1]) {
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin' }))
      expect((await service.setRolePermissions('team', perms)).ok).toBe(true)
      open()
      await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(34))
    }

    it("shows 'Includes: {labels}' under each permission", async () => {
      open()
      await waitFor(() => expect(screen.getAllByRole('checkbox')).toHaveLength(34))
      // The 10 permissions that need others, once each.
      expect(screen.getAllByText(/^Includes: /)).toHaveLength(10)
      // Publish and Delete products both need editing (and so viewing).
      expect(screen.getAllByText('Includes: View products and catalogues, Create and edit products')).toHaveLength(2)
      expect(screen.getByText('Includes: View businesses, Create and edit businesses, View products and catalogues, Create and edit products, Delete products')).toBeInTheDocument()
      // Approve and Reject both need View applications.
      expect(screen.getAllByText('Includes: View applications')).toHaveLength(2)
      // R-S4-1: Handle 3D model requests needs both views.
      const models = screen.getByText('Handle 3D model requests').closest('li')!
      expect(within(models).getByText('Includes: View businesses, View products and catalogues')).toBeInTheDocument()
    })

    it('ticking products.publish ticks and locks products.edit and products.view', async () => {
      const user = userEvent.setup()
      await openWithTeam(['businesses.view'])
      expect(box('Team', 'Create and edit products')).not.toBeChecked()
      await user.click(box('Team', 'Publish and unpublish'))
      for (const label of ['Create and edit products', 'View products and catalogues']) {
        expect(box('Team', label)).toBeChecked()
        expect(box('Team', label)).toBeDisabled()
      }
      // Unticking it frees them again.
      await user.click(box('Team', 'Publish and unpublish'))
      expect(box('Team', 'Create and edit products')).not.toBeChecked()
      expect(box('Team', 'Create and edit products')).toBeEnabled()
      expect(screen.queryByText(/unsaved change/)).toBeNull()
    })

    it("toast 'Saved. Also added: View products and catalogues, which it needs.'", async () => {
      const user = userEvent.setup()
      await openWithTeam([])
      await user.click(box('Team', 'Create and edit products'))
      expect(screen.getAllByText('2 unsaved changes').length).toBeGreaterThan(0)
      await user.click(screen.getByRole('button', { name: 'Save changes' }))
      expect(await screen.findByText('Saved. Also added: View products and catalogues, which it needs.')).toBeInTheDocument()
      const saved = await service.getRolePermissions()
      expect(saved.ok && [...saved.data.team].sort()).toEqual(['products.edit', 'products.view'])
    })

    it("says 'they need' when more than one newly ticked permission caused the additions", async () => {
      const user = userEvent.setup()
      await openWithTeam([])
      await user.click(box('Team', 'Approve applications'))
      await user.click(box('Team', 'Reject applications'))
      await user.click(screen.getByRole('button', { name: 'Save changes' }))
      expect(await screen.findByText('Saved. Also added: View applications, which they need.')).toBeInTheDocument()
    })
  })
})
