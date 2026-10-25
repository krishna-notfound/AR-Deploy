import { type Page, expect, test } from '@playwright/test'
import { signInAsBusiness, signInAsPlatform, signInAsSuperAdmin } from './helpers'

// Account settings (S1, ADR-0032), demo mode. The demo action and authenticator code is 123456. Demo security state
// lives in memory, so every test starts with 2FA off and these tests never reload the page after turning it on.

const DEMO_CODE = '123456'
const BUSINESS = 'Casa Lisboa Interiors'

const sectionNav = (page: Page) => page.getByRole('navigation', { name: 'Settings sections' })
const h1 = (page: Page, name: string | RegExp) => page.getByRole('heading', { level: 1, name })

async function openFromUserMenu(page: Page, item = 'Account settings') {
  await page.getByRole('button', { name: /^Account menu/ }).click()
  await page.getByRole('menuitem', { name: item }).click()
}

/** Turns 2FA on through the UI and leaves the Security page showing the card with 2FA on. */
async function turnOn2fa(page: Page, path: string) {
  await page.goto(path)
  await expect(h1(page, 'Security & 2FA')).toBeVisible()
  await page.getByRole('button', { name: 'Turn on 2FA' }).click()
  await expect(page.getByRole('heading', { name: 'Connect your authenticator app' })).toBeVisible()
  await page.getByLabel('6-digit code').fill(DEMO_CODE)
  await page.getByRole('button', { name: 'Verify and turn on' }).click()
  const box = page.getByRole('checkbox', { name: 'I saved these codes' })
  await expect(box).toBeVisible()
  return box
}

test.describe('settings navigation', () => {
  test('opens settings from the user menu, moves between sections, Esc closes to the previous page', async ({ page }) => {
    await signInAsBusiness(page, BUSINESS)
    await page.goto('/dashboard/products')
    await expect(h1(page, /./)).toBeVisible()

    await openFromUserMenu(page)
    await expect(page).toHaveURL(/\/dashboard\/settings\/account$/)
    await expect(h1(page, 'My account')).toBeVisible()
    await expect(sectionNav(page).getByRole('link', { name: 'My account' })).toHaveAttribute('aria-current', 'page')

    // Moving between sections keeps the page that opened settings.
    await sectionNav(page).getByRole('link', { name: 'Security & 2FA' }).click()
    await expect(page).toHaveURL(/\/dashboard\/settings\/security$/)
    await expect(h1(page, 'Security & 2FA')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(/\/dashboard\/products$/)
  })

  test('every business section opens by deep link, an unknown one goes to My account, Esc without history goes home', async ({ page }) => {
    await signInAsBusiness(page, BUSINESS)
    const sections: [string, string][] = [
      ['account', 'My account'],
      ['profile', 'Profile'],
      ['security', 'Security & 2FA'],
      ['notifications', 'Notifications'],
      ['preferences', 'Preferences'],
      ['activity', 'Security activity'],
      ['business', 'Business profile'],
    ]
    for (const [id, title] of sections) {
      await page.goto(`/dashboard/settings/${id}`)
      await expect(h1(page, title), `/dashboard/settings/${id}`).toBeVisible()
      await expect(sectionNav(page).locator(`[data-section-link="${id}"]`)).toHaveAttribute('aria-current', 'page')
    }

    // A section this role does not have (and one that does not exist) lands on My account.
    await page.goto('/dashboard/settings/platform')
    await expect(page).toHaveURL(/\/dashboard\/settings\/account$/)
    await expect(h1(page, 'My account')).toBeVisible()
    await page.goto('/dashboard/settings/no-such-section')
    await expect(page).toHaveURL(/\/dashboard\/settings\/account$/)

    // Opened by URL, there is no previous page to return to: Esc goes to the dashboard home.
    await page.keyboard.press('Escape')
    await expect(page).toHaveURL(/\/dashboard$/)
  })

  test('the close button returns to the page that opened settings', async ({ page }) => {
    await signInAsSuperAdmin(page)
    await page.goto('/admin/businesses')
    await expect(h1(page, 'Businesses')).toBeVisible()
    await openFromUserMenu(page, 'Security & 2FA')
    await expect(page).toHaveURL(/\/admin\/settings\/security$/)
    await page.getByRole('button', { name: 'Close settings' }).click()
    await expect(page).toHaveURL(/\/admin\/businesses$/)
  })
})

test.describe('settings at phone width (390)', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 })

  test('the section list comes first and the back link returns to it', async ({ page }) => {
    await signInAsBusiness(page, BUSINESS)
    await page.goto('/dashboard/settings')
    // No redirect to My account: the list is the screen.
    await expect(page).toHaveURL(/\/dashboard\/settings$/)
    await expect(h1(page, 'Settings')).toBeVisible()
    await expect(sectionNav(page).getByRole('link')).toHaveCount(7)

    await sectionNav(page).getByRole('link', { name: 'Notifications' }).click()
    await expect(page).toHaveURL(/\/dashboard\/settings\/notifications$/)
    await expect(h1(page, 'Notifications')).toBeVisible()
    await expect(sectionNav(page)).toHaveCount(0)

    await page.getByRole('link', { name: 'Settings' }).click()
    await expect(page).toHaveURL(/\/dashboard\/settings$/)
    await expect(h1(page, 'Settings')).toBeVisible()
    await expect(sectionNav(page).getByRole('link', { name: 'Notifications' })).toBeFocused()
  })
})

