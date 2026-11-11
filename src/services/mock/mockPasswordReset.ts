// Demo "Forgot password": an in-memory harness, labelled Demo on the page. No email is sent and no account is looked
// up; the code is always DEMO_RESET_CODE. A verified code opens a pretend recovery session in mockAccount (gone on
// reload), which account.resetPassword needs, like the real reset_password action; with demo 2FA on, that session
// starts at aal1, so the page asks for the authenticator code as it would for a real account.
import { ok } from '../catalogService'
import { DEMO_RESET_CODE, type PasswordResetService } from '../passwordResetService'
import { closeMockRecovery, mockRecoveryOpen, openMockRecovery } from './mockAccount'

const LATENCY_MS = import.meta.env.MODE === 'test' ? 0 : 150
const pause = () => (LATENCY_MS ? new Promise((r) => setTimeout(r, LATENCY_MS)) : Promise.resolve())

export const mockPasswordReset: PasswordResetService = {
  async requestCode() {
    await pause()
    return ok(undefined)
  },
  async verifyCode(_email, code) {
    await pause()
    if (code !== DEMO_RESET_CODE) return { ok: false, error: { code: 'PERMISSION', message: 'Token has expired or is invalid', reason: 'otp_expired' } }
    openMockRecovery()
    return ok(undefined)
  },
  hasSession: async () => ok(mockRecoveryOpen()),
  async signOutHere() {
    closeMockRecovery()
    return ok(undefined)
  },
}
