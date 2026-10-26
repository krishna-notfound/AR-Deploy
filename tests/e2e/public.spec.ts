import { type Page, expect, test } from '@playwright/test'
import { signInAsSuperAdmin } from './helpers'

// §19.8–19.11 Public catalog, product detail, 3D fallback, AR button, PT/EN
test('catalog → product navigation with search and categories', async ({ page }) => {
  await page.goto('/catalog/nordhaus')
  await expect(page.getByRole('heading', { level: 1, name: 'Nordhaus Living' })).toBeVisible()
  await expect(page.getByText('Oslo Bar Stool')).toBeHidden() // draft is not public
  await page.getByRole('button', { name: 'Lighting' }).click()
  await expect(page.getByRole('heading', { name: 'Copper Barn Wall Lamp' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Fjord Shell Chair' })).toBeHidden()
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await page.getByRole('searchbox', { name: 'Search products' }).fill('zzz')
  await expect(page.getByText('No matching products')).toBeVisible()
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await page.getByRole('link', { name: /Fjord Shell Chair/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Fjord Shell Chair' })).toBeVisible()
  await page.getByRole('link', { name: 'Back to Nordhaus Living' }).click()
  await expect(page).toHaveURL(/\/catalog\/nordhaus/)
})

test('product without a model shows photos and no AR button', async ({ page }) => {
  await page.goto('/products/nordhaus/fjord-shell-chair')
  await expect(page.getByText('3D view is not available for this product yet.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'View in my home' })).toHaveCount(0)
  await expect(page.getByText('W 48', { exact: false }).or(page.getByText('48 cm')).first()).toBeVisible()
})

test('broken model shows a recoverable error', async ({ page }) => {
  await page.goto('/products/casa-lisboa/tejo-side-table')
  // The page opens on the photograph (client requirement); the 3D action reveals the viewer and its error.
  await expect(page.getByRole('img', { name: /Tejo Side Table/ })).toBeVisible()
  await page.getByRole('button', { name: 'View in 3D', exact: true }).click()
  await expect(page.getByText('The 3D model could not be loaded')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('alert').getByRole('button', { name: 'Photos' }).click()
  await expect(page.getByRole('img', { name: /Tejo Side Table/ })).toBeVisible()
})

test('model loads, scale is checked, and AR falls back honestly on desktop', async ({ page }) => {
  // Two sample models (several MB each) come from raw.githubusercontent.com: the test's budget must cover
  // both 60 s waits, not Playwright's default 30 s.
  test.setTimeout(150_000)
  await page.goto('/products/nordhaus/sheen-lounge-chair')
  await expect(page.getByText('True-to-size model')).toBeVisible({ timeout: 60_000 })
  // Desktop Chromium cannot launch AR: the button is not shown, a phone hand-off is offered instead.
  await expect(page.getByRole('button', { name: 'View in my home' })).toHaveCount(0)
  await expect(page.getByText('View in your space on a phone')).toBeVisible()
  await page.getByRole('button', { name: 'Show QR code' }).click()
  await expect(page.getByRole('img', { name: 'Scan with your phone camera to open this product.' })).toBeVisible()

  await page.goto('/products/atelier-verde/damask-accent-chair')
  await expect(page.getByText('AR scale unverified')).toBeVisible({ timeout: 60_000 })
})

/** Replaces navigator.xr (an init script): `offered` says whether immersive-ar is supported; every session request is counted and refused. */
function stubWebXr(offered: boolean) {
  const w = window as unknown as { __xrRequests: number }
  w.__xrRequests = 0
  Object.defineProperty(navigator, 'xr', {
    value: {
      isSessionSupported: async (mode: string) => offered && mode === 'immersive-ar',
      requestSession: async () => {
        w.__xrRequests++
        throw new DOMException('refused in the test', 'NotAllowedError')
      },
      addEventListener() {},
      removeEventListener() {},
    },
  })
}
const xrRequests = (page: Page) => page.evaluate(() => (window as unknown as { __xrRequests: number }).__xrRequests)

// WebXR first (ADR-0035): a browser that offers immersive-ar gets AR inside the browser. Here the session is refused,
// as when the visitor blocks the camera: one request per tap, and the button never stays busy.
test('WebXR first: a browser that offers immersive-ar starts an in-browser AR session', async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(stubWebXr, true)
  await page.goto('/products/nordhaus/sheen-lounge-chair')
  await expect(page.getByText('True-to-size model').first()).toBeVisible({ timeout: 60_000 }) // model loaded and measured
  const button = page.getByRole('button', { name: 'View in my home' }).first()
  await expect(button).toBeEnabled({ timeout: 10_000 })
  await button.click()
  await page.getByRole('checkbox').check() // "don't show again"
  await page.getByRole('button', { name: 'Start AR' }).click()
  await expect.poll(() => xrRequests(page)).toBe(1)
  await expect(page.locator('[aria-busy="true"]')).toHaveCount(0, { timeout: 25_000 }) // never stuck on "Preparing AR"
})

// Android without WebXR (simulated user agent, NOT a real phone): model-viewer falls back to Google Scene Viewer at
// true size. The intent navigation is captured instead of leaving the page. Real devices: docs/TEST_PLAN.md.
test.describe('Android', () => {
  test.use({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' })

  test('without WebXR, AR falls back to Google Scene Viewer at fixed real-world scale, once per tap', async ({ page }) => {
    test.setTimeout(120_000)
    await page.addInitScript(stubWebXr, false)
    await page.addInitScript(() => {
      const w = window as unknown as { __intents: string[]; navigation?: EventTarget }
      w.__intents = []
      w.navigation?.addEventListener('navigate', (e) => {
        const ev = e as Event & { destination: { url: string } }
        if (!ev.destination.url.startsWith('intent:')) return
        w.__intents.push(ev.destination.url)
        ev.preventDefault()
      })
    })
    const glbFetches: string[] = []
    page.on('request', (r) => {
      if (r.url().endsWith('.glb')) glbFetches.push(r.url())
    })
    await page.goto('/products/nordhaus/sheen-lounge-chair')
    const button = page.getByRole('button', { name: 'View in my home' }).first()
    await expect(button).toBeEnabled({ timeout: 60_000 })
    await button.click()
    await page.getByRole('checkbox').check() // "don't show again", so the next tap launches directly
    await page.getByRole('button', { name: 'Start AR' }).click()
    await button.click({ force: true }) // impatient second tap while Scene Viewer opens (button busy): ignored
    const intents = () => page.evaluate(() => (window as unknown as { __intents: string[] }).__intents)
    await expect.poll(intents).toHaveLength(1)
    await page.waitForTimeout(500)
    expect(await intents()).toHaveLength(1)
    expect(await xrRequests(page)).toBe(0) // WebXR was not offered, so none was requested
    const intent = (await intents())[0]!
    expect(intent).toMatch(/^intent:\/\/arvr\.google\.com\/scene-viewer\/1\.2\?/)
    expect(intent).toContain('#Intent;scheme=https;package=com.google.android.googlequicksearchbox;action=android.intent.action.VIEW;S.browser_fallback_url=')
    expect(intent).toContain('mode=ar_preferred')
    expect(intent).toContain('resizable=false') // ar-scale="fixed": no pinch scaling
    expect(decodeURIComponent(intent)).toContain('#model-viewer-no-ar-fallback') // the page knows when Scene Viewer failed
    const file = new URLSearchParams(intent.slice(intent.indexOf('?') + 1, intent.indexOf('#Intent'))).get('file')
    expect(file).toBe(await page.locator('model-viewer').evaluate((el) => (el as HTMLElement & { src: string }).src)) // exactly the model the 3D view shows
    expect(glbFetches).toHaveLength(1) // the page's 3D view only; Scene Viewer downloads its own copy
  })
})

test('switches language between English and Portuguese', async ({ page }) => {
  await page.goto('/products/atelier-verde/rio-sideboard')
  await expect(page.getByRole('heading', { name: 'Dimensions' })).toBeVisible()
  await page.getByRole('radio', { name: 'PT' }).click()
  await expect(page.getByRole('heading', { name: 'Dimensões' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('lang', 'pt-PT')
  // Missing PT product name falls back to English, marked lang="en"
  await expect(page.locator('h1[lang="en"]', { hasText: 'Rio Sideboard' })).toBeVisible()
  // Persists within the session
  await page.getByRole('link', { name: 'Voltar a Atelier Verde' }).click()
  await expect(page.getByRole('searchbox', { name: 'Pesquisar produtos' })).toBeVisible()
})

test('inactive catalogs and unknown products show friendly states', async ({ page }) => {
  // R-W8-2: a paused catalog reads as not found to a signed-out visitor, and nothing of it leaks.
  await page.goto('/catalog/oak-ember')
  await expect(page.getByText('Catalog not found')).toBeVisible()
  await expect(page.getByText('Oak & Ember Studio')).toHaveCount(0)
  await expect(page.getByText('Walnut Writing Desk')).toHaveCount(0)
  await page.goto('/products/nordhaus/does-not-exist')
  await expect(page.getByText('Product not available')).toBeVisible()
  await page.goto('/catalog/nope')
  await expect(page.getByText('Catalog not found')).toBeVisible()
})

test('in-app browser notice appears for Instagram, on the catalog (QR landing) and product pages', async ({ browser }) => {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0',
  })
  const page = await ctx.newPage()
  await page.goto('/catalog/nordhaus')
  await expect(page.getByText(/AR works best in Safari/)).toBeVisible()
  await page.goto('/products/nordhaus/fjord-shell-chair')
  await expect(page.getByText(/AR works best in Safari/)).toBeVisible()
  await page.getByRole('button', { name: 'Dismiss' }).click()
  await expect(page.getByText(/AR works best in Safari/)).toBeHidden()
  await ctx.close()
})

// Regression: /reset-password crashed ("useI18n must be used inside <LanguageProvider>") while it sat outside PublicLayout.
test('the reset-password page renders without crashing', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/reset-password?lang=en')
  // Demo mode has no password reset, so the page sends visitors to /demo.
  await expect(page).toHaveURL(/\/demo/)
  await expect(page.getByText('Something went wrong')).toBeHidden()
  expect(errors).toEqual([])
})

// S1.5: a published product of a business that is not active yet is previewed through "Open product page", with the
// catalog banner. A signed-out visitor sees no preview.
test('Open product page on a product of an inactive business shows the preview banner; a visitor sees none', async ({ page, context, browser }) => {
  await signInAsSuperAdmin(page)
  await page.goto('/admin/products')
  await page.getByRole('searchbox', { name: /Search/ }).fill('Walnut Writing Desk')
  await page.getByRole('button', { name: 'Actions for Walnut Writing Desk' }).click()
  const [popup] = await Promise.all([context.waitForEvent('page'), page.getByRole('menuitem', { name: 'Open product page' }).click()])
  await expect(popup).toHaveURL(/\/products\/oak-ember\/walnut-writing-desk\?preview=1/)
  await expect(popup.getByRole('heading', { level: 1, name: 'Walnut Writing Desk' })).toBeVisible()
  await expect(popup.getByText('Preview. Customers cannot see this catalog until it is activated.')).toBeVisible()

  const visitorContext = await browser.newContext({ baseURL: new URL(page.url()).origin })
  const visitor = await visitorContext.newPage()
  await visitor.goto('/products/oak-ember/walnut-writing-desk?preview=1')
  await expect(visitor.getByText('Preview. Customers cannot see this catalog until it is activated.')).toHaveCount(0)
  await visitorContext.close()
})
