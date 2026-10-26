// @vitest-environment node
// S1.5 business-logic fixes (docs/superpowers/specs/2026-10-26-business-logic-fixes-design.md): one describe per task,
// on the shared PGlite harness. Each task seeds its own users and businesses with ids(task), so describes are
// independent; a test that changes shared settings (role sets, the 2FA policy) restores them before it ends.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MIGRATIONS, ROLLBACK_SQL, S15_MIGRATION, freshDb, ids, makeHelpers, type Helpers } from './harness'
import { createHash } from 'node:crypto'

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

describe('S1.5 Task 5: permission prerequisites and storage deletes (R-W3-3)', () => {
  GONE_AFTER_ROLLBACK.push('private.permission_prerequisites()', 'private.with_prerequisites(text[])')
  // The TS map the SQL mirrors (imported here so this task's code stays inside its describe).
  let P: typeof import('@/domain/permissions')

  const id = ids(5)
  const OWNER = id(1)
  const TEAM = id(2)
  const BIZ = id(10)

  beforeAll(async () => {
    P = await import('@/domain/permissions')
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at) values ('${OWNER}', 't5-owner@test', now()), ('${TEAM}', 't5-team@test', now());
      insert into public.platform_admins (user_id) values ('${OWNER}');
      insert into public.platform_members (user_id, email, role, status) values ('${TEAM}', 't5-team@test', 'team', 'active');
      insert into public.businesses (id, name, slug, status) values ('${BIZ}', 'Task Five Co', 't5-co', 'active');
    `)
  })

  const save = (perms: string[]) => h.call(OWNER, `select public.admin_set_role_permissions('team', $1::text[]) as r`, [perms])
  const stored = async (role: 'admin' | 'team', target: PGlite = db) =>
    (await target.query<{ p: string }>('select permission as p from public.platform_role_permissions where role = $1::public.platform_role order by 1', [role])).rows.map((r) => r.p)
  const lastAudit = async () =>
    (await db.query<{ metadata: Record<string, unknown> }>(
      `select metadata from public.audit_events where event_type = 'access_permissions_changed' and actor_id = $1 order by created_at desc limit 1`, [OWNER])).rows[0]?.metadata

  /** The read-only pre-flight query, as written in the migration's Task 5 comment (lines between the markers, `-- ` stripped). */
  function preflightSql(): string {
    const src = readFileSync(join(MIGRATIONS, S15_MIGRATION), 'utf8').split(/\r?\n/)
    const from = src.findIndex((l) => l.includes('PRE-FLIGHT (R-W3-3) BEGIN'))
    const to = src.findIndex((l) => l.includes('PRE-FLIGHT (R-W3-3) END'))
    expect(from).toBeGreaterThan(-1)
    expect(to).toBeGreaterThan(from)
    return src.slice(from + 1, to).map((l) => l.replace(/^-- ?/, '')).join('\n')
  }

  it('saving Team = {products.publish} stores the three and returns added [products.view, products.edit]; the audit row lists them', async () => {
    await withRolePermissions({ team: [] }, async () => {
      expect(await save(['products.publish'])).toEqual({ ok: true, added: ['products.view', 'products.edit'] })
      expect(await stored('team')).toEqual(['products.edit', 'products.publish', 'products.view'])
      expect(await lastAudit()).toEqual({ role: 'team', added: ['products.edit', 'products.publish', 'products.view'], removed: [] })
      // Saving the closed set again changes nothing and adds nothing.
      expect(await save(['products.view', 'products.edit', 'products.publish'])).toEqual({ ok: true, added: [] })
      // Unknown keys and non-Owners are still refused.
      expect(await save(['products.view', 'x'])).toEqual({ error: 'unknown_permission' })
      expect(await h.call(TEAM, `select public.admin_set_role_permissions('team', array['products.view']) as r`)).toEqual({ error: 'forbidden' })
    })
  })

  it('the backfill normalises a pre-seeded {products.publish} set and audits reason prerequisites', async () => {
    const pre = await freshDb((n) => n < S15_MIGRATION)
    try {
      await pre.query(`delete from public.platform_role_permissions where role = 'team'`)
      await pre.query(`insert into public.platform_role_permissions (role, permission) values ('team', 'products.publish')`)
      const admin = await stored('admin', pre)
      // The pre-flight shows what the backfill will add, before the migration exists on the database.
      expect((await pre.query(preflightSql())).rows).toEqual([{ role: 'team', will_add: ['products.edit', 'products.view'] }])

      await pre.exec(readFileSync(join(MIGRATIONS, S15_MIGRATION), 'utf8'))
      expect(await stored('team', pre)).toEqual(['products.edit', 'products.publish', 'products.view'])
      expect(await stored('admin', pre)).toEqual(admin)
      const rows = (await pre.query<{ actor_id: string | null; metadata: Record<string, unknown> }>(
        `select actor_id, metadata from public.audit_events where event_type = 'access_permissions_changed'`)).rows
      // One row per changed role (Admin already had every prerequisite), by the system.
      expect(rows).toEqual([{ actor_id: null, metadata: { role: 'team', added: ['products.edit', 'products.view'], removed: [], reason: 'prerequisites' } }])
      expect((await pre.query(preflightSql())).rows).toEqual([])
    } finally {
      await pre.close()
    }
  }, 60_000)

  it('SQL closure equals withPrerequisites for every single permission', async () => {
    const edges = (await db.query<{ permission: string; requires: string }>('select permission, requires from private.permission_prerequisites() order by 1, 2')).rows
    const tsEdges = Object.entries(P.PERMISSION_PREREQUISITES).flatMap(([permission, reqs]) => reqs.map((requires) => ({ permission, requires })))
    expect(edges).toEqual([...tsEdges].sort((a, b) => (a.permission < b.permission ? -1 : a.permission > b.permission ? 1 : a.requires < b.requires ? -1 : 1)))
    await withRolePermissions({ team: [] }, async () => {
      for (const p of P.ALL_PERMISSIONS) {
        const closed = P.withPrerequisites([p])
        const sql = (await db.query<{ r: string[] }>('select private.with_prerequisites(array[$1]) as r', [p])).rows[0]!.r
        expect({ p, sql: [...sql].sort() }).toEqual({ p, sql: [...closed].sort() })
        // The RPC answers the prerequisites it added, in the order of ALL_PERMISSIONS.
        expect({ p, r: await save([p]) }).toEqual({ p, r: { ok: true, added: closed.filter((x) => x !== p) } })
        expect({ p, stored: await stored('team') }).toEqual({ p, stored: [...closed].sort() })
      }
    })
  })

  it("a member whose role is {businesses.view, businesses.delete} saved through the RPC can delete storage objects in business-logos and product-media of that business; with only businesses.view they can't", async () => {
    await db.exec(`
      insert into storage.objects (bucket_id, name) values
        ('business-logos', '${BIZ}/logo.png'), ('product-media', '${BIZ}/${id(20)}/photo.jpg'), ('product-media', '${BIZ}/${id(20)}/model.glb');
    `)
    const delLogos = `delete from storage.objects where bucket_id = 'business-logos' and name like $1`
    const delMedia = `delete from storage.objects where bucket_id = 'product-media' and name like $1`
    const delBiz = `delete from public.businesses where id = $1`
    const prefix = [`${BIZ}/%`]
    try {
      await withRolePermissions({}, async () => {
        expect(await save(['businesses.view', 'businesses.delete'])).toMatchObject({ ok: true })
        expect(await h.affected(TEAM, delLogos, prefix)).toBe(1)
        expect(await h.affected(TEAM, delMedia, prefix)).toBe(2)
        expect(await h.affected(TEAM, delBiz, [BIZ])).toBe(1)

        expect(await save(['businesses.view'])).toEqual({ ok: true, added: [] })
        expect(await h.affected(TEAM, delLogos, prefix)).toBe(0)
        expect(await h.affected(TEAM, delMedia, prefix)).toBe(0)
        expect(await h.affected(TEAM, delBiz, [BIZ])).toBe(0)
      })
      // Sets written straight to the table (not closed; deleting needs the read policies too, so the views stay):
      // businesses.delete without any edit deletes logos and media, products.delete without products.edit media only.
      await withRolePermissions({ team: ['businesses.view', 'products.view', 'businesses.delete'] }, async () => {
        expect(await h.affected(TEAM, delLogos, prefix)).toBe(1)
        expect(await h.affected(TEAM, delMedia, prefix)).toBe(2)
      })
      await withRolePermissions({ team: ['businesses.view', 'products.view', 'products.delete'] }, async () => {
        expect(await h.affected(TEAM, delLogos, prefix)).toBe(0)
        expect(await h.affected(TEAM, delMedia, prefix)).toBe(2)
      })
    } finally {
      await db.query(`delete from storage.objects where name like $1`, prefix)
    }
  })

  it('the rollback restores admin_set_role_permissions and the two storage delete policies, and keeps the role sets', async () => {
    const definitions = async (target: PGlite) => ({
      fn: (await target.query<{ d: string }>(`select pg_get_functiondef('public.admin_set_role_permissions(public.platform_role, text[])'::regprocedure) as d`)).rows[0]!.d.replace(/\r\n/g, '\n'),
      policies: (await target.query(`select policyname, qual from pg_policies where tablename = 'objects'
        and policyname in ('Platform members delete media', 'Platform members delete logos') order by 1`)).rows,
    })
    const before = await freshDb((n) => n < S15_MIGRATION)
    const rolled = await freshDb()
    try {
      const pre = await definitions(before)
      expect(pre.policies).toHaveLength(2)
      expect(await definitions(rolled)).not.toEqual(pre)
      await rolled.query(`insert into public.platform_role_permissions (role, permission) values ('team', 'businesses.status'), ('team', 'businesses.edit')`)
      const sets = await stored('team', rolled)
      await rolled.exec(readFileSync(ROLLBACK_SQL, 'utf8'))
      expect(await definitions(rolled)).toEqual(pre)
      expect(await stored('team', rolled)).toEqual(sets)
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

describe('S1.5 Task 18: application submission', () => {
  GONE_AFTER_ROLLBACK.push('private.application_attempts', 'public.service_application_attempt(text[],integer)')
  const id = ids(18)
  const VISITOR = id(1)
  const attempt = async (hashes: string[]) => (await h.svc('select to_jsonb(public.service_application_attempt($1::text[])) as r', [hashes])) as unknown as boolean
  const stored = async (hash: string) =>
    (await db.query<{ n: number }>('select count(*)::int as n from private.application_attempts where submitter_hash = $1', [hash])).rows[0]!.n
  const seed = (hash: string, n: number, age = '0 minutes') =>
    db.query(`insert into private.application_attempts (submitter_hash, created_at) select $1, now() - $2::interval from generate_series(1, $3)`, [hash, age, n])

  it('five calls are allowed, the sixth in the hour returns false and records nothing', async () => {
    const results: boolean[] = []
    for (let i = 0; i < 6; i++) results.push(await attempt(['t18-five']))
    expect(results).toEqual([true, true, true, true, true, false])
    expect(await stored('t18-five')).toBe(5)
  })

  it('attempts under either of two hashes count together', async () => {
    await seed('t18-today', 3)
    await seed('t18-yesterday', 2, '30 minutes')
    expect(await attempt(['t18-today', 't18-yesterday'])).toBe(false)
    expect(await stored('t18-today')).toBe(3)
    // Only today's hash: three attempts, so this one is allowed and recorded under today's hash.
    expect(await attempt(['t18-today'])).toBe(true)
    expect(await stored('t18-today')).toBe(4)
    expect(await stored('t18-yesterday')).toBe(2)
  })

  it('attempts older than 2 hours are deleted by the next call', async () => {
    await seed('t18-old', 5, '3 hours')
    await seed('t18-90min', 5, '90 minutes')
    // Neither counts towards the hour; the call is recorded under its first hash.
    expect(await attempt(['t18-new', 't18-old', 't18-90min'])).toBe(true)
    expect(await stored('t18-new')).toBe(1)
    expect(await stored('t18-old')).toBe(0)
    expect(await stored('t18-90min')).toBe(5)
  })

  it('two connections at count 4: exactly one is allowed', async () => {
    await seed('t18-race', 4)
    // PGlite has one connection and runs the two transactions one after the other; on Postgres the advisory lock
    // (asserted below) is what serializes them.
    const results = await Promise.all([attempt(['t18-race']), attempt(['t18-race'])])
    expect(results.filter(Boolean)).toHaveLength(1)
    expect(await stored('t18-race')).toBe(5)
    const def = (await db.query<{ d: string }>(`select pg_get_functiondef('public.service_application_attempt(text[],integer)'::regprocedure) as d`)).rows[0]!.d
    const lock = def.indexOf(`pg_advisory_xact_lock(hashtext('application_attempt:' || p_hashes[1]))`)
    expect(lock).toBeGreaterThan(-1)
    expect(lock).toBeLessThan(def.indexOf('count('))
  })

  it('anon and authenticated cannot select from private.application_attempts', async () => {
    await seed('t18-secret', 1)
    for (const role of ['anon', 'authenticated'] as const) {
      await expect(h.probe(VISITOR, 'select count(*)::int as n from private.application_attempts', [], 'aal2', role)).rejects.toThrow(/permission denied/)
      const { rows } = await db.query<{ t: boolean; f: boolean }>(
        `select has_table_privilege($1, 'private.application_attempts', 'select') as t,
                has_function_privilege($1, 'public.service_application_attempt(text[],integer)', 'execute') as f`, [role])
      expect(rows[0]).toEqual({ t: false, f: false })
    }
    const svc = (await db.query<{ s: boolean; i: boolean; d: boolean; u: boolean; f: boolean }>(
      `select has_table_privilege('service_role', 'private.application_attempts', 'select') as s,
              has_table_privilege('service_role', 'private.application_attempts', 'insert') as i,
              has_table_privilege('service_role', 'private.application_attempts', 'delete') as d,
              has_table_privilege('service_role', 'private.application_attempts', 'update') as u,
              has_function_privilege('service_role', 'public.service_application_attempt(text[],integer)', 'execute') as f`)).rows[0]
    expect(svc).toEqual({ s: true, i: true, d: true, u: false, f: true })
  })
})

// ---- S1.5 Task 7 ----
// The day buckets depend on now(): the tests that pin a date fake the JS clock, which PGlite's now() reads.
import { vi } from 'vitest'

describe('S1.5 Task 7: analytics data', () => {
  const id = ids(7)
  const OWNER_A = id(1)
  const OWNER_B = id(2)
  const OWNER_COUNT = id(3)
  const OWNER_KEEP = id(4)
  const BIZ_A = id(10)
  const BIZ_B = id(11)
  const BIZ_DEL = id(12)
  const BIZ_COUNT = id(13)
  const BIZ_KEEP = id(14)
  const P_TZ = id(20) // time-zone buckets
  const P_DST = id(21) // the Lisbon DST change
  const P_LIVE = id(22) // published, for record_event_limited
  const P_B = id(23) // business B
  const P_GONE = id(24) // deleted with 500 views
  const P_DEL = id(25) // in the business that is deleted

  GONE_AFTER_ROLLBACK.push('public.analytics_daily(text, integer, uuid)', 'public.business_product_counts')

  const product = (pid: string, biz: string, slug: string, status = 'draft') =>
    `insert into public.products (id, business_id, slug, name, category, price, currency, status, width, height, depth, dimension_unit)
       values ('${pid}', '${biz}', '${slug}', '{"en":"T7 ${slug}"}', 'sofa', 1000, 'EUR', '${status}', 10, 10, 10, 'cm');`

  beforeAll(async () => {
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at) values
        ('${OWNER_A}', 't7-a@test', now()), ('${OWNER_B}', 't7-b@test', now()), ('${OWNER_COUNT}', 't7-count@test', now()),
        ('${OWNER_KEEP}', 't7-keep@test', now());
      insert into public.businesses (id, name, slug, status) values
        ('${BIZ_A}', 'T7 A', 't7-a', 'active'), ('${BIZ_B}', 'T7 B', 't7-b', 'active'), ('${BIZ_DEL}', 'T7 Del', 't7-del', 'active'),
        ('${BIZ_COUNT}', 'T7 Count', 't7-count', 'active'), ('${BIZ_KEEP}', 'T7 Keep', 't7-keep', 'active');
      insert into public.business_members (business_id, user_id) values
        ('${BIZ_A}', '${OWNER_A}'), ('${BIZ_B}', '${OWNER_B}'), ('${BIZ_COUNT}', '${OWNER_COUNT}'), ('${BIZ_KEEP}', '${OWNER_KEEP}');
      ${product(P_TZ, BIZ_A, 'tz')} ${product(P_DST, BIZ_A, 'dst')} ${product(P_B, BIZ_B, 'b')}
      ${product(P_GONE, BIZ_KEEP, 'gone')} ${product(P_DEL, BIZ_DEL, 'del')}
      begin;
      ${product(P_LIVE, BIZ_A, 'live', 'published')}
      insert into public.product_images (product_id, url, kind, is_primary) values ('${P_LIVE}', 'https://example.test/t7.jpg', 'gallery', true);
      commit;
    `)
  })

  /** Inserts events (as the database owner) at the given instants. */
  const events = async (pid: string, biz: string, at: string[], type = 'view') => {
    for (const t of at) await db.query('insert into public.product_analytics (business_id, product_id, event_type, created_at) values ($1, $2, $3, $4)', [biz, pid, type, t])
  }
  type Day = { day: string; views: number; embed_views: number }
  /** analytics_daily as `uid` for one product: local day and counts. */
  const daily = async (uid: string, tz: string, days: number, pid: string) =>
    (await h.probe(uid, `select day::text as day, views::int as views, embed_views::int as embed_views from public.analytics_daily($1, $2) where product_id = $3 order by day`, [tz, days, pid])).rows as Day[]
  /** Runs `fn` with the clock (and so PGlite's now()) at `iso`. */
  async function at(iso: string, fn: () => Promise<void>) {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date(iso))
    try {
      await fn()
    } finally {
      vi.useRealTimers()
    }
  }

  it('an event at 2026-10-26 01:30 UTC lands on 25 Oct for America/Sao_Paulo and on 26 Oct for Europe/Lisbon', async () => {
    await events(P_TZ, BIZ_A, ['2026-10-26T01:30:00Z'])
    await at('2026-10-26T12:00:00Z', async () => {
      expect(await daily(OWNER_A, 'America/Sao_Paulo', 30, P_TZ)).toEqual([{ day: '2026-10-25', views: 1, embed_views: 0 }])
      expect(await daily(OWNER_A, 'Europe/Lisbon', 30, P_TZ)).toEqual([{ day: '2026-10-26', views: 1, embed_views: 0 }])
      expect(await daily(OWNER_A, 'UTC', 30, P_TZ)).toEqual([{ day: '2026-10-26', views: 1, embed_views: 0 }])
    })
  })

  it('analytics_daily buckets across the Lisbon DST change and returns p_days local dates', async () => {
    // Lisbon leaves summer time at 2026-10-25 01:00 UTC, so 25 Oct is 25 hours long: 24 Oct 23:00 UTC to 26 Oct 00:00 UTC.
    await events(P_DST, BIZ_A, [
      '2026-10-23T12:00:00Z', // 23 Oct
      '2026-10-24T22:59:00Z', // 24 Oct 23:59 (WEST)
      '2026-10-24T23:00:00Z', // 25 Oct 00:00 (WEST)
      '2026-10-25T00:30:00Z', // 25 Oct 01:30 (WEST)
      '2026-10-25T01:30:00Z', // 25 Oct 01:30 again (WET)
      '2026-10-25T23:59:00Z', // 25 Oct 23:59 (WET)
      '2026-10-26T00:00:00Z', // 26 Oct 00:00 (WET)
    ])
    await at('2026-10-26T12:00:00Z', async () => {
      expect(await daily(OWNER_A, 'Europe/Lisbon', 2, P_DST)).toEqual([
        { day: '2026-10-25', views: 4, embed_views: 0 },
        { day: '2026-10-26', views: 1, embed_views: 0 },
      ])
      expect(await daily(OWNER_A, 'Europe/Lisbon', 3, P_DST)).toEqual([
        { day: '2026-10-24', views: 1, embed_views: 0 },
        { day: '2026-10-25', views: 4, embed_views: 0 },
        { day: '2026-10-26', views: 1, embed_views: 0 },
      ])
      // One day only: today.
      expect((await daily(OWNER_A, 'Europe/Lisbon', 1, P_DST)).map((r) => r.day)).toEqual(['2026-10-26'])
      // The same instants in UTC: 25 Oct holds 3 (00:30, 01:30, 23:59) and 24 Oct holds 2.
      expect(await daily(OWNER_A, 'UTC', 3, P_DST)).toEqual([
        { day: '2026-10-24', views: 2, embed_views: 0 },
        { day: '2026-10-25', views: 3, embed_views: 0 },
        { day: '2026-10-26', views: 1, embed_views: 0 },
      ])
    })
  })

  it('unknown tz → invalid_timezone; p_days 0 and 367 refused', async () => {
    const run = (tz: string, days: number) => h.probe(OWNER_A, 'select count(*)::int as n from public.analytics_daily($1, $2)', [tz, days])
    await expect(run('Mars/Olympus_Mons', 30)).rejects.toMatchObject({ code: '22023', message: 'invalid_timezone' })
    await expect(run('', 30)).rejects.toMatchObject({ code: '22023', message: 'invalid_timezone' })
    await expect(run('UTC', 0)).rejects.toMatchObject({ code: '22023', message: 'invalid_request' })
    await expect(run('UTC', 367)).rejects.toMatchObject({ code: '22023', message: 'invalid_request' })
    expect((await run('UTC', 1)).rows).toHaveLength(1)
    expect((await run('Europe/Lisbon', 366)).rows).toHaveLength(1)
    // The defaults: 30 days, every business the caller can read.
    expect((await h.probe(OWNER_A, `select count(*)::int as n from public.analytics_daily('UTC')`)).rows).toHaveLength(1)
  })

  it('analytics_daily applies RLS: an owner sees only their business', async () => {
    await events(P_TZ, BIZ_A, [new Date().toISOString()])
    await events(P_B, BIZ_B, [new Date().toISOString()])
    const businesses = async (uid: string, biz: string | null) =>
      [...new Set(((await h.probe(uid, 'select business_id from public.analytics_daily($1, 30, $2)', ['UTC', biz])).rows as { business_id: string }[]).map((r) => r.business_id))]
    expect(await businesses(OWNER_A, null)).toEqual([BIZ_A])
    expect(await businesses(OWNER_A, BIZ_B)).toEqual([])
    expect(await businesses(OWNER_B, null)).toEqual([BIZ_B])
    // Security invoker, executable by signed-in users only.
    expect((await db.query<{ d: boolean }>(`select prosecdef as d from pg_proc where oid = 'public.analytics_daily(text, integer, uuid)'::regprocedure`)).rows[0]!.d).toBe(false)
    await expect(h.probe('', `select * from public.analytics_daily('UTC')`, [], null, 'anon')).rejects.toThrow(/permission denied/)
  })

  it('record_event_limited accepts embed_view; one embed load → embed_views +1, views +0', async () => {
    const key = 'e'.repeat(64)
    const totals = async () =>
      (await h.probe(OWNER_A, `select coalesce(sum(views), 0)::int as views, coalesce(sum(embed_views), 0)::int as embed_views from public.product_analytics_daily where product_id = $1`, [P_LIVE])).rows[0]
    expect(await totals()).toEqual({ views: 0, embed_views: 0 })
    expect(await h.svc('select public.record_event_limited($1, $2, $3, $4) as r', [key, P_LIVE, BIZ_A, 'embed_view'])).toBe('recorded')
    expect(await totals()).toEqual({ views: 0, embed_views: 1 })
    expect(await h.probe(OWNER_A, `select sum(views)::int as views, sum(embed_views)::int as embed_views from public.analytics_daily('Europe/Lisbon', 30, $1) where product_id = $2`, [BIZ_A, P_LIVE]).then((r) => r.rows[0])).toEqual({ views: 0, embed_views: 1 })
    // Still checked like every other event: a draft product is not recordable.
    expect(await h.svc('select public.record_event_limited($1, $2, $3, $4) as r', [key, P_TZ, BIZ_A, 'embed_view'])).toBe('invalid')
    // embed_views is the view's last column.
    const cols = (await db.query<{ c: string }>(`select column_name as c from information_schema.columns where table_schema = 'public' and table_name = 'product_analytics_daily' order by ordinal_position`)).rows.map((r) => r.c)
    expect(cols).toEqual(['business_id', 'product_id', 'day', 'views', 'ar_activations', 'model_interactions', 'embed_views'])
  })

  it("deleting a product with 500 views keeps 500 rows with product_id null, and the 30-day total is unchanged", async () => {
    await db.query(
      `insert into public.product_analytics (business_id, product_id, event_type, created_at)
         select $1, $2, 'view', now() - (g || ' milliseconds')::interval from generate_series(1, 500) g`, [BIZ_KEEP, P_GONE])
    const total = async () => (await h.probe(OWNER_KEEP, `select coalesce(sum(views), 0)::int as n from public.analytics_daily('UTC', 30, $1)`, [BIZ_KEEP])).rows[0]
    expect(await total()).toEqual({ n: 500 })
    await h.as(OWNER_KEEP, (tx) => tx.query('delete from public.products where id = $1', [P_GONE]))
    expect((await db.query('select 1 from public.products where id = $1', [P_GONE])).rows).toHaveLength(0)
    expect(await total()).toEqual({ n: 500 })
    expect(await h.count(OWNER_KEEP, 'select count(*)::int as n from public.product_analytics where business_id = $1 and product_id is null', [BIZ_KEEP])).toBe(500)
    expect((await h.probe(OWNER_KEEP, `select product_id, views::int as views from public.analytics_daily('UTC', 30, $1)`, [BIZ_KEEP])).rows).toEqual([{ product_id: null, views: 500 }])
  })

  it('deleting the business deletes its analytics rows', async () => {
    await events(P_DEL, BIZ_DEL, [new Date().toISOString(), new Date().toISOString()])
    // Its rows are first kept as "Deleted product" (product_id null), then a second product gets one more.
    await db.query('delete from public.products where id = $1', [P_DEL])
    expect((await db.query('select 1 from public.product_analytics where business_id = $1 and product_id is null', [BIZ_DEL])).rows).toHaveLength(2)
    await db.exec(`${product(id(26), BIZ_DEL, 'del-2')}`)
    await events(id(26), BIZ_DEL, [new Date().toISOString()])
    expect((await db.query('select 1 from public.product_analytics where business_id = $1', [BIZ_DEL])).rows).toHaveLength(3)
    await db.query('delete from public.businesses where id = $1', [BIZ_DEL])
    expect((await db.query('select 1 from public.product_analytics where business_id = $1', [BIZ_DEL])).rows).toHaveLength(0)
  })

  it('business_product_counts is exact for 1,200 products', async () => {
    await db.exec(`
      begin;
      insert into public.products (business_id, slug, name, category, price, currency, status, width, height, depth, dimension_unit)
        select '${BIZ_COUNT}', 'c-' || g, '{"en":"T7 count"}', 'chair', 1000, 'EUR', case when g <= 200 then 'published' else 'draft' end, 10, 10, 10, 'cm'
          from generate_series(1, 1200) g;
      insert into public.product_images (product_id, url, kind, is_primary)
        select id, 'https://example.test/c.jpg', 'gallery', true from public.products where business_id = '${BIZ_COUNT}' and status = 'published';
      commit;
    `)
    const counts = async (uid: string) =>
      (await h.probe(uid, 'select total, published, drafts from public.business_product_counts where business_id = $1', [BIZ_COUNT])).rows
    expect(await counts(OWNER_COUNT)).toEqual([{ total: 1200, published: 200, drafts: 1000 }])
    // Security invoker: another owner counts only what RLS shows them (the public, published products).
    expect(await counts(OWNER_B)).toEqual([{ total: 200, published: 200, drafts: 0 }])
    expect((await db.query<{ o: string[] | null }>(`select reloptions as o from pg_class where oid = 'public.business_product_counts'::regclass`)).rows[0]!.o).toContain('security_invoker=true')
    await expect(h.probe('', 'select * from public.business_product_counts', [], null, 'anon')).rejects.toThrow(/permission denied/)
  })
})

