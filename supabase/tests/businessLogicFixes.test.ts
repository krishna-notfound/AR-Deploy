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
