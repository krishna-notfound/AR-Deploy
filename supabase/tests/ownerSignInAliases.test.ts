// @vitest-environment node
// Owner sign-in aliases (ADR-0077): private.account_aliases (closed to every API role, unique, never an Auth email, at
// most 3 per Owner, Owner only), the service_alias_* functions, the add_alias action-code purpose, the three audit
// events and the rollback. PGlite only; nothing touches a live project.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MIGRATIONS, freshDb, ids, makeHelpers, type Helpers } from './harness'

const MIGRATION = readdirSync(MIGRATIONS).find((n) => n.endsWith('_owner_sign_in_aliases.sql'))!
const ROLLBACK_SQL = join(__dirname, '..', 'rollback', '20261114_owner_sign_in_aliases_rollback.sql')

const id = ids(17)
const OWNER = id(1)
const OWNER_2 = id(2)
const STAFF = id(3)
const SESSION_A = id(31)
const SESSION_B = id(32)
const HASH = (c: string) => `encode(sha256(convert_to('salt-${c}' || '${c}', 'UTF8')), 'hex')`

let db: PGlite
let h: Helpers

beforeAll(async () => {
  db = await freshDb()
  h = makeHelpers(db)
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values
      ('${OWNER}', 'dev@owner.test', now()), ('${OWNER_2}', 'second@owner.test', now()), ('${STAFF}', 'staff@owner.test', now());
    insert into public.platform_admins (user_id) values ('${OWNER}'), ('${OWNER_2}');
    insert into public.platform_members (user_id, email, role, status) values ('${STAFF}', 'staff@owner.test', 'admin', 'active');
    insert into auth.sessions (id, user_id) values ('${SESSION_A}', '${OWNER}'), ('${SESSION_B}', '${OWNER}');`)
}, 120_000)

afterAll(async () => {
  await db.close()
})

const begin = (email: string, user = OWNER) => h.svc('select public.service_alias_begin($1, $2) as r', [user, email])
const verify = (email: string, user = OWNER) => h.svc('select public.service_alias_verify($1, $2) as r', [user, email])
const remove = (email: string, user = OWNER) => h.svc('select public.service_alias_remove($1, $2) as r', [user, email])
const list = (user = OWNER) => h.svc('select public.service_alias_list($1) as r', [user])
const resolve = (email: string) => h.svc('select public.service_alias_resolve($1) as r', [email])
const addVerified = async (email: string, user = OWNER) => {
  expect(await begin(email, user)).toMatchObject({ ok: true })
  expect(await verify(email, user)).toMatchObject({ ok: true })
}

describe('adding an alias', () => {
  it('sorts after every earlier migration', () => {
    expect(MIGRATION > '20261114123842_qa_edge_hardening.sql').toBe(true)
  })

  it('is pending until verified: it does not sign in and is not listed', async () => {
    expect(await begin('  Client@Example.TEST ')).toEqual({ ok: true, email: 'client@example.test' })
    expect(await resolve('client@example.test')).toEqual({ error: 'not_found' })
    expect(await list()).toEqual({ ok: true, aliases: [] })
    expect(await verify('client@example.test')).toEqual({ ok: true, email: 'client@example.test' })
    expect(await resolve('CLIENT@example.test')).toEqual({ ok: true, user_id: OWNER })
    const l = (await list()) as { aliases: { email: string }[] }
    expect(l.aliases.map((a) => a.email)).toEqual(['client@example.test'])
  })

  it('keeps one pending address per Owner: a new address replaces the earlier one', async () => {
    await begin('first@example.test')
    await begin('second@example.test')
    expect(await verify('first@example.test')).toEqual({ error: 'not_found' })
    expect(await verify('second@example.test')).toMatchObject({ ok: true })
    await remove('second@example.test')
  })

  it('refuses a malformed address, a non-Owner and an address that is already in use', async () => {
    expect(await begin('not an email')).toEqual({ error: 'invalid_request' })
    expect(await begin('')).toEqual({ error: 'invalid_request' })
    expect(await begin('x@example.test', STAFF)).toEqual({ error: 'not_allowed' })
    expect(await list(STAFF)).toEqual({ error: 'not_allowed' })
    // Any user's Auth email, in any case.
    expect(await begin('STAFF@owner.test')).toEqual({ error: 'email_in_use' })
    expect(await begin('second@owner.test')).toEqual({ error: 'email_in_use' })
    // Another Owner's alias.
    expect(await begin('client@example.test', OWNER_2)).toEqual({ error: 'email_in_use' })
  })

  it('allows at most 3 verified aliases per Owner', async () => {
    await addVerified('two@example.test')
    await addVerified('three@example.test')
    expect(await begin('four@example.test')).toEqual({ error: 'alias_limit' })
    expect(await remove('three@example.test')).toEqual({ ok: true })
    await addVerified('four@example.test')
    expect(await begin('five@example.test')).toEqual({ error: 'alias_limit' })
    // Another Owner has their own 3.
    await addVerified('other@example.test', OWNER_2)
  })

  it('removes only a verified alias that belongs to the user', async () => {
    expect(await remove('other@example.test')).toEqual({ error: 'not_found' })
    expect(await remove('dev@owner.test')).toEqual({ error: 'not_found' })
    expect(await remove('nobody@example.test')).toEqual({ error: 'not_found' })
    expect(await resolve('other@example.test')).toMatchObject({ ok: true, user_id: OWNER_2 })
  })

  it('cancel drops the pending row only', async () => {
    await remove('four@example.test')
    await begin('pending@example.test')
    expect(await h.svc(`select public.service_alias_cancel($1, 'two@example.test') as r`, [OWNER])).toEqual({ ok: true })
    expect(await resolve('two@example.test')).toMatchObject({ ok: true })
    expect(await h.svc(`select public.service_alias_cancel($1, 'pending@example.test') as r`, [OWNER])).toEqual({ ok: true })
    expect(await verify('pending@example.test')).toEqual({ error: 'not_found' })
  })

  it('a pending address that was never verified expires after an hour', async () => {
    await begin('stale@example.test')
    await db.exec(`update private.account_aliases set created_at = now() - interval '2 hours' where email = 'stale@example.test'`)
    expect(await begin('stale@example.test', OWNER_2)).toMatchObject({ ok: true })
    await h.svc(`select public.service_alias_cancel($1, 'stale@example.test') as r`, [OWNER_2])
  })
})

describe('the table rules hold for a direct write too', () => {
  it('refuses an alias that equals an Auth email, a duplicate, a non-Owner, an upper-case address and a fourth verified alias', async () => {
    const insert = (user: string, email: string, verified = true) =>
      db.query(`insert into private.account_aliases (user_id, email, verified_at) values ($1, $2, ${verified ? 'now()' : 'null'})`, [user, email])
    await expect(insert(OWNER, 'staff@owner.test')).rejects.toThrow(/alias_email_in_use/)
    await expect(insert(OWNER, 'two@example.test')).rejects.toThrow(/duplicate key/)
    await expect(insert(STAFF, 'staff-alias@example.test')).rejects.toThrow(/alias_owner_only/)
    await expect(insert(OWNER, 'Upper@example.test')).rejects.toThrow(/account_aliases_email_check/)
    await insert(OWNER, 'ok3@example.test')
    await expect(insert(OWNER, 'ok4@example.test')).rejects.toThrow(/alias_limit/)
    // The same limit holds when an unverified row is verified by an update.
    await insert(OWNER, 'ok5@example.test', false)
    await expect(db.query(`update private.account_aliases set verified_at = now() where email = 'ok5@example.test'`)).rejects.toThrow(/alias_limit/)
    await db.exec(`delete from private.account_aliases where email in ('ok3@example.test', 'ok5@example.test')`)
  })

  it('is closed to every API role (RLS on, no grants, no policies)', async () => {
    const rls = await db.query<{ r: boolean; p: number }>(
      `select c.relrowsecurity as r, (select count(*)::int from pg_policy where polrelid = c.oid) as p
         from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'private' and c.relname = 'account_aliases'`,
    )
    expect(rls.rows[0]).toEqual({ r: true, p: 0 })
    for (const role of ['anon', 'authenticated', 'service_role'] as const)
      await expect(h.probe(OWNER, 'select * from private.account_aliases', [], 'aal2', role)).rejects.toThrow(/permission denied/)
  })

  it('goes with the user (on delete cascade)', async () => {
    await db.exec(`insert into auth.users (id, email) values ('${id(50)}', 'gone@owner.test'); insert into public.platform_admins (user_id) values ('${id(50)}');`)
    await addVerified('gone-alias@example.test', id(50))
    await db.exec(`delete from public.platform_admins where user_id = '${id(50)}'; delete from auth.users where id = '${id(50)}'`)
    expect(await resolve('gone-alias@example.test')).toEqual({ error: 'not_found' })
  })
})

describe('service_alias_swap (make primary)', () => {
  it('turns the old primary into an alias and drops the new primary from the aliases, keeping the count', async () => {
    const before = ((await list()) as { aliases: unknown[] }).aliases.length
    // The Edge Function has already changed the Auth email to the alias.
    await db.exec(`update auth.users set email = 'two@example.test' where id = '${OWNER}'`)
    expect(await h.svc(`select public.service_alias_swap($1, 'two@example.test', 'dev@owner.test') as r`, [OWNER])).toEqual({ ok: true })
    const after = (await list()) as { aliases: { email: string }[] }
    expect(after.aliases).toHaveLength(before)
    expect(after.aliases.map((a) => a.email)).toContain('dev@owner.test')
    expect(after.aliases.map((a) => a.email)).not.toContain('two@example.test')
    expect(await resolve('dev@owner.test')).toMatchObject({ ok: true, user_id: OWNER })
    expect(await resolve('two@example.test')).toEqual({ error: 'not_found' })
  })

  it('refuses an alias that does not exist, and the same address twice', async () => {
    expect(await h.svc(`select public.service_alias_swap($1, 'missing@example.test', 'dev@owner.test') as r`, [OWNER])).toEqual({ error: 'not_found' })
    expect(await h.svc(`select public.service_alias_swap($1, 'a@example.test', 'a@example.test') as r`, [OWNER])).toEqual({ error: 'invalid_request' })
  })
})

describe('service_end_other_sessions', () => {
  it('ends every session of the user except the one kept', async () => {
    await h.svc('select to_jsonb(public.service_end_other_sessions($1, $2)) as r', [OWNER, SESSION_A])
    const left = await db.query<{ id: string }>(`select id from auth.sessions where user_id = $1`, [OWNER])
    expect(left.rows.map((r) => r.id)).toEqual([SESSION_A])
    await h.svc('select to_jsonb(public.service_end_other_sessions($1, null)) as r', [OWNER])
    expect((await db.query(`select 1 from auth.sessions where user_id = $1`, [OWNER])).rows).toEqual([])
  })
})

describe('add_alias codes and the audit events', () => {
  const create = (purpose: string, code: string, user = OWNER) =>
    h.svc(`select public.service_create_action_code($1, $2, ${HASH(code)}, 'salt-' || $3) as r`, [user, purpose, code])
  const check = (purpose: string, code: string, user = OWNER) => h.svc('select public.service_check_action_code($1, $2, $3) as r', [user, purpose, code])

  it('creates and checks a code of the new purpose; another purpose cannot use it', async () => {
    expect(await create('add_alias', '135790')).toMatchObject({ ok: true })
    expect(await check('change_password', '135790')).toEqual({ error: 'invalid_code' })
    expect(await check('add_alias', '135790')).toEqual({ ok: true })
    expect(await check('add_alias', '135790')).toEqual({ error: 'invalid_code' })
    expect(await create('add_everything', '123123')).toEqual({ error: 'invalid_request' })
  })

  it('writes the three alias events (and still refuses an unknown one)', async () => {
    for (const event of ['account_alias_added', 'account_alias_removed', 'account_primary_email_changed'])
      expect(await h.svc(`select public.service_log_account_event($1, '${event}', '{"alias_sha256":"x"}', '198.51.100.4') as r`, [OWNER])).toEqual({ ok: true })
    expect(await h.svc(`select public.service_log_account_event($1, 'account_alias_stolen', '{}', null) as r`, [OWNER])).toEqual({ error: 'invalid_request' })
    const mine = await h.probe(OWNER, `select event_type from public.list_my_security_events() where event_type like 'account_alias%' or event_type = 'account_primary_email_changed' order by event_type`)
    expect(mine.rows.map((r) => (r as { event_type: string }).event_type)).toEqual(['account_alias_added', 'account_alias_removed', 'account_primary_email_changed'])
  })
})

describe('grants', () => {
  it('only the service role can call the new functions', async () => {
    const calls = [
      `select public.service_alias_list($1)`,
      `select public.service_alias_begin($1, 'x@example.test')`,
      `select public.service_alias_cancel($1, 'x@example.test')`,
      `select public.service_alias_verify($1, 'x@example.test')`,
      `select public.service_alias_remove($1, 'x@example.test')`,
      `select public.service_alias_resolve('x@example.test')`,
      `select public.service_alias_swap($1, 'a@example.test', 'b@example.test')`,
      `select public.service_end_other_sessions($1, null)`,
    ]
    for (const role of ['anon', 'authenticated'] as const)
      for (const sql of calls) await expect(h.probe(OWNER, sql, sql.includes('$1') ? [OWNER] : [], 'aal2', role)).rejects.toThrow(/permission denied/)
  })
})

describe('rollback', () => {
  it('apply → rollback → re-apply: the table and functions go and come back; the earlier definitions return', async () => {
    const before = await freshDb((n) => n < MIGRATION)
    const rolled = await freshDb()
    try {
      const def = async (target: PGlite, fn: string) => (await target.query<{ d: string }>(`select pg_get_functiondef('${fn}'::regprocedure) as d`)).rows[0]!.d.replace(/\r\n/g, '\n')
      const constraint = async (target: PGlite) => (await target.query<{ c: string }>(`select pg_get_constraintdef(oid) as c from pg_constraint where conname = 'action_codes_purpose_check'`)).rows[0]!.c
      const present = async (target: PGlite) =>
        (await target.query<{ t: number; f: number }>(
          `select (select count(*) from information_schema.tables where table_schema = 'private' and table_name = 'account_aliases')::int as t,
                  (select count(*) from pg_proc where proname like 'service\\_alias\\_%' or proname = 'service_end_other_sessions')::int as f`,
        )).rows[0]
      const CREATE = 'public.service_create_action_code(uuid,text,text,text)'
      const LOG = 'public.service_log_account_event(uuid,text,jsonb,text,uuid)'

      expect(await present(rolled)).toEqual({ t: 1, f: 8 })
      expect(await constraint(rolled)).toContain('add_alias')
      await rolled.exec(`insert into auth.users (id, email) values ('${OWNER}', 'x@test'); insert into public.platform_admins (user_id) values ('${OWNER}');
        insert into private.action_codes (user_id, purpose, code_hash, salt) values ('${OWNER}', 'add_alias', repeat('a', 64), 's');
        insert into private.account_aliases (user_id, email, verified_at) values ('${OWNER}', 'a@example.test', now());`)

      await rolled.exec(readFileSync(ROLLBACK_SQL, 'utf8'))
      expect(await present(rolled)).toEqual({ t: 0, f: 0 })
      expect(await constraint(rolled)).toEqual(await constraint(before))
      expect(await def(rolled, CREATE)).toEqual(await def(before, CREATE))
      expect(await def(rolled, LOG)).toEqual(await def(before, LOG))
      expect((await rolled.query(`select 1 from private.action_codes where purpose = 'add_alias'`)).rows).toEqual([])

      await rolled.exec(`delete from public.platform_admins; delete from auth.users;`)
      await rolled.exec(readFileSync(join(MIGRATIONS, MIGRATION), 'utf8'))
      expect(await present(rolled)).toEqual({ t: 1, f: 8 })
      expect(await constraint(rolled)).toContain('add_alias')
    } finally {
      await before.close()
      await rolled.close()
    }
  }, 180_000)
})
