import { test } from '@playwright/test'
import { changePasswordWith2fa, changePasswordWithCode, failedResetLink, forgotPassword } from './passwordFlows'

// The password flows of password.spec.ts at phone width (ADR-0066).

test('change password needs the emailed code, then signs out everywhere (phone)', async ({ page }) => {
  await changePasswordWithCode(page)
})

test('change password with 2FA on also needs the authenticator code (phone)', async ({ page }) => {
  await changePasswordWith2fa(page)
})

test('forgot password: email → code → new password → sign-in (phone)', async ({ page }) => {
  await forgotPassword(page)
})

test('an expired reset link shows a notice and leaves no token in the address bar (phone)', async ({ page }) => {
  await failedResetLink(page)
})
