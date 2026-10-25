// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { type EmailConfig, type LogEntry, sendAndLog } from '../_shared/email'
import { sha256Hex } from '../_shared/http'
import { type AccountSecurityDeps, type Factor, aalFromJwt, handleAccountSecurity } from './handler'

const OWNER = '00000000-0000-4000-8000-000000000001'
const STAFF = '00000000-0000-4000-8000-000000000002'
const BIZ_OWNER = '00000000-0000-4000-8000-000000000003'
const STAFF_2 = '00000000-0000-4000-8000-000000000004'
const OWNER_2 = '00000000-0000-4000-8000-000000000005'
const BUSINESS_ID = '10000000-0000-4000-8000-000000000001'
const NOW = new Date('2026-10-25T12:00:00Z')

const USERS: Record<string, { email: string; kind: 'owner' | 'staff' | 'business' | 'none' }> = {
  [OWNER]: { email: 'owner@sanctus.test', kind: 'owner' },
  [STAFF]: { email: 'staff@sanctus.test', kind: 'staff' },
  [STAFF_2]: { email: 'team@sanctus.test', kind: 'staff' },
  [OWNER_2]: { email: 'owner2@sanctus.test', kind: 'owner' },
  [BIZ_OWNER]: { email: 'maria@studio.pt', kind: 'business' },
}

const CONFIG: EmailConfig = {
  apiKey: 're_test',
  from: 'Sanctus <onboarding@resend.dev>',
  appBaseUrl: 'https://app.sanctus.test',
  testRecipients: ['owner@sanctus.test', 'staff@sanctus.test', 'team@sanctus.test', 'maria@studio.pt', 'inbox@sanctus.test'],
  adminNotificationEmail: 'inbox@sanctus.test',
}

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

interface ActionCodeRow { id: string; user: string; purpose: string; hash: string; salt: string; consumed: boolean; attempts: number; expired: boolean }

