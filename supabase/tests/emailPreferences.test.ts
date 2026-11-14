// @vitest-environment node
// ADR-0078: the five email switches on notification_prefs. Defaults are all on, the existing row-level security keeps limiting each
// person to their own row (and the new columns follow it), people who switched new-application alerts off in their profile keep
// that choice, email_log takes the new staff kind, and the rollback restores the old shape. PGlite only; nothing touches a live project.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MIGRATIONS, freshDb, ids, makeHelpers, type Helpers } from './harness'

const MIGRATION = readdirSync(MIGRATIONS).find((n) => n.endsWith('_email_preferences.sql'))!
const ROLLBACK_SQL = join(__dirname, '..', 'rollback', '20261114_email_preferences_rollback.sql')
const COLUMNS = ['email_new_application', 'email_new_model_request', 'email_company_updates', 'email_model_request_updates', 'email_business_notices']

const id = ids(18)
const ANA = id(41)
const BEN = id(42)
const COY = id(43)

let db: PGlite
let h: Helpers

beforeAll(async () => {
  db = await freshDb()
  h = makeHelpers(db)
  await db.exec(`insert into auth.users (id, email, email_confirmed_at) values ('${ANA}', 'ana@test', now()), ('${BEN}', 'ben@test', now());`)
}, 120_000)

afterAll(async () => {
  await db.close()
})

describe('email switches on notification_prefs', () => {
  it('sorts after every earlier migration', () => {
    expect(MIGRATION).toMatch(/^\d{14}_email_preferences\.sql$/)
    expect(MIGRATION > '20261114123842_qa_edge_hardening.sql').toBe(true)
  })

  it('a new row has all five switches on, and the old switches are unchanged', async () => {
    await h.call(ANA, `insert into public.notification_prefs (user_id, language) values ('${ANA}', 'pt') returning to_jsonb(notification_prefs) as r`)
    const row = (await h.call(ANA, `select to_jsonb(p) as r from public.notification_prefs p where user_id = '${ANA}'`)) as Record<string, unknown>
    for (const c of COLUMNS) expect(row[c], c).toBe(true)
    expect(row).toMatchObject({ new_application: true, push_enabled: true, language: 'pt' })
  })

  it('the five columns are not null booleans', async () => {
    const { rows } = await db.query<{ column_name: string; is_nullable: string; data_type: string; column_default: string }>(
      `select column_name, is_nullable, data_type, column_default from information_schema.columns where table_schema = 'public' and table_name = 'notification_prefs' and column_name like 'email\\_%' order by column_name`,
    )
    expect(rows.map((r) => r.column_name)).toEqual([...COLUMNS].sort())
    for (const r of rows) expect(r).toMatchObject({ is_nullable: 'NO', data_type: 'boolean', column_default: 'true' })
  })

  it('a person switches one type off and nothing else changes', async () => {
    await h.call(ANA, `update public.notification_prefs set email_business_notices = false where user_id = '${ANA}' returning to_jsonb(notification_prefs) as r`)
    const row = (await h.call(ANA, `select to_jsonb(p) as r from public.notification_prefs p where user_id = '${ANA}'`)) as Record<string, unknown>
    expect(row.email_business_notices).toBe(false)
    for (const c of COLUMNS.filter((c) => c !== 'email_business_notices')) expect(row[c], c).toBe(true)
  })

  it('row-level security still limits the switches to their owner', async () => {
    expect(await h.affected(BEN, `update public.notification_prefs set email_new_application = false where user_id = '${ANA}'`)).toBe(0)
    expect(await h.count(BEN, `select count(*)::int as n from public.notification_prefs`)).toBe(0)
    await expect(h.probe(BEN, `insert into public.notification_prefs (user_id, email_new_application) values ('${ANA}', false)`)).rejects.toThrow()
    await expect(h.probe('', `select email_new_application from public.notification_prefs`, [], null, 'anon')).rejects.toThrow()
  })

  it('a switch only takes true or false', async () => {
    await expect(h.probe(ANA, `update public.notification_prefs set email_new_application = null where user_id = '${ANA}'`)).rejects.toThrow()
  })

  it('the service role (the unsubscribe function) upserts one switch off, idempotently, creating the row when there is none', async () => {
    const upsert = `insert into public.notification_prefs (user_id, email_new_model_request) values ('${BEN}', false)
                    on conflict (user_id) do update set email_new_model_request = false returning to_jsonb(notification_prefs) as r`
    await h.svc(upsert)
    const again = (await h.svc(upsert)) as Record<string, unknown>
    expect(again).toMatchObject({ email_new_model_request: false, email_new_application: true, email_business_notices: true, push_enabled: true })
  })

  it('email_log takes model_request_staff and still refuses an unknown kind', async () => {
    await h.svc(`insert into public.email_log (kind, recipient, subject, status) values ('model_request_staff', 'a@b.test', 'New 3D model request', 'accepted') returning to_jsonb(email_log) as r`)
    await expect(h.svc(`insert into public.email_log (kind, recipient, subject, status) values ('nope', 'a@b.test', 's', 'accepted') returning to_jsonb(email_log) as r`)).rejects.toThrow()
  })
})

