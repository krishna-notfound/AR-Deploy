// Supabase Edge Function: public business application (ADR-0024). verify_jwt is off (anonymous visitors apply);
// the handler validates, rate-limits and writes with the service role. Browsers can never insert applications directly.
// Secrets: RESEND_API_KEY, EMAIL_FROM, APP_BASE_URL, EMAIL_TEST_RECIPIENTS, ADMIN_NOTIFICATION_EMAIL (design/23-email.md);
// APPLICATION_SALT is optional (without it the salt is derived from the service key, which never leaves the server).
import { createClient } from 'npm:@supabase/supabase-js@2.117.3'
import { normalizeApplyForm, rulesFromConfig } from '../_shared/applyForm.ts'
import { logRow, readEmailConfig } from '../_shared/email.ts'
import { serviceKeyFrom, sha256Hex } from '../_shared/http.ts'
import { MAX_SUBMISSIONS_PER_HOUR, type StoredApplication, handleSubmitApplication, loggable } from './handler.ts'

const env = (n: string) => Deno.env.get(n)
const key = serviceKeyFrom(env)
const admin = createClient(env('SUPABASE_URL') ?? '', key, { auth: { persistSession: false, autoRefreshToken: false } })
const salt = env('APPLICATION_SALT') || (key ? await sha256Hex(`submit-application-salt|${key}`) : '')

const OPEN = ['submitted', 'under_review']
const STORED_COLUMNS = 'id, reference, applicant_email, business_name, language, created_at'

interface StoredRow {
  id: string
  reference: string
  applicant_email: string
  business_name: string
  language: string
  created_at: string
}
const stored = (r: StoredRow): StoredApplication => ({
  id: r.id,
  reference: r.reference,
  applicantEmail: r.applicant_email,
  businessName: r.business_name,
  language: r.language === 'pt' ? 'pt' : 'en',
  createdAt: r.created_at,
})

Deno.serve((req) =>
  handleSubmitApplication(req, {
    config: readEmailConfig(env),
    fetch,
    salt,
    async findByKey(submissionKey) {
      const { data, error } = await admin.from('business_applications').select(STORED_COLUMNS).eq('submission_key', submissionKey).maybeSingle()
      if (error) throw new Error(`lookup failed: ${error.message}`)
      return data ? stored(data as StoredRow) : null
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
    async allowAttempt(hashes) {
      const { data, error } = await admin.rpc('service_application_attempt', { p_hashes: hashes, p_max: MAX_SUBMISSIONS_PER_HOUR })
      if (error) throw new Error(`rate check failed: ${error.message}`)
      return data === true
    },
    // The published form's rules (nothing published: no rules, today's behaviour). A read error throws: the handler
    // answers 503 config_unavailable instead of treating it as "no form".
    async loadApplyRules() {
      const { data, error } = await admin.from('site_content').select('published, published_version').eq('id', true).maybeSingle()
      if (error) throw new Error(`form lookup failed: ${error.message}`)
      const published = data?.published as { applyForm?: unknown } | null | undefined
      if (!published) return null
      return rulesFromConfig(normalizeApplyForm(published.applyForm), Number(data?.published_version) || 0)
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
            custom: a.custom,
            formVersion: a.formVersion,
          },
          submission_key: a.submissionKey,
          submitter_hash: hash,
        })
        .select(STORED_COLUMNS)
        .single()
      if (error?.code === '23505' && error.message.includes('submission_key')) return 'duplicate_key'
      if (error) throw new Error(`insert failed: ${error.message}`)
      return stored(data as StoredRow)
    },
    async audit(e) {
      const { error } = await admin.from('audit_events').insert({ event_type: e.eventType, application_id: e.applicationId, to_status: e.toStatus ?? null, metadata: e.metadata ?? {} })
      if (error) throw new Error(`audit insert failed: ${error.message}`)
    },
    async hasSubmittedAudit(applicationId) {
      const { data, error } = await admin.from('audit_events').select('id').eq('application_id', applicationId).eq('event_type', 'application_submitted').limit(1)
      if (error) throw new Error(`audit lookup failed: ${error.message}`)
      return (data ?? []).length > 0
    },
    async loggedWorkflows(applicationId) {
      const { data, error } = await admin.from('email_log').select('workflow').eq('application_id', applicationId)
      if (error) throw new Error(`email log lookup failed: ${error.message}`)
      return new Set((data ?? []).map((r) => r.workflow as string | null).filter((w): w is string => !!w))
    },
    async log(e) {
      const { data, error } = await admin.from('email_log').insert(logRow(e)).select('id').single()
      if (error) throw new Error(`email_log insert failed: ${error.message}`)
      return data.id as string
    },
    // Active members whose role has applications.view, plus the Owner, minus anyone who turned the alert off in
    // their profile (the column defaults to on, so a missing profile row counts as on).
    async staffAlertRecipients() {
      const perms = await admin.from('platform_role_permissions').select('role').eq('permission', 'applications.view')
      if (perms.error) throw new Error(`permission lookup failed: ${perms.error.message}`)
      const roles = (perms.data ?? []).map((r) => r.role as string)
      const members = roles.length
        ? await admin.from('platform_members').select('user_id, email').eq('status', 'active').in('role', roles).not('user_id', 'is', null)
        : { data: [] as { user_id: string; email: string }[], error: null }
      if (members.error) throw new Error(`member lookup failed: ${members.error.message}`)
      const owners = await admin.from('platform_admins').select('user_id')
      if (owners.error) throw new Error(`owner lookup failed: ${owners.error.message}`)
      const byUser = new Map<string, string>((members.data ?? []).map((m) => [m.user_id as string, m.email as string]))
      for (const o of owners.data ?? []) {
        if (byUser.has(o.user_id)) continue
        const { data } = await admin.auth.admin.getUserById(o.user_id)
        if (data.user?.email) byUser.set(o.user_id, data.user.email)
      }
      if (!byUser.size) return []
      const off = await admin.from('profiles').select('user_id').in('user_id', [...byUser.keys()]).eq('notify_new_applications', false)
      if (off.error) throw new Error(`profile lookup failed: ${off.error.message}`)
      for (const p of off.data ?? []) byUser.delete(p.user_id as string)
      return [...byUser.values()]
    },
  }).catch((e) => {
    console.error(`submit-application: ${loggable(e, 300)}`)
    return new Response(JSON.stringify({ error: 'unknown' }), { status: 500, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } })
  }),
)
