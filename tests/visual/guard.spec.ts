import { expect, test, type Page } from '@playwright/test'

// Pixel guard (ADR-0031, decision D9): these pages must never change while the dashboards are redesigned.
// The baseline was recorded on the unchanged tree. Any differing pixel is a failure.
// `/login` redirects to `/demo` in demo mode, so it is recorded on its own to guard the redirect too.
const PAGES: Array<[slug: string, path: string]> = [
  ['landing', '/'],
  ['apply', '/apply'],
  ['demo', '/demo'],
  ['accept-invite', '/accept-invite'],
  ['reset-password', '/reset-password'],
  ['join', '/join'],
  ['login', '/login'],
]
const WIDTHS = [1440, 390]

// Images below the fold are `loading="lazy"`, so a full-page screenshot would catch the page mid-load and its
// height would change between two shots. Scroll through the page, wait for every image, then return to the top.
async function settle(page: Page) {
  await page.evaluate(async () => {
    const step = window.innerHeight
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y)
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    await Promise.all(
      Array.from(document.images).map((img) => (img.complete ? undefined : new Promise((resolve) => { img.onload = img.onerror = resolve }))),
    )
    window.scrollTo(0, 0)
  })
  await page.evaluate(() => document.fonts.ready)
}

test.beforeEach(async ({ page }) => {
  // No demo session may leak in from an earlier test.
  await page.addInitScript(() => localStorage.clear())
})

for (const [slug, path] of PAGES) {
  for (const width of WIDTHS) {
    test(`${slug} at ${width}px is unchanged`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(path)
      // Routes are lazy-loaded: wait until the full-page "Loading" spinner has gone.
      await expect(page.getByRole('status').filter({ hasText: /^Loading$/ })).toHaveCount(0)
      await expect(page.locator('#root')).not.toBeEmpty()
      // Google Fonts load over the network: settle() also waits for document.fonts.ready.
      await settle(page)
      await expect(page).toHaveScreenshot(`${slug}-${width}.png`, { fullPage: true })
    })
  }
}
