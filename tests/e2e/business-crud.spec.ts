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
