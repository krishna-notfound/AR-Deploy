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

describe('S1.5 Task 2: staff 2FA gate, team email cannot own a business', () => {
  const id = ids(2)
  const RITA = id(1) // invited to the platform team (no login yet); her owner-invitation account has a mixed-case email
  const OLD = id(2) // a deactivated team member
  const SHOP = id(3) // an ordinary owner
  const ACTOR = id(4)
  const BIZ_A = id(10)
  const BIZ_B = id(11)
  const BIZ_C = id(12)
  const link = (biz: string, user: string) =>
    h.svc(`select to_jsonb(public.service_link_owner($1, $2, $3, null)) as r`, [biz, user, ACTOR])

  beforeAll(async () => {
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at) values
        ('${RITA}', 'Rita@X.pt', null), ('${OLD}', 't2-old@test', now()), ('${SHOP}', 't2-shop@test', null), ('${ACTOR}', 't2-actor@test', now());
      insert into public.platform_admins (user_id) values ('${ACTOR}');
      insert into public.platform_members (user_id, email, role, status) values
        (null, 'rita@x.pt', 'team', 'invited'), ('${OLD}', 't2-old@test', 'admin', 'deactivated');
      insert into public.businesses (id, name, slug, status) values
        ('${BIZ_A}', 'Task Two A', 't2-a', 'draft'), ('${BIZ_B}', 'Task Two B', 't2-b', 'draft'), ('${BIZ_C}', 'Task Two C', 't2-c', 'draft');
    `)
  })

  it("service_link_owner raises email_is_admin for a user whose email has a platform_members row (any status, case-insensitive: 'Rita@X.pt' vs 'rita@x.pt')", async () => {
    await expect(link(BIZ_A, RITA)).rejects.toMatchObject({ message: 'email_is_admin', code: '23514' })
    await expect(link(BIZ_B, OLD)).rejects.toMatchObject({ message: 'email_is_admin', code: '23514' })
    // Nothing was linked or audited.
    expect((await db.query(`select 1 from public.business_members where user_id = any($1)`, [[RITA, OLD]])).rows).toHaveLength(0)
    expect((await db.query(`select 1 from public.audit_events where event_type = 'owner_provisioned' and business_id = any($1)`, [[BIZ_A, BIZ_B]])).rows).toHaveLength(0)
    // An email with no team row links as before.
    expect(await link(BIZ_C, SHOP)).toBe('linked')
    expect(await link(BIZ_C, SHOP)).toBe('already_linked')
    // Removing the team row clears the way (R-W6-1).
    await db.query(`delete from public.platform_members where email = 'rita@x.pt'`)
    try {
      expect(await link(BIZ_A, RITA)).toBe('linked')
    } finally {
      await db.query(`insert into public.platform_members (user_id, email, role, status) values (null, 'rita@x.pt', 'team', 'invited')`)
    }
  })

  it('service_user_can is marked as not 2FA-aware; service_link_owner stays service-role only', async () => {
    const { rows } = await db.query<{ c: string | null }>(`select obj_description('public.service_user_can(uuid, text)'::regprocedure, 'pg_proc') as c`)
    expect(rows[0]!.c).toMatch(/not 2FA-aware; do not use for caller checks/)
    const grants = await db.query<{ a: boolean; u: boolean }>(
      `select has_function_privilege('anon', 'public.service_link_owner(uuid, uuid, uuid, uuid)', 'execute') as a,
              has_function_privilege('authenticated', 'public.service_link_owner(uuid, uuid, uuid, uuid)', 'execute') as u`)
    expect(grants.rows[0]).toEqual({ a: false, u: false })
  })

  it('rollback restores the earlier service_link_owner and removes the service_user_can comment', async () => {
    const defs = async (target: PGlite) => ({
      // The body keeps the source file's line endings (CRLF in a Windows checkout); compare the text only.
      linkOwner: (await target.query<{ d: string }>(
        `select pg_get_functiondef('public.service_link_owner(uuid, uuid, uuid, uuid)'::regprocedure) as d`)).rows[0]!.d.replace(/\r\n/g, '\n'),
      comment: (await target.query<{ c: string | null }>(
        `select obj_description('public.service_user_can(uuid, text)'::regprocedure, 'pg_proc') as c`)).rows[0]!.c,
    })
    const before = await freshDb((n) => n < S15_MIGRATION)
    const rolled = await freshDb()
    try {
      const pre = await defs(before)
      expect(pre.comment).toBeNull()
      expect((await defs(rolled)).linkOwner).not.toEqual(pre.linkOwner)
      await rolled.exec(readFileSync(ROLLBACK_SQL, 'utf8'))
      expect(await defs(rolled)).toEqual(pre)
    } finally {
      await before.close()
      await rolled.close()
    }
  }, 120_000)
})

describe('S1.5 Task 12: email status integrity', () => {
  const id = ids(12)
  GONE_AFTER_ROLLBACK.push(
    'public.service_apply_provider_status(text, text)',
    'public.service_record_email_event(text, text, text, text)',
    'private.apply_email_status(text, text, text)',
    'private.apply_pending_email_events()',
    'private.email_event_status(text)',
  )
  let n = 0
  const msg = () => `t12-msg-${++n}-aaaaaaaa`
  const svix = () => `t12-svix-${++n}`

  const logRow = async (pmid: string | null, over: { kind?: string; workflow?: string | null; status?: string; createdAt?: string } = {}) =>
    (await db.query<{ id: string }>(
      `insert into public.email_log (kind, recipient, subject, status, provider_message_id, workflow, created_at)
       values ($1, 'r@test', 'Subject', $2, $3, $4, coalesce($5::timestamptz, now())) returning id`,
      [over.kind ?? 'test', over.status ?? 'accepted', pmid, over.workflow ?? null, over.createdAt ?? null])).rows[0]!.id
  const statusOf = async (pmid: string) => (await db.query<{ status: string; error: string | null }>(`select status, error from public.email_log where provider_message_id = $1`, [pmid])).rows[0]!
  const record = async (pmid: string, type: string, sv = svix(), error: string | null = null) =>
    (await h.svc(`select to_jsonb(public.service_record_email_event($1, $2, $3, $4)) as r`, [sv, pmid, type, error])) as unknown as boolean
  const apply = async (pmid: string, status: string) =>
    (await h.svc(`select to_jsonb(public.service_apply_provider_status($1, $2)) as r`, [pmid, status])) as unknown as boolean

  it('delivered after bounced stays bounced', async () => {
    const m = msg()
    await logRow(m)
    expect(await record(m, 'email.bounced')).toBe(true)
    expect(await record(m, 'email.delivered')).toBe(true) // a new event id, stored, but it changes nothing
    expect((await statusOf(m)).status).toBe('bounced')
    expect(await record(m, 'email.delivery_delayed')).toBe(true)
    expect((await statusOf(m)).status).toBe('bounced')
  })

  it('email.suppressed is a bounce with error suppressed, whether the Edge Function maps it or not', async () => {
    const a = msg()
    const b = msg()
    await logRow(a)
    await logRow(b)
    await record(a, 'email.bounced', svix(), 'suppressed')
    await record(b, 'email.suppressed')
    expect(await statusOf(a)).toEqual({ status: 'bounced', error: 'suppressed' })
    expect(await statusOf(b)).toEqual({ status: 'bounced', error: 'suppressed' })
  })

  it("sent before the log row is stored applied=false and applied when the row's provider_message_id arrives", async () => {
    const early = msg()
    const late = msg()
    const events = (m: string) => db.query<{ applied: boolean }>(`select applied from private.email_provider_events where provider_message_id = $1`, [m])
    // Insert path: the event arrives first, then the log row is written with the message id.
    await record(early, 'email.sent')
    expect((await events(early)).rows).toEqual([{ applied: false }])
    await logRow(early)
    expect((await statusOf(early)).status).toBe('sent')
    expect((await events(early)).rows).toEqual([{ applied: true }])
    // Update path: the row exists without an id (send in flight), then the id is set.
    await record(late, 'email.delivered')
    const rowId = await logRow(null)
    await db.query(`update public.email_log set provider_message_id = $1 where id = $2`, [late, rowId])
    expect((await statusOf(late)).status).toBe('delivered')
    // Events that carry no status (opened, clicked) have nothing to apply.
    await record(msg(), 'email.opened')
    expect((await db.query(`select 1 from private.email_provider_events where event_type = 'email.opened' and not applied`)).rows).toHaveLength(0)
  })

  it('a duplicate and a late event are idempotent; a pending event is applied exactly once', async () => {
    const m = msg()
    const dup = svix()
    // Two pending events, delivered then bounced, arrive before the row.
    expect(await record(m, 'email.delivered', dup)).toBe(true)
    expect(await record(m, 'email.delivered', dup)).toBe(false) // the same svix id again
    expect(await record(m, 'email.bounced')).toBe(true)
    await logRow(m)
    expect((await statusOf(m)).status).toBe('bounced')

    // A duplicate or a late lower-ranked event changes nothing, not even updated_at.
    const stamp = async () => (await db.query<{ u: string }>(`select updated_at::text as u from public.email_log where provider_message_id = $1`, [m])).rows[0]!.u
    const before = await stamp()
    await record(m, 'email.bounced')
    await record(m, 'email.sent')
    expect(await stamp()).toBe(before)
    expect((await statusOf(m)).status).toBe('bounced')

    // Applied exactly once: reset the status by hand, touch provider_message_id again, nothing is re-applied.
    await db.query(`update public.email_log set status = 'accepted' where provider_message_id = $1`, [m])
    await db.query(`update public.email_log set provider_message_id = provider_message_id where provider_message_id = $1`, [m])
    expect((await statusOf(m)).status).toBe('accepted')
    expect((await db.query(`select 1 from private.email_provider_events where provider_message_id = $1 and not applied`, [m])).rows).toHaveLength(0)
  })

  it('a bounce webhook for team_invite:<member> sets the newest sent invite to email_failed', async () => {
    const MEMBER = id(1)
    const hash = (k: number) => String(k).repeat(64).slice(0, 64)
    await db.exec(`insert into public.platform_members (id, email, role, status) values ('${MEMBER}', 't12-invitee@test', 'team', 'invited')`)
    const invite = async (k: number, status: string, createdAt: string) =>
      (await db.query<{ id: string }>(
        `insert into private.platform_invites (member_id, token_hash, status, expires_at, created_at)
         values ($1, $2, $3::public.invite_status, now() + interval '7 days', $4::timestamptz) returning id`,
        [MEMBER, hash(k), status, createdAt])).rows[0]!.id
    const older = await invite(1, 'sent', new Date(Date.now() - 2 * 3600e3).toISOString())
    const newest = await invite(2, 'sent', new Date(Date.now() - 3600e3).toISOString())
    const after = await invite(3, 'sent', new Date(Date.now() + 3600e3).toISOString()) // created after the log row
    const m = msg()
    await logRow(m, { kind: 'team_invitation', workflow: `team_invite:${MEMBER}` })

    await record(m, 'email.delivered')
    const states = async () => (await db.query<{ id: string; status: string; r: string | null }>(`select id, status::text, last_email_result as r from private.platform_invites where member_id = $1`, [MEMBER])).rows
    expect((await states()).map((r) => r.status)).toEqual(['sent', 'sent', 'sent']) // delivered does not fail an invite

    await record(m, 'email.bounced')
    const by = Object.fromEntries((await states()).map((r) => [r.id, r]))
    expect(by[newest]).toMatchObject({ status: 'email_failed', r: 'bounced' })
    expect(by[older]!.status).toBe('sent')
    expect(by[after]!.status).toBe('sent')

    // Unrelated kinds never touch invites; a failed event on a later invitation email does the same again.
    const c = msg()
    await logRow(c, { kind: 'test', workflow: `team_invite:${MEMBER}` })
    await record(c, 'email.bounced')
    expect((await states()).find((r) => r.id === older)!.status).toBe('sent')
    const f = msg()
    await logRow(f, { kind: 'team_invitation', workflow: `team_invite:${MEMBER}` })
    await record(f, 'email.failed', svix(), 'provider down')
    const next = Object.fromEntries((await states()).map((r) => [r.id, r]))
    expect(next[older]).toMatchObject({ status: 'email_failed', r: 'failed: provider down' })
    expect(next[after]!.status).toBe('sent')
  })

  it('service_apply_provider_status follows the ranks and ignores opened/clicked/scheduled/unknown', async () => {
    const m = msg()
    await logRow(m)
    expect(await apply(m, 'sent')).toBe(true)
    expect(await apply(m, 'accepted')).toBe(false) // lower rank
    expect(await apply(m, 'sent')).toBe(false) // same status
    expect(await apply(m, 'delivered')).toBe(true)
    for (const s of ['opened', 'clicked', 'scheduled', 'queued', 'nonsense', '']) expect(await apply(m, s)).toBe(false)
    expect((await statusOf(m)).status).toBe('delivered')
    expect(await apply(m, 'bounced')).toBe(true)
    expect(await apply(m, 'delivered')).toBe(false)
    expect((await statusOf(m)).status).toBe('bounced')
    expect(await apply('t12-no-such-message', 'delivered')).toBe(false)
  })

  it('the new functions are service-role only', async () => {
    const { rows } = await db.query<{ fn: string; anon: boolean; authenticated: boolean; service: boolean }>(
      `select f as fn, has_function_privilege('anon', f::regprocedure, 'execute') as anon,
              has_function_privilege('authenticated', f::regprocedure, 'execute') as authenticated,
              has_function_privilege('service_role', f::regprocedure, 'execute') as service
         from unnest(array['public.service_apply_provider_status(text, text)', 'public.service_record_email_event(text, text, text, text)']) as f`)
    expect(rows).toHaveLength(2)
    expect(rows).toEqual(rows.map((r) => ({ fn: r.fn, anon: false, authenticated: false, service: true })))
  })
})
