// Supabase Edge Function: public business application (ADR-0024). verify_jwt is off (anonymous visitors apply);
// the handler validates, rate-limits and writes with the service role. Browsers can never insert applications directly.
// Secrets: RESEND_API_KEY, EMAIL_FROM, APP_BASE_URL, EMAIL_TEST_RECIPIENTS, ADMIN_NOTIFICATION_EMAIL (design/23-email.md);
// APPLICATION_SALT is optional (without it the salt is derived from the service key, which never leaves the server).
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { logRow, readEmailConfig } from '../_shared/email.ts'
import { serviceKeyFrom, sha256Hex } from '../_shared/http.ts'
import { handleSubmitApplication } from './handler.ts'

const env = (n: string) => Deno.env.get(n)
const key = serviceKeyFrom(env)
const admin = createClient(env('SUPABASE_URL') ?? '', key, { auth: { persistSession: false, autoRefreshToken: false } })
const salt = env('APPLICATION_SALT') || (key ? await sha256Hex(`submit-application-salt|${key}`) : '')

const OPEN = ['submitted', 'under_review']

Deno.serve((req) =>
  handleSubmitApplication(req, {
    config: readEmailConfig(env),
    fetch,
    salt,
    async findByKey(submissionKey) {
      const { data, error } = await admin.from('business_applications').select('id, reference').eq('submission_key', submissionKey).maybeSingle()
      if (error) throw new Error(`lookup failed: ${error.message}`)
      return data
    },
    async findOpenDuplicate(email, businessName) {
      const { data, error } = await admin
        .from('business_applications')
        .select('id, reference')
        .ilike('applicant_email', email.replace(/[\\%_]/g, (c) => `\\${c}`))
        .ilike('business_name', businessName.replace(/[\\%_]/g, (c) => `\\${c}`))
        .in('status', OPEN)
        .limit(1)
      if (error) throw new Error(`duplicate check failed: ${error.message}`)
      return data?.[0] ?? null
    },
    async countRecent(hash, sinceIso) {
      const { count, error } = await admin.from('business_applications').select('id', { count: 'exact', head: true }).eq('submitter_hash', hash).gte('created_at', sinceIso)
      if (error) throw new Error(`rate check failed: ${error.message}`)
      return count ?? 0
    },
    async insert(a, hash) {
      const { data, error } = await admin
        .from('business_applications')
        .insert({
          business_name: a.businessName,
          applicant_name: a.applicantName,
          applicant_email: a.applicantEmail,
          applicant_phone: a.applicantPhone,
          website: a.website,
          country: a.country,
          city: a.city,
          category: a.category,
          language: a.language,
          answers: {
            description: a.description,
            applicantRole: a.applicantRole,
            productCount: a.productCount,
            photoReadiness: a.photoReadiness,
            modelReadiness: a.modelReadiness,
            notes: a.notes,
          },
          submission_key: a.submissionKey,
          submitter_hash: hash,
        })
        .select('id, reference')
        .single()
      if (error?.code === '23505' && error.message.includes('submission_key')) return 'duplicate_key'
      if (error) throw new Error(`insert failed: ${error.message}`)
      return data
    },
    async audit(e) {
      const { error } = await admin.from('audit_events').insert({ event_type: e.eventType, application_id: e.applicationId, to_status: e.toStatus ?? null, metadata: e.metadata ?? {} })
      if (error) throw new Error(`audit insert failed: ${error.message}`)
    },
    async log(e) {
      const { data, error } = await admin.from('email_log').insert(logRow(e)).select('id').single()
      if (error) throw new Error(`email_log insert failed: ${error.message}`)
      return data.id as string
    },
  }).catch((e) => {
    console.error(`submit-application: ${String(e).slice(0, 300)}`)
    return new Response(JSON.stringify({ error: 'unknown' }), { status: 500, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } })
  }),
)
