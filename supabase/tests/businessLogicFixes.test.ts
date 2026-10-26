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