/** In-memory stand-in for the SQL service_* functions, following the shared contract. */
function deps(over: Partial<AccountSecurityDeps> = {}) {
  const s = {
    codes: [] as ActionCodeRow[],
    recovery: {} as Record<string, { salt: string; rows: { hash: string; used: boolean }[] }>,
    factors: {
      [OWNER]: [{ id: 'f-owner', type: 'totp', status: 'verified', updatedAt: '2026-10-01T10:00:00Z' }],
      [STAFF]: [{ id: 'f-staff', type: 'totp', status: 'verified', updatedAt: '2026-10-01T10:00:00Z' }],
      [STAFF_2]: [{ id: 'f-staff2', type: 'totp', status: 'verified', updatedAt: '2026-10-01T10:00:00Z' }],
      [BIZ_OWNER]: [{ id: 'f-biz', type: 'totp', status: 'verified', updatedAt: '2026-10-01T10:00:00Z' }],
    } as Record<string, Factor[]>,
    events: [] as { user: string; event: string; metadata: Record<string, unknown>; ip: string | null }[],
    rpcCalls: [] as { fn: string; args: Record<string, unknown> }[],
    logs: [] as LogEntry[],
    sends: [] as { to: string; subject: string; text: string; html: string }[],
    deletedUsers: [] as string[],
    deletedBusinesses: [] as string[],
    deletedFactors: [] as string[],
    requires2fa: {} as Record<string, boolean>,
    closures: {} as Record<string, { businessId: string | null }>,
    rateLimited: false,
    failSend: false,
    attempts: [] as { to: string; text: string }[],
    order: [] as string[],
  }
  const fetchFn = vi.fn(async (_url: string, init?: RequestInit) => {
    const b = JSON.parse(String(init?.body)) as { to: string[]; subject: string; text: string; html: string }
    s.attempts.push({ to: b.to[0]!, text: b.text })
    if (s.failSend) return new Response(JSON.stringify({ message: 'provider down' }), { status: 500 })
    s.sends.push({ to: b.to[0]!, subject: b.subject, text: b.text, html: b.html })
    return new Response(JSON.stringify({ id: `msg-${s.sends.length}` }), { status: 200 })
  })
  const norm = (c: string) => c.replace(/[\s-]/g, '').toUpperCase()
  const rpc = async (fn: string, a: Record<string, unknown>): Promise<Record<string, unknown>> => {
    s.rpcCalls.push({ fn, args: a })
    const user = a.p_user as string
    switch (fn) {
      case 'service_create_action_code': {
        if (s.rateLimited) return { error: 'rate_limited' }
        s.codes.filter((c) => c.user === user && c.purpose === a.p_purpose).forEach((c) => (c.consumed = true))
        const row = { id: `code-${s.codes.length + 1}`, user, purpose: a.p_purpose as string, hash: a.p_code_hash as string, salt: a.p_salt as string, consumed: false, attempts: 0, expired: false }
        s.codes.push(row)
        return { ok: true, id: row.id }
      }
      case 'service_void_action_codes':
        s.codes.filter((c) => c.user === user && c.purpose === a.p_purpose).forEach((c) => (c.consumed = true))
        return { ok: true }
      case 'service_check_action_code': {
        const row = [...s.codes].reverse().find((c) => c.user === user && c.purpose === a.p_purpose && !c.consumed)
        if (!row) return { error: 'invalid_code' }
        if (row.expired) return { error: 'code_expired' }
        if (row.attempts >= 5) return { error: 'too_many_attempts' }
        if ((await sha256Hex(row.salt + String(a.p_code))) !== row.hash) {
          row.attempts++
          return { error: row.attempts >= 5 ? 'too_many_attempts' : 'invalid_code' }
        }
        row.consumed = true
        return { ok: true }
      }
      case 'service_set_recovery_codes':
        s.recovery[user] = { salt: a.p_salt as string, rows: (a.p_hashes as string[]).map((hash) => ({ hash, used: false })) }
        return { ok: true }
      case 'service_use_recovery_code': {
        const set = s.recovery[user]
        if (!set) return { error: 'invalid_code' }
        const h = await sha256Hex(set.salt + norm(String(a.p_code)))
        const row = set.rows.find((r) => r.hash === h && !r.used)
        if (!row) return { error: 'invalid_code' }
        row.used = true
        return { ok: true, remaining: set.rows.filter((r) => !r.used).length }
      }
      case 'service_clear_recovery_codes':
        delete s.recovery[user]
        return { ok: true }
      case 'service_has_recovery_codes':
        return { ok: true, count: s.recovery[user]?.rows.filter((r) => !r.used).length ?? 0 }
      case 'service_log_account_event':
        s.events.push({ user, event: a.p_event as string, metadata: a.p_metadata as Record<string, unknown>, ip: a.p_ip as string | null })
        return { ok: true }
      case 'service_requires_2fa': {
        const kind = USERS[user]?.kind
        const group = kind === 'business' ? 'business' : kind === 'staff' || kind === 'owner' ? 'staff' : 'none'
        return { ok: true, requires: !!s.requires2fa[user], group }
      }
      case 'service_classify_user':
        return { ok: true, kind: USERS[user]?.kind ?? 'none' }
      case 'service_request_closure': {
        const kind = USERS[user]?.kind
        if (kind === 'owner') return { error: 'owner_cannot_close' }
        if (s.closures[user]) return { error: 'already_requested' }
        if (kind === 'business') {
          s.closures[user] = { businessId: BUSINESS_ID }
          return { ok: true, kind: 'business', business_id: BUSINESS_ID }
        }
        s.order.push('service_request_closure')
        return { ok: true, kind: 'staff' }
      }
      case 'service_closure_target': {
        const c = s.closures[user]
        return c ? { ok: true, business_id: c.businessId, email: USERS[user]!.email } : { error: 'not_found' }
      }
      case 'service_restore_closure': {
        if (!s.closures[user]) return { error: 'not_found' }
        delete s.closures[user]
        return { ok: true }
      }
      default:
        throw new Error(`unexpected rpc ${fn}`)
    }
  }
  const d: AccountSecurityDeps = {
    appBaseUrl: CONFIG.appBaseUrl,
    adminNotificationEmail: CONFIG.adminNotificationEmail,
    userIdFromToken: async (t) => (t.startsWith('tok:') ? t.split(':')[1]! : null),
    aalFromToken: (t) => (t.endsWith(':aal2') ? 'aal2' : 'aal1'),
    rpc,
    listFactors: async (u) => s.factors[u] ?? [],
    deleteFactor: async (u, id) => {
      s.deletedFactors.push(id)
      s.factors[u] = (s.factors[u] ?? []).filter((f) => f.id !== id)
    },
    deleteUser: async (u) => {
      s.order.push(`deleteUser:${u}`)
      s.deletedUsers.push(u)
    },
    deleteBusiness: async (b) => {
      s.order.push(`deleteBusiness:${b}`)
      s.deletedBusinesses.push(b)
      // account_closure_requests.business_id is on delete set null.
      for (const c of Object.values(s.closures)) if (c.businessId === b) c.businessId = null
    },
    sweepBusinessStorage: async (b) => void s.order.push(`sweep:${b}`),
    userEmail: async (u) => USERS[u]?.email ?? null,
    send: (e) => sendAndLog({ config: CONFIG, fetch: fetchFn as unknown as typeof fetch, log: async (l) => (s.logs.push(l), `log-${s.logs.length}`) }, e),
    random: (n) => crypto.getRandomValues(new Uint8Array(n)),
    now: () => NOW,
    ...over,
  }
  return { d, s, fetchFn }
}

