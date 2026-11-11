import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Locator, type Page, expect, test } from '@playwright/test'
import { signInAsBusiness } from './helpers'

// Image crop on upload (ADR-0063, ADR-0064): every product photo opens the crop dialog first; the whole picture is the
// starting point; "Fill the frame" / "Show whole picture" / Save decide what is kept; pages show the 4:5 copy undistorted;
// "Edit picture" reopens the original with the crop it had. Demo mode; the pictures are in tests/fixtures/images
// (made by scripts/make-image-fixtures.mjs).
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'images')
const fixture = (name: string) => join(FIXTURES, name)
const NUDGE = "This picture doesn't fill the frame."

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Adjust the photo' })
const zoom = (page: Page) => page.getByRole('slider', { name: 'Zoom' })

/** Opens the dialog for a picture and waits until the cropper has loaded it. */
async function choose(page: Page, name: string, label = 'Upload product images') {
  await page.getByLabel(label).setInputFiles(fixture(name))
  await expect(dialog(page)).toBeVisible()
  await expect(dialog(page).getByRole('button', { name: 'Save', exact: true })).toBeEnabled({ timeout: 15_000 })
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

/** The bounding box of the picture's visible (non-transparent) pixels, as a width/height ratio, plus the alpha of the corners. */
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

async function newProduct(page: Page) {
  await signInAsBusiness(page, 'Nordhaus Living')
  await page.goto('/dashboard/products/new')
  await expect(page.getByRole('heading', { level: 1, name: 'Add product' })).toBeVisible()
}

test.describe('crop dialog on a new product', () => {
  test('opens on the whole picture, nudges, Fill the frame covers it, Cancel adds nothing', async ({ page }) => {
    await newProduct(page)
    for (const name of ['landscape.jpg', 'portrait.jpg', 'wide-4x1.jpg', 'tall-1x4.jpg', 'square.jpg', 'white-background.jpg']) {
      await choose(page, name)
      const d = dialog(page)
      await expect(d.getByText(NUDGE)).toBeVisible() // none of these is 4:5
      const whole = Number(await zoom(page).inputValue())
      await d.getByRole('button', { name: 'Fill the frame' }).click()
      await expect(d.getByText(NUDGE)).toBeHidden()
      expect(Number(await zoom(page).inputValue())).toBeGreaterThan(whole)
      await d.getByRole('button', { name: 'Show whole picture' }).click()
      await expect(d.getByText(NUDGE)).toBeVisible()
      expect(Number(await zoom(page).inputValue())).toBeCloseTo(whole, 3)
      await d.getByRole('button', { name: 'Cancel' }).click()
      await expect(d).toBeHidden()
    }
    await expect(page.getByRole('button', { name: /^Edit picture / })).toHaveCount(0) // nothing was added
  })

  test('the keyboard moves and zooms the picture, and Escape cancels', async ({ page }) => {
    await newProduct(page)
    await choose(page, 'landscape.jpg')
    const picture = dialog(page).locator('img').first()
    const transform = () => picture.evaluate((el) => (el as HTMLElement).style.transform)
    const start = await transform()
    // The frame has focus once the picture is shown: arrow keys move, + and - zoom.
    await expect(dialog(page).getByTestId('cropper')).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect.poll(transform).not.toBe(start)
    const moved = await transform()
    await page.keyboard.press('+')
    await expect.poll(transform).not.toBe(moved)
    await page.keyboard.press('-')
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeHidden()
    await expect(page.getByRole('button', { name: /^Edit picture / })).toHaveCount(0)
  })
  test('Fill the frame saves a 4:5 copy; "Save whole" keeps all of the picture, undistorted', async ({ page }) => {
    await newProduct(page)

    await choose(page, 'landscape.jpg') // 1600 x 1000
    await dialog(page).getByRole('button', { name: 'Fill the frame' }).click()
    await dialog(page).getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialog(page)).toBeHidden()
    const filled = await measure(page.getByRole('img', { name: 'landscape' }))
    expect(filled.naturalWidth / filled.naturalHeight).toBeCloseTo(0.8, 2) // 800 x 1000
    expect(filled.boxWidth / filled.boxHeight).toBeCloseTo(0.8, 2)
    expect(filled.fit).toBe('contain')
    expect((await opaque(page.getByRole('img', { name: 'landscape' }))).cornerAlpha).toEqual([255, 255]) // fully covered

    await choose(page, 'portrait.jpg') // 900 x 1200 = 3:4, saved untouched: whole
    await dialog(page).getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialog(page)).toBeHidden()
    const portrait = page.getByRole('img', { name: 'portrait' })
    const whole = await measure(portrait)
    expect(whole.naturalWidth / whole.naturalHeight).toBeCloseTo(0.8, 2)
    const shown = await opaque(portrait)
    expect(shown.ratio).toBeCloseTo(900 / 1200, 1) // the picture itself is not stretched
    expect(shown.cornerAlpha).toEqual([0, 0]) // the margins stay transparent
  })

  test('a transparent PNG stays transparent; the 4000 px picture is saved at 2000 px or less', async ({ page }) => {
    await newProduct(page)
    await choose(page, 'transparent.png')
    await dialog(page).getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialog(page)).toBeHidden()
    const png = page.getByRole('img', { name: 'transparent' })
    await measure(png)
    expect((await opaque(png)).cornerAlpha).toEqual([0, 0])

    await choose(page, 'large-4000.jpg')
    await dialog(page).getByRole('button', { name: 'Fill the frame' }).click()
    await dialog(page).getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialog(page)).toBeHidden({ timeout: 20_000 })
    const big = await measure(page.getByRole('img', { name: 'large-4000' }))
    expect(Math.max(big.naturalWidth, big.naturalHeight)).toBeLessThanOrEqual(2000)
    expect(big.naturalWidth / big.naturalHeight).toBeCloseTo(0.8, 2)
  })

  test('Edit picture reopens the picture with the crop it had', async ({ page }) => {
    await newProduct(page)
    await choose(page, 'landscape.jpg')
    await dialog(page).getByRole('button', { name: 'Fill the frame' }).click()
    const filledZoom = Number(await zoom(page).inputValue())
    await dialog(page).getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialog(page)).toBeHidden()

    await page.getByRole('button', { name: 'Edit picture landscape' }).click({ force: true })
    await expect(dialog(page)).toBeVisible()
    await expect(dialog(page).getByRole('button', { name: 'Save', exact: true })).toBeEnabled({ timeout: 15_000 })
    await expect(dialog(page).getByText(NUDGE)).toBeHidden() // the crop was kept, so the frame is still filled
    expect(Number(await zoom(page).inputValue())).toBeCloseTo(filledZoom, 1)

    // Change it to the whole picture and save: the photo gets a new copy and keeps the same place.
    await dialog(page).getByRole('button', { name: 'Show whole picture' }).click()
    await dialog(page).getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialog(page)).toBeHidden()
    const img = page.getByRole('img', { name: 'landscape' })
    await measure(img)
    expect((await opaque(img)).cornerAlpha).toEqual([0, 0]) // now whole, with transparent margins above and below
    await expect(page.getByRole('button', { name: /^Edit picture / })).toHaveCount(1)
  })
})

