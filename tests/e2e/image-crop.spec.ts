import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { type Locator, type Page, expect, test } from '@playwright/test'
import { signInAsBusiness } from './helpers'

// Image crop on upload (ADR-0063, ADR-0064, ADR-0081): every product photo opens the crop dialog first; the whole picture is
// the starting point; "Fill the frame" / "Show whole picture" / Save decide what is kept. A main photo gets two crops: step 1
// "Catalogue card crop" (4:5) and step 2 "Product page crop" (shape choice, Original by default); "Edit catalogue crop" and
// "Edit product page crop" reopen the original with the crop it had. Demo mode; the pictures are in tests/fixtures/images
// (made by scripts/make-image-fixtures.mjs).
const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'fixtures', 'images')
const fixture = (name: string) => join(FIXTURES, name)
const NUDGE = "This picture doesn't fill the frame."

/** Step 1 of a main photo (and its "Edit catalogue crop"). */
const dialog = (page: Page) => page.getByRole('dialog', { name: 'Catalogue card crop' })
/** Step 2 of a main photo (and its "Edit product page crop"). */
const pageDialog = (page: Page) => page.getByRole('dialog', { name: 'Product page crop' })
/** A "More photos" picture: one dialog, unchanged. */
const moreDialog = (page: Page) => page.getByRole('dialog', { name: 'Adjust the photo' })
const zoom = (page: Page) => page.getByRole('slider', { name: 'Zoom' })

/** Opens the dialog for a picture and waits until the cropper has loaded it. */
async function choose(page: Page, name: string, label = 'Upload product images') {
  await page.getByLabel(label).setInputFiles(fixture(name))
  const d = label === 'Upload product images' ? dialog(page) : moreDialog(page)
  await expect(d).toBeVisible()
  await expect(d.getByRole('button', { name: 'Save', exact: true })).toBeEnabled({ timeout: 15_000 })
}

/** Saves step 1 of a main photo, then step 2 in `shape` (Original when not given), and waits until the photo is added. */
async function saveBoth(page: Page, shape?: string) {
  await dialog(page).getByRole('button', { name: 'Save', exact: true }).click()
  const d = pageDialog(page)
  await expect(d).toBeVisible()
  await expect(d.getByText(/Step 2 of 2/)).toBeVisible()
  await expect(d.getByRole('button', { name: 'Save', exact: true })).toBeEnabled({ timeout: 15_000 })
  const group = d.getByRole('radiogroup', { name: 'Shape' })
  await expect(group.getByRole('radio', { name: 'Original' })).toHaveAttribute('aria-checked', 'true')
  if (shape) {
    await group.getByRole('radio', { name: shape }).click()
    await expect(group.getByRole('radio', { name: shape })).toHaveAttribute('aria-checked', 'true')
  }
  await d.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(d).toBeHidden({ timeout: 20_000 })
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
    await expect(page.getByRole('button', { name: /^Edit catalogue crop of / })).toHaveCount(0) // nothing was added
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
    await expect(page.getByRole('button', { name: /^Edit catalogue crop of / })).toHaveCount(0)
  })
  test('Fill the frame saves a 4:5 copy; "Save whole" keeps all of the picture, undistorted', async ({ page }) => {
    await newProduct(page)

    await choose(page, 'landscape.jpg') // 1600 x 1000
    await dialog(page).getByRole('button', { name: 'Fill the frame' }).click()
    await saveBoth(page)
    const filled = await measure(page.getByRole('img', { name: 'landscape' }))
    expect(filled.naturalWidth / filled.naturalHeight).toBeCloseTo(0.8, 2) // 800 x 1000
    expect(filled.boxWidth / filled.boxHeight).toBeCloseTo(0.8, 2)
    expect(filled.fit).toBe('contain')
    expect((await opaque(page.getByRole('img', { name: 'landscape' }))).cornerAlpha).toEqual([255, 255]) // fully covered

    await choose(page, 'portrait.jpg') // 900 x 1200 = 3:4, saved untouched: whole
    await saveBoth(page)
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
    await saveBoth(page)
    const png = page.getByRole('img', { name: 'transparent' })
    await measure(png)
    expect((await opaque(png)).cornerAlpha).toEqual([0, 0])

    await choose(page, 'large-4000.jpg')
    await dialog(page).getByRole('button', { name: 'Fill the frame' }).click()
    await saveBoth(page)
    const big = await measure(page.getByRole('img', { name: 'large-4000' }))
    expect(Math.max(big.naturalWidth, big.naturalHeight)).toBeLessThanOrEqual(2000)
    expect(big.naturalWidth / big.naturalHeight).toBeCloseTo(0.8, 2)
  })

  test('Edit catalogue crop reopens the picture with the crop it had', async ({ page }) => {
    await newProduct(page)
    await choose(page, 'landscape.jpg')
    await dialog(page).getByRole('button', { name: 'Fill the frame' }).click()
    const filledZoom = Number(await zoom(page).inputValue())
    await saveBoth(page)

    await page.getByRole('button', { name: 'Edit catalogue crop of landscape' }).click({ force: true })
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
    await expect(page.getByRole('button', { name: /^Edit catalogue crop of / })).toHaveCount(1)
    await expect(page.getByRole('button', { name: /^Edit product page crop of / })).toHaveCount(1)
  })

  test('cancelling step 2 keeps the photo with its catalogue card copy', async ({ page }) => {
    await newProduct(page)
    await choose(page, 'landscape.jpg')
    await dialog(page).getByRole('button', { name: 'Fill the frame' }).click()
    await dialog(page).getByRole('button', { name: 'Save', exact: true }).click()
    await expect(pageDialog(page).getByRole('button', { name: 'Save', exact: true })).toBeEnabled({ timeout: 15_000 })
    await pageDialog(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(pageDialog(page)).toBeHidden({ timeout: 20_000 })
    const card = await measure(page.getByRole('img', { name: 'landscape' }))
    expect(card.naturalWidth / card.naturalHeight).toBeCloseTo(0.8, 2)
    await expect(page.getByRole('button', { name: 'Edit catalogue crop of landscape' })).toHaveCount(1)
  })
})

