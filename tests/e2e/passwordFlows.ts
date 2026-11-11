// Password change and "Forgot password" flows (ADR-0066), demo mode, shared by password.spec.ts (desktop) and
// password.mobile.spec.ts (mobile). Demo codes: 123456 for the emailed action code and the authenticator,
// 12345678 for the reset code. Demo security state lives in memory, so a flow never reloads after turning 2FA on.
import { type Page, expect } from '@playwright/test'
import { signInAsBusiness } from './helpers'

export const DEMO_CODE = '123456'
export const DEMO_RESET_CODE = '12345678'
const BUSINESS = 'Casa Lisboa Interiors'
const NEW_PASSWORD = 'a-brand-new-passphrase'

const passwordCard = (page: Page) => page.getByRole('region', { name: 'Password' })
export const changeDialog = (page: Page) => page.getByRole('dialog', { name: 'Confirm the password change' })

/** Fills the Password card and submits it; the code dialog opens. */
export async function startPasswordChange(page: Page) {
  const card = passwordCard(page)
  await card.getByLabel('Current password').fill('my-old-password')
  await card.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD)
  await card.getByLabel('Confirm new password').fill(NEW_PASSWORD)
  await card.getByRole('button', { name: 'Change password' }).click()
  const dialog = changeDialog(page)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText(/We emailed a 6-digit code to/)).toBeVisible()
  return dialog
}

/** Business owner, no 2FA: a wrong code is refused, the right one changes the password and signs out to /demo. */
export async function changePasswordWithCode(page: Page) {
  await signInAsBusiness(page, BUSINESS)
  await page.goto('/dashboard/settings/account')
  await expect(page.getByRole('heading', { level: 1, name: 'My account' })).toBeVisible()
  const dialog = await startPasswordChange(page)
  await expect(dialog.getByLabel('Authenticator code')).toHaveCount(0)
  await dialog.getByLabel('6-digit code').fill('111111')
  await dialog.getByRole('button', { name: 'Change password' }).click()
  await expect(dialog.getByText("That code isn't right. Check it and try again.")).toBeVisible()
  await dialog.getByLabel('6-digit code').fill(DEMO_CODE)
  await dialog.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByText('Every device was signed out. Sign in with your new password.')).toBeVisible()
  await expect(page).toHaveURL(/\/demo/)
}

/** Turns demo 2FA on (Security & 2FA), then goes to My account without a reload. */
export async function turnOn2faThenOpenAccount(page: Page) {
  await signInAsBusiness(page, BUSINESS)
  await page.goto('/dashboard/settings/security')
  await expect(page.getByRole('heading', { level: 1, name: 'Security & 2FA' })).toBeVisible()
  await page.getByRole('button', { name: 'Turn on 2FA' }).click()
  await page.getByLabel('6-digit code').fill(DEMO_CODE)
  await page.getByRole('button', { name: 'Verify and turn on' }).click()
  await page.getByRole('checkbox', { name: 'I saved these codes' }).check()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText('2FA is on').first()).toBeVisible()
  // Client-side, so the in-memory demo 2FA stays on. At phone width the section list is its own screen.
  const nav = page.getByRole('navigation', { name: 'Settings sections' })
  if (!(await nav.isVisible())) await page.getByRole('link', { name: 'Settings', exact: true }).click()
  await nav.getByRole('link', { name: 'My account' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'My account' })).toBeVisible()
}

/** With 2FA on, the dialog also asks for the authenticator code; a wrong one is refused on its own field. */
export async function changePasswordWith2fa(page: Page) {
  await turnOn2faThenOpenAccount(page)
  const dialog = await startPasswordChange(page)
  await expect(dialog.getByText(/and the code your authenticator app shows now/)).toBeVisible()
  await dialog.getByLabel('6-digit code').fill(DEMO_CODE)
  await dialog.getByLabel('Authenticator code').fill('000000')
  await dialog.getByRole('button', { name: 'Change password' }).click()
  await expect(dialog.getByText("That authenticator code isn't right. Enter the newest code from the app.")).toBeVisible()
  await expect(dialog.getByLabel('Authenticator code')).toHaveValue('')
  await dialog.getByLabel('Authenticator code').fill(DEMO_CODE)
  await dialog.getByRole('button', { name: 'Change password' }).click()
  await expect(page.getByText('Every device was signed out. Sign in with your new password.')).toBeVisible()
  await expect(page).toHaveURL(/\/demo/)
}

/** The demo "Forgot password": email → code → new password → sign-in, with the checks on each step. */
export async function forgotPassword(page: Page) {
  await page.goto('/reset-password?lang=en')
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
  await expect(page.getByText('Demo: no email is sent and no account is looked up.')).toBeVisible()
  await page.getByLabel('Email').fill('someone@demo.example')
  await page.getByRole('button', { name: 'Send code' }).click()
  await expect(page.getByText(/If an account uses someone@demo\.example, a code is on its way/)).toBeVisible()
  await expect(page.getByRole('button', { name: /Send a new code \(\d+ s\)/ })).toBeDisabled()
  await expect(page.getByText(`Demo: no email was sent. The code is ${DEMO_RESET_CODE}.`)).toBeVisible()

  await page.getByLabel('Code from the email').fill('00000000')
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByLabel('Code from the email').fill(DEMO_RESET_CODE)
  await page.getByRole('button', { name: 'Continue' }).click()
  await expect(page.getByRole('heading', { name: 'Choose a new password' })).toBeVisible()

  await page.getByLabel('New password', { exact: true }).fill('too-short')
  await page.getByLabel('Repeat new password').fill('too-short')
  await page.getByRole('button', { name: 'Save new password' }).click()
  await expect(page.getByText('Use at least 12 characters.')).toBeVisible()
  await page.getByLabel('New password', { exact: true }).fill(NEW_PASSWORD)
  await page.getByLabel('Repeat new password').fill(NEW_PASSWORD)
  await page.getByRole('button', { name: 'Save new password' }).click()
  await expect(page.getByText('Every device was signed out. Sign in with your new password.')).toBeVisible()
  await expect(page).toHaveURL(/\/demo/)
}

/** An expired or used link lands on a clear notice, and the address bar keeps no token or error. */
export async function failedResetLink(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/reset-password?lang=en#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
  await expect(page.getByText(/That reset link is no longer valid/)).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('')
  expect(page.url()).not.toContain('error')
  expect(errors).toEqual([])
}
