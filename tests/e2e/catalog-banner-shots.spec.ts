import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Page, expect, test } from '@playwright/test'
import { expectToast, signInAsBusiness, signInAsPlatform } from './helpers'

// Screenshots for looking at (not baselines; nothing is compared): the catalogue top with the built-in photograph, the platform's
// default banner and a company's own banner, and the two editors (Website Editor panel, company form field) in light and dark,
// at 1440 and 390 px. Runs only when BANNER_SHOTS_DIR is set:
//   BANNER_SHOTS_DIR=<folder> npx playwright test tests/e2e/catalog-banner-shots.spec.ts --project=desktop
const OUT = process.env.BANNER_SHOTS_DIR
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'images')
const fixture = (name: string) => join(FIXTURES, name)

test.skip(!OUT, 'set BANNER_SHOTS_DIR to write the screenshots')
test.setTimeout(300_000)

const dialog = (page: Page) => page.getByRole('dialog', { name: /^Adjust / })
const save = (page: Page) => dialog(page).getByRole('button', { name: 'Save', exact: true })
const SIZES = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const

async function goInApp(page: Page, path: string) {
  await page.evaluate((to) => {
    window.history.pushState({}, '', to)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

async function pick(page: Page, input: ReturnType<Page['locator']>, name: string) {
  await input.setInputFiles(fixture(name))
  await expect(save(page)).toBeEnabled({ timeout: 15_000 })
  await dialog(page).getByRole('button', { name: 'Fill the frame' }).click()
  await save(page).click()
  await expect(dialog(page)).toBeHidden({ timeout: 20_000 })
}

test('screenshots of the catalogue top and the two editors', async ({ page }) => {
  mkdirSync(OUT!, { recursive: true })
  const theme = (mode: 'light' | 'dark') => page.evaluate((m) => (m === 'dark' ? document.documentElement.setAttribute('data-theme', 'dark') : document.documentElement.removeAttribute('data-theme')), mode)
  const shot = async (locator: ReturnType<Page['locator']>, file: string) => {
    await locator.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await locator.screenshot({ path: join(OUT!, file) })
  }
  /** The top of the catalogue page (the first screen) and the catalogue top section alone, at both sizes. */
  async function catalogueShots(name: string) {
    await expect(page.locator('section[aria-labelledby="catalog-title"] img[data-banner]')).toBeVisible()
    await expect.poll(() => page.locator('section[aria-labelledby="catalog-title"] img[data-banner]').evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true)
    for (const size of SIZES) {
      await page.setViewportSize(size)
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.waitForTimeout(400)
      await page.screenshot({ path: join(OUT!, `catalogue-${name}-${size.width}.png`) })
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name} ${size.width}: no sideways scroll`).toBe(true)
    }
  }
  async function editorShots(locator: ReturnType<Page['locator']>, name: string) {
    for (const size of SIZES) {
      await page.setViewportSize(size)
      for (const mode of ['light', 'dark'] as const) {
        await theme(mode)
        await shot(locator, `${name}-${size.width}-${mode}.png`)
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name} ${size.width} ${mode}: no sideways scroll`).toBe(true)
      }
      await theme('light')
    }
  }

  await page.setViewportSize(SIZES[0])
  // Built-in photograph.
  await page.goto('/catalog/nordhaus')
  await expect(page.getByRole('heading', { level: 1, name: 'Nordhaus Living' })).toBeVisible()
  await catalogueShots('builtin')

  // Company form: empty, then with a banner, then saved and shown on the catalogue.
  await page.setViewportSize(SIZES[0])
  await signInAsBusiness(page, 'Nordhaus Living')
  await page.goto('/dashboard/settings/business')
  const field = page.getByTestId('banner-upload').locator('xpath=..')
  await expect(page.getByLabel('Upload banner')).toBeAttached()
  await editorShots(field, 'company-banner-empty')
  await page.setViewportSize(SIZES[0])
  await pick(page, page.getByLabel('Upload banner'), 'wide-4x1.jpg')
  await editorShots(field, 'company-banner-set')
  await page.setViewportSize(SIZES[0])
  await page.getByRole('button', { name: 'Save changes' }).click()
  await expectToast(page, 'Changes saved')
  await goInApp(page, '/catalog/nordhaus')
  await expect(page.getByRole('heading', { level: 1, name: 'Nordhaus Living' })).toBeVisible()
  await catalogueShots('own')

  // Website Editor panel: empty, then a default banner, then published and shown on another catalogue.
  await page.setViewportSize(SIZES[0])
  await signInAsPlatform(page, 'admin')
  await page.goto('/admin/editor/site')
  const panel = page.getByRole('region', { name: 'Catalogue banner' })
  await expect(panel).toBeVisible({ timeout: 20_000 })
  await editorShots(panel, 'editor-banner-empty')
  await page.setViewportSize(SIZES[0])
  await pick(page, panel.getByTestId('upload-image'), 'landscape.jpg')
  await editorShots(panel, 'editor-banner-set')
  await page.setViewportSize(SIZES[0])
  await page.getByRole('toolbar', { name: 'Editor actions' }).getByRole('button', { name: 'Publish', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: /^Publish \d+ changes? to the live site\?/ })
  await confirm.getByRole('button', { name: 'Publish', exact: true }).click()
  await expectToast(page, /^Published version \d+/)
  await goInApp(page, '/catalog/casa-lisboa')
  await expect(page.getByRole('heading', { level: 1, name: 'Casa Lisboa' })).toBeVisible()
  await catalogueShots('default')
  // Dark theme on the catalogue top (public pages follow the theme too).
  await theme('dark')
  await catalogueShots('default-dark')
})
