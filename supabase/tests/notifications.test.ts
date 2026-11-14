// @vitest-environment node
// Client requests round 2, W5 (ADR-0056): notifications, push_subscriptions and notification_prefs. Each person reads and marks
// read only their own notifications; inserts are the service role's alone; a device moves to the user who registers it; the
// rollback drops all three tables and the function, and the migration applies again. PGlite only; nothing touches a live project.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MIGRATIONS, freshDb, ids, makeHelpers, type Helpers } from './harness'

const MIGRATION = readdirSync(MIGRATIONS).find((n) => n.endsWith('_notifications.sql'))!
const ROLLBACK_SQL = join(__dirname, '..', 'rollback', '20261109_notifications_rollback.sql')

const id = ids(18)
const ANA = id(1)
const BEN = id(2)

let db: PGlite
let h: Helpers

beforeAll(async () => {
  db = await freshDb()
  h = makeHelpers(db)
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values ('${ANA}', 'ana@test', now()), ('${BEN}', 'ben@test', now());
  `)
}, 120_000)

afterAll(async () => {
  await db.close()
})

const NOTE = `insert into public.notifications (recipient, kind, title, body, link, dedupe_key) values ($1, 'new_application', 'New application', 'Atelier applied', '/admin/applications/a1', $2) returning id`
const mine = (uid: string) => h.count(uid, `select count(*)::int as n from public.notifications`)

describe('notifications', () => {
  it('sorts after every earlier migration', () => {
    expect(MIGRATION).toMatch(/^\d{14}_notifications\.sql$/)
    expect(MIGRATION > '20261105122617_application_catalogue.sql').toBe(true)
  })

  it('only the service role inserts; a signed-in user and anon are refused', async () => {
    await h.svc(`with r as (${NOTE}) select to_jsonb(r) as r from r`, [ANA, 'app:1'])
    await h.svc(`with r as (${NOTE}) select to_jsonb(r) as r from r`, [BEN, 'app:1'])
    await expect(h.probe(ANA, NOTE, [ANA, 'x'])).rejects.toThrow()
    await expect(h.probe('', NOTE, [ANA, 'x'], null, 'anon')).rejects.toThrow()
  })

  it('each person reads only their own rows; anon reads none', async () => {
    expect(await mine(ANA)).toBe(1)
    expect(await mine(BEN)).toBe(1)
    await expect(h.probe('', `select 1 from public.notifications`, [], null, 'anon')).rejects.toThrow()
  })

  it('the same recipient and dedupe key insert once; a null key never collides', async () => {
    const again = await h.svc(
      `with r as (insert into public.notifications (recipient, kind, title, dedupe_key) values ('${ANA}', 'new_application', 'Again', 'app:1') on conflict (recipient, dedupe_key) do nothing returning id)
       select to_jsonb((select count(*) from r)) as r`,
    )
    expect(Number(again)).toBe(0)
    for (let i = 0; i < 2; i++)
      await h.svc(`with r as (insert into public.notifications (recipient, kind, title) values ('${ANA}', 'company_update', 'No key') returning id) select to_jsonb(count(*)) as r from r`)
    expect(await mine(ANA)).toBe(3)
  })

  it('a user marks their own rows read, but cannot change the text or touch another user rows', async () => {
    expect(await h.affected(ANA, `update public.notifications set read_at = now() where recipient = '${ANA}'`)).toBe(3)
    expect(await h.affected(ANA, `update public.notifications set read_at = now() where recipient = '${BEN}'`)).toBe(0)
    await expect(h.probe(ANA, `update public.notifications set title = 'Hacked' where recipient = '${ANA}'`)).rejects.toThrow()
    await expect(h.probe(ANA, `update public.notifications set recipient = '${BEN}' where recipient = '${ANA}'`)).rejects.toThrow()
    await expect(h.probe(ANA, `delete from public.notifications where recipient = '${ANA}'`)).rejects.toThrow()
  })

  it('rejects kinds outside the list and links that are not in-app paths', async () => {
    const bad = (cols: string, vals: string) => h.svc(`with r as (insert into public.notifications (recipient, kind, title, ${cols}) values ('${ANA}', ${vals}) returning id) select to_jsonb(count(*)) as r from r`)
    await expect(bad('link', `'new_application', 't', 'https://evil.example'`)).rejects.toThrow()
    await expect(bad('link', `'new_application', 't', '//evil.example'`)).rejects.toThrow()
    await expect(bad('body', `'surprise', 't', 'b'`)).rejects.toThrow()
    expect(Number(await bad('link', `'new_application', 't', '/admin/applications/ok'`))).toBe(1)
  })

  it('deleting the user removes their notifications', async () => {
    await db.exec(`insert into auth.users (id, email) values ('${id(9)}', 'tmp@test')`)
    await h.svc(`with r as (${NOTE}) select to_jsonb(r) as r from r`, [id(9), 'tmp'])
    await db.exec(`delete from auth.users where id = '${id(9)}'`)
    expect((await db.query<{ n: number }>(`select count(*)::int as n from public.notifications where recipient = '${id(9)}'`)).rows[0]!.n).toBe(0)
  })
})

describe('push_subscriptions', () => {
  const REG = `select to_jsonb(public.register_push_subscription($1, 'p256', 'authsecret', 'Firefox')) as r`
  const owner = async (endpoint: string) => (await db.query<{ u: string }>(`select user_id as u from public.push_subscriptions where endpoint = '${endpoint}'`)).rows[0]?.u

  it('register_push_subscription saves a device for the caller; anon cannot call it', async () => {
    await h.call(ANA, REG, ['https://fcm.googleapis.com/fcm/send/a'])
    expect(await owner('https://fcm.googleapis.com/fcm/send/a')).toBe(ANA)
    await expect(h.probe('', REG, ['https://fcm.googleapis.com/fcm/send/b'], null, 'anon')).rejects.toThrow()
  })

  it('a device registered again by another user moves to that user; the first no longer sees it', async () => {
    await h.call(BEN, REG, ['https://fcm.googleapis.com/fcm/send/a'])
    expect(await owner('https://fcm.googleapis.com/fcm/send/a')).toBe(BEN)
    expect(await h.count(ANA, `select count(*)::int as n from public.push_subscriptions`)).toBe(0)
    expect(await h.count(BEN, `select count(*)::int as n from public.push_subscriptions`)).toBe(1)
  })

  it('a user adds, reads and deletes only their own subscriptions directly', async () => {
    const insert = (uid: string) => `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('${uid}', 'https://fcm.googleapis.com/fcm/send/direct-${uid}', 'k', 'a')`
    await h.call(ANA, `with r as (${insert(ANA)} returning id) select to_jsonb(count(*)) as r from r`)
    await expect(h.probe(ANA, insert(BEN))).rejects.toThrow()
    expect(await h.affected(ANA, `delete from public.push_subscriptions where user_id = '${BEN}'`)).toBe(0)
    expect(await h.affected(ANA, `delete from public.push_subscriptions where user_id = '${ANA}'`)).toBe(1)
    await expect(h.probe(ANA, `update public.push_subscriptions set user_id = '${ANA}' where user_id = '${BEN}'`)).rejects.toThrow()
  })

  it('rejects a plain-http endpoint and keeps at most 10 devices per user, newest first', async () => {
    await expect(h.call(ANA, REG, ['http://fcm.googleapis.com/fcm/send/insecure'])).rejects.toThrow()
    for (let i = 0; i < 12; i++) await h.call(ANA, REG, [`https://fcm.googleapis.com/fcm/send/d${i}`])
    expect(await h.count(ANA, `select count(*)::int as n from public.push_subscriptions`)).toBe(10)
    expect(await owner('https://fcm.googleapis.com/fcm/send/d11')).toBe(ANA)
    expect(await owner('https://fcm.googleapis.com/fcm/send/d0')).toBeUndefined()
  })
})

