// @vitest-environment node
// S1.5 business-logic fixes (docs/superpowers/specs/2026-10-26-business-logic-fixes-design.md): one describe per task,
// on the shared PGlite harness. Each task seeds its own users and businesses with ids(task), so describes are
// independent; a test that changes shared settings (role sets, the 2FA policy) restores them before it ends.
import { createHash } from 'node:crypto'
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

describe('S1.5 Task 9: team membership lifecycle', () => {
  GONE_AFTER_ROLLBACK.push('public.admin_remove_member(uuid)', 'private.sync_member_email()')
  const id = ids(9)
  const OWNER = id(1)
  const ADMIN = id(2)
  const DEACT = id(3)
  const REM_OWNER = id(4)
  const REM_INVITE = id(5)
  const SYNC = id(6)
  const CONFLICT = id(7)
  const TAKEN = id(8)
  const BROKEN = id(9)
  const OFF = id(11)
  const BIZ = id(10)
  const M_DEACT = id(20)
  const M_REM_OWNER = id(21)
  const M_REM_INVITE = id(22)
  const M_ADMIN = id(23)
  const M_OFF = id(24)

  type Answer = { ok?: boolean; user_id?: string; error?: string; memberId?: string }
  const remove = (caller: string, member: string, aal: 'aal1' | 'aal2' = 'aal1') =>
    h.call(caller, 'select public.admin_remove_member($1) as r', [member], aal) as Promise<Answer>
  const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')
  const memberEmail = async (memberId: string) =>
    (await db.query<{ email: string }>('select email from public.platform_members where id = $1', [memberId])).rows[0]?.email
  const memberOf = async (userId: string) => (await db.query<{ id: string }>('select id from public.platform_members where user_id = $1', [userId])).rows[0]!.id
  const emailEvents = async (memberId: string) =>
    (await db.query<{ actor_id: string | null; metadata: Record<string, unknown> }>(
      `select actor_id, metadata from public.audit_events where event_type = 'access_member_email_changed' and metadata->>'member_id' = $1 order by created_at`,
      [memberId])).rows

  beforeAll(async () => {
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at) values
        ('${OWNER}', 't9-owner@test', now()), ('${ADMIN}', 't9-admin@test', now()), ('${DEACT}', 't9-deact@test', now()),
        ('${REM_OWNER}', 't9-rem-owner@test', now()), ('${REM_INVITE}', 't9-rem-invite@x.pt', now()),
        ('${SYNC}', 't9-sync@test', now()), ('${CONFLICT}', 't9-conflict@test', now()), ('${TAKEN}', 't9-taken@test', now()),
        ('${BROKEN}', 't9-broken@test', now()), ('${OFF}', 't9-off@test', now());
      insert into public.platform_admins (user_id) values ('${OWNER}');
      insert into public.platform_members (id, user_id, email, role, status, deactivated_at) values
        ('${M_ADMIN}', '${ADMIN}', 't9-admin@test', 'admin', 'active', null),
        ('${M_DEACT}', '${DEACT}', 't9-deact@test', 'admin', 'deactivated', now()),
        ('${M_REM_OWNER}', '${REM_OWNER}', 't9-rem-owner@test', 'team', 'deactivated', now()),
        ('${M_REM_INVITE}', '${REM_INVITE}', 't9-rem-invite@x.pt', 'team', 'deactivated', now()),
        ('${M_OFF}', '${OFF}', 't9-off@test', 'team', 'deactivated', now());
      insert into public.platform_members (user_id, email, role, status) values
        ('${SYNC}', 't9-sync@test', 'team', 'active'), ('${CONFLICT}', 't9-conflict@test', 'team', 'active'),
        ('${TAKEN}', 't9-taken@test', 'team', 'active'), ('${BROKEN}', 't9-broken@test', 'team', 'active');
      insert into private.platform_invites (member_id, token_hash, status, expires_at) values
        ('${M_DEACT}', '${'9a'.repeat(32)}', 'revoked', now() + interval '7 days'),
        ('${M_DEACT}', '${'9b'.repeat(32)}', 'accepted', now() - interval '1 day');
      insert into public.businesses (id, name, slug, status) values ('${BIZ}', 'Task Nine Co', 't9-co', 'draft');
    `)
  })

  it('admin_remove_member: Owner only, refuses an active member (not_deactivated) and self, deletes the invites and the row, writes access_member_removed', async () => {
    expect(await remove(ADMIN, M_DEACT)).toEqual({ error: 'forbidden' })
    expect(await remove(OWNER, M_ADMIN)).toEqual({ error: 'not_deactivated' })
    expect(await remove(OWNER, id(99))).toEqual({ error: 'not_found' })
    // 2FA-gated through owner_or_deny: with the staff policy on, an aal1 Owner is refused.
    await h.withPolicy(true, false, async () => {
      expect(await remove(OWNER, M_DEACT, 'aal1')).toEqual({ error: 'forbidden' })
    })
    // Self: an Owner who also holds a (deactivated) member row can't remove it.
    const selfRow = id(30)
    await db.query(`insert into public.platform_members (id, user_id, email, role, status) values ($1, $2, 't9-owner@test', 'team', 'deactivated')`, [selfRow, OWNER])
    try {
      expect(await remove(OWNER, selfRow)).toEqual({ error: 'self' })
    } finally {
      await db.query('delete from public.platform_members where id = $1', [selfRow])
    }
    expect(await memberEmail(M_DEACT)).toBe('t9-deact@test')

    expect(await remove(OWNER, M_DEACT)).toEqual({ ok: true, user_id: DEACT })
    expect(await memberEmail(M_DEACT)).toBeUndefined()
    expect((await db.query('select 1 from private.platform_invites where member_id = $1', [M_DEACT])).rows).toHaveLength(0)
    const events = (await db.query<{ actor_id: string; metadata: Record<string, unknown> }>(
      `select actor_id, metadata from public.audit_events where event_type = 'access_member_removed' and metadata->>'member_id' = $1`, [M_DEACT])).rows
    expect(events).toEqual([{ actor_id: OWNER, metadata: { member_id: M_DEACT, email_sha256: sha('t9-deact@test'), role: 'admin' } }])
    // The refusal is audited as access_denied, not as a removal.
    expect((await db.query(`select 1 from public.audit_events where event_type = 'access_denied' and actor_id = $1 and metadata->>'action' = 'remove_member'`, [ADMIN])).rows).toHaveLength(1)
    // Only signed-in callers may execute it.
    const grants = (await db.query<{ anon: boolean; auth: boolean }>(
      `select has_function_privilege('anon', 'public.admin_remove_member(uuid)', 'execute') as anon,
              has_function_privilege('authenticated', 'public.admin_remove_member(uuid)', 'execute') as auth`)).rows[0]
    expect(grants).toEqual({ anon: false, auth: true })
  })

  it('after removal the email can be provisioned as an owner (service_link_owner) and invited again', async () => {
    expect(await remove(OWNER, M_REM_OWNER)).toEqual({ ok: true, user_id: REM_OWNER })
    expect(await h.svc(`select to_jsonb(public.service_link_owner($1, $2, $3)) as r`, [BIZ, REM_OWNER, OWNER])).toBe('linked')

    expect(await remove(OWNER, M_REM_INVITE)).toEqual({ ok: true, user_id: REM_INVITE })
    const invited = (await h.call(OWNER, `select public.admin_invite_member('t9-rem-invite@x.pt', 'admin') as r`)) as Answer
    expect(invited).toMatchObject({ ok: true })
    expect(invited.memberId).not.toBe(M_REM_INVITE)
    expect((await db.query<{ status: string; role: string }>('select status::text, role::text from public.platform_members where email = $1', ['t9-rem-invite@x.pt'])).rows)
      .toEqual([{ status: 'invited', role: 'admin' }])
  })

  it("updating auth.users.email to 'New@X.pt' sets platform_members.email 'new@x.pt' and audits from/to", async () => {
    const memberId = await memberOf(SYNC)
    await db.query(`update auth.users set email = 'New@X.pt' where id = $1`, [SYNC])
    expect(await memberEmail(memberId)).toBe('new@x.pt')
    expect(await emailEvents(memberId)).toEqual([{ actor_id: SYNC, metadata: { member_id: memberId, from: 't9-sync@test', to: 'new@x.pt' } }])
    // Another column changing, or the same address in another case, writes nothing.
    await db.query(`update auth.users set last_sign_in_at = now() where id = $1`, [SYNC])
    await db.query(`update auth.users set email = 'new@X.PT' where id = $1`, [SYNC])
    expect(await emailEvents(memberId)).toHaveLength(1)
  })

  it('an address already used by another member changes nothing and audits conflict:true', async () => {
    const memberId = await memberOf(CONFLICT)
    await db.query(`update auth.users set email = 'T9-Taken@test' where id = $1`, [CONFLICT])
    expect((await db.query<{ email: string }>('select email from auth.users where id = $1', [CONFLICT])).rows[0]!.email).toBe('T9-Taken@test')
    expect(await memberEmail(memberId)).toBe('t9-conflict@test')
    expect(await emailEvents(memberId)).toEqual([{ actor_id: CONFLICT, metadata: { member_id: memberId, from: 't9-conflict@test', to: 't9-taken@test', conflict: true } }])
  })

  it("an exception inside sync_member_email doesn't block the auth.users update", async () => {
    const memberId = await memberOf(BROKEN)
    await db.exec(`
      create function public.t9_explode() returns trigger language plpgsql as $$ begin raise exception 't9 boom'; end $$;
      create trigger t9_explode before update on public.platform_members for each row execute function public.t9_explode();
    `)
    try {
      await db.query(`update auth.users set email = 't9-renamed@test' where id = $1`, [BROKEN])
    } finally {
      await db.exec('drop trigger t9_explode on public.platform_members; drop function public.t9_explode();')
    }
    expect((await db.query<{ email: string }>('select email from auth.users where id = $1', [BROKEN])).rows[0]!.email).toBe('t9-renamed@test')
    expect(await memberEmail(memberId)).toBe('t9-broken@test')
    expect(await emailEvents(memberId)).toEqual([])
  })

  it('the backfill syncs drifted rows', async () => {
    const pre = await freshDb((n) => n < S15_MIGRATION)
    try {
      await pre.exec(`
        insert into auth.users (id, email) values ('${id(40)}', 'T9-Drift-New@test'), ('${id(41)}', 't9-same@test'),
          ('${id(42)}', 't9-wanted@test'), ('${id(43)}', 't9-holder@test');
        insert into public.platform_members (id, user_id, email, role, status) values
          ('${id(50)}', '${id(40)}', 't9-drift-old@test', 'team', 'active'),
          ('${id(51)}', '${id(41)}', 't9-same@test', 'team', 'active'),
          ('${id(52)}', '${id(42)}', 't9-before@test', 'team', 'active'),
          ('${id(53)}', null, 't9-wanted@test', 'team', 'invited');
      `)
      await pre.exec(readFileSync(join(MIGRATIONS, S15_MIGRATION), 'utf8'))
      const emails = (await pre.query<{ id: string; email: string }>('select id, email from public.platform_members order by id')).rows
      expect(emails).toEqual([
        { id: id(50), email: 't9-drift-new@test' },
        { id: id(51), email: 't9-same@test' },
        { id: id(52), email: 't9-before@test' }, // the address is another member's row: left alone
        { id: id(53), email: 't9-wanted@test' },
      ])
      const events = (await pre.query<{ metadata: Record<string, unknown> }>(
        `select metadata from public.audit_events where event_type = 'access_member_email_changed' order by metadata->>'member_id'`)).rows
      expect(events.map((e) => e.metadata)).toEqual([
        { member_id: id(50), from: 't9-drift-old@test', to: 't9-drift-new@test' },
        { member_id: id(52), from: 't9-before@test', to: 't9-wanted@test', conflict: true },
      ])
    } finally {
      await pre.close()
    }
  }, 60_000)

  it('my_platform_access for a deactivated member → role null, status deactivated; the Owner still gets 15', async () => {
    const access = (uid: string) => h.call(uid, 'select public.my_platform_access() as r') as Promise<Record<string, unknown> | null>
    expect(await access(OFF)).toEqual({ role: null, permissions: [], status: 'deactivated' })
    const owner = await access(OWNER)
    expect(owner?.role).toBe('owner')
    expect(owner?.permissions).toHaveLength(15)
    expect((await access(ADMIN))?.role).toBe('admin')
    expect(await access(id(98))).toBeNull() // no row at all
    await withRolePermissions({ admin: [], team: [] }, async () => {
      expect((await access(OWNER))?.permissions).toHaveLength(15)
      expect(await access(OFF)).toEqual({ role: null, permissions: [], status: 'deactivated' })
    })
  })
})
