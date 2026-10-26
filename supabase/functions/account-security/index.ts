// Supabase Edge Function: account security (S1, spec §7). JWT verification stays on (supabase/config.toml); the
// caller is whoever getUser() says the token belongs to, and the aal claim is read only after that succeeds.
// Every database step is a service_* function or the Auth admin API, with the service role, which lives only in
// Edge Function secrets; cancel_account_closure alone runs as the caller (anon key plus their token). Secrets:
// RESEND_API_KEY, EMAIL_FROM, APP_BASE_URL, EMAIL_TEST_RECIPIENTS, ADMIN_NOTIFICATION_EMAIL (design/23-email.md).
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { callerRpc } from '../_shared/caller.ts'
import { type LogEntry, logRow, readEmailConfig, sendAndLog } from '../_shared/email.ts'
import { CORS_HEADERS, serviceKeyFrom } from '../_shared/http.ts'
import { SWEEP_BUCKETS, aalFromJwt, handleAccountSecurity } from './handler.ts'

const env = (n: string) => Deno.env.get(n)
const url = env('SUPABASE_URL') ?? ''
const admin = createClient(url, serviceKeyFrom(env), { auth: { persistSession: false, autoRefreshToken: false } })
const config = readEmailConfig(env)

async function log(e: LogEntry): Promise<string> {
  const { data, error } = await admin.from('email_log').insert(logRow(e)).select('id').single()
  if (error) throw new Error(`email_log insert failed: ${error.code ?? 'unknown'}`)
  return data.id as string
}

/** Removes every file in a business's folder (folder = business id), a page of 1000 at a time. */
async function removeFolder(bucket: string, folder: string) {
  for (let round = 0; round < 50; round++) {
    const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000 })
    if (error) throw new Error(`storage list failed: ${bucket}`)
    const files = (data ?? []).filter((f) => f.id).map((f) => `${folder}/${f.name}`)
    if (!files.length) return
    const removed = await admin.storage.from(bucket).remove(files)
    if (removed.error) throw new Error(`storage remove failed: ${bucket}`)
    if (files.length < 1000) return
  }
}

Deno.serve((req) =>
  handleAccountSecurity(req, {
    appBaseUrl: config.ok ? config.config.appBaseUrl : '',
    adminNotificationEmail: config.ok ? config.config.adminNotificationEmail : '',
    async userIdFromToken(token) {
      const { data, error } = await admin.auth.getUser(token)
      return error ? null : (data.user?.id ?? null)
    },
    aalFromToken: aalFromJwt,
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
      const results = await Promise.allSettled(SWEEP_BUCKETS.map((bucket) => removeFolder(bucket, businessId)))
      if (results.some((r) => r.status === 'rejected')) throw new Error('storage sweep incomplete')
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
