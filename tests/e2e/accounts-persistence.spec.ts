import { expect, test } from '@playwright/test'
import { expectToast, signInAsBusiness, signInAsSuperAdmin } from './helpers'

// §19.13 Mock account switching, §19.15 persistence
test('business admin sees only their own business and cannot open admin pages', async ({ page }) => {
  await signInAsBusiness(page, 'Atelier Verde')
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'My Products' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'My products' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Damask Accent Chair' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Sheen Lounge Chair' })).toHaveCount(0)

  // Another business's product is not editable here
  await page.goto('/dashboard/products/prd_sheen_chair/edit')
  await expect(page.getByText('Product not found')).toBeVisible()

  // Admin area is guarded (UX guard, not security)
  await page.goto('/admin')
  await expect(page.getByText('This area is for Super Admin accounts')).toBeVisible()

  // Switch account from the demo entry
  await page.getByRole('link', { name: 'Switch account' }).click()
  await page.getByRole('button', { name: 'Continue as Super Admin' }).click()
  await expect(page).toHaveURL(/\/admin$/)
})

test('business settings: slug read-only, edits persist after reload', async ({ page }) => {
  await signInAsBusiness(page, 'Nordhaus Living')
  await page.goto('/dashboard/settings')
  await expect(page.getByText('Changing your catalog address requires platform support.')).toBeVisible()
  await expect(page.getByLabel('Catalog address (subdomain)')).toHaveCount(0)
  await page.getByLabel('Business name').fill('Nordhaus Living Studio')
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expectToast(page, 'Changes saved')
  await page.waitForTimeout(400) // debounced localStorage write
  await page.reload()
  await expect(page.getByLabel('Business name')).toHaveValue('Nordhaus Living Studio')
})

test('corrupt stored data is reset safely', async ({ page: first, context }) => {
  await first.goto('/demo')
  await first.evaluate(() => localStorage.setItem('arfurn:v1:db', '{"schemaVersion":1,"businesses":[{"bad":true}]'))
  // Close without running unload handlers (the app flushes good data on unload).
  await first.close({ runBeforeUnload: false })
  const page = await context.newPage()
  await page.goto('/demo')
  await expect(page.getByRole('status').filter({ hasText: 'Demo data was reset' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Casa Lisboa Interiors/ })).toBeVisible()
})

test('reset demo data from settings', async ({ page }) => {
  await signInAsSuperAdmin(page)
  await page.goto('/admin/settings')
  await page.getByRole('button', { name: 'Reset demo data' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Reset demo data' }).click()
  await expectToast(page, 'Demo data reset')
})