test.describe('2FA in demo', () => {
  test('turn on with 123456, save the recovery codes, turn off with the action code', async ({ page }) => {
    await signInAsBusiness(page, BUSINESS)
    const saved = await turnOn2fa(page, '/dashboard/settings/security')

    // The recovery codes gate: Done stays disabled until the box is ticked.
    await expect(page.getByRole('list', { name: 'Recovery codes' }).getByRole('listitem')).toHaveCount(8)
    const done = page.getByRole('button', { name: 'Done' })
    await expect(done).toBeDisabled()
    await saved.check()
    await expect(done).toBeEnabled()
    await done.click()

    await expect(page.getByText('2FA is on').first()).toBeVisible()
    const card = page.locator('main').getByRole('heading', { level: 2, name: 'Two-step verification (2FA)' })
    await expect(card).toBeVisible()
    await expect(page.locator('main').getByText('On', { exact: true })).toBeVisible()
    await expect(page.getByText('8 of 8 recovery codes left')).toBeVisible()

    // Turn off: the dialog sends an action code (demo: 123456).
    await page.getByRole('button', { name: 'Turn off 2FA' }).click()
    const dialog = page.getByRole('dialog', { name: 'Turn off 2FA?' })
    await expect(dialog.getByText('Demo: no email is sent. Use the code 123456.')).toBeVisible()
    await dialog.getByLabel('6-digit code').fill('000000')
    await dialog.getByRole('button', { name: 'Turn off 2FA' }).click()
    await expect(dialog.getByText("That code isn't right. Check it and try again.")).toBeVisible()
    await dialog.getByLabel('6-digit code').fill(DEMO_CODE)
    await dialog.getByRole('button', { name: 'Turn off 2FA' }).click()
    await expect(dialog).toBeHidden()

    await expect(page.getByText('2FA is off').first()).toBeVisible()
    await expect(page.locator('main').getByText('Off', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Turn on 2FA' })).toBeVisible()
  })

  test('a wrong authenticator code is refused during setup and nothing is turned on', async ({ page }) => {
    await signInAsBusiness(page, BUSINESS)
    await page.goto('/dashboard/settings/security')
    await page.getByRole('button', { name: 'Turn on 2FA' }).click()
    await page.getByLabel('6-digit code').fill('111111')
    await page.getByRole('button', { name: 'Verify and turn on' }).click()
    await expect(page.getByText("That code didn't match. Check the time on your phone and enter the newest code.").first()).toBeVisible()
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('button', { name: 'Turn on 2FA' })).toBeVisible()
  })
})

test.describe('change password', () => {
  test('shows the validation messages for a short password and a mismatch', async ({ page }) => {
    await signInAsBusiness(page, BUSINESS)
    await page.goto('/dashboard/settings/account')
    await expect(page.getByRole('heading', { level: 2, name: 'Password' })).toBeVisible()
    const current = page.getByLabel('Current password', { exact: false }).last()
    const next = page.getByLabel('New password', { exact: true })
    const confirm = page.getByLabel('Confirm new password')
    const submit = page.getByRole('button', { name: 'Change password' })

    // While typing, the hint counts the characters still needed (the submit error replaces it).
    await next.fill('short-pass')
    await expect(page.getByText('Too short: 2 more characters needed.')).toBeVisible()

    // Submitting with the current password empty and a short new one names both problems.
    await confirm.fill('short-pass')
    await submit.click()
    await expect(page.getByText('Enter your current password.')).toBeVisible()
    await expect(page.getByText('Use at least 12 characters.')).toBeVisible()

    // With the current password filled, the short new password is still refused.
    await current.fill('whatever-current')
    await submit.click()
    await expect(page.getByText('Enter your current password.')).toHaveCount(0)
    await expect(page.getByText('Use at least 12 characters.')).toBeVisible()

    // Long enough, but the confirmation differs.
    await next.fill('a-long-enough-passphrase')
    await confirm.fill('a-long-enough-passphrasX')
    await submit.click()
    await expect(page.getByText("The passwords don't match.")).toBeVisible()
    await expect(page.getByText('Use at least 12 characters.')).toHaveCount(0)
  })
})

test.describe('role visibility', () => {
  test('the Owner sees Platform and Security policy', async ({ page }) => {
    await signInAsSuperAdmin(page)
    await page.goto('/admin/settings/account')
    const nav = sectionNav(page)
    await expect(nav.getByRole('heading', { name: 'Platform' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'General' })).toBeVisible()
    await expect(nav.getByRole('link', { name: 'Security policy' })).toBeVisible()
    await expect(nav.getByRole('link')).toHaveCount(8)
    await nav.getByRole('link', { name: 'Security policy' }).click()
    await expect(h1(page, 'Security policy')).toBeVisible()
  })

  for (const role of ['admin', 'team'] as const) {
    test(`${role === 'admin' ? 'Admin' : 'Team'} sees neither Platform nor Security policy`, async ({ page }) => {
      await signInAsPlatform(page, role)
      await page.goto('/admin/settings/account')
      const nav = sectionNav(page)
      await expect(h1(page, 'My account')).toBeVisible()
      await expect(nav.getByRole('link')).toHaveCount(6)
      await expect(nav.getByRole('heading', { name: 'Platform' })).toHaveCount(0)
      await expect(nav.getByRole('link', { name: 'General' })).toHaveCount(0)
      await expect(nav.getByRole('link', { name: 'Security policy' })).toHaveCount(0)
      // The URL is no way in: the hub sends them to My account.
      await page.goto('/admin/settings/security-policy')
      await expect(page).toHaveURL(/\/admin\/settings\/account$/)
      await page.goto('/admin/settings/platform')
      await expect(page).toHaveURL(/\/admin\/settings\/account$/)
    })
  }
})