const tok = (user: string, aal: 'aal1' | 'aal2' = 'aal1') => `tok:${user}:${aal}`
const call = (d: AccountSecurityDeps, token: string | null, body: unknown) =>
  handleAccountSecurity(
    new Request('https://fn.test/account-security', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.7', ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    d,
  )
const json = async (r: Response) => (await r.json()) as Record<string, unknown>
const lastCode = (s: { sends: { text: string }[] }) => /\b(\d{6})\b/.exec(s.sends.at(-1)!.text)![1]!

async function codeFor(d: AccountSecurityDeps, s: { sends: { text: string }[] }, user: string, purpose: string, aal: 'aal1' | 'aal2' = 'aal2') {
  const r = await call(d, tok(user, aal), { action: 'send_code', purpose })
  expect(r.status).toBe(200)
  return lastCode(s)
}

describe('account-security', () => {
  it('rejects a request with no token (401 not_signed_in) and an unknown action (400 invalid_request)', async () => {
    const { d } = deps()
    const a = await call(d, null, { action: 'send_code', purpose: 'disable_2fa' })
    expect(a.status).toBe(401)
    expect(await json(a)).toEqual({ ok: false, error: 'not_signed_in' })
    const b = await call(d, 'garbage', { action: 'send_code', purpose: 'disable_2fa' })
    expect(b.status).toBe(401)
    const c = await call(d, tok(STAFF), { action: 'drop_tables' })
    expect(c.status).toBe(400)
    expect(await json(c)).toEqual({ ok: false, error: 'invalid_request' })
    const e = await call(d, tok(STAFF), 'not json')
    expect(await json(e)).toEqual({ ok: false, error: 'invalid_request' })
    const f = await call(d, tok(STAFF), { action: 'send_code', purpose: 'everything' })
    expect(await json(f)).toEqual({ ok: false, error: 'invalid_request' })
    const g = await call(d, tok(STAFF), { action: 'owner_reset_2fa', target_user_id: 'nope', code: '123456' })
    expect(await json(g)).toEqual({ ok: false, error: 'invalid_request' })
  })

  it('send_code: creates a hashed code, emails it, returns a masked address; rate_limited from SQL becomes 429', async () => {
    const { d, s } = deps()
    const r = await call(d, tok(BIZ_OWNER), { action: 'send_code', purpose: 'request_closure' })
    expect(r.status).toBe(200)
    expect(await json(r)).toEqual({ ok: true, sentTo: 'm•••@studio.pt' })
    const code = lastCode(s)
    expect(code).toMatch(/^\d{6}$/)
    const row = s.codes[0]!
    expect(row.purpose).toBe('request_closure')
    expect(row.hash).toMatch(/^[0-9a-f]{64}$/)
    expect(row.hash).toBe(await sha256Hex(row.salt + code))
    expect(JSON.stringify(s.rpcCalls)).not.toContain(code)
    expect(s.sends[0]!.to).toBe('maria@studio.pt')
    expect(s.sends[0]!.subject).not.toContain(code)
    expect(s.sends[0]!.text).toContain('expires in 10 minutes')
    expect(s.logs.map((l) => [l.kind, l.status])).toEqual([['security_code', 'accepted']])

    s.rateLimited = true
    const limited = await call(d, tok(BIZ_OWNER), { action: 'send_code', purpose: 'request_closure' })
    expect(limited.status).toBe(429)
    expect(await json(limited)).toEqual({ ok: false, error: 'rate_limited' })
    expect(s.sends).toHaveLength(1)
  })

  it('send_code: only the Owner can ask for the Owner-only purposes', async () => {
    const { d, s } = deps()
    const r = await call(d, tok(STAFF, 'aal2'), { action: 'send_code', purpose: 'owner_reset_2fa' })
    expect(r.status).toBe(403)
    expect(await json(r)).toEqual({ ok: false, error: 'not_allowed' })
    expect(s.codes).toHaveLength(0)
    const ok = await call(d, tok(OWNER, 'aal2'), { action: 'send_code', purpose: 'complete_closure' })
    expect(await json(ok)).toEqual({ ok: true, sentTo: 'o•••@sanctus.test' })
  })

  it('email failure returns email_failed and keeps no usable code', async () => {
    const { d, s } = deps()
    s.failSend = true
    const r = await call(d, tok(STAFF, 'aal2'), { action: 'send_code', purpose: 'disable_2fa' })
    expect(r.status).toBe(400)
    expect(await json(r)).toEqual({ ok: false, error: 'email_failed' })
    expect(s.logs.map((l) => [l.kind, l.status])).toEqual([['security_code', 'failed']])
    expect(s.codes.filter((c) => !c.consumed)).toHaveLength(0)
    expect(s.rpcCalls.filter((c) => c.fn === 'service_create_action_code')).toHaveLength(1)
    expect(s.rpcCalls.at(-1)).toEqual({ fn: 'service_void_action_codes', args: { p_user: STAFF, p_purpose: 'disable_2fa' } })
    // The code in the email that did not go out is refused.
    const unsent = /\b(\d{6})\b/.exec(s.attempts.at(-1)!.text)![1]!
    s.failSend = false
    const tried = await call(d, tok(STAFF, 'aal2'), { action: 'disable_2fa', code: unsent })
    expect(await json(tried)).toEqual({ ok: false, error: 'invalid_code' })
    expect(s.factors[STAFF]).toHaveLength(1)
  })

  it('generate_recovery_codes: needs aal2; first set within 15 minutes of enrolling needs no code; a regenerate needs a valid regenerate_recovery code; returns 8 codes in XXXXX-XXXXX form and stores only hashes', async () => {
    const { d, s } = deps()
    s.factors[STAFF] = [{ id: 'f-new', type: 'totp', status: 'verified', updatedAt: new Date(NOW.getTime() - 5 * 60_000).toISOString() }]

    const aal1 = await call(d, tok(STAFF, 'aal1'), { action: 'generate_recovery_codes' })
    expect(aal1.status).toBe(403)
    expect(await json(aal1)).toEqual({ ok: false, error: 'aal2_required' })

    const first = await json(await call(d, tok(STAFF, 'aal2'), { action: 'generate_recovery_codes' }))
    expect(first.ok).toBe(true)
    const codes = first.codes as string[]
    expect(codes).toHaveLength(8)
    for (const c of codes) expect(c).toMatch(new RegExp(`^[${ALPHABET}]{5}-[${ALPHABET}]{5}$`))
    expect(new Set(codes).size).toBe(8)
    const stored = s.rpcCalls.find((c) => c.fn === 'service_set_recovery_codes')!.args
    const hashes = stored.p_hashes as string[]
    expect(hashes).toHaveLength(8)
    for (const h of hashes) expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(hashes[0]).toBe(await sha256Hex(String(stored.p_salt) + codes[0]!.replace('-', '')))
    expect(JSON.stringify(s.rpcCalls)).not.toMatch(new RegExp(codes.map((c) => c.replace('-', '')).join('|')))
    expect(s.events.map((e) => e.event)).toEqual(['account_2fa_enabled'])

    // A set exists now, so a second call is a regenerate and needs the emailed code.
    const noCode = await call(d, tok(STAFF, 'aal2'), { action: 'generate_recovery_codes' })
    expect(await json(noCode)).toEqual({ ok: false, error: 'invalid_code' })
    const wrongPurpose = await codeFor(d, s, STAFF, 'disable_2fa')
    expect(await json(await call(d, tok(STAFF, 'aal2'), { action: 'generate_recovery_codes', code: wrongPurpose }))).toEqual({ ok: false, error: 'invalid_code' })
    const code = await codeFor(d, s, STAFF, 'regenerate_recovery')
    const again = await json(await call(d, tok(STAFF, 'aal2'), { action: 'generate_recovery_codes', code }))
    expect(again.ok).toBe(true)
    expect((again.codes as string[]).some((c) => codes.includes(c))).toBe(false)
    expect(s.events.map((e) => e.event)).toEqual(['account_2fa_enabled', 'account_recovery_regenerated'])
  })

  it('generate_recovery_codes: an old enrolment without a set needs a code', async () => {
    const { d } = deps()
    const r = await call(d, tok(STAFF, 'aal2'), { action: 'generate_recovery_codes' })
    expect(await json(r)).toEqual({ ok: false, error: 'invalid_code' })
  })

  it('accepts a recovery code regardless of case, spaces and dash, once', async () => {
    const { d, s } = deps()
    s.factors[STAFF] = [{ id: 'f-new', type: 'totp', status: 'verified', updatedAt: new Date(NOW.getTime() - 60_000).toISOString() }]
    const codes = (await json(await call(d, tok(STAFF, 'aal2'), { action: 'generate_recovery_codes' }))).codes as string[]
    const set = s.recovery[STAFF]!
    const messy = ` ${codes[2]!.toLowerCase()} `
    const first = await call(d, tok(STAFF, 'aal1'), { action: 'redeem_recovery_code', code: messy })
    expect(first.status).toBe(200)
    expect(await json(first)).toEqual({ ok: true })
    expect(s.rpcCalls.find((c) => c.fn === 'service_use_recovery_code')!.args.p_code).toBe(codes[2]!.replace('-', ''))
    expect(set.rows.filter((r) => r.used)).toHaveLength(1)
    // A recovery turns 2FA off and clears the set; put both back (with the used mark) to try the same code again.
    s.factors[STAFF] = [{ id: 'f-again', type: 'totp', status: 'verified', updatedAt: NOW.toISOString() }]
    s.recovery[STAFF] = set
    const second = await call(d, tok(STAFF, 'aal1'), { action: 'redeem_recovery_code', code: codes[2]!.replace('-', ' ') })
    expect(second.status).toBe(400)
    expect(await json(second)).toEqual({ ok: false, error: 'invalid_code' })
    expect(await json(await call(d, tok(STAFF, 'aal1'), { action: 'redeem_recovery_code', code: 'not a code!' }))).toEqual({ ok: false, error: 'invalid_code' })
  })

  it('redeem_recovery_code deletes every TOTP factor, logs account_recovery_used and emails a notice', async () => {
    const { d, s } = deps()
    s.factors[STAFF] = [
      { id: 'f-a', type: 'totp', status: 'verified', updatedAt: NOW.toISOString() },
      { id: 'f-b', type: 'totp', status: 'unverified', updatedAt: NOW.toISOString() },
    ]
    const codes = (await json(await call(d, tok(STAFF, 'aal2'), { action: 'generate_recovery_codes' }))).codes as string[]
    s.sends.length = 0
    const r = await call(d, tok(STAFF, 'aal1'), { action: 'redeem_recovery_code', code: codes[0] })
    expect(await json(r)).toEqual({ ok: true })
    expect(s.deletedFactors.sort()).toEqual(['f-a', 'f-b'])
    expect(s.recovery[STAFF]).toBeUndefined()
    expect(s.events.at(-1)).toMatchObject({ user: STAFF, event: 'account_recovery_used', ip: '203.0.113.7' })
    expect(s.sends.map((m) => m.to)).toEqual(['staff@sanctus.test'])
    expect(s.logs.at(-1)!.kind).toBe('security_notice')
  })

  it('redeem_recovery_code needs a verified factor and an aal1 session', async () => {
    const { d, s } = deps()
    s.factors[STAFF] = []
    expect(await json(await call(d, tok(STAFF, 'aal1'), { action: 'redeem_recovery_code', code: 'ABCDE-FGHJK' }))).toEqual({ ok: false, error: 'not_allowed' })
    expect(s.rpcCalls.some((c) => c.fn === 'service_use_recovery_code')).toBe(false)
  })

  it("disable_2fa: needs aal2 and a valid disable_2fa code; refused with policy_requires_2fa when the caller's group requires 2FA", async () => {
    const { d, s } = deps()
    const code = await codeFor(d, s, BIZ_OWNER, 'disable_2fa')
    expect(await json(await call(d, tok(BIZ_OWNER, 'aal1'), { action: 'disable_2fa', code }))).toEqual({ ok: false, error: 'aal2_required' })
    expect(await json(await call(d, tok(BIZ_OWNER, 'aal2'), { action: 'disable_2fa', code: '999999' === code ? '999998' : '999999' }))).toEqual({ ok: false, error: 'invalid_code' })

    s.requires2fa[STAFF] = true
    const staffCode = await codeFor(d, s, STAFF, 'disable_2fa')
    const refused = await call(d, tok(STAFF, 'aal2'), { action: 'disable_2fa', code: staffCode })
    expect(refused.status).toBe(403)
    expect(await json(refused)).toEqual({ ok: false, error: 'policy_requires_2fa' })
    expect(s.factors[STAFF]).toHaveLength(1)
    // The refusal did not use up the code.
    expect(s.codes.find((c) => c.user === STAFF && !c.consumed)).toBeDefined()

    const fresh = await codeFor(d, s, BIZ_OWNER, 'disable_2fa')
    s.recovery[BIZ_OWNER] = { salt: 'x', rows: [{ hash: 'h', used: false }] }
    s.sends.length = 0
    expect(await json(await call(d, tok(BIZ_OWNER, 'aal2'), { action: 'disable_2fa', code: fresh }))).toEqual({ ok: true })
    expect(s.factors[BIZ_OWNER]).toEqual([])
    expect(s.recovery[BIZ_OWNER]).toBeUndefined()
    expect(s.events.at(-1)).toMatchObject({ user: BIZ_OWNER, event: 'account_2fa_disabled' })
    expect(s.sends.map((m) => m.to)).toEqual(['maria@studio.pt'])
  })

  it('request_closure: refuses the Owner; a business owner gets kind business and the admin inbox is emailed; staff get kind staff, sessions ended and the user deleted', async () => {
    const { d, s } = deps()
    // A business owner without 2FA (and no policy) may ask at aal1; one with 2FA needs aal2 (next test).
    s.factors[BIZ_OWNER] = []
    const ownerCode = await codeFor(d, s, OWNER, 'request_closure')
    const owner = await call(d, tok(OWNER, 'aal2'), { action: 'request_closure', code: ownerCode })
    expect(owner.status).toBe(403)
    expect(await json(owner)).toEqual({ ok: false, error: 'owner_cannot_close' })
    expect(s.rpcCalls.some((c) => c.fn === 'service_request_closure')).toBe(false)

    expect(await json(await call(d, tok(BIZ_OWNER), { action: 'request_closure', code: '000000' }))).toEqual({ ok: false, error: 'invalid_code' })
    const bizCode = await codeFor(d, s, BIZ_OWNER, 'request_closure', 'aal1')
    s.sends.length = 0
    expect(await json(await call(d, tok(BIZ_OWNER), { action: 'request_closure', code: bizCode }))).toEqual({ ok: true, kind: 'business' })
    expect(s.closures[BIZ_OWNER]).toEqual({ businessId: BUSINESS_ID })
    expect(s.sends.map((m) => m.to).sort()).toEqual(['inbox@sanctus.test', 'maria@studio.pt'])
    expect(s.logs.filter((l) => l.kind === 'closure_request').map((l) => l.recipient)).toEqual(['inbox@sanctus.test'])
    expect(s.events.at(-1)).toMatchObject({ user: BIZ_OWNER, event: 'account_closure_requested' })
    expect(s.deletedUsers).toEqual([])

    const again = await codeFor(d, s, BIZ_OWNER, 'request_closure', 'aal1')
    expect(await json(await call(d, tok(BIZ_OWNER), { action: 'request_closure', code: again }))).toEqual({ ok: false, error: 'already_requested' })
    // Refused before the code was checked, so the code is still usable.
    expect(s.codes.find((c) => c.user === BIZ_OWNER && !c.consumed)).toBeDefined()

    const staffCode = await codeFor(d, s, STAFF, 'request_closure')
    expect(await json(await call(d, tok(STAFF, 'aal2'), { action: 'request_closure', code: staffCode }))).toEqual({ ok: true, kind: 'staff' })
    expect(s.rpcCalls.filter((c) => c.fn === 'service_request_closure').map((c) => c.args.p_user)).toContain(STAFF)
    expect(s.deletedUsers).toEqual([STAFF])
    // service_request_closure deactivates the membership and ends the sessions before the account goes.
    expect(s.order).toEqual(['service_request_closure', `deleteUser:${STAFF}`])
    const deleted = s.events.find((e) => e.event === 'account_deleted')!
    expect(deleted.user).toBe(STAFF)
    expect(JSON.stringify(deleted.metadata)).not.toContain('staff@sanctus.test')
    expect(deleted.metadata.email_sha256).toBe(await sha256Hex('staff@sanctus.test'))
  })

  it('request_closure: a caller with a verified factor needs aal2, refused before the code is checked (the code stays usable)', async () => {
    const { d, s } = deps()
    const code = await codeFor(d, s, BIZ_OWNER, 'request_closure', 'aal1')
    const refused = await call(d, tok(BIZ_OWNER, 'aal1'), { action: 'request_closure', code })
    expect(refused.status).toBe(403)
    expect(await json(refused)).toEqual({ ok: false, error: 'aal2_required' })
    expect(s.rpcCalls.some((c) => c.fn === 'service_check_action_code')).toBe(false)
    expect(s.rpcCalls.some((c) => c.fn === 'service_request_closure')).toBe(false)
    expect(s.codes.find((c) => c.user === BIZ_OWNER && !c.consumed)).toBeDefined()
    // The same code works once the session is aal2.
    expect(await json(await call(d, tok(BIZ_OWNER, 'aal2'), { action: 'request_closure', code }))).toEqual({ ok: true, kind: 'business' })
  })

  it("request_closure: the caller's group policy requires 2FA (no factor yet): aal2 required; no verified factor and no policy: aal1 is enough", async () => {
    const { d, s } = deps()
    s.factors[STAFF] = []
    s.requires2fa[STAFF] = true
    const code = await codeFor(d, s, STAFF, 'request_closure', 'aal1')
    expect(await json(await call(d, tok(STAFF, 'aal1'), { action: 'request_closure', code }))).toEqual({ ok: false, error: 'aal2_required' })
    expect(s.deletedUsers).toEqual([])
    expect(s.codes.find((c) => c.user === STAFF && !c.consumed)).toBeDefined()

    s.factors[BIZ_OWNER] = [{ id: 'f-half', type: 'totp', status: 'unverified', updatedAt: NOW.toISOString() }]
    const bizCode = await codeFor(d, s, BIZ_OWNER, 'request_closure', 'aal1')
    expect(await json(await call(d, tok(BIZ_OWNER, 'aal1'), { action: 'request_closure', code: bizCode }))).toEqual({ ok: true, kind: 'business' })
  })

  it('a regenerate and disable_2fa at aal1 are refused before the code is checked', async () => {
    const { d, s } = deps()
    s.recovery[STAFF] = { salt: 'x', rows: [{ hash: 'h', used: false }] }
    const regen = await codeFor(d, s, STAFF, 'regenerate_recovery', 'aal1')
    expect(await json(await call(d, tok(STAFF, 'aal1'), { action: 'generate_recovery_codes', code: regen }))).toEqual({ ok: false, error: 'aal2_required' })
    const off = await codeFor(d, s, STAFF, 'disable_2fa', 'aal1')
    expect(await json(await call(d, tok(STAFF, 'aal1'), { action: 'disable_2fa', code: off }))).toEqual({ ok: false, error: 'aal2_required' })
    expect(s.rpcCalls.some((c) => c.fn === 'service_check_action_code')).toBe(false)
    expect(s.codes.filter((c) => c.user === STAFF && !c.consumed)).toHaveLength(2)
  })

  it("events about another user never store the actor's IP; the caller's own events do", async () => {
    const { d, s } = deps()
    const reset = await codeFor(d, s, OWNER, 'owner_reset_2fa')
    expect(await json(await call(d, tok(OWNER, 'aal2'), { action: 'owner_reset_2fa', target_user_id: STAFF, code: reset }))).toEqual({ ok: true })

    s.closures[BIZ_OWNER] = { businessId: BUSINESS_ID }
    const close = await codeFor(d, s, OWNER, 'complete_closure')
    expect(await json(await call(d, tok(OWNER, 'aal2'), { action: 'complete_closure', target_user_id: BIZ_OWNER, code: close }))).toEqual({ ok: true })

    // A failed user delete is logged too, also without the IP.
    s.closures[STAFF_2] = { businessId: null }
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    const failing = { ...d, deleteUser: async () => Promise.reject(new Error('auth down')) }
    const retry = await codeFor(d, s, OWNER, 'complete_closure')
    expect(await json(await call(failing, tok(OWNER, 'aal2'), { action: 'complete_closure', target_user_id: STAFF_2, code: retry }))).toEqual({ ok: false, error: 'unknown' })
    quiet.mockRestore()

    s.closures[STAFF] = { businessId: null }
    expect(await json(await call(d, tok(OWNER, 'aal2'), { action: 'restore_closure', target_user_id: STAFF }))).toEqual({ ok: true })

    const about = s.rpcCalls.filter((c) => c.fn === 'service_log_account_event' && (c.args.p_metadata as Record<string, unknown>).subject_id !== undefined)
    expect(about.map((c) => c.args.p_event)).toEqual(['account_2fa_reset_by_owner', 'account_closure_completed', 'account_closure_completed'])
    for (const c of about) {
      expect(c.args.p_user).not.toBe((c.args.p_metadata as Record<string, unknown>).subject_id)
      expect(c.args.p_ip).toBeNull()
    }
    // restore_closure logs in SQL (service_restore_closure), which takes no IP.
    expect(Object.keys(s.rpcCalls.find((c) => c.fn === 'service_restore_closure')!.args).sort()).toEqual(['p_actor', 'p_user'])

    // The caller's own events still carry it.
    s.factors[STAFF_2] = [{ id: 'f-new', type: 'totp', status: 'verified', updatedAt: NOW.toISOString() }]
    await call(d, tok(STAFF_2, 'aal2'), { action: 'generate_recovery_codes' })
    expect(s.events.at(-1)).toMatchObject({ user: STAFF_2, event: 'account_2fa_enabled', ip: '203.0.113.7' })
  })

  it('owner_reset_2fa: only the Owner at aal2 with a valid code; never on the Owner; deletes the target\'s factors and codes; emails the target', async () => {
    const { d, s } = deps()
    const staffTry = await call(d, tok(STAFF, 'aal2'), { action: 'owner_reset_2fa', target_user_id: STAFF_2, code: '123456' })
    expect(staffTry.status).toBe(403)
    expect(await json(staffTry)).toEqual({ ok: false, error: 'not_allowed' })

    const code = await codeFor(d, s, OWNER, 'owner_reset_2fa')
    expect(await json(await call(d, tok(OWNER, 'aal1'), { action: 'owner_reset_2fa', target_user_id: STAFF, code }))).toEqual({ ok: false, error: 'aal2_required' })
    expect(await json(await call(d, tok(OWNER, 'aal2'), { action: 'owner_reset_2fa', target_user_id: OWNER, code }))).toEqual({ ok: false, error: 'not_allowed' })
    expect(await json(await call(d, tok(OWNER, 'aal2'), { action: 'owner_reset_2fa', target_user_id: '00000000-0000-4000-8000-0000000000ff', code }))).toEqual({ ok: false, error: 'not_found' })
    expect(s.factors[OWNER]).toHaveLength(1)

    s.recovery[STAFF] = { salt: 'x', rows: [{ hash: 'h', used: false }] }
    s.sends.length = 0
    expect(await json(await call(d, tok(OWNER, 'aal2'), { action: 'owner_reset_2fa', target_user_id: STAFF, code }))).toEqual({ ok: true })
    expect(s.factors[STAFF]).toEqual([])
    expect(s.recovery[STAFF]).toBeUndefined()
    expect(s.events.at(-1)).toMatchObject({ user: OWNER, event: 'account_2fa_reset_by_owner', metadata: { subject_id: STAFF } })
    expect(s.sends.map((m) => m.to)).toEqual(['staff@sanctus.test'])
  })

  it('complete_closure: Owner at aal2 with a code; deletes the business, then the user; logs with email removed', async () => {
    const { d, s } = deps()
    s.closures[BIZ_OWNER] = { businessId: BUSINESS_ID }

    expect(await json(await call(d, tok(STAFF, 'aal2'), { action: 'complete_closure', target_user_id: BIZ_OWNER, code: '123456' }))).toEqual({ ok: false, error: 'not_allowed' })
    const code = await codeFor(d, s, OWNER, 'complete_closure')
    expect(await json(await call(d, tok(OWNER, 'aal1'), { action: 'complete_closure', target_user_id: BIZ_OWNER, code }))).toEqual({ ok: false, error: 'aal2_required' })
    expect(await json(await call(d, tok(OWNER, 'aal2'), { action: 'complete_closure', target_user_id: STAFF, code }))).toEqual({ ok: false, error: 'not_found' })
    const fresh = await codeFor(d, s, OWNER, 'complete_closure')
    s.sends.length = 0
    expect(await json(await call(d, tok(OWNER, 'aal2'), { action: 'complete_closure', target_user_id: BIZ_OWNER, code: fresh }))).toEqual({ ok: true })
    expect(s.order).toEqual([`deleteBusiness:${BUSINESS_ID}`, `sweep:${BUSINESS_ID}`, `deleteUser:${BIZ_OWNER}`])
    const ev = s.events.find((e) => e.event === 'account_closure_completed')!
    expect(ev.metadata.storage_sweep_incomplete).toBeUndefined()
    expect(ev.user).toBe(OWNER)
    expect(JSON.stringify(ev.metadata)).not.toContain('maria@studio.pt')
    expect(ev.metadata.email_sha256).toBe(await sha256Hex('maria@studio.pt'))
    expect(s.sends.map((m) => m.to)).toEqual(['maria@studio.pt'])
  })

  it('complete_closure: never on another Owner', async () => {
    const { d, s } = deps()
    s.closures[OWNER_2] = { businessId: null }
    const code = await codeFor(d, s, OWNER, 'complete_closure')
    expect(await json(await call(d, tok(OWNER, 'aal2'), { action: 'complete_closure', target_user_id: OWNER_2, code }))).toEqual({ ok: false, error: 'not_allowed' })
    expect(s.deletedUsers).toEqual([])
    expect(s.codes.find((c) => c.user === OWNER && !c.consumed)).toBeDefined()
  })

  it('complete_closure: a failed user delete is logged and can be retried without deleting the business again', async () => {
    const { d, s } = deps()
    s.closures[BIZ_OWNER] = { businessId: BUSINESS_ID }
    const realDelete = d.deleteUser
    d.deleteUser = async () => Promise.reject(new Error('auth down'))
    const first = await call(d, tok(OWNER, 'aal2'), { action: 'complete_closure', target_user_id: BIZ_OWNER, code: await codeFor(d, s, OWNER, 'complete_closure') })
    expect(first.status).toBe(500)
    expect(await json(first)).toEqual({ ok: false, error: 'unknown' })
    expect(s.deletedBusinesses).toEqual([BUSINESS_ID])
    expect(s.events.at(-1)).toMatchObject({ user: OWNER, event: 'account_closure_completed', metadata: { user_delete_failed: true } })

    d.deleteUser = realDelete
    s.sends.length = 0
    const retry = await call(d, tok(OWNER, 'aal2'), { action: 'complete_closure', target_user_id: BIZ_OWNER, code: await codeFor(d, s, OWNER, 'complete_closure') })
    expect(await json(retry)).toEqual({ ok: true })
    expect(s.deletedBusinesses).toEqual([BUSINESS_ID])
    expect(s.deletedUsers).toEqual([BIZ_OWNER])
    expect(s.events.at(-1)!.metadata.user_delete_failed).toBeUndefined()
    expect(s.sends.map((m) => m.to)).toEqual(['owner@sanctus.test', 'maria@studio.pt'])
  })

  it('complete_closure: a failed storage sweep is noted and the closure still completes', async () => {
    const { d, s } = deps()
    s.closures[BIZ_OWNER] = { businessId: BUSINESS_ID }
    d.sweepBusinessStorage = async () => Promise.reject(new Error('storage down'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const r = await call(d, tok(OWNER, 'aal2'), { action: 'complete_closure', target_user_id: BIZ_OWNER, code: await codeFor(d, s, OWNER, 'complete_closure') })
    vi.mocked(console.error).mockRestore()
    expect(await json(r)).toEqual({ ok: true })
    expect(s.deletedUsers).toEqual([BIZ_OWNER])
    expect(s.events.at(-1)).toMatchObject({ event: 'account_closure_completed', metadata: { storage_sweep_incomplete: true } })
  })

  it('request_closure: an unexpected kind from SQL deletes nobody', async () => {
    const { d, s } = deps()
    const base = d.rpc
    d.rpc = async (fn, a) => (fn === 'service_request_closure' ? { ok: true, kind: 'something_else' } : base(fn, a))
    const r = await call(d, tok(STAFF, 'aal2'), { action: 'request_closure', code: await codeFor(d, s, STAFF, 'request_closure') })
    expect(r.status).toBe(500)
    expect(await json(r)).toEqual({ ok: false, error: 'unknown' })
    expect(s.deletedUsers).toEqual([])
    expect(s.events.some((e) => e.event === 'account_deleted')).toBe(false)
  })

  it('request_closure: a staff kind for a caller who is not staff deletes nobody', async () => {
    const { d, s } = deps()
    const base = d.rpc
    d.rpc = async (fn, a) => (fn === 'service_request_closure' ? { ok: true, kind: 'staff' } : base(fn, a))
    const r = await call(d, tok(BIZ_OWNER, 'aal2'), { action: 'request_closure', code: await codeFor(d, s, BIZ_OWNER, 'request_closure') })
    expect(await json(r)).toEqual({ ok: false, error: 'unknown' })
    expect(s.deletedUsers).toEqual([])
  })

  it('request_closure: a failed staff self-delete is logged and answers unknown', async () => {
    const { d, s } = deps()
    d.deleteUser = async () => Promise.reject(new Error('auth down'))
    const r = await call(d, tok(STAFF, 'aal2'), { action: 'request_closure', code: await codeFor(d, s, STAFF, 'request_closure') })
    expect(r.status).toBe(500)
    expect(await json(r)).toEqual({ ok: false, error: 'unknown' })
    expect(s.events.at(-1)).toMatchObject({ user: STAFF, event: 'account_deleted', metadata: { delete_failed: true } })
  })

  it('restore_closure: Owner at aal2 only', async () => {
    const { d, s } = deps()
    s.closures[BIZ_OWNER] = { businessId: BUSINESS_ID }
    expect(await json(await call(d, tok(STAFF, 'aal2'), { action: 'restore_closure', target_user_id: BIZ_OWNER }))).toEqual({ ok: false, error: 'not_allowed' })
    expect(await json(await call(d, tok(OWNER, 'aal1'), { action: 'restore_closure', target_user_id: BIZ_OWNER }))).toEqual({ ok: false, error: 'aal2_required' })
    s.sends.length = 0
    expect(await json(await call(d, tok(OWNER, 'aal2'), { action: 'restore_closure', target_user_id: BIZ_OWNER }))).toEqual({ ok: true })
    expect(s.rpcCalls.find((c) => c.fn === 'service_restore_closure')!.args).toEqual({ p_user: BIZ_OWNER, p_actor: OWNER })
    expect(s.closures[BIZ_OWNER]).toBeUndefined()
    expect(s.sends.map((m) => m.to)).toEqual(['maria@studio.pt'])
    expect(await json(await call(d, tok(OWNER, 'aal2'), { action: 'restore_closure', target_user_id: BIZ_OWNER }))).toEqual({ ok: false, error: 'not_found' })
  })

  it('never logs a code or a recovery code', async () => {
    const consoleSpies = (['log', 'info', 'warn', 'error'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}))
    const { d, s } = deps()
    s.factors[STAFF] = [{ id: 'f-new', type: 'totp', status: 'verified', updatedAt: NOW.toISOString() }]
    const codes = (await json(await call(d, tok(STAFF, 'aal2'), { action: 'generate_recovery_codes' }))).codes as string[]
    const sent = await codeFor(d, s, STAFF, 'regenerate_recovery')
    const next = (await json(await call(d, tok(STAFF, 'aal2'), { action: 'generate_recovery_codes', code: sent }))).codes as string[]
    await call(d, tok(STAFF, 'aal1'), { action: 'redeem_recovery_code', code: next[0] })
    s.failSend = true
    await call(d, tok(BIZ_OWNER), { action: 'send_code', purpose: 'request_closure' })

    const secrets = [sent, ...codes, ...next].flatMap((c) => [c, c.replace('-', '')])
    const logged = JSON.stringify({ logs: s.logs, events: s.events, consoles: consoleSpies.map((sp) => sp.mock.calls) })
    for (const secret of secrets) expect(logged).not.toContain(secret)
    expect(logged).not.toMatch(/\b\d{6}\b/)
    const metadata = JSON.stringify(s.rpcCalls.filter((c) => c.fn === 'service_log_account_event').map((c) => c.args))
    expect(metadata).not.toMatch(/\b\d{6}\b/)
    consoleSpies.forEach((sp) => sp.mockRestore())
  })

  it('reads aal from a JWT payload', () => {
    const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    expect(aalFromJwt(`${b64({ alg: 'HS256' })}.${b64({ sub: 'x', aal: 'aal2' })}.sig`)).toBe('aal2')
    expect(aalFromJwt(`${b64({ alg: 'HS256' })}.${b64({ sub: 'x', aal: 'aal1' })}.sig`)).toBe('aal1')
    expect(aalFromJwt('not-a-jwt')).toBe('aal1')
  })
})
