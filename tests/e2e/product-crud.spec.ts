import { expect, test } from '@playwright/test'
import { PNG_1PX, confirmDialog, expectToast, signInAsSuperAdmin } from './helpers'

// §19.3–19.7 Product create/edit, duplicate/delete, publish/unpublish, filters
test('create a product, publish it, duplicate and delete it', async ({ page }) => {
  await signInAsSuperAdmin(page)
  await page.goto('/admin/products')

  // Business must be chosen first
  await page.getByRole('button', { name: 'Add product' }).click()
  const picker = page.getByRole('dialog', { name: 'Add a product' })
  await picker.getByLabel('Business').selectOption({ label: 'Nordhaus Living' })
  await picker.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Add product' })).toBeVisible()
  await expect(page.getByRole('combobox', { name: /^Business/ })).toHaveValue('biz_nord')

  await page.getByRole('textbox', { name: /^Product name/ }).fill('Aurora Side Chair')
  await expect(page.getByLabel('Product URL')).toHaveValue('aurora-side-chair')
  await expect(page.getByText('Demo URL: https://nordhaus.example.com/products/aurora-side-chair')).toBeVisible()
  await page.getByLabel('Price', { exact: true }).fill('349.00')
  await page.getByLabel('Width').fill('52')
  await page.getByLabel('Height').fill('81')
  await page.getByLabel('Depth').fill('55')

  // Save draft → moves to the edit URL
  await page.getByRole('button', { name: 'Save draft' }).click()
  await expectToast(page, 'Draft saved')
  await expect(page).toHaveURL(/\/admin\/products\/prd_[^/]+\/edit/)

  // Publishing without an image is blocked
  await page.getByRole('button', { name: 'Publish' }).click()
  await expect(page.getByText('Add at least one product image before publishing.').first()).toBeVisible()

  // Invalid file type rejected, valid image accepted
  await page.getByLabel('Upload product images').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') })
  await expect(page.getByText(/notes\.txt: unsupported file type/)).toBeVisible()
  await page.getByLabel('Upload product images').setInputFiles({ name: 'chair.png', mimeType: 'image/png', buffer: PNG_1PX })
  await expect(page.getByText('Primary', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Publish' }).click()
  const published = page.getByRole('dialog', { name: 'Product published' })
  await expect(published).toBeVisible()
  await expect(published.getByText('https://nordhaus.example.com/products/aurora-side-chair')).toBeVisible()
  await published.getByRole('button', { name: 'Keep editing' }).click()
  await expect(page.getByRole('button', { name: 'Unpublish' })).toBeVisible()

  // Unpublish with confirmation
  await page.getByRole('button', { name: 'Unpublish' }).click()
  await confirmDialog(page, 'Unpublish')
  await expectToast(page, 'Unpublished')

  // List: search + business + status filters
  await page.goto('/admin/products')
  await page.getByRole('searchbox', { name: 'Search products by name' }).fill('Aurora')
  await expect(page.getByRole('link', { name: 'Aurora Side Chair', exact: true })).toBeVisible()
  await page.getByLabel('Filter by status').selectOption('published')
  await expect(page.getByText('No products match these filters')).toBeVisible()
  await page.getByLabel('Filter by status').selectOption('draft')
  await page.getByLabel('Filter by business').selectOption({ label: 'Nordhaus Living' })
  await expect(page).toHaveURL(/business=biz_nord/)
  await expect(page.getByRole('link', { name: 'Aurora Side Chair', exact: true })).toBeVisible()

  // Duplicate
  await page.getByRole('button', { name: 'Actions for Aurora Side Chair', exact: true }).click()
  await page.getByRole('menuitem', { name: 'Duplicate' }).click()
  await expectToast(page, 'Product duplicated')
  await expect(page.getByRole('link', { name: 'Aurora Side Chair (copy)' })).toBeVisible()

  // Delete the copy
  await page.getByRole('button', { name: 'Actions for Aurora Side Chair (copy)' }).click()
  await page.getByRole('menuitem', { name: 'Delete' }).click()
  await confirmDialog(page, 'Delete product')
  await expectToast(page, 'Product deleted')
  await expect(page.getByRole('link', { name: 'Aurora Side Chair (copy)' })).toBeHidden()
})

test('business filter only shows that business’s products', async ({ page }) => {
  await signInAsSuperAdmin(page)
  await page.goto('/admin/products?business=biz_verde')
  const rows = page.locator('tbody tr')
  await expect(rows.first()).toBeVisible()
  const count = await rows.count()
  for (let i = 0; i < count; i++) await expect(rows.nth(i)).toContainText('Atelier Verde')
})

test('product editor shows AR readiness for each platform', async ({ page }) => {
  await signInAsSuperAdmin(page)
  await page.goto('/admin/products/prd_sheen_chair/edit')
  const readiness = page.getByRole('region', { name: 'AR readiness' })
  await expect(readiness.getByText('Works on every device.')).toBeVisible({ timeout: 60_000 })
  await expect(readiness.getByText('Android AR')).toBeVisible()
  await expect(readiness.getByText('iPhone and iPad AR')).toBeVisible()
  await expect(readiness.getByText('AR shows “True size”', { exact: false })).toBeVisible()
})

test('publishing under an inactive catalog says it is not visible yet (no false "live" claim)', async ({ page }) => {
  await signInAsSuperAdmin(page)
  await page.goto('/admin/products/prd_desk/edit') // Oak & Ember: catalog inactive
  await page.getByRole('button', { name: 'Unpublish' }).click()
  await confirmDialog(page, 'Unpublish')
  await page.getByRole('button', { name: 'Publish' }).click()
  await expect(page.getByText('The catalog is not active yet', { exact: false }).first()).toBeVisible()
})
