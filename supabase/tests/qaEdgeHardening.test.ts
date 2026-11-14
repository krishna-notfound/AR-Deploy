// @vitest-environment node
// QA round of 2026-11-14, edge functions: service_claim_decision_email (EF-3) and the push endpoint host check (EF-4).
// PGlite only; nothing touches a live project.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MIGRATIONS, freshDb, ids, makeHelpers, type Helpers } from './harness'

const MIGRATION = readdirSync(MIGRATIONS).find((n) => n.endsWith('_qa_edge_hardening.sql'))!
const ROLLBACK_SQL = join(__dirname, '..', 'rollback', '20261114_qa_edge_hardening_rollback.sql')

const id = ids(18)
const ANA = id(1)
const APP = id(5)
const APP2 = id(6)

let db: PGlite
let h: Helpers

beforeAll(async () => {
  db = await freshDb()
  h = makeHelpers(db)
  await db.exec(`insert into auth.users (id, email, email_confirmed_at) values ('${ANA}', 'ana@test', now());`)
  for (const a of [APP, APP2])
    await db.exec(`insert into public.business_applications (id, business_name, applicant_email, submission_key) values ('${a}', 'Casa ${a.slice(-2)}', 'rita@shop.test', gen_random_uuid())`)
}, 120_000)

afterAll(async () => {
  await db.close()
})

const claim = (app: string) => h.svc(`select to_jsonb(public.service_claim_decision_email('${app}')) as r`)
const setStatus = (app: string, status: string, at: string) => db.exec(`update public.business_applications set status = '${status}', reviewed_at = '${at}' where id = '${app}'`)

describe('service_claim_decision_email (EF-3)', () => {
  it('sorts after every earlier migration', () => {
    expect(MIGRATION > '20261113084852_website_editor_signin_panel_heading.sql').toBe(true)
  })

  it('is false for an application that is not rejected', async () => {
    expect(await claim(APP)).toBe(false)
    await setStatus(APP, 'under_review', '2026-11-14 10:00:00+00')
    expect(await claim(APP)).toBe(false)
  })

  it('lets exactly one of two concurrent claims win', async () => {
    await setStatus(APP, 'rejected', '2026-11-14 10:05:00+00')
    const results = await Promise.all([claim(APP), claim(APP)])
    expect(results.filter(Boolean)).toHaveLength(1)
    // Any later repeat of the same rejection is refused too.
    expect(await claim(APP)).toBe(false)
  })

  it('gives a new rejection (reopened, then rejected again at another time) a new claim; another application is separate', async () => {
    await setStatus(APP, 'under_review', '2026-11-14 11:00:00+00')
    await setStatus(APP, 'rejected', '2026-11-14 11:05:00+00')
    expect(await claim(APP)).toBe(true)
    expect(await claim(APP)).toBe(false)
    await setStatus(APP2, 'rejected', '2026-11-14 10:05:00+00')
    expect(await claim(APP2)).toBe(true)
  })

  it('is callable by the service role only', async () => {
    const q = `select to_jsonb(public.service_claim_decision_email('${APP}')) as r`
    await expect(h.probe(ANA, q)).rejects.toThrow()
    await expect(h.probe('', q, [], null, 'anon')).rejects.toThrow()
  })

  it('keeps the claims out of reach of signed-in users', async () => {
    await expect(h.probe(ANA, `select 1 from private.application_decision_emails`)).rejects.toThrow()
  })
})

describe('push endpoint host check (EF-4)', () => {
  const REG = `select to_jsonb(public.register_push_subscription($1, 'p256', 'authsecret', 'Browser')) as r`

  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com/wp/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/QAbc',
    'https://db5p.notify.windows.com/?token=abc',
    'https://wns2-pn1p.notify.windows.com/w/?token=abc',
  ])('accepts %s', async (endpoint) => {
    await h.call(ANA, REG, [endpoint])
    expect(await h.count(ANA, `select count(*)::int as n from public.push_subscriptions where endpoint = '${endpoint}'`)).toBe(1)
  })

  it.each([
    'https://push.example/x',
    'https://evil.example/fcm.googleapis.com',
    'https://fcm.googleapis.com.evil.example/x',
    'https://evilfcm.googleapis.com/x',
    'https://notify.windows.com/x',
    'https://x.notify.windows.com.evil.example/x',
    'https://169.254.169.254/latest/meta-data',
    'http://fcm.googleapis.com/fcm/send/abc',
  ])('refuses %s through the function and through a direct insert', async (endpoint) => {
    await expect(h.call(ANA, REG, [endpoint])).rejects.toThrow()
    await expect(h.probe(ANA, `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('${ANA}', '${endpoint}', 'k', 'a')`)).rejects.toThrow()
  })
})

describe('rollback', () => {
  it('apply â†’ rollback â†’ re-apply: the function, the claim table and the constraint go and come back', async () => {
    const rolled = await freshDb()
    try {
      const state = async () =>
        (
          await rolled.query<{ f: number; t: number; c: number }>(
            `select (select count(*) from pg_proc where proname = 'service_claim_decision_email')::int as f,
                    (select count(*) from information_schema.tables where table_schema = 'private' and table_name = 'application_decision_emails')::int as t,
                    (select count(*) from pg_constraint where conname = 'push_subscriptions_endpoint_host_check')::int as c`,
          )
        ).rows[0]
      expect(await state()).toEqual({ f: 1, t: 1, c: 1 })
      await rolled.exec(readFileSync(ROLLBACK_SQL, 'utf8'))
      expect(await state()).toEqual({ f: 0, t: 0, c: 0 })
      await rolled.exec(readFileSync(join(MIGRATIONS, MIGRATION), 'utf8'))
      expect(await state()).toEqual({ f: 1, t: 1, c: 1 })
    } finally {
      await rolled.close()
    }
  }, 120_000)
})
