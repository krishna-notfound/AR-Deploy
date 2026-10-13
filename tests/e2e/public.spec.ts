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

// Simulated, not a real device: the browser claims immersive-ar but refuses the session (e.g. camera denied).
test('WebXR phone: AR start failure is reported once, with no dead button and the 3D view kept', async ({ page }) => {
  test.skip(process.env.VITE_CUSTOM_WEBXR !== 'on', 'custom WebXR session is off (ADR-0018 revision); run with VITE_CUSTOM_WEBXR=on')
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'xr', {
      value: {
        isSessionSupported: async (m: string) => m === 'immersive-ar',
        requestSession: async () => {
          throw new DOMException('denied', 'NotAllowedError')
        },
      },
    })
  })
  await page.goto('/products/nordhaus/sheen-lounge-chair')
  const button = page.getByRole('button', { name: 'View in my home' })
  await expect(button).toBeEnabled({ timeout: 60_000 })
  await button.click()
  await expect(page.getByText('AR could not start', { exact: false })).toBeVisible()
  // The fallback is <model-viewer>'s own AR (it also sees WebXR here), offered once; the 3D view stays and the
  // visitor is not told to "open this page on a phone" (they may already be on one).
  await expect(page.getByRole('button', { name: 'Open in phone AR viewer' })).toBeVisible()
  await expect(page.getByText('View in your room on a phone')).toHaveCount(0)
  await expect(page.getByText('True-to-size model')).toBeVisible()
})

// ar_activation means "asked for AR on this page view": repeated taps (here: the camera prompt cancelled twice)
// must not inflate the count.
test('AR activations are counted once per page view', async ({ page }) => {
  test.skip(process.env.VITE_CUSTOM_WEBXR !== 'on', 'custom WebXR session is off (ADR-0018 revision); run with VITE_CUSTOM_WEBXR=on')
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'xr', {
      value: {
        isSessionSupported: async () => true,
        requestSession: async () => {
          throw new DOMException('cancelled', 'AbortError')
        },
      },
    })
  })
  await page.goto('/products/nordhaus/sheen-lounge-chair')
  const button = page.getByRole('button', { name: 'View in my home' })
  await expect(button).toBeEnabled({ timeout: 60_000 })
  await button.click()
  await button.click() // a cancel is not a failure: the button stays
  const count = () =>
    page.evaluate(() => {
      const db = JSON.parse(localStorage.getItem('arfurn:v1:db') ?? '{}') as { events?: { type: string; sample: boolean }[] }
      return (db.events ?? []).filter((e) => e.type === 'ar_activation' && !e.sample).length
    })
  await expect.poll(count).toBe(1)
  await expect(page.getByText('AR could not start', { exact: false })).toHaveCount(0)
})

// Restored flow (as before 98c7545): on a WebXR-capable phone the AR button launches <model-viewer>'s own WebXR,
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
  const sessionChunks: string[] = []
  page.on('request', (r) => {
    if (r.url().endsWith('.glb')) glbFetches.push(r.url())
    if (/webxrSession/.test(r.url())) sessionChunks.push(r.url())
  })
  await page.goto('/products/nordhaus/sheen-lounge-chair')
  const button = page.getByRole('button', { name: 'View in my home' })
  await expect(button).toBeEnabled({ timeout: 60_000 })
  await button.click()
  await page.getByRole('button', { name: 'Start AR' }).click()
  await expect.poll(() => page.evaluate(() => (window as unknown as { __xrRequests: number }).__xrRequests)).toBeGreaterThan(0)
  expect(glbFetches).toHaveLength(1) // the 3D view's download only
  expect(sessionChunks).toHaveLength(0) // our custom session code is never loaded
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
