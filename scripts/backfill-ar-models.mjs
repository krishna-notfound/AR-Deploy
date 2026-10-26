// One-time backfill of the public AR model copies (owner decision 2026-10-26): asks the sync-ar-models Edge Function
// to copy every PUBLISHED product's GLB/USDZ into the public ar-models bucket and set public_url. The function accepts
// { all: true } from the platform Owner only, so this signs in AS the Owner (the publishable key, never a secret key).
//
//   VITE_SUPABASE_URL=https://<ref>.supabase.co VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_... \
//   OWNER_EMAIL=admin@... OWNER_PASSWORD=... [OWNER_TOTP=123456] node scripts/backfill-ar-models.mjs
//
// OWNER_TOTP is needed only when the Owner has 2FA (the function's gate needs aal2 then). Prints { ok, copied,
// removed, failed } and nothing else; it never prints the password, the code or a token. Safe to run again: copies
// already in place are skipped.
import { createClient } from '@supabase/supabase-js'

const need = (n) => {
  const v = process.env[n]
  if (!v) {
    console.error(`Missing ${n}.`)
    process.exit(2)
  }
  return v
}

const sb = createClient(need('VITE_SUPABASE_URL'), need('VITE_SUPABASE_PUBLISHABLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
const signIn = await sb.auth.signInWithPassword({ email: need('OWNER_EMAIL'), password: need('OWNER_PASSWORD') })
if (signIn.error) {
  console.error(`Sign-in failed (${signIn.error.code ?? signIn.error.status ?? 'unknown'}).`)
  process.exit(1)
}

const code = process.env.OWNER_TOTP
if (code) {
  const factors = await sb.auth.mfa.listFactors()
  const totp = factors.data?.totp?.find((f) => f.status === 'verified')
  if (!totp) {
    console.error('OWNER_TOTP given, but the account has no verified authenticator.')
    process.exit(1)
  }
  const verified = await sb.auth.mfa.challengeAndVerify({ factorId: totp.id, code })
  if (verified.error) {
    console.error(`2FA failed (${verified.error.code ?? 'unknown'}).`)
    process.exit(1)
  }
}

const { data, error } = await sb.functions.invoke('sync-ar-models', { body: { all: true } })
if (error) {
  const body = error.context && typeof error.context.json === 'function' ? await error.context.json().catch(() => ({})) : {}
  console.error(`sync-ar-models refused: ${body.error ?? 'unknown'}${body.error === 'aal2_required' ? ' (set OWNER_TOTP)' : ''}`)
  process.exit(1)
}
console.log(JSON.stringify(data))
await sb.auth.signOut()
