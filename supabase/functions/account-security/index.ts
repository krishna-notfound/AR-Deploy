// Supabase Edge Function: account security (S1, spec §7). JWT verification stays on (supabase/config.toml); the
// caller is whoever getUser() says the token belongs to, and the aal claim is read only after that succeeds.
// Every database step is a service_* function or the Auth admin API, with the service role, which lives only in
// Edge Function secrets; cancel_account_closure alone runs as the caller (anon key plus their token), and the current
// password check of change_password signs in on a throwaway anon client (ADR-0066). Secrets:
// RESEND_API_KEY, EMAIL_FROM, APP_BASE_URL, EMAIL_TEST_RECIPIENTS (design/23-email.md); optionally APPLICATION_SALT.
// ADR-0077: verify_jwt is OFF for this function (supabase/config.toml), because the owner-alias actions run before anyone
// is signed in (alias_sign_in, alias_reset_request, alias_reset_verify) and the app's publishable key is not a JWT. The
// handler authenticates every other action itself with getUser() on the caller's token (no token: 401). Closure alerts
// go to the Owner's Auth email, so ADMIN_NOTIFICATION_EMAIL is not read here.
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { applicationSalt } from '../_shared/attempts.ts'
import { callerRpc } from '../_shared/caller.ts'
import { type LogEntry, logRow, readEmailConfig, sendAndLog } from '../_shared/email.ts'
import { CORS_HEADERS, serviceKeyFrom } from '../_shared/http.ts'
import { type AliasSignInResult, SWEEP_BUCKETS, type SweepStorage, aalFromJwt, amrFromJwt, handleAccountSecurity, removeBusinessFolder, sessionFromJwt } from './handler.ts'

const env = (n: string) => Deno.env.get(n)
const url = env('SUPABASE_URL') ?? ''
const serviceKey = serviceKeyFrom(env)
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const config = readEmailConfig(env)
const salt = await applicationSalt(env, serviceKey)

/** A throwaway anon client: no storage, no refresh, so it never touches anyone's session. */
const anonClient = () => createClient(url, env('SUPABASE_ANON_KEY') ?? '', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })

/** The answer of a sign-in on a throwaway client: the tokens on success, otherwise only a fixed reason (never Auth's text). */
function signInResult(error: { status?: number; code?: string } | null, session: { access_token: string; refresh_token: string; expires_in: number; token_type: string } | null): AliasSignInResult {
  if (error) {
    if (error.status === 429 || error.code === 'over_request_rate_limit') return { status: 'rate_limited' }
    const invalid = ['invalid_credentials', 'otp_expired', 'otp_disabled', 'validation_failed', 'bad_json'].includes(error.code ?? '') || error.status === 400 || error.status === 403 || error.status === 422
    return { status: invalid ? 'invalid' : 'unknown' }
  }
  if (!session) return { status: 'unknown' }
  return { status: 'ok', session: { access_token: session.access_token, refresh_token: session.refresh_token, expires_in: session.expires_in, token_type: session.token_type } }
}

async function log(e: LogEntry): Promise<string> {
  const { data, error } = await admin.from('email_log').insert(logRow(e)).select('id').single()
  if (error) throw new Error(`email_log insert failed: ${error.code ?? 'unknown'}`)
  return data.id as string
}

/** The service-role client as the closure sweep's storage (handler.ts removeBusinessFolder does the walking). */
const sweepStorage: SweepStorage = {
  async list(bucket, folder, offset) {
    const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000, offset })
    if (error) throw new Error(`storage list failed: ${bucket}`)
    return (data ?? []).map((f) => ({ name: f.name, id: f.id ?? null }))
  },
  async remove(bucket, paths) {
    const { error } = await admin.storage.from(bucket).remove(paths)
    if (error) throw new Error(`storage remove failed: ${bucket}`)
  },
}

