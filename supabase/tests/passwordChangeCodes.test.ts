// @vitest-environment node
// Password change verification (ADR-0066): the 'change_password' action-code purpose (table check and
// service_create_action_code), the account_password_reset audit event, unchanged grants, and the rollback.
// PGlite only; nothing touches a live project.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MIGRATIONS, freshDb, ids, makeHelpers, type Helpers } from './harness'

const MIGRATION = readdirSync(MIGRATIONS).find((n) => n.endsWith('_password_change_codes.sql'))!
const ROLLBACK_SQL = join(__dirname, '..', 'rollback', '20261111_password_change_codes_rollback.sql')

const id = ids(18)
const USER = id(61)
const OTHER = id(62)
/** sha256(salt || code) with the salt 'salt-<code>' (the format service_check_action_code checks). */
const HASH = (c: string) => `encode(sha256(convert_to('salt-${c}' || '${c}', 'UTF8')), 'hex')`

let db: PGlite
let h: Helpers

beforeAll(async () => {
  db = await freshDb()
  h = makeHelpers(db)
  await db.exec(`insert into auth.users (id, email, email_confirmed_at) values ('${USER}', 'pw-user@test', now()), ('${OTHER}', 'pw-other@test', now());`)
}, 120_000)

afterAll(async () => {
  await db.close()
})

const create = (purpose: string, code: string, user = USER) =>
  h.svc(`select public.service_create_action_code($1, $2, ${HASH(code)}, 'salt-' || $3) as r`, [user, purpose, code])
const check = (purpose: string, code: string, user = USER) => h.svc('select public.service_check_action_code($1, $2, $3) as r', [user, purpose, code])

describe('change_password action codes', () => {
  it('creates, checks once and refuses a reuse; the code of one purpose is not the other', async () => {
    expect(await create('change_password', '246810')).toMatchObject({ ok: true })
    expect(await check('disable_2fa', '246810')).toEqual({ error: 'invalid_code' })
    expect(await check('change_password', '246810')).toEqual({ ok: true })
    expect(await check('change_password', '246810')).toEqual({ error: 'invalid_code' })
  })

  it('a newer code replaces the older one; void makes it unusable; five wrong tries lock it', async () => {
    await create('change_password', '111111', OTHER)
    await create('change_password', '222222', OTHER)
    expect(await check('change_password', '111111', OTHER)).toEqual({ error: 'invalid_code' })
    expect(await h.svc('select public.service_void_action_codes($1, $2) as r', [OTHER, 'change_password'])).toEqual({ ok: true })
    expect(await check('change_password', '222222', OTHER)).toEqual({ error: 'invalid_code' })
    // The hourly limit (5 codes per user, all purposes) counts these too.
    await create('change_password', '333333', OTHER)
    for (let i = 0; i < 5; i++) await check('change_password', '000000', OTHER)
    expect(await check('change_password', '333333', OTHER)).toEqual({ error: 'too_many_attempts' })
    expect(await create('change_password', '444444', OTHER)).toMatchObject({ ok: true })
    expect(await create('change_password', '555555', OTHER)).toMatchObject({ ok: true })
    expect(await create('change_password', '666666', OTHER)).toEqual({ error: 'rate_limited' })
  })

  it('an unknown purpose is still refused by the function and by the table check', async () => {
    expect(await create('change_everything', '123123')).toEqual({ error: 'invalid_request' })
    await expect(db.query(`insert into private.action_codes (user_id, purpose, code_hash, salt) values ($1, 'change_everything', repeat('a', 64), 's')`, [USER])).rejects.toThrow(/action_codes_purpose_check/)
    await db.query(`insert into private.action_codes (user_id, purpose, code_hash, salt) values ($1, 'change_password', repeat('a', 64), 's')`, [USER])
  })

  it('only the service role can create or check codes (grants unchanged)', async () => {
    for (const role of ['anon', 'authenticated'] as const) {
      await expect(h.probe(USER, `select public.service_create_action_code($1, 'change_password', repeat('a', 64), 's')`, [USER], 'aal2', role)).rejects.toThrow(/permission denied/)
      await expect(h.probe(USER, `select public.service_log_account_event($1, 'account_password_reset', '{}', null)`, [USER], 'aal2', role)).rejects.toThrow(/permission denied/)
    }
  })
})

