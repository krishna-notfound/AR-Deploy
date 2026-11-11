import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Locator, type Page, expect, test } from '@playwright/test'
import { expectToast, signInAsBusiness, signInAsPlatform } from './helpers'

// Changeable catalogue banner (ADR-0065). Demo mode, the real crop dialog, the pictures of tests/fixtures/images.
// A Website Editor picture only lives in the browser tab in the demo, so after publishing the test goes to the catalogues by in-app
// navigation (no reload), as a signed-in editor would; a company's own banner is kept in the demo data and survives a reload.
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'images')
const fixture = (name: string) => join(FIXTURES, name)

const dialog = (page: Page) => page.getByRole('dialog', { name: /^Adjust / })
const save = (page: Page) => dialog(page).getByRole('button', { name: 'Save', exact: true })

/** Goes to a page of the app without reloading it. */
async function goInApp(page: Page, path: string) {
  await page.evaluate((to) => {
    window.history.pushState({}, '', to)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

/** The picture of the catalogue top and what it is: built-in, default or own. */
const top = (page: Page) => page.locator('section[aria-labelledby="catalog-title"] img[data-banner]')

/** The picture as the browser decoded it, and the box it is drawn in. */
async function measure(img: Locator) {
  await expect(img).toBeVisible()
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true)
  return img.evaluate((el: HTMLImageElement) => {
    const r = el.getBoundingClientRect()
    return { naturalWidth: el.naturalWidth, naturalHeight: el.naturalHeight, boxWidth: r.width, boxHeight: r.height, fit: getComputedStyle(el).objectFit, src: el.currentSrc }
  })
}

/** Chooses a file in an upload input, fills the frame in the dialog and saves. */
async function pick(page: Page, input: Locator, name: string) {
  await input.setInputFiles(fixture(name))
  await expect(dialog(page)).toBeVisible()
  await expect(save(page)).toBeEnabled({ timeout: 15_000 })
  await dialog(page).getByRole('button', { name: 'Fill the frame' }).click()
  await save(page).click()
  await expect(dialog(page)).toBeHidden({ timeout: 20_000 })
}

async function publish(page: Page) {
  await page.getByRole('toolbar', { name: 'Editor actions' }).getByRole('button', { name: 'Publish', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: /^Publish \d+ changes? to the live site\?/ })
  await expect(confirm).toBeVisible()
  await expect(confirm.getByText('Catalogue banner')).toBeVisible() // the summary counts it
  await confirm.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(confirm).toBeHidden()
  await expectToast(page, /^Published version \d+/)
}

test('built-in photo, a company banner, the platform default, and Remove back to the default', async ({ page }) => {
  // 1. Nothing set: the built-in Sanctus photograph, anchored as before.
  await page.goto('/catalog/nordhaus')
  await expect(page.getByRole('heading', { level: 1, name: 'Nordhaus Living' })).toBeVisible()
  await expect(top(page)).toHaveAttribute('data-banner', 'builtin')
  expect((await measure(top(page))).src).toContain('/images/sanctus/v2/lamp-vase.webp')

  // 2. The company owner sets a banner of its own in the company form (next to the logo) and saves.
  await signInAsBusiness(page, 'Nordhaus Living')
  await page.goto('/dashboard/settings/business')
  await expect(page.getByText('Catalogue banner').first()).toBeVisible()
  await expect(page.getByText('No banner of its own: the catalogue shows the default banner.').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit picture: catalogue banner' })).toHaveCount(0)
  await page.getByLabel('Upload banner').setInputFiles(fixture('wide-4x1.jpg'))
  await expect(dialog(page)).toHaveAccessibleName('Adjust the banner')
  await expect(save(page)).toBeEnabled({ timeout: 15_000 })
  await dialog(page).getByRole('button', { name: 'Fill the frame' }).click()
  await save(page).click()
  await expect(dialog(page)).toBeHidden({ timeout: 20_000 })
  await expect(page.getByRole('button', { name: 'Edit picture: catalogue banner' })).toBeVisible()
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expectToast(page, 'Changes saved')

  // Its catalogue shows it, cut to 2:1; another catalogue still shows the built-in photo (no default yet).
  await goInApp(page, '/catalog/nordhaus')
  await expect(top(page)).toHaveAttribute('data-banner', 'own')
  const own = await measure(top(page))
  expect(own.naturalWidth / own.naturalHeight).toBeCloseTo(2, 1)
  expect(own.fit).toBe('cover')
  await goInApp(page, '/catalog/casa-lisboa')
  await expect(page.getByRole('heading', { level: 1, name: 'Casa Lisboa' })).toBeVisible()
  await expect(top(page)).toHaveAttribute('data-banner', 'builtin')

  // 3. The platform sets the default banner in the Website Editor and publishes.
  await signInAsPlatform(page, 'admin')
  await page.goto('/admin/editor/site')
  const panel = page.getByRole('region', { name: 'Catalogue banner' })
  await expect(panel).toBeVisible({ timeout: 20_000 })
  await expect(panel.getByText(/show the built-in Sanctus photograph/)).toBeVisible()
  await expect(panel.getByText(/on a narrow screen its sides are trimmed/)).toBeVisible()
  await pick(page, panel.getByTestId('upload-image'), 'landscape.jpg')
  await expect(panel.getByRole('button', { name: 'Edit picture: Catalogue banner' })).toBeVisible()
  await publish(page)

  // The company with its own banner keeps it; the other catalogue now shows the default.
  await goInApp(page, '/catalog/nordhaus')
  await expect(top(page)).toHaveAttribute('data-banner', 'own')
  await goInApp(page, '/catalog/casa-lisboa')
  await expect(top(page)).toHaveAttribute('data-banner', 'default')
  const def = await measure(top(page))
  expect(def.naturalWidth / def.naturalHeight).toBeCloseTo(2, 1)
  expect(def.fit).toBe('cover')
  expect(def.src).toMatch(/^blob:/)
  // The name, eyebrow and piece count are still written over it, on the dark veil.
  await expect(page.getByRole('heading', { level: 1, name: 'Casa Lisboa' })).toBeVisible()
  await expect(page.locator('section[aria-labelledby="catalog-title"]').getByText(/^\d+ products?$/)).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

  // 4. The platform admin removes Nordhaus's own banner in the same form: the catalogue goes back to the default.
  await goInApp(page, '/admin/businesses/biz_nord')
  await page.getByRole('button', { name: 'Remove the banner (use the default)' }).click()
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expectToast(page, 'Changes saved')
  await goInApp(page, '/catalog/nordhaus')
  await expect(top(page)).toHaveAttribute('data-banner', 'default')
})

test('Edit picture reopens the company original with the crop it had', async ({ page }) => {
  await signInAsBusiness(page, 'Nordhaus Living')
  await page.goto('/dashboard/settings/business')
  await page.getByLabel('Upload banner').setInputFiles(fixture('landscape.jpg'))
  await expect(save(page)).toBeEnabled({ timeout: 15_000 })
  await dialog(page).getByRole('button', { name: 'Fill the frame' }).click()
  const filledZoom = Number(await page.getByRole('slider', { name: 'Zoom' }).inputValue())
  await save(page).click()
  await expect(dialog(page)).toBeHidden({ timeout: 20_000 })

  await page.getByRole('button', { name: 'Edit picture: catalogue banner' }).click()
  await expect(save(page)).toBeEnabled({ timeout: 15_000 })
  expect(Number(await page.getByRole('slider', { name: 'Zoom' }).inputValue())).toBeCloseTo(filledZoom, 1)
  // It opened the whole original (not the 2:1 copy): showing it whole needs a smaller zoom.
  await dialog(page).getByRole('button', { name: 'Show whole picture' }).click()
  expect(Number(await page.getByRole('slider', { name: 'Zoom' }).inputValue())).toBeLessThan(filledZoom)
  await dialog(page).getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog(page)).toBeHidden()
})

test('the company form of a new company asks to save first (a banner needs the company)', async ({ page }) => {
  await signInAsPlatform(page, 'admin')
  await page.goto('/admin/businesses/new')
  await expect(page.getByText('Save the company first, then you can add a banner.')).toBeVisible()
  await expect(page.getByLabel('Upload banner')).toHaveCount(0)
})
