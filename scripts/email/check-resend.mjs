// Email test workflow (design/23-email.md). Never prints keys or passwords.
//
//   node scripts/email/check-resend.mjs            Direct: sends the "test" template with RESEND_API_KEY from .env.qa,
//                                                  then asks Resend what happened to that message (provider evidence).
//   node scripts/email/check-resend.mjs --function Same test through the deployed send-test-email Edge Function, signed in
//                                                  as SANCTUS_ADMIN_EMAIL/PASSWORD (.env.qa); the result is also in email_log.
//
// Recipient: EMAIL_TEST_TO (.env.qa), default delivered@resend.dev. With the Resend test sender only the Resend account's
// own email and the *@resend.dev simulation addresses are accepted.
import { readFileSync } from 'node:fs'
import { fetchProviderStatus, sendViaResend } from '../../supabase/functions/_shared/email.ts'
import { renderEmail } from '../../supabase/functions/_shared/email-templates.ts'

const readEnv = (file) => {
  try {
    return Object.fromEntries(
      readFileSync(file, 'utf8')
        .split('\n')
        .filter((l) => /^[A-Z_]+=/.test(l))
        .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim()]),
    )
  } catch {
    return {}
  }
}
const env = { ...readEnv('.env.local'), ...readEnv('.env.qa'), ...process.env }
const to = env.EMAIL_TEST_TO || 'delivered@resend.dev'
const lang = process.argv.includes('--pt') ? 'pt' : 'en'
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

if (process.argv.includes('--function')) {
  const url = env.VITE_SUPABASE_URL
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key || !env.SANCTUS_ADMIN_EMAIL || !env.SANCTUS_ADMIN_PASSWORD) {
    console.error('Needs VITE_SUPABASE_URL/VITE_SUPABASE_PUBLISHABLE_KEY (.env.local) and SANCTUS_ADMIN_EMAIL/PASSWORD (.env.qa).')
    process.exit(1)
  }
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(url, key, { auth: { persistSession: false } })
  const { error } = await sb.auth.signInWithPassword({ email: env.SANCTUS_ADMIN_EMAIL, password: env.SANCTUS_ADMIN_PASSWORD })
  if (error) {
    console.error('Admin sign-in failed:', error.message)
    process.exit(1)
  }
  const call = async (body) => {
    const { data, error: fnError } = await sb.functions.invoke('send-test-email', { body })
    if (fnError) {
      const detail = fnError.context ? await fnError.context.json().catch(() => ({})) : {}
      return { error: fnError.message, ...detail }
    }
    return data
  }
  const sent = await call({ action: 'send', to, lang, idempotencyKey: `check-${Date.now()}` })
  console.log('send:', sent)
  if (sent.status === 'accepted') {
    await wait(8000)
    console.log('provider evidence:', await call({ action: 'status', providerMessageId: sent.providerMessageId }))
  }
} else {
  if (!env.RESEND_API_KEY) {
    console.error('Add RESEND_API_KEY to .env.qa (git-ignored) first.')
    process.exit(1)
  }
  const config = { apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM || 'Sanctus <onboarding@resend.dev>' }
  const email = renderEmail('test', lang)
  const sent = await sendViaResend(fetch, config, { ...email, to, idempotencyKey: `check-${Date.now()}` })
  console.log('send:', sent.ok ? { status: 'accepted', providerMessageId: sent.id, to } : { status: 'failed', httpStatus: sent.status, error: sent.error })
  if (sent.ok) {
    await wait(8000)
    const s = await fetchProviderStatus(fetch, config, sent.id)
    console.log('provider evidence:', s.ok ? { lastEvent: s.lastEvent, status: s.status } : { error: s.error })
  }
}
