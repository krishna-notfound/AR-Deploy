import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Locator, type Page, expect, test } from '@playwright/test'
import { expectToast, signInAsBusiness, signInAsPlatform } from './helpers'

// Image crop on upload (ADR-0063), Website Editor, logo and profile photo. Demo mode, the real crop dialog, the pictures of
// tests/fixtures/images. An uploaded picture only lives in the browser tab in the demo, so after publishing the test goes to
// the landing page by in-app navigation (no reload), exactly as a signed-in editor would.
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'images')
const fixture = (name: string) => join(FIXTURES, name)
const NUDGE = "This picture doesn't fill the frame."
const CAPTION = 'Textures that tell stories.'

const dialog = (page: Page) => page.getByRole('dialog', { name: /^Adjust / })
const zoom = (page: Page) => page.getByRole('slider', { name: 'Zoom' })
const toolbar = (page: Page) => page.getByRole('toolbar', { name: 'Editor actions' })
const save = (page: Page) => dialog(page).getByRole('button', { name: 'Save', exact: true })

/** Chooses a file in the given upload input and waits until the dialog has loaded it. */
async function choose(page: Page, input: Locator, name: string) {
  await input.setInputFiles(fixture(name))
  await expect(dialog(page)).toBeVisible()
  await expect(save(page)).toBeEnabled({ timeout: 15_000 })
}

/** The picture as the browser decoded it, and the box it is drawn in. */
async function measure(img: Locator) {
  await expect(img).toBeVisible()
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true)
  return img.evaluate((el: HTMLImageElement) => {
    const r = el.getBoundingClientRect()
    return { naturalWidth: el.naturalWidth, naturalHeight: el.naturalHeight, boxWidth: r.width, boxHeight: r.height, fit: getComputedStyle(el).objectFit }
  })
}

/** The width/height ratio of the picture's visible (non-transparent) pixels, and the alpha of two corners. */
async function opaque(img: Locator) {
  return img.evaluate((el: HTMLImageElement) => {
    const c = document.createElement('canvas')
    c.width = el.naturalWidth
    c.height = el.naturalHeight
    const g = c.getContext('2d')!
    g.drawImage(el, 0, 0)
    const { data, width, height } = g.getImageData(0, 0, c.width, c.height)
    let minX = width, minY = height, maxX = -1, maxY = -1
    for (let y = 0; y < height; y += 2)
      for (let x = 0; x < width; x += 2)
        if (data[(y * width + x) * 4 + 3]! > 200) {
          minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y)
        }
    const corner = (x: number, y: number) => data[(y * width + x) * 4 + 3]!
    return { ratio: (maxX - minX + 1) / (maxY - minY + 1), cornerAlpha: [corner(0, 0), corner(width - 1, height - 1)] }
  })
}

async function publish(page: Page) {
  await toolbar(page).getByRole('button', { name: 'Publish', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: /^Publish \d+ changes? to the live site\?/ })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: 'Publish', exact: true }).click()
  await expect(confirm).toBeHidden()
  await expectToast(page, /^Published version \d+/)
}

/** Goes to a page of the app without reloading it (the demo keeps uploaded pictures in memory only). */
async function goInApp(page: Page, path: string) {
  await page.evaluate((to) => {
    window.history.pushState({}, '', to)
    window.dispatchEvent(new PopStateEvent('popstate'))
  }, path)
}

const sections = (page: Page) => page.getByRole('region', { name: 'Sections' })

async function openAbout(page: Page) {
  await signInAsPlatform(page, 'admin')
  await page.goto('/admin/editor/landing')
  await expect(sections(page)).toBeVisible({ timeout: 20_000 })
  await sections(page).getByRole('button', { name: 'Edit About' }).click()
}
/** The upload input of an About slot: 0 main, 1 detail, 2 third. */
const aboutInput = (page: Page, n: number) => sections(page).getByTestId('upload-image').nth(n)

