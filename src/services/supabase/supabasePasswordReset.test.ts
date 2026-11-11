import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { passwordResetRedirectUrl } from '@/lib/urls'
import { createSupabasePasswordReset } from './supabasePasswordReset'

const authError = (code: string, status = 429) => ({ name: 'AuthApiError', code, status, message: `raw: ${code}` })

function fake(over: { reset?: unknown; verify?: unknown; session?: unknown } = {}) {
  const auth = {
    resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: over.reset ?? null })),
    verifyOtp: vi.fn(async () => ({ data: {}, error: over.verify ?? null })),
    getSession: vi.fn(async () => ({ data: { session: over.session ?? null }, error: null })),
    signOut: vi.fn(async () => ({ error: null })),
  }
  return { auth, svc: createSupabasePasswordReset({ auth } as unknown as SupabaseClient) }
}

describe('Supabase password reset (ADR-0027, ADR-0066)', () => {
  it('asks Supabase for a reset code with the redirect URL from urls.ts (no token, no query)', async () => {
    const f = fake()
    expect(await f.svc.requestCode('ana@studio.pt')).toEqual({ ok: true, data: undefined })
    expect(f.auth.resetPasswordForEmail).toHaveBeenCalledWith('ana@studio.pt', { redirectTo: passwordResetRedirectUrl() })
    expect(passwordResetRedirectUrl()).toBe(`${location.origin}/reset-password`)
  })

  it("answers the per-address resend limit as success (only an existing account can hit it), other errors as they are", async () => {
    expect(await fake({ reset: authError('over_email_send_rate_limit') }).svc.requestCode('ana@studio.pt')).toEqual({ ok: true, data: undefined })
    const ip = await fake({ reset: authError('over_request_rate_limit') }).svc.requestCode('ana@studio.pt')
    expect(!ip.ok && ip.error.reason).toBe('over_request_rate_limit')
  })

  it('verifies the code as a recovery code; reads and ends the session in this browser only', async () => {
    const f = fake({ session: { access_token: 'x' } })
    expect((await f.svc.verifyCode('ana@studio.pt', '12345678')).ok).toBe(true)
    expect(f.auth.verifyOtp).toHaveBeenCalledWith({ email: 'ana@studio.pt', token: '12345678', type: 'recovery' })
    expect(await f.svc.hasSession()).toEqual({ ok: true, data: true })
    expect(await fake().svc.hasSession()).toEqual({ ok: true, data: false })
    expect((await f.svc.signOutHere()).ok).toBe(true)
    expect(f.auth.signOut).toHaveBeenCalledWith({ scope: 'local' })
    const bad = await fake({ verify: authError('otp_expired', 403) }).svc.verifyCode('ana@studio.pt', '00000000')
    expect(!bad.ok && bad.error.reason).toBe('otp_expired')
  })
})
