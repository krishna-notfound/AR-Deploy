// Supabase Edge Function: one-click email unsubscribe (ADR-0078). verify_jwt is off: the link in an email carries a signed
// token instead of a session (supabase/config.toml). The handler checks the token, rate-limits and writes with the service
// role; a token can only switch one email type off for the person it was issued to.
// Secrets: EMAIL_UNSUBSCRIBE_SECRET (the signing secret, shared with the functions that send the emails);
// APPLICATION_SALT is optional (without it the salt is derived from the service key, which never leaves the server).
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { applicationSalt } from '../_shared/attempts.ts'
import { EMAIL_PREF_COLUMN } from '../_shared/emailPrefs.ts'
import { serviceKeyFrom } from '../_shared/http.ts'
import { handleEmailUnsubscribe, UNSUBSCRIBES_PER_HOUR } from './handler.ts'

const env = (n: string) => Deno.env.get(n)
const key = serviceKeyFrom(env)
const admin = createClient(env('SUPABASE_URL') ?? '', key, { auth: { persistSession: false, autoRefreshToken: false } })
const salt = await applicationSalt(env, key)
const secret = (env('EMAIL_UNSUBSCRIBE_SECRET') ?? '').trim()

Deno.serve((req) =>
  handleEmailUnsubscribe(req, {
    secret,
    salt,
    async allowAttempt(hashes) {
      const { data, error } = await admin.rpc('service_application_attempt', { p_hashes: hashes, p_max: UNSUBSCRIBES_PER_HOUR })
      if (error) throw new Error(`rate check failed: ${error.code ?? 'unknown'}`)
      return data === true
    },
    // An upsert that names only this column: an existing row keeps its other switches, a new row gets the defaults.
    async setPref(userId, type) {
      const { error } = await admin.from('notification_prefs').upsert({ user_id: userId, [EMAIL_PREF_COLUMN[type]]: false }, { onConflict: 'user_id' })
      // 23503: the account was deleted since the email was sent; nothing is left to switch off.
      if (error && error.code !== '23503') throw new Error(`preference update failed: ${error.code ?? 'unknown'}`)
    },
  }).catch((e) => {
    console.error(`email-unsubscribe: ${String(e).slice(0, 200)}`)
    return new Response(JSON.stringify({ error: 'unknown' }), { status: 500, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } })
  }),
)
