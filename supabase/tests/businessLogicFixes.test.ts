// @vitest-environment node
// S1.5 business-logic fixes (docs/superpowers/specs/2026-10-26-business-logic-fixes-design.md): one describe per task,
// on the shared PGlite harness. Each task seeds its own users and businesses with ids(task), so describes are
// independent; a test that changes shared settings (role sets, the 2FA policy) restores them before it ends.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MIGRATIONS, ROLLBACK_SQL, S15_MIGRATION, freshDb, ids, makeHelpers, type Helpers } from './harness'

/**
 * Objects the S1.5 migration creates, which the rollback must drop: a table or view as `schema.name`, a function as
 * `schema.name(argtypes)`. Each task adds its own.
 */
const GONE_AFTER_ROLLBACK: string[] = [
  // Task 1
  'public.platform_can_read_profile(uuid)',
]

let db: PGlite
let h: Helpers

beforeAll(async () => {
  db = await freshDb()
  h = makeHelpers(db)
}, 60_000)
afterAll(async () => {
  await db?.close()
})

/** Replaces a role's permission set (as the database owner) for the duration of `fn`, then restores it. */
async function withRolePermissions(sets: Partial<Record<'admin' | 'team', string[]>>, fn: () => Promise<void>) {
  const saved = (await db.query<{ role: string; permission: string }>('select role::text, permission from public.platform_role_permissions')).rows
  try {
    for (const [role, perms] of Object.entries(sets)) {
      await db.query('delete from public.platform_role_permissions where role = $1::public.platform_role', [role])
      for (const p of perms) await db.query('insert into public.platform_role_permissions (role, permission) values ($1::public.platform_role, $2)', [role, p])
    }
    await fn()
  } finally {
    await db.query('delete from public.platform_role_permissions')
    for (const r of saved) await db.query('insert into public.platform_role_permissions (role, permission) values ($1::public.platform_role, $2)', [r.role, r.permission])
  }
}