describe('S1.5 Task 10: invitation note, exact access history, 2FA reset only when set', () => {
  GONE_AFTER_ROLLBACK.push(
    'public.service_create_member_invite(uuid, text, timestamptz, uuid, text)',
    'public.service_latest_invite_note(uuid)',
    'private.has_2fa(uuid)',
  )
  const id = ids(10)
  const OWNER = id(1)
  const FACTOR = id(2) // a verified authenticator
  const CODES = id(3) // recovery codes left, no factor
  const NOTHING = id(4) // no factor, no codes
  const HALF = id(5) // an unverified factor and only used codes
  const LATE = id(7) // holds an expired link
  const HASH = (n: number) => String(n).repeat(64).slice(0, 64)

  beforeAll(async () => {
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at) values
        ('${OWNER}', 't10-owner@test', now()), ('${FACTOR}', 't10-factor@test', now()), ('${CODES}', 't10-codes@test', now()),
        ('${NOTHING}', 't10-nothing@test', now()), ('${HALF}', 't10-half@test', now()), ('${LATE}', 't10-late@test', now());
      insert into public.platform_admins (user_id) values ('${OWNER}');
      insert into public.platform_members (user_id, email, role, status) values
        ('${FACTOR}', 't10-factor@test', 'admin', 'active'), ('${CODES}', 't10-codes@test', 'team', 'active'),
        ('${NOTHING}', 't10-nothing@test', 'team', 'active'), ('${HALF}', 't10-half@test', 'team', 'active'),
        (null, 't10-invited@test', 'team', 'invited'), (null, 't10-late@test', 'team', 'invited');
      insert into auth.mfa_factors (user_id, status, factor_type) values
        ('${OWNER}', 'verified', 'totp'), ('${FACTOR}', 'verified', 'totp'), ('${HALF}', 'unverified', 'totp');
      insert into private.recovery_codes (user_id, code_hash, salt, used_at) values
        ('${CODES}', '${HASH(1)}', 's', null), ('${HALF}', '${HASH(2)}', 's', now());
    `)
  })

  const memberId = async (email: string) =>
    (await db.query<{ id: string }>('select id from public.platform_members where email = $1', [email])).rows[0]!.id

  it('note > 500 refused', async () => {
    const m = await memberId('t10-invited@test')
    const create = (n: number, note: string | null) =>
      h.svc(`select public.service_create_member_invite($1, $2, now() + interval '7 days', $3, $4) as r`, [m, HASH(n), OWNER, note])
    await expect(create(3, 'x'.repeat(501))).rejects.toThrow(/platform_invites_note_check/)
    expect(await create(4, 'x'.repeat(500))).toMatchObject({ ok: true })
    expect(await create(5, null)).toMatchObject({ ok: true })
    await expect(db.query(`update private.platform_invites set note = $1 where member_id = $2`, ['y'.repeat(501), m])).rejects.toThrow(/platform_invites_note_check/)
  })

  it('stores the note on the invite, and the latest note is what a resend reuses', async () => {
    const m = await memberId('t10-invited@test')
    await h.svc(`select public.service_create_member_invite($1, $2, now() + interval '7 days', $3, 'Welcome, Ana') as r`, [m, HASH(6), OWNER])
    expect(await h.svc(`select to_jsonb(public.service_latest_invite_note($1)) as r`, [m])).toBe('Welcome, Ana')
    // Four-argument calls (the Edge Function of the earlier release) still work and store no note.
    await h.svc(
      `select public.service_create_member_invite(p_member => $1, p_token_hash => $2, p_expires_at => now() + interval '7 days', p_actor => $3) as r`,
      [m, HASH(7), OWNER])
    expect(await h.svc(`select to_jsonb(public.service_latest_invite_note($1)) as r`, [m])).toBeNull()
    // Service role only.
    for (const fn of ['public.service_latest_invite_note(uuid)', 'public.service_create_member_invite(uuid, text, timestamptz, uuid, text)']) {
      const g = (await db.query<{ a: boolean; u: boolean; s: boolean }>(
        `select has_function_privilege('anon', $1::regprocedure, 'execute') as a, has_function_privilege('authenticated', $1::regprocedure, 'execute') as u,
                has_function_privilege('service_role', $1::regprocedure, 'execute') as s`, [fn])).rows[0]
      expect({ fn, ...g }).toEqual({ fn, a: false, u: false, s: true })
    }
    expect((await db.query(`select to_regprocedure('public.service_create_member_invite(uuid, text, timestamptz, uuid)')::text as o`)).rows[0]).toEqual({ o: null })
  })

  it('an expired-invite attempt carries member_id', async () => {
    const m = await memberId('t10-late@test')
    await db.query(
      `insert into private.platform_invites (member_id, token_hash, status, expires_at, created_by) values ($1, $2, 'sent', now() - interval '1 day', $3)`,
      [m, HASH(8), OWNER])
    expect(await h.svc(`select to_jsonb(public.service_accept_invite($1, $2)) as r`, [HASH(8), LATE])).toBe('invite_expired')
    const { rows } = await db.query<{ metadata: Record<string, unknown> }>(
      `select metadata from public.audit_events where event_type = 'access_invite_expired_attempt' and actor_id = $1`, [LATE])
    expect(rows).toEqual([{ metadata: { member_id: m } }])
  })

  it('has_2fa true for a verified factor or recovery codes, else false', async () => {
    const list = (await h.call(OWNER, 'select public.admin_list_members() as r', [], 'aal2')) as { members: { email: string; has2fa: boolean }[] }
    const byEmail = Object.fromEntries(list.members.filter((x) => x.email.startsWith('t10-')).map((x) => [x.email, x.has2fa]))
    expect(byEmail).toEqual({
      't10-owner@test': true,
      't10-factor@test': true,
      't10-codes@test': true,
      't10-nothing@test': false,
      't10-half@test': false,
      't10-invited@test': false,
      't10-late@test': false,
    })
    const one = async (email: string) =>
      ((await h.call(OWNER, 'select public.admin_get_member($1) as r', [await memberId(email)], 'aal2')) as { member: { has2fa: boolean } }).member.has2fa
    expect(await one('t10-factor@test')).toBe(true)
    expect(await one('t10-codes@test')).toBe(true)
    expect(await one('t10-nothing@test')).toBe(false)
    expect(await one('t10-half@test')).toBe(false)
    // private.has_2fa is not callable from the API roles.
    for (const role of ['anon', 'authenticated', 'service_role']) {
      expect((await db.query<{ x: boolean }>(`select has_function_privilege($1, 'private.has_2fa(uuid)', 'execute') as x`, [role])).rows[0]!.x).toBe(false)
    }
  })

  it('rollback restores the four-argument invite function, admin_list_members and admin_get_member, and drops the note column', async () => {
    const defs = async (target: PGlite) => {
      // The body keeps the source file's line endings (CRLF in a Windows checkout); compare the text only.
      const def = async (fn: string) =>
        (await target.query<{ d: string }>(`select pg_get_functiondef($1::regprocedure) as d`, [fn])).rows[0]!.d.replace(/\r\n/g, '\n')
      return {
        invite: await def('public.service_create_member_invite(uuid, text, timestamptz, uuid)'),
        list: await def('public.admin_list_members()'),
        get: await def('public.admin_get_member(uuid)'),
        note: (await target.query(
          `select 1 from information_schema.columns where table_schema = 'private' and table_name = 'platform_invites' and column_name = 'note'`)).rows.length,
      }
    }
    const before = await freshDb((n) => n < S15_MIGRATION)
    const rolled = await freshDb()
    try {
      const pre = await defs(before)
      expect(pre.note).toBe(0)
      await rolled.exec(readFileSync(ROLLBACK_SQL, 'utf8'))
      expect(await defs(rolled)).toEqual(pre)
      const g = (await rolled.query<{ u: boolean; s: boolean }>(
        `select has_function_privilege('authenticated', 'public.service_create_member_invite(uuid, text, timestamptz, uuid)', 'execute') as u,
                has_function_privilege('service_role', 'public.service_create_member_invite(uuid, text, timestamptz, uuid)', 'execute') as s`)).rows[0]
      expect(g).toEqual({ u: false, s: true })
    } finally {
      await before.close()
      await rolled.close()
    }
  }, 120_000)
})

describe('S1.5 Task 8: catalogue activity from audit events', () => {
  GONE_AFTER_ROLLBACK.push('private.audit_product_change()')
  const id = ids(8)
  const TEAM = id(2)
  const OWNER_A = id(3) // business owner of A
  const OWNER_B = id(4)
  const BIZ_A = id(10)
  const BIZ_B = id(11)
  const BIZ_GONE = id(12) // deleted with its products
  const P_LIFE = id(20) // insert → publish → unpublish → slug → delete
  const P_GONE = id(21) // in BIZ_GONE
  const P_B = id(22) // in BIZ_B

  const product = (pid: string, biz: string, slug: string, name: string) =>
    `insert into public.products (id, business_id, slug, name, category, price, currency, status, width, height, depth, dimension_unit)
       values ('${pid}', '${biz}', '${slug}', '{"en":"${name}","pt":"PT ${name}"}', 'sofa', 1000, 'EUR', 'draft', 10, 10, 10, 'cm');`

  beforeAll(async () => {
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at) values
        ('${TEAM}', 't8-team@test', now()), ('${OWNER_A}', 't8-a@test', now()), ('${OWNER_B}', 't8-b@test', now());
      insert into public.platform_members (user_id, email, role, status) values ('${TEAM}', 't8-team@test', 'team', 'active');
      insert into public.businesses (id, name, slug, status) values
        ('${BIZ_A}', 'T8 A', 't8-a', 'active'), ('${BIZ_B}', 'T8 B', 't8-b', 'active'), ('${BIZ_GONE}', 'T8 Gone', 't8-gone', 'active');
      insert into public.business_members (business_id, user_id) values ('${BIZ_A}', '${OWNER_A}'), ('${BIZ_B}', '${OWNER_B}');
      ${product(P_GONE, BIZ_GONE, 'gone', 'T8 Gone sofa')}
      ${product(P_B, BIZ_B, 'b', 'T8 B sofa')}
    `)
  })

  type Row = { event_type: string; business_id: string | null; name: string | null; from: string | null; to: string | null }
  /** Audit rows for one product id (as the database owner), oldest first. */
  const productEvents = async (pid: string) =>
    (await db.query<Row>(
      `select event_type, business_id, metadata->>'name' as name, metadata->>'from' as from, metadata->>'to' as to
         from public.audit_events where metadata->>'product_id' = $1 order by created_at, id`, [pid])).rows

  it('insert, publish, unpublish, slug change and delete each write one event with name and business_id', async () => {
    await db.exec(product(P_LIFE, BIZ_A, 'life', 'T8 Life sofa'))
    expect((await productEvents(P_LIFE)).map((r) => r.event_type)).toEqual(['product_created'])
    // The deferred publish check needs a gallery image by the time the publish commits.
    await db.exec(`
      begin;
      insert into public.product_images (product_id, url, kind, is_primary) values ('${P_LIFE}', 'https://example.test/t8.jpg', 'gallery', true);
      update public.products set status = 'published' where id = '${P_LIFE}';
      commit;`)
    // An edit that changes neither the status nor the address writes nothing.
    await db.exec(`update public.products set price = 1200 where id = '${P_LIFE}'`)
    await db.exec(`update public.products set status = 'draft' where id = '${P_LIFE}'`)
    await db.exec(`update public.products set slug = 'life-2' where id = '${P_LIFE}'`)
    await db.exec(`delete from public.products where id = '${P_LIFE}'`)
    const rows = await productEvents(P_LIFE)
    expect(rows.map((r) => r.event_type)).toEqual(['product_created', 'product_published', 'product_unpublished', 'product_slug_changed', 'product_deleted'])
    for (const r of rows) expect(r).toMatchObject({ business_id: BIZ_A, name: 'T8 Life sofa' })
    expect(rows[3]).toMatchObject({ from: 'life', to: 'life-2' })
  })

  it('a business delete writes no product_deleted rows', async () => {
    await db.exec(`delete from public.businesses where id = '${BIZ_GONE}'`)
    expect((await productEvents(P_GONE)).map((r) => r.event_type)).toEqual(['product_created'])
    // The business delete itself is still recorded.
    expect((await db.query(`select 1 from public.audit_events where event_type = 'business_deleted' and metadata->>'business_id' = $1`, [BIZ_GONE])).rows).toHaveLength(1)
  })

  it('staff read product_% only with products.view, and business_% only with businesses.view', async () => {
    await db.exec(`update public.businesses set status = 'inactive' where id = '${BIZ_B}'; update public.businesses set status = 'active' where id = '${BIZ_B}';`)
    const seen = async () =>
      (await h.probe(TEAM, `select distinct event_type from public.audit_events where business_id = $1 order by 1`, [BIZ_B])).rows.map(
        (r) => (r as { event_type: string }).event_type)
    await withRolePermissions({ team: ['products.view'] }, async () => {
      expect(await seen()).toEqual(['product_created'])
    })
    await withRolePermissions({ team: ['businesses.view'] }, async () => {
      expect(await seen()).toEqual(['business_status_changed'])
    })
    await withRolePermissions({ team: ['analytics.view'] }, async () => {
      expect(await seen()).toEqual([])
    })
    // Behind the staff 2FA gate, like every staff read.
    await withRolePermissions({ team: ['products.view', 'businesses.view'] }, async () => {
      expect(await seen()).toEqual(['business_status_changed', 'product_created'])
      await h.withPolicy(true, false, async () => {
        expect(await seen()).toEqual([])
      })
    })
  })

  it("an owner reads only their business's whitelisted events", async () => {
    const WHITELIST = ['business_status_changed', 'business_slug_changed', 'product_created', 'product_published', 'product_unpublished',
      'product_slug_changed', 'product_deleted', 'account_closure_voided']
    // One row of every whitelisted type and two that are not, for A and for B.
    for (const biz of [BIZ_A, BIZ_B])
      for (const t of [...WHITELIST, 'business_created', 'owner_provisioned'])
        await db.query(`insert into public.audit_events (event_type, business_id, metadata) values ($1, $2, '{"t8":true}')`, [t, biz])
    const read = async (uid: string) =>
      (await h.probe(uid, `select business_id, event_type from public.audit_events where metadata->>'t8' = 'true' order by 2`)).rows as { business_id: string; event_type: string }[]
    const a = await read(OWNER_A)
    expect(a.every((r) => r.business_id === BIZ_A)).toBe(true)
    expect(a.map((r) => r.event_type)).toEqual([...WHITELIST].sort())
    const b = await read(OWNER_B)
    expect(b.every((r) => r.business_id === BIZ_B)).toBe(true)
    expect(b).toHaveLength(WHITELIST.length)
    // Behind the business 2FA gate.
    await h.withPolicy(false, true, async () => {
      expect(await read(OWNER_A)).toEqual([])
    })
  })
})
