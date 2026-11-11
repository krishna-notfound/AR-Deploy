import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Page, expect, test } from '@playwright/test'
import { expectToast, signInAsBusiness, signInAsPlatform } from './helpers'

// Changeable catalogue banner (ADR-0065) on a phone (Pixel 7): the company form's banner field and the crop dialog fit the screen with
// touch-sized controls, the Website Editor's panel has no sideways scroll, and the catalogue top (own picture, then default) keeps its
// text readable and does not overflow.
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'images')
const fixture = (name: string) => join(FIXTURES, name)

const dialog = (page: Page) => page.getByRole('dialog', { name: /^Adjust / })
const save = (page: Page) => dialog(page).getByRole('button', { name: 'Save', exact: true })
const noSidewaysScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)

async function goInApp(page: Page, path: string) {
  await page.evaluate((to) => {
    window.history.pushState({}, '', to)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

/** Whether the catalogue's heading stays inside the screen (the white text over the picture is not pushed out of view). */
async function headingFits(page: Page) {
  return page.evaluate(() => {
    const h1 = document.querySelector('#catalog-title') as HTMLElement
    const r = h1.getBoundingClientRect()
    return { fits: r.left >= 0 && r.right <= window.innerWidth, color: getComputedStyle(h1).color }
  })
}

test('the banner field and its crop dialog fit a phone; the catalogue top shows the picture without overflow', async ({ page }) => {
  await signInAsBusiness(page, 'Nordhaus Living')
  await page.goto('/dashboard/settings/business')
  await expect(page.getByLabel('Upload banner')).toBeAttached()
  expect(await noSidewaysScroll(page)).toBe(true)

  await page.getByLabel('Upload banner').setInputFiles(fixture('wide-4x1.jpg'))
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
  await dialog(page).getByRole('button', { name: 'Fill the frame' }).click()
  await save(page).click()
  await expect(dialog(page)).toBeHidden({ timeout: 20_000 })
  expect(await noSidewaysScroll(page)).toBe(true)
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expectToast(page, 'Changes saved')

  await goInApp(page, '/catalog/nordhaus')
  const top = page.locator('section[aria-labelledby="catalog-title"] img[data-banner]')
  await expect(top).toHaveAttribute('data-banner', 'own')
  await expect.poll(() => top.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true)
  await expect(page.getByRole('heading', { level: 1, name: 'Nordhaus Living' })).toBeVisible()
  expect((await headingFits(page)).fits).toBe(true)
  expect(await noSidewaysScroll(page)).toBe(true)
})

test('the Website Editor panel has no sideways scroll on a phone, and the default banner shows on a catalogue', async ({ page }) => {
  await signInAsPlatform(page, 'admin')
  await page.goto('/admin/editor/site')
  const panel = page.getByRole('region', { name: 'Catalogue banner' })
  await expect(panel).toBeVisible({ timeout: 20_000 })
  expect(await noSidewaysScroll(page)).toBe(true)
  await panel.getByTestId('upload-image').setInputFiles(fixture('landscape.jpg'))
  await expect(save(page)).toBeEnabled({ timeout: 15_000 })
  await page.waitForTimeout(600)
  const viewport = page.viewportSize()!
  for (const name of ['Fill the frame', 'Cancel', 'Save']) {
    const b = (await dialog(page).getByRole('button', { name, exact: true }).boundingBox())!
    expect(b.height, name).toBeGreaterThanOrEqual(43.5)
    expect(b.y + b.height, name).toBeLessThanOrEqual(viewport.height + 1)
  }
  await dialog(page).getByRole('button', { name: 'Fill the frame' }).click()
  await save(page).click()
  await expect(dialog(page)).toBeHidden({ timeout: 20_000 })
  await expect(panel.getByRole('button', { name: 'Edit picture: Catalogue banner' })).toBeVisible()
  expect(await noSidewaysScroll(page)).toBe(true)

  await page.getByRole('toolbar', { name: 'Editor actions' }).getByRole('button', { name: 'Publish', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: /^Publish \d+ changes? to the live site\?/ })
  await confirm.getByRole('button', { name: 'Publish', exact: true }).click()
  await expectToast(page, /^Published version \d+/)

  await goInApp(page, '/catalog/casa-lisboa')
  const top = page.locator('section[aria-labelledby="catalog-title"] img[data-banner]')
  await expect(top).toHaveAttribute('data-banner', 'default')
  await expect.poll(() => top.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true)
  expect((await headingFits(page)).fits).toBe(true)
  expect(await noSidewaysScroll(page)).toBe(true)
})