test.describe('card and product page', () => {
  test('a cropped primary photo shows undistorted on the catalogue card and the product page, and Edit picture keeps its crop', async ({ page }) => {
    await signInAsBusiness(page, 'Nordhaus Living')
    await page.goto('/dashboard/products/prd_shell_chair/edit')
    await expect(page.getByLabel('Upload product images')).toBeVisible()

    await choose(page, 'landscape.jpg') // 1600 x 1000 -> Fill the frame -> 800 x 1000
    await dialog(page).getByRole('button', { name: 'Fill the frame' }).click()
    await dialog(page).getByRole('button', { name: 'Save', exact: true }).click()
    await expect(dialog(page)).toBeHidden()
    await page.getByRole('button', { name: 'Make landscape the primary image' }).click({ force: true })
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('status').filter({ hasText: /saved/i }).first()).toBeVisible()

    // Catalogue card.
    await page.goto('/catalog/nordhaus')
    const card = page.getByRole('link', { name: /Fjord Shell Chair/ }).first().locator('img').first()
    const onCard = await measure(card)
    expect([onCard.naturalWidth, onCard.naturalHeight]).toEqual([800, 1000])
    expect(onCard.boxWidth / onCard.boxHeight).toBeCloseTo(0.8, 2)
    expect(onCard.fit).toBe('contain')

    // Product page: the stage is 4:5 at this width, and so is the picture in it.
    await page.goto('/products/nordhaus/fjord-shell-chair')
    const photos = page.getByRole('button', { name: 'Photos', exact: true })
    if (await photos.isVisible().catch(() => false)) await photos.click()
    const stage = page.getByRole('region', { name: /Fjord Shell Chair/ }).locator('img').first()
    const onPage = await measure(stage)
    expect([onPage.naturalWidth, onPage.naturalHeight]).toEqual([800, 1000])
    expect(onPage.boxWidth / onPage.boxHeight).toBeCloseTo(0.8, 2)
    const box = await stage.evaluate((el) => {
      const r = el.parentElement!.parentElement!.getBoundingClientRect()
      return { w: r.width, h: r.height, vh: window.innerHeight }
    })
    expect(box.w / box.h).toBeCloseTo(0.8, 2)
    expect(box.h).toBeLessThanOrEqual(box.vh) // the stage is never taller than the screen

    // Back in the editor, the saved crop is still there.
    await page.goto('/dashboard/products/prd_shell_chair/edit')
    await page.getByRole('button', { name: 'Edit picture landscape' }).click({ force: true })
    await expect(dialog(page).getByRole('button', { name: 'Save', exact: true })).toBeEnabled({ timeout: 15_000 })
    await expect(dialog(page).getByText(NUDGE)).toBeHidden()
  })

  test('an old photo (no original) can be edited too, and keeps showing whole until it is', async ({ page }) => {
    await signInAsBusiness(page, 'Nordhaus Living')
    await page.goto('/catalog/nordhaus')
    const before = await measure(page.getByRole('link', { name: /Fjord Shell Chair/ }).first().locator('img').first())
    expect(before.fit).toBe('contain') // shown whole in the 4:5 frame as before
    expect(before.boxWidth / before.boxHeight).toBeCloseTo(0.8, 2)

    await page.goto('/dashboard/products/prd_shell_chair/edit')
    await page.getByRole('button', { name: 'Edit picture Black shell chair' }).first().click({ force: true })
    await expect(dialog(page).getByRole('button', { name: 'Save', exact: true })).toBeEnabled({ timeout: 15_000 })
    await dialog(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog(page)).toBeHidden()
  })
})