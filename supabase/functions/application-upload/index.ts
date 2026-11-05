// Supabase Edge Function: signed upload URL for the optional PDF catalogue of a business application (ADR-0050). verify_jwt is
// off (anonymous visitors apply); the handler validates, rate-limits (the same per-IP limit as submit-application) and signs
// with the service role. Browsers can never write to the private bucket application-files directly.
// Secrets: APPLICATION_SALT is optional (without it the salt is derived from the service key, as in submit-application).
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { applicationSalt } from '../_shared/attempts.ts'
import { serviceKeyFrom } from '../_shared/http.ts'
import { handleApplicationUpload } from './handler.ts'

const env = (n: string) => Deno.env.get(n)
const key = serviceKeyFrom(env)
const admin = createClient(env('SUPABASE_URL') ?? '', key, { auth: { persistSession: false, autoRefreshToken: false } })
const salt = await applicationSalt(env, key)

Deno.serve((req) =>
  handleApplicationUpload(req, {
    salt,
    async allowAttempt(hashes, max) {
      const { data, error } = await admin.rpc('service_application_attempt', { p_hashes: hashes, p_max: max })
      if (error) throw new Error(`rate check failed: ${error.message}`)
      return data === true
    },
    async createUpload(path) {
      const { data, error } = await admin.storage.from('application-files').createSignedUploadUrl(path, { upsert: true })
      if (error) throw new Error(`signed upload url failed: ${error.message}`)
      return data
    },
  }).catch((e) => {
    console.error(`application-upload: ${String(e).slice(0, 300)}`)
    return new Response(JSON.stringify({ error: 'unknown' }), { status: 500, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } })
  }),
)
