import { expect, test, type Page } from '@playwright/test'

// Dashboard dark mode (ADR-0060): screenshots of the signed-in screens in dark at 1440 and 390 px, written to
// test-results/dark-mode/. They are for looking at, not baselines (nothing is compared), so a redesign of a screen
// never breaks this file. The assertions do guard the rule: dashboards carry data-theme="dark", public routes never do.
// Run: npx playwright test --project=dark-mode
const OUT = 'test-results/dark-mode'
const SIZES = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 },
]

async function dark(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('arfurn:theme', 'dark')
    } catch {
      // Storage unavailable: the test then fails on the data-theme assertion.
    }
  })
}

async function settle(page: Page) {
  await page.waitForLoadState('networkidle')
  await page.evaluate(() => document.fonts.ready)
  await page.waitForTimeout(400)
}

async function shot(page: Page, name: string, size: string) {
  await settle(page)
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.screenshot({ path: `${OUT}/${name}-${size}.png`, fullPage: true })
}

for (const size of SIZES) {
  test.describe(`dark ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } })

    test('admin screens', async ({ page }) => {
      await dark(page)
      await page.goto('/demo')
      // The sign-in page stays light even when dark is the saved choice.
      await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark')
      await page.getByRole('button', { name: 'Continue as Super Admin' }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
      for (const [name, path] of [
        ['admin-overview', '/admin'],
        ['admin-applications', '/admin/applications'],
        ['admin-products', '/admin/products'],
        ['admin-product-editor', '/admin/products/new'],
        ['admin-analytics', '/admin/analytics'],
        ['admin-businesses', '/admin/businesses'],
        ['admin-website-editor', '/admin/editor/pages'],
        ['admin-editor-landing', '/admin/editor/landing'],
        ['admin-editor-preview', '/admin/editor/preview/page/terms'],
        ['admin-business-new', '/admin/businesses/new'],
        ['admin-team', '/admin/team'],
        ['admin-audit', '/admin/activity'],
        ['admin-model-requests', '/admin/model-requests'],
        ['admin-catalogs', '/admin/catalogs'],
        ['admin-settings', '/admin/settings/preferences'],
        ['admin-settings-security', '/admin/settings/security'],
      ] as const) {
        await page.goto(path)
        await shot(page, name, size.name)
      }
      // The public landing page is light.
      await page.goto('/')
      await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark')
    })

    test('company dashboard', async ({ page }) => {
      await dark(page)
      await page.goto('/demo')
      const select = page.getByLabel('Business', { exact: true })
      const first = await select.locator('option').evaluateAll((os) => (os as HTMLOptionElement[]).map((o) => o.label).find((l) => l.trim() !== '' && !/select|choose/i.test(l)))
      await select.selectOption({ label: first! })
      await page.getByRole('button', { name: 'Continue', exact: true }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
      for (const [name, path] of [
        ['biz-overview', '/dashboard'],
        ['biz-products', '/dashboard/products'],
        ['biz-product-editor', '/dashboard/products/new'],
        ['biz-analytics', '/dashboard/analytics'],
        ['biz-catalog', '/dashboard/catalog'],
        ['biz-settings', '/dashboard/settings/preferences'],
      ] as const) {
        await page.goto(path)
        await shot(page, name, size.name)
      }
    })

    test('account menu and dialogs', async ({ page }) => {
      await dark(page)
      await page.goto('/demo')
      await page.getByRole('button', { name: 'Continue as Super Admin' }).click()
      await expect(page.getByRole('heading', { level: 1, name: 'Overview' })).toBeVisible()
      if (size.width < 1024) await page.getByRole('button', { name: /open navigation|abrir navegação/i }).click()
      await page.getByRole('button', { name: /account menu/i }).click()
      await expect(page.getByRole('menuitemradio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true')
      await settle(page)
      await page.screenshot({ path: `${OUT}/account-menu-${size.name}.png` })
      await page.keyboard.press('Escape')
      await page.goto('/admin')
      await page.getByRole('button', { name: /notifications/i }).first().click()
      await settle(page)
      await page.screenshot({ path: `${OUT}/bell-${size.name}.png` })
    })
  })
}
