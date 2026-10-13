import { expect, test } from '@playwright/test'

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
  await expect(page.getByText('W 48', { exact: false }).or(page.getByText('48 cm').first())).toBeVisible()
})

test('broken model shows a recoverable error', async ({ page }) => {
  await page.goto('/products/casa-lisboa/tejo-side-table')
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
  await expect(page.getByText('View in your room on a phone')).toBeVisible()
  await page.getByRole('button', { name: 'Show QR code' }).click()
  await expect(page.getByRole('img', { name: 'Scan with your phone camera to open this product.' })).toBeVisible()

  await page.goto('/products/atelier-verde/damask-accent-chair')
  await expect(page.getByText('AR scale unverified')).toBeVisible({ timeout: 60_000 })
})

// Fallback path (desktop UA, so Scene Viewer is not a candidate): on a WebXR-capable browser the AR button launches <model-viewer>'s own WebXR,
// which reuses the model already loaded for the 3D view. Simulated: Chromium with a stubbed navigator.xr.
test('AR launches through model-viewer and does not download the model again', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __xrRequests: number }
    w.__xrRequests = 0
    Object.defineProperty(navigator, 'xr', {
      value: {
        isSessionSupported: async (mode: string) => mode === 'immersive-ar',
        requestSession: async () => {
          w.__xrRequests++
          throw new DOMException('no camera in CI', 'NotAllowedError')
        },
        addEventListener() {},
        removeEventListener() {},
      },
    })
  })
  const glbFetches: string[] = []
  page.on('request', (r) => {
    if (r.url().endsWith('.glb')) glbFetches.push(r.url())
  })
  await page.goto('/products/nordhaus/sheen-lounge-chair')
  const button = page.getByRole('button', { name: 'View in my home' })
  await expect(button).toBeEnabled({ timeout: 60_000 })
  await button.click()
  await page.getByRole('button', { name: 'Start AR' }).click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __xrRequests: number }).__xrRequests)).toBeGreaterThan(0)
  expect(glbFetches).toHaveLength(1) // the 3D view's download only
})

// Android (simulated user agent, not a real phone): AR hands off to Google Scene Viewer first, at true size,
// even when the browser also offers WebXR. The intent link is captured instead of leaving the page.
test.describe('Android', () => {
  test.use({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36' })

  test('AR opens Google Scene Viewer at fixed real-world scale, not the in-browser session', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __intents: string[]; __xrRequests: number }
      w.__intents = []
      w.__xrRequests = 0
      const click = HTMLAnchorElement.prototype.click
      HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
        if (this.href.startsWith('intent:')) w.__intents.push(this.href)
        else click.call(this)
      }
      Object.defineProperty(navigator, 'xr', {
        value: {
          isSessionSupported: async (mode: string) => mode === 'immersive-ar',
          requestSession: async () => {
            w.__xrRequests++
            throw new DOMException('not expected', 'NotAllowedError')
          },
          addEventListener() {},
          removeEventListener() {},
        },
      })
    })
    await page.goto('/products/nordhaus/sheen-lounge-chair')
    const button = page.getByRole('button', { name: 'View in my home' })
    await expect(button).toBeEnabled({ timeout: 60_000 })
    await button.click()
    await page.getByRole('button', { name: 'Start AR' }).click()
    const intents = () => page.evaluate(() => (window as unknown as { __intents: string[] }).__intents)
    await expect.poll(intents).toHaveLength(1)
    const intent = (await intents())[0]!
    expect(intent).toContain('arvr.google.com/scene-viewer')
    expect(intent).toContain('package=com.google.android.googlequicksearchbox')
    expect(intent).toContain('mode=ar_preferred') // 3D view instead of a failure on phones without ARCore
    expect(intent).toContain('resizable=false') // true size: no pinch scaling
    expect(decodeURIComponent(intent)).toContain('SheenChair.glb') // the same model as the 3D view
    expect(await page.evaluate(() => (window as unknown as { __xrRequests: number }).__xrRequests)).toBe(0)
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
  await page.goto('/catalog/oak-ember')
  await expect(page.getByText('This catalog is currently unavailable')).toBeVisible()
  await page.goto('/products/nordhaus/does-not-exist')
  await expect(page.getByText('Product not available')).toBeVisible()
  await page.goto('/catalog/nope')
  await expect(page.getByText('Catalog not found')).toBeVisible()
})

test('in-app browser notice appears for Instagram', async ({ browser }) => {
  const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 300.0.0.0',
  })
  const page = await ctx.newPage()
  await page.goto('/products/nordhaus/fjord-shell-chair')
  await expect(page.getByText(/open this page in Safari/)).toBeVisible()
  await page.getByRole('button', { name: 'Dismiss' }).click()
  await expect(page.getByText(/open this page in Safari/)).toBeHidden()
  await ctx.close()
})