describe('S1.5 Task 1: scaffold and privacy', () => {
  const id = ids(1)
  const OWNER = id(1)
  const ADMIN = id(2)
  const TEAM = id(3)
  const BIZ_OWNER = id(4)
  const STRANGER = id(5)
  const BIZ = id(10)

  beforeAll(async () => {
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at) values
        ('${OWNER}', 't1-owner@test', now()), ('${ADMIN}', 't1-admin@test', now()), ('${TEAM}', 't1-team@test', now()),
        ('${BIZ_OWNER}', 't1-bizowner@test', now()), ('${STRANGER}', 't1-stranger@test', now());
      insert into public.platform_admins (user_id) values ('${OWNER}');
      insert into public.platform_members (user_id, email, role, status) values
        ('${ADMIN}', 't1-admin@test', 'admin', 'active'), ('${TEAM}', 't1-team@test', 'team', 'active');
      insert into public.businesses (id, name, slug, status) values ('${BIZ}', 'Task One Co', 't1-co', 'active');
      insert into public.business_members (business_id, user_id) values ('${BIZ}', '${BIZ_OWNER}');
    `)
  })

  it('the S1.5 migration applies after every earlier migration', async () => {
    expect(S15_MIGRATION).toMatch(/^\d{14}_business_logic_fixes\.sql$/)
    expect(S15_MIGRATION > '20261025180600').toBe(true)
    // The shared database applied every migration (beforeAll); this one's objects are there.
    expect((await db.query(`select to_regprocedure('public.platform_can_read_profile(uuid)')::text as o`)).rows[0]).toEqual({ o: 'platform_can_read_profile(uuid)' })
  })

  it('neither anon nor authenticated can execute any public.service_* function', async () => {
    const { rows } = await db.query<{ fn: string; anon: boolean; authenticated: boolean }>(
      `select p.oid::regprocedure::text as fn, has_function_privilege('anon', p.oid, 'execute') as anon,
              has_function_privilege('authenticated', p.oid, 'execute') as authenticated
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname like 'service\\_%'`)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.filter((r) => r.anon).map((r) => r.fn)).toEqual([])
    expect(rows.filter((r) => r.authenticated).map((r) => r.fn)).toEqual([])
  })

  it('an Admin with records.view reads 0 account_% events of other users and still reads their own; the Owner reads all', async () => {
    await db.query(
      `insert into public.audit_events (event_type, actor_id, metadata) values
         ('account_signed_in', $1, '{"ip":"198.51.100.1"}'), ('account_signed_in', $2, '{"ip":"198.51.100.2"}'),
         ('account_signed_in', $3, '{"ip":"198.51.100.3"}'), ('account_2fa_enabled', $3, '{}')`,
      [OWNER, ADMIN, TEAM])
    await db.query(`insert into public.audit_events (event_type, actor_id, business_id) values ('business_updated', $1, $2)`, [OWNER, BIZ])
    const mine = [OWNER, ADMIN, TEAM]
    const accountRows = `select count(*)::int as n from public.audit_events where event_type like 'account\\_%' and actor_id = any($1)`
    expect(await h.flag(ADMIN, `public.platform_can('records.view')`)).toBe(true)
    expect(await h.count(ADMIN, accountRows, [[OWNER, TEAM]])).toBe(0)
    expect(await h.count(ADMIN, accountRows, [[ADMIN]])).toBe(1)
    // Other records are still readable with records.view.
    expect(await h.count(ADMIN, `select count(*)::int as n from public.audit_events where event_type = 'business_updated' and business_id = $1`, [BIZ])).toBe(1)
    expect(await h.count(TEAM, accountRows, [[OWNER, ADMIN]])).toBe(0)
    expect(await h.count(TEAM, accountRows, [[TEAM]])).toBe(2)
    expect(await h.count(OWNER, accountRows, [mine])).toBe(4)
  })

  it("profiles: a zero-permission Team member reads only their own; default Team (businesses.view) reads business owners' profiles but not staff; default Admin reads both; the Owner reads all", async () => {
    const reads = async (caller: string, target: string) =>
      (await h.count(caller, 'select count(*)::int as n from public.profiles where user_id = $1', [target])) === 1
    const all = [OWNER, ADMIN, TEAM, BIZ_OWNER, STRANGER]
    const readable = async (caller: string) => {
      const out: string[] = []
      for (const t of all) if (await reads(caller, t)) out.push(t)
      return out
    }

    expect(await readable(TEAM)).toEqual([TEAM, BIZ_OWNER])
    expect(await readable(ADMIN)).toEqual([OWNER, ADMIN, TEAM, BIZ_OWNER])
    expect(await readable(OWNER)).toEqual(all)
    expect(await readable(BIZ_OWNER)).toEqual([BIZ_OWNER])
    expect(await readable(STRANGER)).toEqual([STRANGER])
    await withRolePermissions({ team: [] }, async () => {
      expect(await readable(TEAM)).toEqual([TEAM])
    })
    // Staff profiles need access.view or records.view (§16: there is no members.view).
    await withRolePermissions({ team: ['records.view'] }, async () => {
      expect(await readable(TEAM)).toEqual([OWNER, ADMIN, TEAM])
    })
    await withRolePermissions({ team: ['access.view'] }, async () => {
      expect(await readable(TEAM)).toEqual([OWNER, ADMIN, TEAM])
    })
    // The staff 2FA policy still gates the staff reads: at aal1 only the own row is left.
    await h.withPolicy(true, false, async () => {
      expect(await h.count(ADMIN, 'select count(*)::int as n from public.profiles where user_id = any($1)', [all], 'aal1')).toBe(1)
      expect(await h.count(ADMIN, 'select count(*)::int as n from public.profiles where user_id = any($1)', [all], 'aal2')).toBe(4)
    })
  })

  it("after Admin and Team permission sets are both {}, the Owner's my_platform_access().permissions has length 15", async () => {
    const access = (uid: string) => h.call(uid, 'select public.my_platform_access() as r') as Promise<{ role: string; permissions: string[] } | null>
    await withRolePermissions({ admin: [], team: [] }, async () => {
      const owner = await access(OWNER)
      expect(owner?.role).toBe('owner')
      expect(owner?.permissions).toHaveLength(15)
      expect(new Set(owner?.permissions).size).toBe(15)
      expect(await access(ADMIN)).toEqual({ role: 'admin', permissions: [] })
    })
    // The same 15 keys the role-permission table allows.
    const allowed = (await db.query<{ d: string }>(
      `select pg_get_constraintdef(oid) as d from pg_constraint where conrelid = 'public.platform_role_permissions'::regclass and contype = 'c'`)).rows[0]!.d
    for (const p of (await access(OWNER))!.permissions) expect(allowed).toContain(`'${p}'`)
  })

  it("email_log accepts application_decision, business_notice and team_notice and still rejects 'nope'", async () => {
    const insert = (kind: string) =>
      db.query(`insert into public.email_log (kind, recipient, subject, status) values ($1, 't1@test', 'Subject', 'sent')`, [kind])
    for (const kind of ['application_decision', 'business_notice', 'team_notice', 'security_notice']) await insert(kind)
    await expect(insert('nope')).rejects.toThrow(/email_log_kind_check/)
  })
})

describe('S1.5 rollback', () => {
  /** The policies and function the S1.5 migration recreates, as definitions, to compare before and after. */
  async function definitions(target: PGlite) {
    const policies = (await target.query<{ tablename: string; policyname: string; qual: string }>(
      `select tablename, policyname, qual from pg_policies
        where (tablename, policyname) in (('audit_events', 'Platform members read audit events'), ('profiles', 'Platform members read profiles'))
        order by 1, 2`)).rows
    // The body keeps the source file's line endings (CRLF in a Windows checkout); compare the text only.
    const fn = (await target.query<{ d: string }>(`select pg_get_functiondef('public.my_platform_access'::regproc) as d`)).rows[0]!.d.replace(/\r\n/g, '\n')
    const kinds = (await target.query<{ d: string }>(
      `select pg_get_constraintdef(oid) as d from pg_constraint where conname = 'email_log_kind_check'`)).rows[0]!.d
    return { policies, fn, kinds }
  }

  it('apply → rollback → re-apply succeeds; every GONE_AFTER_ROLLBACK name is null after rollback; the audit and profiles policies are back to their pre-S1.5 definitions', async () => {
    const before = await freshDb((n) => n < S15_MIGRATION)
    const rolled = await freshDb()
    try {
      const pre = await definitions(before)
      expect(pre.policies).toHaveLength(2)
      expect((await definitions(rolled)).policies).not.toEqual(pre.policies)

      // Rows written under S1.5 survive the rollback.
      await rolled.query(`insert into public.email_log (kind, recipient, subject, status) values ('team_notice', 'r@test', 'Subject', 'sent')`)
      await rolled.exec(readFileSync(ROLLBACK_SQL, 'utf8'))
      expect((await rolled.query(`select 1 from public.email_log where kind = 'team_notice'`)).rows).toHaveLength(1)

      for (const name of GONE_AFTER_ROLLBACK) {
        const fn = name.includes('(')
        const { rows } = await rolled.query<{ o: string | null }>(`select ${fn ? 'to_regprocedure' : 'to_regclass'}($1)::text as o`, [name])
        expect({ name, o: rows[0]!.o }).toEqual({ name, o: null })
      }

      const post = await definitions(rolled)
      expect(post.policies).toEqual(pre.policies)
      expect(post.fn).toEqual(pre.fn)
      // Re-added NOT VALID so rows of the S1.5 kinds are kept; new rows get the earlier check.
      expect(post.kinds).toBe(`${pre.kinds} NOT VALID`)
      await expect(rolled.query(`insert into public.email_log (kind, recipient, subject, status) values ('team_notice', 'r@test', 'S', 'sent')`)).rejects.toThrow(/email_log_kind_check/)

      // Re-apply: the migration runs cleanly on the rolled-back database.
      await rolled.exec(readFileSync(join(MIGRATIONS, S15_MIGRATION), 'utf8'))
      const again = await definitions(rolled)
      const applied = await freshDb()
      try {
        expect(again).toEqual(await definitions(applied))
      } finally {
        await applied.close()
      }
    } finally {
      await before.close()
      await rolled.close()
    }
  }, 120_000)
})

describe('S1.5 Task 3: closure integrity', () => {
  GONE_AFTER_ROLLBACK.push('private.void_closure_on_owner_removed()', 'private.guard_activate_during_closure()')

  const id = ids(3)
  const OWNER = id(1)
  const ADMIN = id(2)
  const A = id(3)
  const B = id(4)
  const C = id(5)
  const D = id(6)
  const E = id(7)
  const BIZ_A = id(10)
  const BIZ_C = id(11)
  const BIZ_D = id(12)
  const BIZ_E = id(13)

  beforeAll(async () => {
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at) values
        ('${OWNER}', 't3-owner@test', now()), ('${ADMIN}', 't3-admin@test', now()), ('${A}', 't3-a@test', now()),
        ('${B}', 't3-b@test', now()), ('${C}', 't3-c@test', now()), ('${D}', 't3-d@test', now()), ('${E}', 't3-e@test', now());
      insert into public.platform_admins (user_id) values ('${OWNER}');
      insert into public.platform_members (user_id, email, role, status) values ('${ADMIN}', 't3-admin@test', 'admin', 'active');
      insert into public.businesses (id, name, slug, status) values
        ('${BIZ_A}', 'Task Three A', 't3-a', 'active'), ('${BIZ_C}', 'Task Three C', 't3-c', 'active'),
        ('${BIZ_D}', 'Task Three D', 't3-d', 'active'), ('${BIZ_E}', 'Task Three E', 't3-e', 'inactive');
      insert into public.business_members (business_id, user_id) values ('${BIZ_A}', '${A}'), ('${BIZ_C}', '${C}'), ('${BIZ_D}', '${D}');
    `)
  })

  const status = async (biz: string) => (await db.query<{ status: string }>('select status from public.businesses where id = $1', [biz])).rows[0]?.status
  const request = async (user: string) =>
    (await db.query<{ business_id: string | null; previous_business_status: string | null }>(
      'select business_id, previous_business_status from public.account_closure_requests where user_id = $1', [user])).rows[0]
  const voided = async (subject: string) =>
    (await db.query<{ actor_id: string | null; business_id: string | null; metadata: Record<string, unknown> }>(
      `select actor_id, business_id, metadata from public.audit_events where event_type = 'account_closure_voided' and metadata->>'subject_id' = $1`, [subject])).rows
  const requestClosure = (user: string) => h.svc('select public.service_request_closure($1) as r', [user])
  const cancelAs = (user: string) => h.call(user, 'select public.cancel_account_closure() as r')
  /** A status change through the Data API as `uid` (committed when it succeeds). */
  const setStatus = (uid: string, biz: string, to: string) =>
    h.as(uid, (tx) => tx.query('update public.businesses set status = $2 where id = $1', [biz, to]))

  it("owner A requests closure, A's membership is deleted: the request row is gone, account_closure_voided exists with business_id, the business stays inactive", async () => {
    expect(await requestClosure(A)).toEqual({ ok: true, kind: 'business', business_id: BIZ_A })
    expect(await status(BIZ_A)).toBe('inactive')

    const removed = await h.as(OWNER, (tx) => tx.query('delete from public.business_members where business_id = $1 and user_id = $2', [BIZ_A, A]))
    expect(removed.affectedRows).toBe(1)

    expect(await request(A)).toBeUndefined()
    expect(await voided(A)).toEqual([{ actor_id: OWNER, business_id: BIZ_A, metadata: { subject_id: A, business_id: BIZ_A, reason: 'owner_removed' } }])
    expect(await status(BIZ_A)).toBe('inactive')
  })

  it('after removal: service_closure_target(A) → not_found; cancel_account_closure() as A → not_found and the status is unchanged; after owner B is linked nothing A does changes the status', async () => {
    expect(await h.svc('select public.service_closure_target($1) as r', [A])).toEqual({ error: 'not_found' })
    expect(await cancelAs(A)).toEqual({ error: 'not_found' })
    expect(await status(BIZ_A)).toBe('inactive')

    await db.query('insert into public.business_members (business_id, user_id) values ($1, $2)', [BIZ_A, B])
    expect(await cancelAs(A)).toEqual({ error: 'not_found' })
    expect(await h.affected(A, `update public.businesses set status = 'active' where id = $1`, [BIZ_A])).toBe(0)
    expect(await requestClosure(A)).toEqual({ error: 'not_allowed' })
    expect(await h.svc('select public.service_restore_closure($1, $2) as r', [A, OWNER])).toEqual({ error: 'not_found' })
    expect(await status(BIZ_A)).toBe('inactive')
  })

  it('a request whose requester is no longer a member of its business: service_closure_target → not_found; undo deletes it and logs without touching the status', async () => {
    // A stale row (as one left from before S1.5 could be): E never owned BIZ_E.
    await db.query(`insert into public.account_closure_requests (user_id, business_id, previous_business_status) values ($1, $2, 'active')`, [E, BIZ_E])
    expect(await h.svc('select public.service_closure_target($1) as r', [E])).toEqual({ error: 'not_found' })
    expect(await h.svc('select public.service_restore_closure($1, $2) as r', [E, OWNER])).toEqual({ ok: true })
    expect(await request(E)).toBeUndefined()
    expect(await status(BIZ_E)).toBe('inactive')
    const ev = (await db.query<{ business_id: string; from_status: string; to_status: string }>(
      `select business_id, from_status, to_status from public.audit_events where event_type = 'account_closure_restored' and metadata->>'subject_id' = $1`, [E])).rows
    expect(ev).toEqual([{ business_id: BIZ_E, from_status: 'inactive', to_status: 'inactive' }])
  })

  it('deleting a business whose owner has an open closure request succeeds and writes no account_closure_voided', async () => {
    expect(await requestClosure(D)).toEqual({ ok: true, kind: 'business', business_id: BIZ_D })
    const deleted = await h.as(OWNER, (tx) => tx.query('delete from public.businesses where id = $1', [BIZ_D]))
    expect(deleted.affectedRows).toBe(1)
    expect(await status(BIZ_D)).toBeUndefined()
    expect(await voided(D)).toEqual([])
    // The request stays (business_id null), so a complete_closure retry still finds it.
    expect(await request(D)).toEqual({ business_id: null, previous_business_status: 'active' })
    expect(await h.svc('select public.service_closure_target($1) as r', [D])).toEqual({ ok: true, business_id: null, email: 't3-d@test' })
  })

  it("an Admin and the Owner PATCHing status 'active' while a request is open both get closure_pending; setting draft or inactive is allowed and closure_follow_status records it; cancel_account_closure and service_restore_closure still bring it back", async () => {
    expect(await requestClosure(C)).toEqual({ ok: true, kind: 'business', business_id: BIZ_C })
    for (const who of [ADMIN, OWNER]) {
      const err = await setStatus(who, BIZ_C, 'active').then(() => null, (e: { code?: string; message?: string }) => e)
      expect({ who, code: err?.code, message: err?.message }).toEqual({ who, code: 'P0001', message: 'closure_pending' })
    }
    expect(await status(BIZ_C)).toBe('inactive')

    // The requester cancels: back to active.
    expect(await cancelAs(C)).toEqual({ ok: true })
    expect(await status(BIZ_C)).toBe('active')

    // The Owner restores: back to active.
    expect(await requestClosure(C)).toMatchObject({ ok: true })
    expect(await h.svc('select public.service_restore_closure($1, $2) as r', [C, OWNER])).toEqual({ ok: true })
    expect(await status(BIZ_C)).toBe('active')

    // Draft and inactive stay allowed during a closure, and become the status that cancel or restore brings back.
    expect(await requestClosure(C)).toMatchObject({ ok: true })
    await setStatus(ADMIN, BIZ_C, 'draft')
    expect(await request(C)).toMatchObject({ previous_business_status: 'draft' })
    await setStatus(ADMIN, BIZ_C, 'inactive')
    expect(await request(C)).toMatchObject({ previous_business_status: 'inactive' })
    await expect(setStatus(ADMIN, BIZ_C, 'active')).rejects.toThrow(/closure_pending/)
    expect(await h.svc('select public.service_restore_closure($1, $2) as r', [C, OWNER])).toEqual({ ok: true })
    expect(await status(BIZ_C)).toBe('inactive')

    // With no request open, activating works as before.
    await setStatus(ADMIN, BIZ_C, 'active')
    expect(await status(BIZ_C)).toBe('active')
  })

  it('rollback restores the S1 bodies of service_closure_target and undo_closure and drops both triggers', async () => {
    const defs = async (target: PGlite) => {
      const fns = (await target.query<{ d: string }>(
        `select pg_get_functiondef(p) as d from unnest(array['public.service_closure_target(uuid)'::regprocedure,
           'private.undo_closure(uuid, uuid, text)'::regprocedure]) p`)).rows.map((r) => r.d.replace(/\r\n/g, '\n'))
      const triggers = (await target.query<{ tgname: string }>(
        `select tgname from pg_trigger where tgname in ('business_members_void_closure', 'businesses_guard_activate_during_closure') order by 1`)).rows.map((r) => r.tgname)
      return { fns, triggers }
    }
    const before = await freshDb((n) => n < S15_MIGRATION)
    const rolled = await freshDb()
    try {
      expect((await defs(rolled)).triggers).toEqual(['business_members_void_closure', 'businesses_guard_activate_during_closure'])
      await rolled.exec(readFileSync(ROLLBACK_SQL, 'utf8'))
      const after = await defs(rolled)
      expect(after).toEqual(await defs(before))
      expect(after.triggers).toEqual([])
    } finally {
      await before.close()
      await rolled.close()
    }
  }, 120_000)
})
