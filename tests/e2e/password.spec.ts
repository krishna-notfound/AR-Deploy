import { type Page, expect, test } from '@playwright/test'
import { signInAsBusiness } from './helpers'
import { DEMO_CODE, DEMO_RESET_CODE, changePasswordWith2fa, changePasswordWithCode, failedResetLink, forgotPassword, startPasswordChange, turnOn2faThenOpenAccount } from './passwordFlows'

// Password change with an emailed code (and the authenticator code with 2FA on), and "Forgot password" (ADR-0066).
// Desktop; the same flows run at phone width in password.mobile.spec.ts.

test.describe('change password (ADR-0066)', () => {
  test('needs the emailed code, then signs out everywhere', async ({ page }) => {
    await changePasswordWithCode(page)
  })

  test('with 2FA on, also needs the authenticator code', async ({ page }) => {
    await changePasswordWith2fa(page)
  })
})

test.describe('forgot password (ADR-0066)', () => {
  test('email → code → new password → sign-in, in demo mode', async ({ page }) => {
    await forgotPassword(page)
  })

  test('an expired or used link shows a notice and leaves no token in the address bar', async ({ page }) => {
    await failedResetLink(page)
  })
})

// Screenshots for review (not compared): the new dialogs at 1440 and 390 px, light and dark, and the reset steps.
// Written only when PASSWORD_SHOTS names a folder.
const SHOTS = process.env.PASSWORD_SHOTS
test.describe('password screenshots', () => {
  test.skip(!SHOTS, 'set PASSWORD_SHOTS to a folder to write the screenshots')
  test.setTimeout(240_000)

  async function shoot(page: Page, name: string) {
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${SHOTS}/${name}.png` })
  }

  for (const width of [1440, 390]) {
    for (const theme of ['light', 'dark'] as const) {
      test(`change-password dialogs at ${width} px, ${theme}`, async ({ page }) => {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
        await page.addInitScript((t) => {
          try {
            localStorage.setItem('arfurn:theme', t)
          } catch {
            // Storage unavailable.
          }
        }, theme)
        await signInAsBusiness(page, 'Casa Lisboa Interiors')
        await page.goto('/dashboard/settings/account')
        await expect(page.getByRole('heading', { level: 1, name: 'My account' })).toBeVisible()
        const plain = await startPasswordChange(page)
        await plain.getByLabel('6-digit code').fill('111111')
        await plain.getByRole('button', { name: 'Change password' }).click()
        await expect(plain.getByText("That code isn't right. Check it and try again.")).toBeVisible()
        await shoot(page, `change-${width}-${theme}`)
        await plain.getByRole('button', { name: 'Cancel' }).click()

        await turnOn2faThenOpenAccount(page)
        const twoFa = await startPasswordChange(page)
        await twoFa.getByLabel('6-digit code').fill(DEMO_CODE)
        await shoot(page, `change-2fa-${width}-${theme}`)
      })
    }

    test(`reset steps at ${width} px`, async ({ page }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      await page.goto('/reset-password?lang=en#error=access_denied&error_code=otp_expired')
      await expect(page.getByText(/That reset link is no longer valid/)).toBeVisible()
      await shoot(page, `reset-link-${width}`)
      await page.getByLabel('Email').fill('someone@demo.example')
      await page.getByRole('button', { name: 'Send code' }).click()
      await expect(page.getByRole('button', { name: /Send a new code \(\d+ s\)/ })).toBeVisible()
      await shoot(page, `reset-code-${width}`)
      await page.getByLabel('Code from the email').fill(DEMO_RESET_CODE)
      await page.getByRole('button', { name: 'Continue' }).click()
      await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()
      await shoot(page, `reset-password-${width}`)
    })
  }

  test('reset with demo 2FA on asks for the authenticator code (1440 and 390 px)', async ({ page }) => {
    await turnOn2faThenOpenAccount(page)
    // Client-side to the public reset page, so the in-memory demo 2FA stays on.
    await page.evaluate(() => {
      window.history.pushState(null, '', '/reset-password?lang=en')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await page.getByLabel('Email').fill('someone@demo.example')
    await page.getByRole('button', { name: 'Send code' }).click()
    await page.getByLabel('Code from the email').fill(DEMO_RESET_CODE)
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('heading', { name: 'Confirm with your authenticator' })).toBeVisible()
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 900 })
      await shoot(page, `reset-2fa-${width}`)
    }
  })
})
