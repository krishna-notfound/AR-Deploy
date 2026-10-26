import { expect, test } from '@playwright/test'
import { signInAsPlatform } from './helpers'

// S4 3D model requests at phone width (demo, Pixel 7 project): the staff queue is a list of cards, and the request's
// photo viewer opens and closes with its own close button.
test('the 3D requests queue shows cards and the photo viewer closes with its button', async ({ page }) => {
  await signInAsPlatform(page, 'admin')
  await page.getByRole('button', { name: 'Open navigation' }).click()
  await page.getByRole('dialog', { name: 'Navigation' }).getByRole('link', { name: /^3D requests/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: '3D model requests' })).toBeVisible()

  // Cards, not a table.
  const cards = page.getByRole('list', { name: '3D model requests' })
  await expect(cards).toBeVisible()
  await expect(page.getByRole('table')).toBeHidden()
  await expect(cards.getByRole('listitem')).not.toHaveCount(0)
  await expect(cards.getByText('Casa Lisboa Interiors').first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)

  await cards.getByRole('link', { name: 'Alfama Tall Bookcase' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Alfama Tall Bookcase' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)

  const thumb = page.getByRole('button', { name: /^Open photo 1: / })
  await thumb.click()
  const viewer = page.getByRole('dialog')
  await expect(viewer).toBeVisible()
  await viewer.getByRole('button', { name: 'Close photo' }).click()
  await expect(viewer).toBeHidden()
})
