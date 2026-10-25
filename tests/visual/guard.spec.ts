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

// A client-side redirect (`/login` and `/reset-password` go to `/demo`) or a late reload destroys the page's JS
// context, which made `page.evaluate` throw "Execution context was destroyed". Wait for the URL to stop changing
// and the network to go quiet before touching the page, and retry any evaluate that still races a navigation.
async function waitForStableUrl(page: Page, quietMs = 600) {
  let last = page.url()
  let since = Date.now()
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    await page.waitForTimeout(100)
    const now = page.url()
    if (now !== last) {
      last = now
      since = Date.now()
    } else if (Date.now() - since >= quietMs) return
  }
}

async function loaded(page: Page) {
  await page.waitForLoadState('load')
  await page.waitForLoadState('networkidle')
}

async function retrying<T>(page: Page, run: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await run()
    } catch (error) {
      if (attempt >= 4 || !/context was destroyed|navigation|Target (page|closed)/i.test(String(error))) throw error
      await loaded(page)
      await waitForStableUrl(page)
    }
  }
}

// Images below the fold are `loading="lazy"`, so a full-page screenshot would catch the page mid-load and its
// height would change between two shots. Scroll through the page, wait for every image and font, then return to
// the top and let two animation frames pass so the screenshot never catches a scroll-linked repaint.
async function settle(page: Page) {
  await loaded(page)
  await waitForStableUrl(page)
  const step = page.viewportSize()?.height ?? 900
  for (let y = 0; ; y += step) {
    const height = await retrying(page, () => page.evaluate((top) => {
      window.scrollTo(0, top)
      return document.documentElement.scrollHeight
    }, y))
    if (y >= height) break
    await page.waitForTimeout(100)
  }
  await retrying(page, () => page.evaluate(() =>
    Promise.all(Array.from(document.images).map((img) =>
      img.complete ? undefined : new Promise((resolve) => { img.onload = img.onerror = resolve }),
    )),
  ))
  await retrying(page, () => page.evaluate(() => document.fonts.ready))
  await loaded(page)
  await retrying(page, () => page.evaluate(() => new Promise<void>((resolve) => {
    window.scrollTo(0, 0)
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  })))
}

test.beforeEach(async ({ page }) => {
  // No demo session may leak in from an earlier test.
  await page.addInitScript(() => localStorage.clear())
})

for (const [slug, path] of PAGES) {
  for (const width of WIDTHS) {
    test(`${slug} at ${width}px is unchanged`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(path, { waitUntil: 'load' })
      await loaded(page)
      await waitForStableUrl(page)
      // In demo mode the sign-in and reset forms redirect to /demo: assert the redirect itself.
      if (slug === 'login' || slug === 'reset-password') await expect(page).toHaveURL(/\/demo/)
      // Routes are lazy-loaded: wait until the full-page "Loading" spinner has gone.
      await expect(page.getByRole('status').filter({ hasText: /^Loading$/ })).toHaveCount(0)
      await expect(page.locator('#root')).not.toBeEmpty()
      // Google Fonts load over the network: settle() also waits for document.fonts.ready.
      await settle(page)
      await expect(page).toHaveScreenshot(`${slug}-${width}.png`, { fullPage: true })
    })
  }
}
