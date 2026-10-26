import { expect, test } from '@playwright/test'
import { confirmDialog, expectToast, signInAsSuperAdmin } from './helpers'

// §19.2 Business creation and editing
test('create, edit, deactivate and delete a business', async ({ page }) => {
  await signInAsSuperAdmin(page)
  await page.goto('/admin/businesses/new')

  // Validation: empty name
  await page.getByRole('button', { name: 'Create business' }).click()
  await expect(page.getByText('Business name is required.')).toBeVisible()

  await page.getByLabel('Business name').fill('Lumen Home Studio')
  await expect(page.getByLabel('Catalog address (subdomain)')).toHaveValue('lumen-home-studio')
  await page.getByLabel('Email').fill('not-an-email')
  await page.getByRole('button', { name: 'Create business' }).click()
  await expect(page.getByText('Enter a valid email address.')).toBeVisible()
  await page.getByLabel('Email').fill('hello@lumen.example')
  await page.getByRole('button', { name: 'Create business' }).click()

  await expectToast(page, 'Business created')
  await expect(page.getByText(/real subdomain and SSL certificate need deployment setup/i)).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Lumen Home Studio' })).toBeVisible()

  // Edit
  await page.getByLabel('Business name').fill('Lumen Home')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expectToast(page, 'Changes saved')
  await expect(page.getByRole('heading', { level: 1, name: 'Lumen Home' })).toBeVisible()

  // Deactivate with confirmation
  await page.getByRole('button', { name: 'Deactivate' }).click()
  await confirmDialog(page, 'Deactivate catalog')
  await expectToast(page, 'Catalog deactivated')
  await expect(page.getByText('Inactive').first()).toBeVisible()

  // Duplicate slug is rejected
  await page.goto('/admin/businesses/new')
  await page.getByLabel('Business name').fill('Casa Lisboa')
  await page.getByLabel('Catalog address (subdomain)').fill('casa-lisboa')
  await page.getByRole('button', { name: 'Create business' }).click()
  await expect(page.getByText('This catalog address is already used by another business.')).toBeVisible()

  // Delete (leave the unsaved form first)
  await page.goto('/admin/businesses')
  await page.getByRole('searchbox', { name: 'Search businesses' }).fill('Lumen')
  await page.getByRole('button', { name: 'Actions for Lumen Home' }).click()
  await page.getByRole('menuitem', { name: 'Delete business' }).click()
  await confirmDialog(page, 'Delete business')
  await expectToast(page, 'Business deleted')
  await expect(page.getByText('No businesses match')).toBeVisible()
})

// S1.5 R-W1-3: Oak & Ember Studio is seeded with an open closure request from its owner. The badge says so, and
// Activate is not offered anywhere (the database refuses it as well) while Preview catalog still is.
test('a business with an open closure request shows the badge and cannot be activated', async ({ page }) => {
  await signInAsSuperAdmin(page)
  await page.goto('/admin/businesses')
  const row = page.getByRole('row', { name: /Oak & Ember Studio/ })
  await expect(row.getByText(/^Closure requested on /)).toBeVisible()
  await expect(row.getByText('Inactive')).toBeVisible()
  await page.getByRole('button', { name: 'Actions for Oak & Ember Studio' }).click()
  const menu = page.getByRole('menu')
  await expect(menu.getByRole('menuitem', { name: 'Preview catalog' })).toBeVisible()
  await expect(menu.getByRole('menuitem', { name: 'Activate catalog' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  // A business without a request carries no badge.
  await expect(page.getByRole('row', { name: /Casa Lisboa/ }).getByText(/^Closure requested/)).toHaveCount(0)

  // The same on the business page.
  await page.goto('/admin/businesses/biz_oak')
  await expect(page.getByRole('heading', { level: 1, name: 'Oak & Ember Studio' })).toBeVisible()
  await expect(page.getByText(/^Closure requested on /)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Preview catalog' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Activate', exact: true })).toHaveCount(0)
})

test('the Closure requested filter lists only the business with an open request', async ({ page }) => {
  await signInAsSuperAdmin(page)
  await page.goto('/admin/businesses')
  await page.getByRole('button', { name: /^Closure requested/ }).click()
  await expect(page.getByRole('link', { name: 'Oak & Ember Studio' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Casa Lisboa Interiors' })).toHaveCount(0)
})

test('a draft business is previewed, not opened', async ({ page, context }) => {
  await signInAsSuperAdmin(page)
  await page.goto('/admin/businesses/new')
  await page.getByLabel('Business name').fill('Draft Preview Studio')
  await page.getByLabel('Email').fill('hello@draftpreview.example')
  await page.getByRole('button', { name: 'Save as draft' }).click()
  await expectToast(page, 'Business saved as draft')
  await expect(page.getByRole('heading', { level: 1, name: 'Draft Preview Studio' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Open catalog' })).toHaveCount(0)
  const [popup] = await Promise.all([context.waitForEvent('page'), page.getByRole('button', { name: 'Preview catalog' }).click()])
  await expect(popup).toHaveURL(/\/catalog\/draft-preview-studio\?preview=1/)
  await expect(popup.getByText('Preview. Customers cannot see this catalog until it is activated.')).toBeVisible()
})