describe('account_password_reset event', () => {
  it('is written by service_log_account_event and shows in the person’s own security activity', async () => {
    expect(await h.svc(`select public.service_log_account_event($1, 'account_password_reset', '{}', '198.51.100.4') as r`, [USER])).toEqual({ ok: true })
    expect(await h.svc(`select public.service_log_account_event($1, 'account_password_hacked', '{}', null) as r`, [USER])).toEqual({ error: 'invalid_request' })
    const mine = await h.probe(USER, `select event_type, metadata ->> 'ip' as ip from public.list_my_security_events() where event_type = 'account_password_reset'`)
    expect(mine.rows).toEqual([{ event_type: 'account_password_reset', ip: '198.51.100.4' }])
    // The client may still not log it itself (only the two client events are allowed there).
    await expect(h.probe(USER, `select public.log_account_event('account_password_reset')`)).rejects.toThrow(/unknown_event/)
  })
})

describe('rollback', () => {
  it('apply → rollback → re-apply: both functions and the check equal their earlier definitions', async () => {
    const before = await freshDb((n) => n < MIGRATION)
    const rolled = await freshDb()
    try {
      const def = async (target: PGlite, fn: string) =>
        (await target.query<{ d: string }>(`select pg_get_functiondef('${fn}'::regprocedure) as d`)).rows[0]!.d.replace(/\r\n/g, '\n')
      const constraint = async (target: PGlite) =>
        (await target.query<{ c: string }>(`select pg_get_constraintdef(oid) as c from pg_constraint where conname = 'action_codes_purpose_check'`)).rows[0]!.c
      const grants = async (target: PGlite, fn: string) =>
        (await target.query<{ a: boolean; u: boolean; s: boolean }>(
          `select has_function_privilege('anon', '${fn}', 'execute') as a, has_function_privilege('authenticated', '${fn}', 'execute') as u,
                  has_function_privilege('service_role', '${fn}', 'execute') as s`,
        )).rows[0]
      const CREATE = 'public.service_create_action_code(uuid,text,text,text)'
      const LOG = 'public.service_log_account_event(uuid,text,jsonb,text,uuid)'

      expect(await constraint(rolled)).toContain('change_password')
      expect(await def(rolled, CREATE)).not.toEqual(await def(before, CREATE))
      expect(await def(rolled, LOG)).not.toEqual(await def(before, LOG))
      await rolled.exec(`insert into auth.users (id, email) values ('${USER}', 'x@test');
        insert into private.action_codes (user_id, purpose, code_hash, salt) values ('${USER}', 'change_password', repeat('a', 64), 's');`)

      await rolled.exec(readFileSync(ROLLBACK_SQL, 'utf8'))
      expect(await constraint(rolled)).toEqual(await constraint(before))
      expect(await def(rolled, CREATE)).toEqual(await def(before, CREATE))
      expect(await def(rolled, LOG)).toEqual(await def(before, LOG))
      for (const fn of [CREATE, LOG]) expect(await grants(rolled, fn)).toEqual(await grants(before, fn))
      expect(await grants(rolled, CREATE)).toEqual({ a: false, u: false, s: true })
      expect((await rolled.query(`select 1 from private.action_codes where purpose = 'change_password'`)).rows).toEqual([])

      await rolled.exec(readFileSync(join(MIGRATIONS, MIGRATION), 'utf8'))
      expect(await constraint(rolled)).toContain('change_password')
      expect(await def(rolled, CREATE)).not.toEqual(await def(before, CREATE))
    } finally {
      await before.close()
      await rolled.close()
    }
  }, 180_000)
})
