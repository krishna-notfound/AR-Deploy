import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Page, expect, test } from '@playwright/test'
import { expectToast, signInAsPlatform } from './helpers'

// Screenshots for looking at (not baselines; nothing is compared): the Website Editor's picture slots and the landing page's About
// grid, collections and picture + text section at 1440 and 390 px, with pictures made by the crop dialog, editor in light and dark.
// Runs only when CROP_SHOTS_DIR is set:  CROP_SHOTS_DIR=<folder> npx playwright test tests/e2e/site-image-crop-shots.spec.ts --project=desktop
const OUT = process.env.CROP_SHOTS_DIR
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'images')
const fixture = (name: string) => join(FIXTURES, name)

test.skip(!OUT, 'set CROP_SHOTS_DIR to write the screenshots')
test.setTimeout(240_000)

const dialog = (page: Page) => page.getByRole('dialog', { name: /^Adjust / })
const save = (page: Page) => dialog(page).getByRole('button', { name: 'Save', exact: true })

async function pick(page: Page, input: ReturnType<Page['locator']>, name: string, fill: boolean) {
  await input.setInputFiles(fixture(name))
  await expect(save(page)).toBeEnabled({ timeout: 15_000 })
  if (fill) await dialog(page).getByRole('button', { name: 'Fill the frame' }).click()
  await save(page).click()
  await expect(dialog(page)).toBeHidden({ timeout: 20_000 })
}

test('screenshots of the editor and the landing page', async ({ page }) => {
  mkdirSync(OUT!, { recursive: true })
  const shot = async (locator: ReturnType<Page['locator']>, file: string) => {
    await locator.scrollIntoViewIfNeeded()
    await page.waitForTimeout(250)
    await locator.screenshot({ path: join(OUT!, file) })
  }

  await page.setViewportSize({ width: 1440, height: 900 })
  await signInAsPlatform(page, 'admin')
  await page.goto('/admin/editor/landing')
  const sections = page.getByRole('region', { name: 'Sections' })
  await expect(sections).toBeVisible({ timeout: 20_000 })

  // Hero.
  const hero = page.getByRole('region', { name: 'Hero picture' })
  await pick(page, hero.getByTestId('upload-image').first(), 'landscape.jpg', true)

  // Own picture + text section (a wide picture saved whole: a 4:3 copy with bars).
  await sections.getByRole('button', { name: 'Add section' }).click()
  await sections.getByRole('button', { name: /^Picture and text/ }).click()
  await sections.getByRole('textbox', { name: 'Heading (English)' }).fill('Our workshop')
  await sections.getByRole('textbox', { name: 'Text (optional) (English)' }).fill('Every piece is made by hand in our workshop.')
  await pick(page, sections.getByTestId('upload-image').first(), 'wide-4x1.jpg', false)
  await sections.getByRole('button', { name: 'Edit About' }).click()
  await pick(page, sections.getByTestId('upload-image').nth(0), 'landscape.jpg', true)
  await pick(page, sections.getByTestId('upload-image').nth(1), 'portrait.jpg', false)
  await pick(page, sections.getByTestId('upload-image').nth(2), 'square.jpg', false)
  await sections.getByRole('textbox', { name: 'Description (English)' }).nth(2).fill('A bronze bowl')

  // A collection card with an uploaded portrait.
  await page.getByRole('button', { name: 'Add a collection' }).click()
  const cardPicture = page.getByRole('img', { name: 'The picture of this card' }).locator('xpath=ancestor::fieldset')
  await page.getByRole('textbox', { name: 'Title (English)' }).last().fill('Handmade tables')
  await pick(page, cardPicture.getByTestId('upload-image'), 'tall-1x4.jpg', false)

  // ---- the editor, 1440 and 390, light and dark ----
  async function editorShots(width: number, suffix: string) {
    await page.setViewportSize({ width, height: width > 600 ? 900 : 844 })
    await page.evaluate(() => document.documentElement.removeAttribute('data-theme'))
    await shot(sections, `editor-sections-about-${width}-light${suffix}.png`)
    await shot(hero, `editor-hero-${width}-light${suffix}.png`)
    await shot(cardPicture, `editor-collection-${width}-light${suffix}.png`)
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
    await shot(sections, `editor-sections-about-${width}-dark${suffix}.png`)
    await shot(cardPicture, `editor-collection-${width}-dark${suffix}.png`)
    await page.evaluate(() => document.documentElement.removeAttribute('data-theme'))
  }
  await editorShots(1440, '')
  await editorShots(390, '')

  // ---- publish, then the landing page ----
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.getByRole('toolbar', { name: 'Editor actions' }).getByRole('button', { name: 'Publish', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: /^Publish \d+ changes? to the live site\?/ })
  await confirm.getByRole('button', { name: 'Publish', exact: true }).click()
  await expectToast(page, /^Published version \d+/)
  await page.evaluate(() => {
    window.history.pushState({}, '', '/')
    window.dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.locator('#sobre')).toBeVisible()

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: width > 600 ? 900 : 844 })
    await shot(page.locator('#sobre'), `landing-about-${width}.png`)
    await shot(page.locator('#colecoes'), `landing-collections-${width}.png`)
    await shot(page.getByRole('heading', { level: 2, name: 'Our workshop' }).locator('xpath=ancestor::section'), `landing-imagetext-${width}.png`)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(250)
    await page.screenshot({ path: join(OUT!, `landing-top-${width}.png`) })
  }
})
