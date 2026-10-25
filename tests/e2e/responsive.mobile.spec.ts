import { expect, test } from '@playwright/test'
import { signInAsSuperAdmin } from './helpers'

// §19.14 Responsive layouts (runs in the mobile project)
test('mobile navigation drawer opens, navigates and closes', async ({ page }) => {
  await signInAsSuperAdmin(page)
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden()
  await page.getByRole('button', { name: 'Open navigation' }).click()
  const drawer = page.getByRole('dialog', { name: 'Navigation' })
  await expect(drawer).toBeVisible()
  await drawer.getByRole('link', { name: 'All Products' }).click()
  await expect(drawer).toBeHidden()
  await expect(page.getByRole('heading', { level: 1, name: 'All products' })).toBeVisible()
  // Table collapses to a card list on mobile
  await expect(page.getByRole('list', { name: 'Products' })).toBeVisible()
})

test('public product page fits a phone screen without horizontal scroll', async ({ page }) => {
  await page.goto('/products/casa-lisboa/glam-velvet-sofa')
  await expect(page.getByRole('heading', { level: 1, name: 'Glam Velvet Sofa' })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
})

test('the business application wizard fits a phone and shows its step counter', async ({ page }) => {
  await page.goto('/apply?lang=pt')
  await expect(page.getByRole('heading', { level: 1, name: 'Candidatura de empresa' })).toBeVisible()
  await expect(page.getByText('Passo 1 de 5')).toBeVisible()
  // The anti-spam field is invisible to people and to screen readers.
  await expect(page.getByRole('textbox', { name: /fax/i })).toHaveCount(0)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(1)
  // The split sign-up layout replaces the site header: the way back is the "Voltar ao site" link.
  await expect(page.getByRole('link', { name: 'Voltar ao site' })).toBeVisible()
})
