// Renders the sample business logos (SVG in supabase/seed/sample_logos.json) to 256px PNGs and uploads them
// to the public business-logos bucket as {business_id}/logo.png, signed in as a platform admin.
// Usage: SEED_ADMIN_EMAIL=... SEED_ADMIN_PASSWORD=... node scripts/sample-data/upload-logos.mjs
// Uses only the publishable key from .env.local; storage policies allow platform admins to write any folder.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const env = Object.fromEntries(
  readFileSync(join(root, '.env.local'), 'utf8')
    .split('\n')
    .filter((l) => /^\s*VITE_[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const { SEED_ADMIN_EMAIL: email, SEED_ADMIN_PASSWORD: password } = process.env
if (!email || !password) throw new Error('Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (a platform admin account).')

const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } })
const { error: signInError } = await sb.auth.signInWithPassword({ email, password })
if (signInError) throw new Error(`Sign-in failed: ${signInError.message}`)

const logos = JSON.parse(readFileSync(join(root, 'supabase/seed/sample_logos.json'), 'utf8'))
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 256, height: 256 } })
for (const { id, name, svg } of logos) {
  await page.setContent(`<html><body style="margin:0;background:transparent"><img src="${svg}" width="256" height="256"></body></html>`)
  const png = await page.screenshot({ type: 'png', omitBackground: true })
  const { error } = await sb.storage.from('business-logos').upload(`${id}/logo.png`, png, { contentType: 'image/png', upsert: true })
  console.log(error ? `FAIL ${name}: ${error.message}` : `uploaded ${name}`)
}
await browser.close()
await sb.auth.signOut()
