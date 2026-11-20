import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { signInAsBusiness } from './helpers'

// The crop dialog on a phone (Pixel 7): it fits the screen, every control is reachable and at least 44 px, and the
// product page stage is 4:5 at this width (ADR-0063, ADR-0064).
const picture = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'images', 'landscape.jpg')

test('the crop dialog fits a phone and its controls are touch-sized', async ({ page }) => {
  await signInAsBusiness(page, 'Nordhaus Living')
  await page.goto('/dashboard/products/new')
  await page.getByLabel('Upload product images').setInputFiles(picture)
  // A main photo: step 1 is the catalogue card crop, step 2 the product page crop (ADR-0081).
  const dialog = page.getByRole('dialog', { name: 'Catalogue card crop' })
  await expect(dialog).toBeVisible()
  const save = dialog.getByRole('button', { name: 'Save', exact: true })
  await expect(save).toBeEnabled({ timeout: 15_000 })

  const viewport = page.viewportSize()!
  await page.waitForTimeout(600) // the dialog slides in; measure it at rest
  const box = (await dialog.boundingBox())!
  expect(box.width).toBeLessThanOrEqual(viewport.width)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1)
  for (const name of ['Fill the frame', 'Show whole picture', 'Reset', 'Zoom in', 'Zoom out', 'Cancel', 'Save']) {
    const b = (await dialog.getByRole('button', { name, exact: true }).boundingBox())!
    expect(b.height, name).toBeGreaterThanOrEqual(43.5)
    expect(b.y + b.height, name).toBeLessThanOrEqual(viewport.height + 1)
  }
  expect((await dialog.getByRole('slider', { name: 'Zoom' }).boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  await dialog.getByRole('button', { name: 'Fill the frame' }).click()
  await save.click()
  await expect(dialog).toBeHidden()

  // Step 2 (product page crop) also fits, and its shape choice is reachable.
  const step2 = page.getByRole('dialog', { name: 'Product page crop' })
  const save2 = step2.getByRole('button', { name: 'Save', exact: true })
  await expect(save2).toBeEnabled({ timeout: 15_000 })
  await page.waitForTimeout(600)
  const box2 = (await step2.boundingBox())!
  expect(box2.width).toBeLessThanOrEqual(viewport.width)
  expect(box2.y + box2.height).toBeLessThanOrEqual(viewport.height + 1)
  await expect(step2.getByRole('radio', { name: 'Original' })).toHaveAttribute('aria-checked', 'true')
  const s2 = (await save2.boundingBox())!
  expect(s2.y + s2.height).toBeLessThanOrEqual(viewport.height + 1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
  await save2.click()
  await expect(step2).toBeHidden({ timeout: 20_000 })
  // Both edit buttons are shown without hovering.
  await expect(page.getByRole('button', { name: 'Edit catalogue crop of landscape' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit product page crop of landscape' })).toBeVisible()
})