import { expect, test } from '@playwright/test'
import { signInAsSuperAdmin } from './helpers'

// §19.1 Super Admin navigation
test('every Super Admin sidebar item opens its page', async ({ page }) => {
  await signInAsSuperAdmin(page)
  const nav = page.getByRole('navigation', { name: 'Main' })
  const pages: [string, string][] = [
    ['Businesses', 'Businesses'],
    ['All Products', 'All products'],
    ['Analytics', 'Analytics'],
    ['Catalogs & QR Codes', 'Catalogs & QR codes'],
    ['Overview', 'Overview'],
  ]
  for (const [link, heading] of pages) {
    await nav.getByRole('link', { name: link }).click()
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
  }
  // Settings is full-screen, outside the shell: it opens on My account and closes back to where it was opened.
  await nav.getByRole('link', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'My account' })).toBeVisible()
  await page.getByRole('button', { name: 'Close settings' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
  // Sample data is labelled on overview
  await expect(page.getByText('Sample data').first()).toBeVisible()
})

test('logout returns to the demo entry and guards admin routes', async ({ page }) => {
  await signInAsSuperAdmin(page)
  await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Log out' }).click()
  await expect(page.getByRole('heading', { name: 'Choose how to explore the platform.' })).toBeVisible()
  await page.goto('/admin/products')
  await expect(page).toHaveURL(/\/demo\?next=%2Fadmin%2Fproducts/)
})