describe('notification_prefs', () => {
  it('a user creates and updates their own row; defaults are all on; another user row is out of reach', async () => {
    await h.call(ANA, `insert into public.notification_prefs (user_id, language) values ('${ANA}', 'pt') returning to_jsonb(notification_prefs) as r`)
    const row = (await h.call(ANA, `select to_jsonb(p) as r from public.notification_prefs p where user_id = '${ANA}'`)) as Record<string, unknown>
    expect(row).toMatchObject({ new_application: true, new_model_request: true, company_updates: true, push_enabled: true, language: 'pt' })
    expect(await h.affected(ANA, `update public.notification_prefs set push_enabled = false where user_id = '${ANA}'`)).toBe(1)
    expect(await h.affected(BEN, `update public.notification_prefs set push_enabled = false where user_id = '${ANA}'`)).toBe(0)
    expect(await h.count(BEN, `select count(*)::int as n from public.notification_prefs`)).toBe(0)
    await expect(h.probe(BEN, `insert into public.notification_prefs (user_id) values ('${ANA}')`)).rejects.toThrow()
    await expect(h.probe(ANA, `update public.notification_prefs set language = 'fr' where user_id = '${ANA}'`)).rejects.toThrow()
  })

  it('the service role reads every row', async () => {
    expect(Number(await h.svc(`select to_jsonb(count(*)) as r from public.notification_prefs`))).toBe(1)
  })
})

describe('rollback', () => {
  it('apply â†’ rollback â†’ re-apply: the tables and the function go and come back', async () => {
    const rolled = await freshDb()
    try {
      const exists = async (target: PGlite) =>
        (
          await target.query<{ t: number; f: number }>(
            `select (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('notifications', 'push_subscriptions', 'notification_prefs'))::int as t,
                    (select count(*) from pg_proc where proname = 'register_push_subscription')::int as f`,
          )
        ).rows[0]
      expect(await exists(rolled)).toEqual({ t: 3, f: 1 })
      await rolled.exec(readFileSync(ROLLBACK_SQL, 'utf8'))
      expect(await exists(rolled)).toEqual({ t: 0, f: 0 })
      await rolled.exec(readFileSync(join(MIGRATIONS, MIGRATION), 'utf8'))
      expect(await exists(rolled)).toEqual({ t: 3, f: 1 })
    } finally {
      await rolled.close()
    }
  }, 120_000)
})