test.describe('Website Editor pictures', () => {
  test('About: main 4:5, detail 1:1 and the third picture; the landing shows them undistorted, the caption goes when the third is set', async ({ page }) => {
    await openAbout(page)
    expect(await dialog(page).count()).toBe(0)

    // Main photograph: landscape -> Fill the frame -> an 800 x 1000 copy.
    await choose(page, aboutInput(page, 0), 'landscape.jpg')
    await expect(dialog(page).getByText(NUDGE)).toBeVisible()
    await dialog(page).getByRole('button', { name: 'Fill the frame' }).click()
    await save(page).click()
    await expect(dialog(page)).toBeHidden()
    // Detail photograph: a portrait saved whole -> a square copy with transparent margins.
    await choose(page, aboutInput(page, 1), 'portrait.jpg')
    await save(page).click()
    await expect(dialog(page)).toBeHidden()
    // Third picture: Cancel adds nothing, then a square picture is saved.
    await choose(page, aboutInput(page, 2), 'square.jpg')
    await dialog(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog(page)).toBeHidden()
    await expect(sections(page).getByText('No third picture: the box shows the caption.')).toBeVisible()
    await choose(page, aboutInput(page, 2), 'square.jpg')
    await save(page).click()
    await expect(dialog(page)).toBeHidden()
    await expect(sections(page).getByRole('button', { name: 'Edit picture: Third picture' })).toBeVisible()
    await sections(page).getByRole('textbox', { name: 'Description (English)' }).nth(2).fill('A bronze bowl')

    await publish(page)
    await goInApp(page, '/')
    const about = page.locator('#sobre')
    await expect(about).toBeVisible()
    // The two photographs have no description, so they are decorative (not role img): find them by tag.
    const [main, detail] = [about.locator('img').nth(0), about.locator('img').nth(1)]
    const m = await measure(main)
    expect([m.naturalWidth, m.naturalHeight]).toEqual([800, 1000])
    expect(m.boxWidth / m.boxHeight).toBeCloseTo(0.8, 2)
    expect(m.fit).toBe('contain')
    expect((await opaque(main)).cornerAlpha).toEqual([255, 255]) // the frame is fully covered
    const d = await measure(detail)
    expect(d.naturalWidth / d.naturalHeight).toBeCloseTo(1, 2)
    expect(d.boxWidth / d.boxHeight).toBeCloseTo(1, 2)
    expect((await opaque(detail)).ratio).toBeCloseTo(900 / 1200, 1) // the portrait itself is not stretched
    const third = about.getByTestId('about-third').getByRole('img', { name: 'A bronze bowl' })
    const t = await measure(third)
    expect(t.fit).toBe('contain')
    expect(t.naturalWidth / t.naturalHeight).toBeCloseTo(1, 2)
    await expect(about.getByText(CAPTION)).toHaveCount(0) // the picture replaces the caption
  })

  test('without a third picture the About box keeps the caption; Remove brings it back', async ({ page }) => {
    await openAbout(page)
    await choose(page, aboutInput(page, 2), 'square.jpg')
    await save(page).click()
    await expect(dialog(page)).toBeHidden()
    await sections(page).getByRole('button', { name: 'Remove the third picture (show the caption)' }).click()
    await expect(sections(page).getByText('No third picture: the box shows the caption.')).toBeVisible()
    // Something to publish: the main photograph.
    await choose(page, aboutInput(page, 0), 'portrait.jpg')
    await save(page).click()
    await expect(dialog(page)).toBeHidden()
    await publish(page)
    await goInApp(page, '/')
    await expect(page.locator('#sobre').getByText(CAPTION)).toBeVisible()
    await expect(page.locator('#sobre').getByTestId('about-third')).toHaveCount(0)
  })

  test('Edit picture reopens the original with the crop it had, and saving keeps the same original', async ({ page }) => {
    await openAbout(page)
    await choose(page, aboutInput(page, 0), 'landscape.jpg')
    await dialog(page).getByRole('button', { name: 'Fill the frame' }).click()
    const filledZoom = Number(await zoom(page).inputValue())
    await save(page).click()
    await expect(dialog(page)).toBeHidden()

    await sections(page).getByRole('button', { name: 'Edit picture: Main photograph' }).click()
    await expect(dialog(page)).toBeVisible()
    await expect(save(page)).toBeEnabled({ timeout: 15_000 })
    await expect(dialog(page).getByText(NUDGE)).toBeHidden() // the crop was kept: the frame is still filled
    expect(Number(await zoom(page).inputValue())).toBeCloseTo(filledZoom, 1)
    // It opened the whole 1600 x 1000 original, not the 800 x 1000 copy: showing it whole needs a smaller zoom.
    await dialog(page).getByRole('button', { name: 'Show whole picture' }).click()
    expect(Number(await zoom(page).inputValue())).toBeLessThan(filledZoom)
    await save(page).click()
    await expect(dialog(page)).toBeHidden()
    const preview = sections(page).getByRole('img', { name: 'The picture of this section' }).first()
    await measure(preview)
    expect((await opaque(preview)).cornerAlpha).toEqual([0, 0]) // now whole, with transparent margins above and below
    await expect(sections(page).getByRole('button', { name: /^Edit picture:/ })).toHaveCount(1)
  })

  test('hero (16:9), a collection card (4:5) and a picture + text section (4:3) each get their own frame', async ({ page }) => {
    await signInAsPlatform(page, 'admin')
    await page.goto('/admin/editor/landing')
    await expect(sections(page)).toBeVisible({ timeout: 20_000 })

    // Hero picture.
    const hero = page.getByRole('region', { name: 'Hero picture' })
    await choose(page, hero.getByTestId('upload-image').first(), 'tall-1x4.jpg')
    await dialog(page).getByRole('button', { name: 'Fill the frame' }).click()
    await save(page).click()
    await expect(dialog(page)).toBeHidden()
    await expect(hero.getByRole('button', { name: 'Edit picture: Picture' })).toBeVisible()

    // A picture + text section.
    await sections(page).getByRole('button', { name: 'Add section' }).click()
    await sections(page).getByRole('button', { name: /^Picture and text/ }).click()
    await sections(page).getByRole('textbox', { name: 'Heading (English)' }).fill('Our workshop')
    await choose(page, sections(page).getByTestId('upload-image').first(), 'wide-4x1.jpg')
    await save(page).click() // whole: a 4:3 copy with transparent bars
    await expect(dialog(page)).toBeHidden()

    await publish(page)
    await goInApp(page, '/')
    const section = page.getByRole('heading', { level: 2, name: 'Our workshop' }).locator('xpath=ancestor::section')
    const picture = section.locator('img')
    const p = await measure(picture)
    expect(p.fit).toBe('contain')
    expect(p.naturalWidth / p.naturalHeight).toBeCloseTo(4 / 3, 2)
    expect(p.boxWidth / p.boxHeight).toBeCloseTo(4 / 3, 2)
    expect((await opaque(picture)).ratio).toBeCloseTo(4, 0) // the wide picture is not stretched
    // The hero fills its band (cover) with the 16:9 copy.
    const heroImg = page.locator('#hero-title').locator('xpath=ancestor::section').locator('img').first()
    const h = await measure(heroImg)
    expect(h.fit).toBe('cover')
    expect(h.naturalWidth / h.naturalHeight).toBeCloseTo(16 / 9, 1)
  })
})

