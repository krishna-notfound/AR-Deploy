import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Page, expect, test } from '@playwright/test'
import { expectToast, signInAsPlatform } from './helpers'

// The crop dialog in the Website Editor on a phone (Pixel 7), and the About grid with a third picture on the landing page
// (ADR-0063): the dialog fits the screen with touch-sized controls, and the landing has no sideways scroll.
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'images')

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Adjust the picture' })
const save = (page: Page) => dialog(page).getByRole('button', { name: 'Save', exact: true })

async function goInApp(page: Page, path: string) {
  await page.evaluate((to) => {
    window.history.pushState({}, '', to)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

test('the editor dialog fits a phone with touch-sized controls; the About grid with a third picture does not overflow', async ({ page }) => {
  await signInAsPlatform(page, 'admin')
  await page.goto('/admin/editor/landing')
  const sections = page.getByRole('region', { name: 'Sections' })
  await expect(sections).toBeVisible({ timeout: 20_000 })
  await sections.getByRole('button', { name: 'Edit About' }).click()

  await sections.getByTestId('upload-image').nth(2).setInputFiles(join(FIXTURES, 'square.jpg'))
  await expect(dialog(page)).toBeVisible()
  await expect(save(page)).toBeEnabled({ timeout: 15_000 })
  const viewport = page.viewportSize()!
  await page.waitForTimeout(600) // the dialog slides in; measure it at rest
  const box = (await dialog(page).boundingBox())!
  expect(box.width).toBeLessThanOrEqual(viewport.width)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1)
  for (const name of ['Fill the frame', 'Show whole picture', 'Cancel', 'Save']) {
    const b = (await dialog(page).getByRole('button', { name, exact: true }).boundingBox())!
    expect(b.height, name).toBeGreaterThanOrEqual(43.5)
    expect(b.y + b.height, name).toBeLessThanOrEqual(viewport.height + 1)
  }
  await save(page).click()
  await expect(dialog(page)).toBeHidden()
  await sections.getByRole('textbox', { name: 'Description (English)' }).fill('A bronze bowl')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  await page.getByRole('toolbar', { name: 'Editor actions' }).getByRole('button', { name: 'Publish', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: /^Publish \d+ changes? to the live site\?/ })
  await confirm.getByRole('button', { name: 'Publish', exact: true }).click()
  await expectToast(page, /^Published version \d+/)

  await goInApp(page, '/')
  const third = page.locator('#sobre').getByTestId('about-third')
  await expect(third).toBeVisible()
  await third.scrollIntoViewIfNeeded()
  const img = third.getByRole('img', { name: 'A bronze bowl' })
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true)
  const t = await third.boundingBox()
  expect(t!.width).toBeGreaterThan(60)
  expect(t!.height).toBeGreaterThan(60)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})