describe('carrying over the profile switch', () => {
  it('a person who turned new-application alerts off in their profile starts with that email switch off; others stay on', async () => {
    const before = await freshDb((n) => n < MIGRATION)
    try {
      await before.exec(`insert into auth.users (id, email, email_confirmed_at) values ('${ANA}', 'ana@test', now()), ('${BEN}', 'ben@test', now()), ('${COY}', 'coy@test', now())`)
      await before.exec(`insert into public.profiles (user_id) values ('${ANA}'), ('${BEN}'), ('${COY}') on conflict (user_id) do nothing`)
      await before.exec(`update public.profiles set notify_new_applications = false where user_id in ('${ANA}', '${COY}')`)
      // BEN already has a prefs row with other choices: they survive.
      await before.exec(`insert into public.notification_prefs (user_id, push_enabled, language) values ('${COY}', false, 'pt')`)
      await before.exec(readFileSync(join(MIGRATIONS, MIGRATION), 'utf8'))
      const { rows } = await before.query<{ user_id: string; email_new_application: boolean; push_enabled: boolean; language: string | null }>(
        `select user_id, email_new_application, push_enabled, language from public.notification_prefs order by user_id`,
      )
      expect(rows).toEqual([
        { user_id: ANA, email_new_application: false, push_enabled: true, language: null },
        { user_id: COY, email_new_application: false, push_enabled: false, language: 'pt' },
      ])
    } finally {
      await before.close()
    }
  }, 120_000)
})

describe('rollback', () => {
  it('drops the five columns, keeps the other switches, and the migration applies again', async () => {
    const rolled = await freshDb()
    try {
      await rolled.exec(`insert into auth.users (id, email, email_confirmed_at) values ('${ANA}', 'ana@test', now())`)
      await rolled.exec(`insert into public.notification_prefs (user_id, push_enabled, language) values ('${ANA}', false, 'pt')`)
      const cols = async () =>
        (await rolled.query<{ column_name: string }>(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'notification_prefs' and column_name like 'email\\_%'`)).rows.length
      expect(await cols()).toBe(5)
      await rolled.exec(readFileSync(ROLLBACK_SQL, 'utf8'))
      expect(await cols()).toBe(0)
      expect((await rolled.query(`select push_enabled, language from public.notification_prefs`)).rows).toEqual([{ push_enabled: false, language: 'pt' }])
      await expect(rolled.exec(`insert into public.email_log (kind, recipient, subject, status) values ('model_request_staff', 'a@b.test', 's', 'accepted')`)).rejects.toThrow()
      await rolled.exec(readFileSync(join(MIGRATIONS, MIGRATION), 'utf8'))
      expect(await cols()).toBe(5)
    } finally {
      await rolled.close()
    }
  }, 120_000)

  it('keeps the wider email_log check while a model_request_staff row exists', async () => {
    const rolled = await freshDb()
    try {
      await rolled.exec(`insert into public.email_log (kind, recipient, subject, status) values ('model_request_staff', 'a@b.test', 's', 'accepted')`)
      await rolled.exec(readFileSync(ROLLBACK_SQL, 'utf8'))
      await rolled.exec(`insert into public.email_log (kind, recipient, subject, status) values ('model_request_staff', 'c@d.test', 's', 'accepted')`)
    } finally {
      await rolled.close()
    }
  }, 120_000)
})