Deno.serve((req) =>
  handleAccountSecurity(req, {
    appBaseUrl: config.ok ? config.config.appBaseUrl : '',
    attemptSalt: salt,
    async attempt(hashes, max) {
      const { data, error } = await admin.rpc('service_application_attempt', { p_hashes: hashes, p_max: max })
      // A limiter that cannot answer refuses: these actions are anonymous.
      if (error) return false
      return data === true
    },
    sessionFromToken: sessionFromJwt,
    async endOtherSessions(userId, keep) {
      const { error } = await admin.rpc('service_end_other_sessions', { p_user: userId, p_keep: keep })
      if (error) throw new Error(`service_end_other_sessions failed: ${error.code ?? 'unknown'}`)
    },
    async setEmail(userId, email) {
      const { error } = await admin.auth.admin.updateUserById(userId, { email, email_confirm: true })
      if (!error) return 'ok'
      if (error.code === 'email_exists' || error.code === 'user_already_exists') return 'email_taken'
      throw new Error(`updateUserById failed: ${error.code ?? error.name}`)
    },
    async signIn(email, password) {
      try {
        const { data, error } = await anonClient().auth.signInWithPassword({ email, password })
        return signInResult(error, data.session)
      } catch {
        return { status: 'unknown' }
      }
    },
    async verifyRecovery(email, code) {
      try {
        const { data, error } = await anonClient().auth.verifyOtp({ email, token: code, type: 'recovery' })
        return signInResult(error, data.session)
      } catch {
        return { status: 'unknown' }
      }
    },
    async sendRecovery(email) {
      // Answers the same for an address with no account; a send-rate limit is the only error and is not shown to anyone.
      await anonClient().auth.resetPasswordForEmail(email, { redirectTo: config.ok ? `${config.config.appBaseUrl}/reset-password` : undefined })
    },
    async userIdFromToken(token) {
      const { data, error } = await admin.auth.getUser(token)
      return error ? null : (data.user?.id ?? null)
    },
    aalFromToken: aalFromJwt,
    amrFromToken: amrFromJwt,
    // ADR-0066: a throwaway anon client (no storage, no refresh), signed out at once, which revokes the extra session.
    async checkPassword(email, password) {
      try {
        const check = createClient(url, env('SUPABASE_ANON_KEY') ?? '', { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
        const { error } = await check.auth.signInWithPassword({ email, password })
        if (error) {
          if (error.status === 429 || error.code === 'over_request_rate_limit') return 'rate_limited'
          return error.code === 'invalid_credentials' ? 'password_incorrect' : 'unknown'
        }
        await check.auth.signOut({ scope: 'local' }).catch(() => undefined)
        return 'ok'
      } catch {
        return 'unknown'
      }
    },
    async setPassword(userId, password) {
      const { error } = await admin.auth.admin.updateUserById(userId, { password })
      if (!error) return 'ok'
      if (error.code === 'weak_password') return 'weak_password'
      throw new Error(`updateUserById failed: ${error.code ?? error.name}`)
    },
    async endSessions(userId) {
      const { error } = await admin.rpc('service_end_sessions', { p_user: userId })
      if (error) throw new Error(`service_end_sessions failed: ${error.code ?? 'unknown'}`)
    },
    async rpc(fn, args) {
      const { data, error } = await admin.rpc(fn, args)
      // Never include the arguments: they carry code hashes and the code being checked.
      if (error) throw new Error(`${fn} failed: ${error.code ?? 'unknown'}`)
      return (data ?? {}) as Record<string, unknown>
    },
    async listFactors(userId) {
      const { data, error } = await admin.auth.admin.mfa.listFactors({ userId })
      if (error) throw new Error(`listFactors failed: ${error.name}`)
      return (data?.factors ?? []).map((f) => ({ id: f.id, type: f.factor_type, status: f.status, updatedAt: f.updated_at }))
    },
    async deleteFactor(userId, id) {
      const { error } = await admin.auth.admin.mfa.deleteFactor({ id, userId })
      if (error) throw new Error(`deleteFactor failed: ${error.name}`)
    },
    async deleteUser(userId) {
      const { error } = await admin.auth.admin.deleteUser(userId)
      if (error) throw new Error(`deleteUser failed: ${error.name}`)
    },
    // The same path as the console's delete (supabaseCatalogService.deleteBusiness): the row goes, related rows
    // cascade, then the business's Storage folders are swept (best effort, reported by the handler).
    async deleteBusiness(businessId) {
      const { error } = await admin.from('businesses').delete().eq('id', businessId)
      if (error) throw new Error(`business delete failed: ${error.code ?? 'unknown'}`)
    },
    async sweepBusinessStorage(businessId) {
      const results = await Promise.allSettled(SWEEP_BUCKETS.map((bucket) => removeBusinessFolder(sweepStorage, bucket, businessId)))
      if (results.some((r) => r.status === 'rejected')) throw new Error('storage sweep incomplete')
    },
    // ADR-0069: the folder of public copies sync-ar-models wrote ({business}/{product}/{variant|base}/{file}) goes, then
    // every model row of the business stops pointing at it (public_url null), so a cancelled closure falls back to the
    // private file until the copies are made again. Both steps are tried; the error at the end says one failed.
    async removeArCopies(businessId) {
      let failed = false
      try {
        await removeBusinessFolder(sweepStorage, 'ar-models', businessId)
      } catch {
        failed = true
      }
      const { data, error } = await admin.from('products').select('id').eq('business_id', businessId).limit(5000)
      if (error) throw new Error(`product lookup failed: ${error.code ?? 'unknown'}`)
      const ids = (data ?? []).map((r: { id: string }) => r.id)
      for (let i = 0; i < ids.length; i += 100) {
        const chunk = ids.slice(i, i + 100)
        for (const table of ['product_models', 'product_variant_models'] as const) {
          const res = await admin.from(table).update({ public_url: null }).in('product_id', chunk).not('public_url', 'is', null)
          if (res.error) failed = true
        }
      }
      if (failed) throw new Error('AR copy removal incomplete')
    },
    async userEmail(userId) {
      const { data, error } = await admin.auth.admin.getUserById(userId)
      return error ? null : (data.user?.email ?? null)
    },
    async send(email) {
      if (!config.ok) {
        const logId = await log({ kind: email.kind, recipient: email.to, subject: email.subject, status: 'blocked', error: 'email_not_configured', businessId: email.businessId, workflow: email.workflow, triggeredBy: email.triggeredBy })
        return { logId, status: 'blocked', error: 'email_not_configured' }
      }
      return sendAndLog({ config: config.config, fetch, log }, email)
    },
    log,
    // cancel_account_closure runs as the caller (anon key plus their token): its auth.uid() and 2FA gate are theirs.
    async callerRpc(token, fn, args) {
      const data = await callerRpc(url, env('SUPABASE_ANON_KEY') ?? '', token)(fn, args ?? {})
      return (data ?? {}) as Record<string, unknown>
    },
    async businessSummary(businessId) {
      const { data, error } = await admin.from('businesses').select('name, status').eq('id', businessId).maybeSingle()
      if (error) throw new Error(`business lookup failed: ${error.code ?? 'unknown'}`)
      return data ? { name: String(data.name), status: String(data.status) } : null
    },
    async ownerEmails() {
      const { data, error } = await admin.from('platform_admins').select('user_id')
      if (error) throw new Error(`owner lookup failed: ${error.code ?? 'unknown'}`)
      const emails: string[] = []
      for (const o of data ?? []) {
        const u = await admin.auth.admin.getUserById(o.user_id as string)
        if (u.data.user?.email) emails.push(u.data.user.email)
      }
      return emails
    },
    random: (n) => crypto.getRandomValues(new Uint8Array(n)),
    now: () => new Date(),
  }).catch((e) => {
    console.error(`account-security: ${String(e).slice(0, 300)}`)
    return new Response(JSON.stringify({ ok: false, error: 'unknown' }), { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } })
  }),
)
