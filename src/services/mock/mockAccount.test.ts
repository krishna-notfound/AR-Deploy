import { beforeEach, describe, expect, it } from 'vitest'
import { DEMO_RESET_CODE } from '../passwordResetService'
import { DEMO_CODE, mockAccountService as a, resetMockAccount } from './mockAccount'
import { mockPasswordReset } from './mockPasswordReset'

describe('demo account service', () => {
  beforeEach(() => resetMockAccount())

  it('the mock keeps profile, factors, recovery codes and closure state in memory and accepts the demo code 123456', async () => {
    expect(DEMO_CODE).toBe('123456')

    // Profile
    const p = await a.updateProfile({ displayName: 'Ana Demo', timezone: 'Europe/Paris', clock: '12h' })
    expect(p.ok && p.data).toMatchObject({ displayName: 'Ana Demo', timezone: 'Europe/Paris', clock: '12h', dateFormat: 'd MMM yyyy' })
    expect((await a.getProfile()).ok && ((await a.getProfile()) as { data: { displayName: string } }).data.displayName).toBe('Ana Demo')
    const tooLong = await a.updateProfile({ displayName: 'x'.repeat(81) })
    expect(!tooLong.ok && tooLong.error.reason).toBe('invalid_name')
    expect((await a.setOnboarding('dismissed')).ok).toBe(true)

    // 2FA: a wrong code is refused, the demo code is accepted
    let s = await a.getSecurityState()
    expect(s.ok && s.data).toMatchObject({ hasVerifiedFactor: false, aal: 'aal1', closure: null, recoveryCodesLeft: null })
    expect(s.ok && s.data.onboarding.dismissedAt).toBeTruthy()
    const enrol = await a.startTotpEnrollment()
    expect(enrol.ok).toBe(true)
    if (!enrol.ok) return
    expect(enrol.data.qrSvg).toContain('Demo')
    const wrong = await a.confirmTotpEnrollment(enrol.data.factorId, '000000')
    expect(!wrong.ok && wrong.error.reason).toBe('invalid_code')
    expect((await a.confirmTotpEnrollment(enrol.data.factorId, '123456')).ok).toBe(true)

    // Recovery codes: 8, XXXXX-XXXXX, redeemed case- and dash-insensitively, once
    const codes = await a.generateRecoveryCodes()
    expect(codes.ok && codes.data).toHaveLength(8)
    if (!codes.ok) return
    for (const c of codes.data) expect(c).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/)
    s = await a.getSecurityState()
    expect(s.ok && s.data).toMatchObject({ hasVerifiedFactor: true, aal: 'aal2', recoveryCodesLeft: 8 })
    const messy = ` ${(codes.data[0] ?? '').toLowerCase().replace('-', ' ')} `
    expect((await a.redeemRecoveryCode(messy)).ok).toBe(true)
    // Redeeming removes 2FA (as the real function does), so the code can't be used again.
    s = await a.getSecurityState()
    expect(s.ok && s.data).toMatchObject({ hasVerifiedFactor: false, recoveryCodesLeft: null })
    const again = await a.redeemRecoveryCode(messy)
    expect(!again.ok && again.error.reason).toBe('invalid_code')

    // Action codes
    const sent = await a.sendActionCode('request_closure')
    expect(sent.ok && sent.data.sentTo).toContain('•••')
    const bad = await a.requestClosure('111111')
    expect(!bad.ok && bad.error.reason).toBe('invalid_code')

    // Closure
    const closed = await a.requestClosure('123456')
    expect(closed.ok && closed.data.kind).toBe('business')
    s = await a.getSecurityState()
    expect(s.ok && s.data.closure?.requestedAt).toBeTruthy()
    const twice = await a.requestClosure('123456')
    expect(!twice.ok && twice.error.reason).toBe('already_requested')
    expect((await a.cancelClosure()).ok).toBe(true)
    s = await a.getSecurityState()
    expect(s.ok && s.data.closure).toBeNull()
    const none = await a.cancelClosure()
    expect(!none.ok && none.error.reason).toBe('not_found')

    // Events are recorded newest first
    const ev = await a.listSecurityEvents()
    expect(ev.ok && ev.data[0]?.type).toBe('account_closure_cancelled')
  })

  it('getAssurance follows the demo factor and session level', async () => {
    expect(await a.getAssurance()).toEqual({ ok: true, data: { currentLevel: 'aal1', nextLevel: 'aal1' } })
    const e = await a.startTotpEnrollment()
    if (!e.ok) throw new Error('enrol failed')
    await a.confirmTotpEnrollment(e.data.factorId, DEMO_CODE)
    expect(await a.getAssurance()).toEqual({ ok: true, data: { currentLevel: 'aal2', nextLevel: 'aal2' } })
  })

  it('refuses the platform policy at aal1 and accepts it at aal2', async () => {
    const refused = await a.updatePlatformSettings({ require2faStaff: true })
    expect(!refused.ok && refused.error.reason).toBe('aal2_required')
    const e = await a.startTotpEnrollment()
    if (!e.ok) throw new Error('enrol failed')
    await a.confirmTotpEnrollment(e.data.factorId, '123456')
    const saved = await a.updatePlatformSettings({ require2faStaff: true })
    expect(saved.ok && saved.data).toMatchObject({ require2faStaff: true, require2faBusiness: false })
    expect(saved.ok && saved.data.updatedAt).toBeTruthy()
  })

  it('checks password and email inputs like the real service', async () => {
    const short = await a.changePassword({ current: 'current-password', next: 'short', code: DEMO_CODE })
    expect(!short.ok && short.error.reason).toBe('weak_password')
    const same = await a.changePassword({ current: 'same-password-123', next: 'same-password-123', code: DEMO_CODE })
    expect(!same.ok && same.error.reason).toBe('same_password')
    const wrongCode = await a.changePassword({ current: 'old-password-123', next: 'new-password-456', code: '111111' })
    expect(!wrongCode.ok && wrongCode.error.reason).toBe('invalid_code')
    expect((await a.changePassword({ current: 'old-password-123', next: 'new-password-456', code: DEMO_CODE })).ok).toBe(true)
    expect((await a.checkCurrentPassword('anything')).ok).toBe(true)
    const empty = await a.checkCurrentPassword('')
    expect(!empty.ok && empty.error.reason).toBe('current_password_mismatch')
    const bad = await a.requestEmailChange('pw', 'not-an-email')
    expect(!bad.ok && bad.error.reason).toBe('invalid_email')
    expect((await a.requestEmailChange('pw', 'new@demo.example')).ok).toBe(true)
    let s = await a.getSecurityState()
    expect(s.ok && s.data.pendingEmail).toBe('new@demo.example')
    await a.cancelEmailChange()
    s = await a.getSecurityState()
    expect(s.ok && s.data.pendingEmail).toBeNull()
  })

  // ADR-0066, mirroring the account-security function.
  it('with demo 2FA on, a password change needs the authenticator code too', async () => {
    const e = await a.startTotpEnrollment()
    if (!e.ok) throw new Error('enrol failed')
    await a.confirmTotpEnrollment(e.data.factorId, DEMO_CODE)
    const input = { current: 'old-password-123', next: 'new-password-456', code: DEMO_CODE }
    const missing = await a.changePassword(input)
    expect(!missing.ok && missing.error.reason).toBe('totp_required')
    const wrong = await a.changePassword({ ...input, totp: '000000' })
    expect(!wrong.ok && wrong.error.reason).toBe('invalid_totp')
    expect((await a.changePassword({ ...input, totp: DEMO_CODE })).ok).toBe(true)
    const ev = await a.listSecurityEvents()
    expect(ev.ok && ev.data[0]?.type).toBe('account_password_changed')
  })

  it('resetPassword needs the pretend recovery session, and its 2FA step when 2FA is on', async () => {
    const closed = await a.resetPassword('a-new-long-password')
    expect(!closed.ok && closed.error.reason).toBe('reset_expired')
    const e = await a.startTotpEnrollment()
    if (!e.ok) throw new Error('enrol failed')
    await a.confirmTotpEnrollment(e.data.factorId, DEMO_CODE)
    expect((await mockPasswordReset.verifyCode('x@demo.example', '00000000')).ok).toBe(false)
    expect((await mockPasswordReset.verifyCode('x@demo.example', DEMO_RESET_CODE)).ok).toBe(true)
    expect(await mockPasswordReset.hasSession()).toEqual({ ok: true, data: true })
    // The recovery session starts at aal1: the reset page asks for the authenticator code first.
    expect(await a.getAssurance()).toEqual({ ok: true, data: { currentLevel: 'aal1', nextLevel: 'aal2' } })
    const skip = await a.resetPassword('a-new-long-password')
    expect(!skip.ok && skip.error.reason).toBe('aal2_required')
    expect((await a.verifyTotpForSignIn(DEMO_CODE)).ok).toBe(true)
    const short = await a.resetPassword('short')
    expect(!short.ok && short.error.reason).toBe('weak_password')
    expect((await a.resetPassword('a-new-long-password')).ok).toBe(true)
    expect(await mockPasswordReset.hasSession()).toEqual({ ok: true, data: false })
    const ev = await a.listSecurityEvents()
    expect(ev.ok && ev.data[0]?.type).toBe('account_password_reset')
  })
})