test.describe('logo and profile photo', () => {
  test('the company logo is cropped to a square in the dialog before it is uploaded', async ({ page }) => {
    await signInAsPlatform(page, 'admin')
    await page.goto('/admin/businesses/new')
    const input = page.getByLabel('Upload logo')
    await expect(input).toBeAttached()
    await input.setInputFiles(fixture('wide-4x1.jpg'))
    await expect(dialog(page)).toBeVisible()
    await expect(dialog(page)).toHaveAccessibleName('Adjust the logo')
    await expect(save(page)).toBeEnabled({ timeout: 15_000 })
    await expect(dialog(page).getByText(NUDGE)).toBeVisible()
    await dialog(page).getByRole('button', { name: 'Fill the frame' }).click()
    await save(page).click()
    await expect(dialog(page)).toBeHidden()
    const logo = page.getByRole('img', { name: /logo$/ }).first()
    const l = await measure(logo)
    expect(l.naturalWidth).toBe(l.naturalHeight) // square, 1024 px or less
    expect(l.naturalWidth).toBeLessThanOrEqual(1024)
    await expect(page.getByText('Replace logo')).toBeVisible()
  })

  test('the profile photo is cropped to a square in the dialog, written at 512 px or less, and Cancel changes nothing', async ({ page }) => {
    await signInAsBusiness(page, 'Nordhaus Living')
    await page.goto('/dashboard/settings/profile')
    const input = page.getByLabel('Upload photo')
    await input.setInputFiles(fixture('landscape.jpg'))
    await expect(dialog(page)).toBeVisible()
    await expect(dialog(page)).toHaveAccessibleName('Adjust your profile photo')
    await expect(save(page)).toBeEnabled({ timeout: 15_000 })
    await dialog(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog(page)).toBeHidden()
    await expect(page.getByText('Photo updated')).toHaveCount(0)

    await input.setInputFiles(fixture('large-4000.jpg'))
    await expect(save(page)).toBeEnabled({ timeout: 20_000 })
    await dialog(page).getByRole('button', { name: 'Fill the frame' }).click()
    await save(page).click()
    await expect(dialog(page)).toBeHidden({ timeout: 20_000 })
    await expectToast(page, 'Photo updated')
    const avatar = page.getByRole('region', { name: 'Photo' }).locator('[data-avatar] img')
    const a = await measure(avatar)
    expect(a.naturalWidth).toBe(a.naturalHeight)
    expect(a.naturalWidth).toBeLessThanOrEqual(512)
    expect(a.naturalWidth).toBeGreaterThanOrEqual(256)
  })
})
