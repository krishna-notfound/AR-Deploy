import { expect, test } from '@playwright/test'

test('landing page tells the story and leads into the demo', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1, name: 'Let customers place the sofa before they buy it.' })).toBeVisible()
  // The hero stage is the real model, measured in the browser (not a hard-coded caption).
  await expect(page.getByText(/Measured from the model: \d+ × \d+ × \d+ cm/)).toBeVisible({ timeout: 30_000 })

  // Showcase uses published products from the service and links to real product pages.
  const showcase = page.locator('#showcase')
  await expect(showcase.getByRole('link').first()).toBeVisible()
  await showcase.getByRole('link', { name: /Glam Velvet Sofa/ }).click()
  await expect(page).toHaveURL(/\/products\/casa-lisboa\/glam-velvet-sofa/)

  // The demo account picker is embedded at the end of the landing page and on /demo.
  await page.goto('/')
  await page.getByRole('banner').getByRole('link', { name: 'Open the demo' }).click()
  await expect(page).toHaveURL(/\/demo$/)
  await page.getByRole('button', { name: 'Continue as Super Admin' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
})

test('old "/?next=" links still reach the account picker', async ({ page }) => {
  await page.goto('/?next=%2Fadmin%2Fanalytics')
  await expect(page).toHaveURL(/\/demo\?next=%2Fadmin%2Fanalytics/)
  await page.getByRole('button', { name: 'Continue as Super Admin' }).click()
  await expect(page).toHaveURL(/\/admin\/analytics$/)
})

test('/login forwards to the demo picker when no backend is configured', async ({ page }) => {
  await page.goto('/login')
  await expect(page).toHaveURL(/\/demo$/)
})