test.describe('card and product page', () => {
  test('a cropped primary photo shows undistorted on the catalogue card and the product page, and Edit catalogue crop keeps its crop', async ({ page }) => {
    await signInAsBusiness(page, 'Nordhaus Living')
    await page.goto('/dashboard/products/prd_shell_chair/edit')
    await expect(page.getByLabel('Upload product images')).toBeVisible()

    await choose(page, 'landscape.jpg') // 1600 x 1000 -> Fill the frame -> 800 x 1000
    await dialog(page).getByRole('button', { name: 'Fill the frame' }).click()
    await saveBoth(page) // product page copy: Original, the whole 1600 x 1000
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

    // Product page: the product-page copy (Original: the whole 1600 x 1000 photo), shown whole in the original stage box
    // (owner 2026-11-21: 5:4 at desktop width, the same box as the 3D view).
    await page.goto('/products/nordhaus/fjord-shell-chair')
    const photos = page.getByRole('button', { name: 'Photos', exact: true })
    if (await photos.isVisible().catch(() => false)) await photos.click()
    const stage = page.getByRole('region', { name: /Fjord Shell Chair/ }).locator('img').first()
    const onPage = await measure(stage)
    expect(onPage.naturalWidth / onPage.naturalHeight).toBeCloseTo(1.6, 1)
    expect(onPage.fit).toBe('contain')
    const box = await page.getByTestId('product-stage').evaluate((el) => {
      const r = el.getBoundingClientRect()
      return { w: r.width, h: r.height }
    })
    expect(box.w / box.h).toBeCloseTo(5 / 4, 1)

    // Back in the editor, the saved crop is still there.
    await page.goto('/dashboard/products/prd_shell_chair/edit')
    await page.getByRole('button', { name: 'Edit catalogue crop of landscape' }).click({ force: true })
    await expect(dialog(page).getByRole('button', { name: 'Save', exact: true })).toBeEnabled({ timeout: 15_000 })
    await expect(dialog(page).getByText(NUDGE)).toBeHidden()
  })

  test('a main photo saved with a 16:9 product page crop shows that copy whole in the original stage box, while the catalogue card stays 4:5', async ({ page }) => {
    await signInAsBusiness(page, 'Nordhaus Living')
    await page.goto('/dashboard/products/prd_shell_chair/edit')
    await expect(page.getByLabel('Upload product images')).toBeVisible()
    await choose(page, 'landscape.jpg')
    await dialog(page).getByRole('button', { name: 'Fill the frame' }).click()
    await saveBoth(page, '16:9')
    await page.getByRole('button', { name: 'Make landscape the primary image' }).click({ force: true })
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect(page.getByRole('status').filter({ hasText: /saved/i }).first()).toBeVisible()

    await page.goto('/catalog/nordhaus')
    const onCard = await measure(page.getByRole('link', { name: /Fjord Shell Chair/ }).first().locator('img').first())
    expect(onCard.naturalWidth / onCard.naturalHeight).toBeCloseTo(0.8, 2)
    expect(onCard.boxWidth / onCard.boxHeight).toBeCloseTo(0.8, 2)

    await page.goto('/products/nordhaus/fjord-shell-chair')
    const photos = page.getByRole('button', { name: 'Photos', exact: true })
    if (await photos.isVisible().catch(() => false)) await photos.click()
    const stage = page.getByRole('region', { name: /Fjord Shell Chair/ }).locator('img').first()
    const onPage = await measure(stage)
    expect(onPage.naturalWidth / onPage.naturalHeight).toBeCloseTo(16 / 9, 1)
    expect(onPage.fit).toBe('contain')
    // The original product page box (owner 2026-11-21): 5:4 at desktop width.
    const box = await page.getByTestId('product-stage').evaluate((el) => {
      const r = el.getBoundingClientRect()
      return { w: r.width, h: r.height }
    })
    expect(box.w / box.h).toBeCloseTo(5 / 4, 1)
  })

  test('an old photo (no original) can be edited too, and keeps showing whole until it is', async ({ page }) => {
    await signInAsBusiness(page, 'Nordhaus Living')
    await page.goto('/catalog/nordhaus')
    const before = await measure(page.getByRole('link', { name: /Fjord Shell Chair/ }).first().locator('img').first())
    expect(before.fit).toBe('contain') // shown whole in the 4:5 frame as before
    expect(before.boxWidth / before.boxHeight).toBeCloseTo(0.8, 2)

    await page.goto('/dashboard/products/prd_shell_chair/edit')
    await page.getByRole('button', { name: 'Edit catalogue crop of Black shell chair' }).first().click({ force: true })
    await expect(dialog(page).getByRole('button', { name: 'Save', exact: true })).toBeEnabled({ timeout: 15_000 })
    await dialog(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog(page)).toBeHidden()
  })
})
// ADR-0080: "More photos" pick a camera shape; the main photo's catalogue card crop (step 1, ADR-0081) keeps 4:5 with no shape choice.
test.describe('More photos shapes', () => {
  test('the main photo card crop has no shape choice; a More photo saves in the shape picked and Original keeps its own', async ({ page }) => {
    await newProduct(page)
    await choose(page, 'landscape.jpg')
    await expect(dialog(page).getByRole('radiogroup', { name: 'Shape' })).toHaveCount(0)
    await dialog(page).getByRole('button', { name: 'Cancel' }).click()

    const shapes = [
      { file: 'landscape.jpg', shape: '16:9', ratio: 16 / 9 },
      { file: 'portrait.jpg', shape: '3:4', ratio: 3 / 4 },
      { file: 'square.jpg', shape: '1:1', ratio: 1 },
    ]
    for (const { file, shape, ratio } of shapes) {
      await choose(page, file, 'Upload additional photos')
      const group = moreDialog(page).getByRole('radiogroup', { name: 'Shape' })
      await expect(group.getByRole('radio', { name: 'Original' })).toHaveAttribute('aria-checked', 'true')
      await group.getByRole('radio', { name: shape }).click()
      await expect(group.getByRole('radio', { name: shape })).toHaveAttribute('aria-checked', 'true')
      await expect(moreDialog(page).getByText(NUDGE)).toBeHidden() // the centred fill crop covers the new frame
      await moreDialog(page).getByRole('button', { name: 'Save', exact: true }).click()
      await expect(moreDialog(page)).toBeHidden()
      const saved = await measure(page.getByRole('img', { name: file.replace('.jpg', '') }).last())
      expect(saved.naturalWidth / saved.naturalHeight).toBeCloseTo(ratio, 1)
      expect((await opaque(page.getByRole('img', { name: file.replace('.jpg', '') }).last())).cornerAlpha).toEqual([255, 255])
    }

    // Original: saved in the picture's own shape, nothing cut and no margins.
    await choose(page, 'wide-4x1.jpg', 'Upload additional photos')
    await moreDialog(page).getByRole('button', { name: 'Save', exact: true }).click()
    await expect(moreDialog(page)).toBeHidden()
    const wide = await measure(page.getByRole('img', { name: 'wide-4x1' }).last())
    expect(wide.naturalWidth / wide.naturalHeight).toBeCloseTo(4, 1)
  })
})
