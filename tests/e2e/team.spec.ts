import { expect, test } from '@playwright/test'
import { confirmDialog, signInAsPlatform, signInAsSuperAdmin } from './helpers'

// Platform team roles (ADR-0029, ADR-0030), demo mode.

test('the Owner invites a Team member and sees the invitation', async ({ page }) => {
  await signInAsSuperAdmin(page)
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /Team & Access/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Team & Access' })).toBeVisible()
  await page.getByRole('button', { name: 'Invite member' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel(/Email address/).fill('new@studio.test')
  await dialog.getByRole('radio', { name: /Team/ }).check()
  await dialog.getByRole('button', { name: 'Review invitation' }).click()
  await expect(dialog.getByText('Check the invitation')).toBeVisible()
  await dialog.getByRole('button', { name: 'Send invitation' }).click()
  await expect(dialog.getByText(/Invitation sent to new@studio.test/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Done' }).click()
  await page.getByRole('tab', { name: /Invitations/ }).click()
  await expect(page.getByRole('table').getByText('new@studio.test')).toBeVisible()
})

test('an Admin does not see Team & Access or the platform settings, and a direct link is refused', async ({ page }) => {
  await signInAsPlatform(page, 'admin')
  const nav = page.getByRole('navigation', { name: 'Main' })
  await expect(nav.getByRole('link', { name: /Applications/ })).toBeVisible()
  await expect(nav.getByRole('link', { name: /Team & Access/ })).toHaveCount(0)
  // Settings opens the Admin's own account sections; the Owner's Platform group is not there.
  await nav.getByRole('link', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'My account' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Settings sections' }).getByRole('heading', { name: 'Platform' })).toHaveCount(0)
  await page.goto('/admin/team')
  await expect(page.getByText("You don't have access to this page")).toBeVisible()
})

test('a Team member cannot publish or delete, and the platform settings are out of reach', async ({ page }) => {
  await signInAsPlatform(page, 'team')
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /All Products/ }).click()
  await page.getByRole('button', { name: /^Actions for / }).first().click()
  const menu = page.getByRole('menu')
  await expect(menu.getByRole('menuitem', { name: 'Edit' })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: /^(Publish|Unpublish|Delete)$/ })).toHaveCount(0)
  await page.keyboard.press('Escape')
  // A direct link to an Owner-only section lands on the member's own account settings.
  await page.goto('/admin/settings/platform')
  await expect(page.getByRole('heading', { level: 1, name: 'My account' })).toBeVisible()
  await expect(page).toHaveURL(/\/admin\/settings\/account$/)
})

test('the Owner deactivates and reactivates a member', async ({ page }) => {
  await signInAsSuperAdmin(page)
  await page.goto('/admin/team/mem_joao')
  await expect(page.getByRole('heading', { level: 1, name: 'João Costa' })).toBeVisible()
  await page.getByRole('button', { name: 'Deactivate' }).click()
  await confirmDialog(page, 'Deactivate')
  await expect(page.getByRole('button', { name: 'Reactivate' })).toBeVisible()
  await page.getByRole('button', { name: 'Reactivate' }).click()
  await confirmDialog(page, 'Reactivate')
  await expect(page.getByRole('button', { name: 'Deactivate' })).toBeVisible()
})

test('the Owner removes a Team permission after confirming', async ({ page }) => {
  await signInAsSuperAdmin(page)
  await page.goto('/admin/team/permissions')
  await page.getByRole('checkbox', { name: 'Team: Create and edit products' }).uncheck()
  await expect(page.locator('[aria-live="polite"]', { hasText: '1 unsaved change' })).toContainText('1 unsaved change')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await confirmDialog(page, 'Save changes')
  await expect(page.getByText('Permissions saved')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeHidden()
  await expect(page.getByRole('checkbox', { name: 'Team: Create and edit products' })).not.toBeChecked()
})

test('an invitation link creates the account and opens the console', async ({ page }) => {
  await page.goto('/join#t=demo-invite-token')
  await expect(page.getByLabel('Email')).toHaveValue('marta.lopes@sanctus.example')
  await expect(page).toHaveURL(/\/join$/) // the secret is gone from the address bar
  await page.getByLabel('Full name').fill('Marta Lopes')
  await page.getByLabel('Password', { exact: true }).fill('a-long-passphrase')
  await page.getByLabel('Confirm password').fill('a-long-passphrase')
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/admin$/)
  const nav = page.getByRole('navigation', { name: 'Main' })
  await expect(nav.getByRole('link', { name: /All Products/ })).toBeVisible()
  await expect(nav.getByRole('link', { name: /Team & Access/ })).toHaveCount(0)
})

// S1.5 R-W6-1: only a deactivated member can be removed, after a confirmation that says what is deleted.
test('the Owner removes a deactivated member; an active one has no Remove', async ({ page }) => {
  await signInAsSuperAdmin(page)
  await page.goto('/admin/team/mem_joao')
  await expect(page.getByRole('heading', { level: 1, name: 'João Costa' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Deactivate' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0)

  await page.goto('/admin/team/mem_pedro')
  await expect(page.getByRole('heading', { level: 1, name: 'Pedro Alves' })).toBeVisible()
  await page.getByRole('button', { name: 'Remove', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText('Remove pedro.alves@sanctus.example from the team?')).toBeVisible()
  await expect(dialog.getByText(/Deleted user \(Admin\)/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('heading', { level: 1, name: 'Pedro Alves' })).toBeVisible()

  await page.getByRole('button', { name: 'Remove', exact: true }).click()
  await confirmDialog(page, 'Remove member')
  await expect(page.getByText('pedro.alves@sanctus.example was removed.').first()).toBeVisible()
  await expect(page).toHaveURL(/\/admin\/team$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Team & Access' })).toBeVisible()
  await expect(page.getByRole('table').getByText('pedro.alves@sanctus.example')).toHaveCount(0)
})

// S1.5 R-W3-3: a permission brings the ones it needs, ticked and locked while it is ticked.
test('ticking a permission ticks and locks the ones it needs, and unticking it frees them', async ({ page }) => {
  await signInAsSuperAdmin(page)
  await page.goto('/admin/team/permissions')
  const status = page.getByRole('checkbox', { name: 'Team: Activate or deactivate businesses' })
  const edit = page.getByRole('checkbox', { name: 'Team: Create and edit businesses' })
  const view = page.getByRole('checkbox', { name: 'Team: View businesses' })
  await expect(edit).not.toBeChecked()
  await expect(edit).toBeEnabled()
  await expect(view).toBeChecked()
  await expect(view).toBeEnabled()

  await status.check()
  await expect(edit).toBeChecked()
  await expect(edit).toBeDisabled()
  await expect(edit.locator('xpath=ancestor::label')).toHaveAttribute('title', 'Needed by Activate or deactivate businesses')
  await expect(view).toBeChecked()
  await expect(view).toBeDisabled()
  await expect(page.locator('[aria-live="polite"]', { hasText: 'unsaved change' })).toContainText('2 unsaved changes')

  await status.uncheck()
  await expect(edit).not.toBeChecked()
  await expect(edit).toBeEnabled()
  await expect(view).toBeEnabled()

  // Saving keeps the prerequisites with the permission.
  await status.check()
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expect(page.getByText(/^(Permissions saved|Saved\. Also added: )/).first()).toBeVisible()
  await expect(edit).toBeChecked()
  await expect(edit).toBeDisabled()
})
