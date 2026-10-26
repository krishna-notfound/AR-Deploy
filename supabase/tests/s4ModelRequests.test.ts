// @vitest-environment node
// S4 3D model requests (docs/superpowers/specs/2026-10-26-s4-3d-model-requests-design.md): one describe per task, on
// the shared PGlite harness. Each describe seeds its own rows with seedS4(db, task) (ids(task)), so describes are
// independent; a test that changes shared settings (role sets, the 2FA policy) restores them before it ends.
//
// Slots: Task 1 owns the fixtures, its describe and the rollback describe. Tasks 3, 4, 6, 7 and 8 put their whole
// describe between their own `// ---- S4 Task N tests ----` markers at the end of this file, and call
// GONE_AFTER_ROLLBACK.push(...) at their describe's body level.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MIGRATIONS, S4_MIGRATION, S4_ROLLBACK_SQL, freshDb, ids, makeHelpers, type Helpers } from './harness'

type ModelRequestStatus = 'requested' | 'in_progress' | 'delivered' | 'rejected' | 'cancelled'

/**
 * Objects the S4 migration creates, which the rollback must drop: a table as `schema.name`, a function as
 * `schema.name(argtypes)`. Each task adds its own with GONE_AFTER_ROLLBACK.push(...) at its describe's body level.
 */
export const GONE_AFTER_ROLLBACK: string[] = []

/** Team's default set (ADR-0029) and a Team set that handles 3D requests (models.manage plus its prerequisites). */
export const TEAM_DEFAULTS = ['analytics.view', 'applications.view', 'businesses.view', 'products.edit', 'products.view']
export const MODEL_STAFF = ['businesses.view', 'models.manage', 'products.view']

let db: PGlite
let h: Helpers

beforeAll(async () => {
  db = await freshDb()
  h = makeHelpers(db)
}, 60_000)
afterAll(async () => {
  await db?.close()
})

export interface S4Fixture {
  /** Platform Owner, Admin (default set: every key) and one Team member. Role sets are per role, so "Team with the
   *  key" is this member inside withTeam(MODEL_STAFF, ...); outside it Team has its defaults (no models.manage). */
  owner: string
  admin: string
  team: string
  /** Business A (allow_own_models off) and its owner; business B (switch on) and its owner. */
  bizA: string
  ownerA: string
  bizB: string
  ownerB: string
  /** In A: P (draft, dimensions > 0) with option V; Q (depth 0). In B: R. */
  productP: string
  variantV: string
  productQ: string
  productR: string
  /** A fresh id the fixture never uses, for request ids and object names: free(n) with n in 50..99. */
  free: (n: number) => string
}

/** Seeds the fixture of S4Fixture as the database owner, with ids(task). */
async function seedS4(target: PGlite, task: number): Promise<S4Fixture> {
  const id = ids(task)
  const f: S4Fixture = {
    owner: id(1), admin: id(2), team: id(3), ownerA: id(4), ownerB: id(5),
    bizA: id(10), bizB: id(11), productP: id(20), variantV: id(21), productQ: id(22), productR: id(23),
    free: (n: number) => {
      if (n < 50) throw new Error('free(n): n must be 50 to 99')
      return id(n)
    },
  }
  await target.exec(`
    insert into auth.users (id, email, email_confirmed_at) values
      ('${f.owner}', 's4t${task}-owner@test', now()), ('${f.admin}', 's4t${task}-admin@test', now()),
      ('${f.team}', 's4t${task}-team@test', now()), ('${f.ownerA}', 's4t${task}-a@test', now()),
      ('${f.ownerB}', 's4t${task}-b@test', now());
    insert into public.platform_admins (user_id) values ('${f.owner}');
    insert into public.platform_members (user_id, email, role, status) values
      ('${f.admin}', 's4t${task}-admin@test', 'admin', 'active'), ('${f.team}', 's4t${task}-team@test', 'team', 'active');
    insert into public.businesses (id, name, slug, status, allow_own_models) values
      ('${f.bizA}', 'S4 T${task} A', 's4-t${task}-a', 'active', false),
      ('${f.bizB}', 'S4 T${task} B', 's4-t${task}-b', 'active', true);
    insert into public.business_members (business_id, user_id) values ('${f.bizA}', '${f.ownerA}'), ('${f.bizB}', '${f.ownerB}');
    insert into public.products (id, business_id, slug, name, category, price, currency, width, height, depth, dimension_unit) values
      ('${f.productP}', '${f.bizA}', 'p', '{"en":"Sofa P"}', 'sofa', 100000, 'EUR', 200, 80, 90, 'cm'),
      ('${f.productQ}', '${f.bizA}', 'q', '{"en":"Chair Q"}', 'chair', 20000, 'EUR', 50, 90, 0, 'cm'),
      ('${f.productR}', '${f.bizB}', 'r', '{"en":"Table R"}', 'table', 50000, 'EUR', 160, 75, 90, 'cm');
    insert into public.product_variants (id, product_id, name) values ('${f.variantV}', '${f.productP}', '{"en":"Oak"}');
  `)
  return f
}

/** A storage.objects row (as the database owner). */
async function putObject(target: PGlite, bucket: string, name: string): Promise<void> {
  await target.query('insert into storage.objects (bucket_id, name) values ($1, $2)', [bucket, name])
}

/** A model_requests row (as the database owner), with closed_at and reason as its status needs, and its photo rows. */
async function insertRequest(
  target: PGlite,
  r: { id: string; business: string; product: string; variant?: string; status: ModelRequestStatus; photos?: string[] },
): Promise<void> {
  const final = ['delivered', 'rejected', 'cancelled'].includes(r.status)
  await target.query(
    `insert into public.model_requests (id, business_id, product_id, variant_id, status, reason, closed_at, started_at, delivered_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [r.id, r.business, r.product, r.variant ?? null, r.status, r.status === 'rejected' ? 'Too dark' : null,
     final ? new Date().toISOString() : null, r.status === 'in_progress' || r.status === 'delivered' ? new Date().toISOString() : null,
     r.status === 'delivered' ? new Date().toISOString() : null])
  for (const [i, path] of (r.photos ?? []).entries()) {
    await target.query(
      `insert into public.model_request_photos (request_id, storage_path, file_name, size_bytes, sort_order) values ($1, $2, $3, 1000, $4)`,
      [r.id, path, `photo-${i + 1}.jpg`, i])
  }
}

/** Replaces the Team role's set (as the database owner) for the duration of `fn`, then restores it. */
async function withTeam(perms: string[], fn: () => Promise<void>): Promise<void> {
  const saved = (await db.query<{ p: string }>(`select permission as p from public.platform_role_permissions where role = 'team'`)).rows.map((r) => r.p)
  const put = async (set: string[]) => {
    await db.query(`delete from public.platform_role_permissions where role = 'team'`)
    for (const p of set) await db.query(`insert into public.platform_role_permissions (role, permission) values ('team', $1)`, [p])
  }
  try {
    await put(perms)
    await fn()
  } finally {
    await put(saved)
  }
}

/** Asserts `sql` (run with `params`) raises forbidden for Team-without-key and aal2_required for Admin at aal1 with the staff policy on. */
async function expectStaffGate(hh: Helpers, f: S4Fixture, sql: string, params: unknown[]): Promise<void> {
  await withTeam(TEAM_DEFAULTS, async () => {
    await expect(hh.probe(f.team, sql, params)).rejects.toMatchObject({ message: 'forbidden', code: '42501' })
  })
  await hh.withPolicy(true, false, async () => {
    await expect(hh.probe(f.admin, sql, params, 'aal1')).rejects.toMatchObject({ message: 'aal2_required', code: '42501' })
  })
}

describe('S4 Task 1: permission, switch, tables, bucket', () => {
  GONE_AFTER_ROLLBACK.push(
    'public.model_requests', 'public.model_request_photos', 'public.model_request_files',
    'public.can_write_own_models(uuid)', 'public.admin_set_own_models(uuid, boolean)',
    'private.require_models_manage()', 'private.require_business_member(uuid)',
    'private.guard_own_models()', 'private.guard_own_models_flag()',
  )
  let f: S4Fixture
  beforeAll(async () => {
    f = await seedS4(db, 1)
  })

  const glbPath = (biz: string, n: number) => `${biz}/${ids(1)(n)}.glb`
  const insertModel = (product: string, path: string) =>
    `insert into public.product_models (product_id, format, storage_path, file_name) values ('${product}', 'glb', '${path}', 'm.glb')`
  const insertVariantModel = (variant: string, product: string, path: string) =>
    `insert into public.product_variant_models (variant_id, product_id, format, storage_path, file_name) values ('${variant}', '${product}', 'glb', '${path}', 'm.glb')`
  const setSwitch = (biz: string, on: boolean) => db.query('update public.businesses set allow_own_models = $2 where id = $1', [biz, on])

  it('the S4 migration applies after every earlier migration', async () => {
    expect(S4_MIGRATION).toMatch(/^\d{14}_s4_model_requests\.sql$/)
    expect(S4_MIGRATION > '20261026041731').toBe(true)
    for (const t of ['public.model_requests', 'public.model_request_photos', 'public.model_request_files']) {
      expect((await db.query<{ o: string | null }>('select to_regclass($1)::text as o', [t])).rows[0]!.o).toBe(t.replace('public.', ''))
    }
  })

  it("the Owner's my_platform_access().permissions has length 16 after Admin and Team sets are both {}", async () => {
    const saved = (await db.query<{ role: string; permission: string }>('select role::text, permission from public.platform_role_permissions')).rows
    try {
      await db.query('delete from public.platform_role_permissions')
      const owner = (await h.call(f.owner, 'select public.my_platform_access() as r')) as { role: string; permissions: string[] }
      expect(owner.role).toBe('owner')
      expect(owner.permissions).toHaveLength(16)
      expect(owner.permissions).toContain('models.manage')
      expect(await h.call(f.admin, 'select public.my_platform_access() as r')).toEqual({ role: 'admin', permissions: [] })
    } finally {
      for (const r of saved) await db.query('insert into public.platform_role_permissions (role, permission) values ($1::public.platform_role, $2)', [r.role, r.permission])
    }
  })

  it('admin_set_role_permissions accepts models.manage and returns added [businesses.view, products.view] for Team = {models.manage}', async () => {
    await withTeam(TEAM_DEFAULTS, async () => {
      await db.query(`delete from public.platform_role_permissions where role = 'team'`)
      expect(await h.call(f.owner, `select public.admin_set_role_permissions('team', array['models.manage']) as r`))
        .toEqual({ ok: true, added: ['businesses.view', 'products.view'] })
      const stored = (await db.query<{ p: string }>(`select permission as p from public.platform_role_permissions where role = 'team' order by 1`)).rows.map((r) => r.p)
      expect(stored).toEqual(MODEL_STAFF)
    })
  })

  it('an owner PATCHing allow_own_models → 42501; an Admin PATCHing it → own_models_admin_only; admin_set_own_models as Team-with-key → changed and one audit row; same value again → changed false, no row', async () => {
    const patch = `update public.businesses set allow_own_models = true where id = $1`
    await expect(h.probe(f.ownerA, patch, [f.bizA])).rejects.toMatchObject({ code: '42501' })
    await expect(h.probe(f.admin, patch, [f.bizA])).rejects.toMatchObject({ message: 'own_models_admin_only', code: '42501' })
    const events = async () => (await db.query<{ actor_id: string; metadata: Record<string, unknown> }>(
      `select actor_id, metadata from public.audit_events where event_type = 'business_own_models_changed' and business_id = $1`, [f.bizA])).rows
    try {
      await withTeam(MODEL_STAFF, async () => {
        expect(await h.call(f.team, 'select public.admin_set_own_models($1, true) as r', [f.bizA])).toEqual({ allow_own_models: true, changed: true })
        expect(await events()).toEqual([{ actor_id: f.team, metadata: expect.objectContaining({ from: false, to: true }) }])
        expect(await h.call(f.team, 'select public.admin_set_own_models($1, true) as r', [f.bizA])).toEqual({ allow_own_models: true, changed: false })
        expect(await events()).toHaveLength(1)
      })
      expect((await db.query<{ a: boolean }>('select allow_own_models as a from public.businesses where id = $1', [f.bizA])).rows[0]!.a).toBe(true)
      await expectStaffGate(h, f, 'select public.admin_set_own_models($1, false) as r', [f.bizA])
      // The Owner and a default Admin hold the key.
      expect(await h.call(f.admin, 'select public.admin_set_own_models($1, false) as r', [f.bizA])).toEqual({ allow_own_models: false, changed: true })
      await expect(h.probe(f.admin, 'select public.admin_set_own_models($1, true)', [f.free(99)])).rejects.toMatchObject({ message: 'business_not_found' })
    } finally {
      await setSwitch(f.bizA, false)
    }
  })

  it('switch off, owner: a direct insert into product_models → own_models_not_allowed; switch on → allowed; Admin with products.edit and switch off → allowed; deleting a product or an option with a GLB → allowed (cascade)', async () => {
    const own = insertModel(f.productP, glbPath(f.bizA, 60))
    await expect(h.probe(f.ownerA, own)).rejects.toMatchObject({ message: 'own_models_not_allowed', code: '42501' })
    await expect(h.probe(f.ownerA, insertVariantModel(f.variantV, f.productP, glbPath(f.bizA, 61)))).rejects.toMatchObject({ message: 'own_models_not_allowed' })
    expect(await h.affected(f.ownerB, insertModel(f.productR, glbPath(f.bizB, 62)))).toBe(1)
    expect(await h.affected(f.admin, own)).toBe(1)
    await withTeam(TEAM_DEFAULTS, async () => {
      expect(await h.affected(f.team, own)).toBe(1) // default Team has products.edit
    })

    // A GLB delivered earlier: the owner (switch off) can't remove it directly, but deleting the option or the product cascades.
    const pid = f.free(70)
    const vid = f.free(71)
    await db.exec(`
      insert into public.products (id, business_id, slug, name, category, price, currency, width, height, depth, dimension_unit)
        values ('${pid}', '${f.bizA}', 'cascade', '{"en":"Cascade"}', 'sofa', 100, 'EUR', 1, 1, 1, 'cm');
      insert into public.product_variants (id, product_id, name) values ('${vid}', '${pid}', '{"en":"Walnut"}');
      ${insertModel(pid, glbPath(f.bizA, 72))};
      ${insertVariantModel(vid, pid, glbPath(f.bizA, 73))};
    `)
    try {
      await expect(h.probe(f.ownerA, 'delete from public.product_models where product_id = $1', [pid])).rejects.toMatchObject({ message: 'own_models_not_allowed' })
      expect(await h.affected(f.ownerA, 'delete from public.product_variants where id = $1', [vid])).toBe(1)
      await h.as(f.ownerA, (tx) => tx.query('delete from public.products where id = $1', [pid]))
      expect((await db.query('select 1 from public.products where id = $1', [pid])).rows).toHaveLength(0)
      expect((await db.query('select 1 from public.product_variant_models where variant_id = $1', [vid])).rows).toHaveLength(0)
    } finally {
      await db.query('delete from public.products where id = $1', [pid])
    }
  })

  it('fix round 1: an Admin inserting a business with allow_own_models = true gets own_models_admin_only; with the default it is created off', async () => {
    const insert = (on: boolean) => `insert into public.businesses (id, name, slug, status, allow_own_models) values ('${f.free(95)}', 'New Co', 's4-t1-new', 'draft', ${on})`
    await expect(h.probe(f.admin, insert(true))).rejects.toMatchObject({ message: 'own_models_admin_only', code: '42501' })
    expect(await h.affected(f.admin, insert(false))).toBe(1)
  })

  it('fix round 1: an owner with the switch on moving a model row from their product to a product of a switch-off business gets own_models_not_allowed', async () => {
    const path = glbPath(f.bizB, 96)
    await db.query(insertModel(f.productR, path))
    try {
      await expect(h.probe(f.ownerB, 'update public.product_models set product_id = $1 where product_id = $2', [f.productP, f.productR]))
        .rejects.toMatchObject({ message: 'own_models_not_allowed', code: '42501' })
      expect((await db.query('select 1 from public.product_models where product_id = $1', [f.productR])).rows).toHaveLength(1)
    } finally {
      await db.query('delete from public.product_models where product_id = $1', [f.productR])
    }
  })

  it('model_requests rows: owner reads own business only; other owner, Team without the key and anon read 0; Team with the key reads all; no role can insert, update or delete through the API; the same for photos; staged files only with the key', async () => {
    const rA = f.free(80)
    const rB = f.free(81)
    await insertRequest(db, { id: rA, business: f.bizA, product: f.productP, status: 'requested', photos: [`${f.bizA}/${rA}/${f.free(82)}.jpg`, `${f.bizA}/${rA}/${f.free(83)}.jpg`] })
    await insertRequest(db, { id: rB, business: f.bizB, product: f.productR, status: 'requested', photos: [`${f.bizB}/${rB}/${f.free(84)}.jpg`] })
    await db.query(`insert into public.model_request_files (request_id, format, storage_path, file_name, size_bytes) values ($1, 'glb', $2, 'm.glb', 10)`, [rA, glbPath(f.bizA, 85)])
    const both = [[rA, rB]]
    const reqs = 'select count(*)::int as n from public.model_requests where id = any($1)'
    const photos = 'select count(*)::int as n from public.model_request_photos where request_id = any($1)'
    const files = 'select count(*)::int as n from public.model_request_files where request_id = any($1)'
    try {
      expect(await h.count(f.ownerA, reqs, both)).toBe(1)
      expect(await h.count(f.ownerA, photos, both)).toBe(2)
      expect(await h.count(f.ownerB, reqs, both)).toBe(1)
      expect(await h.count(f.ownerB, photos, both)).toBe(1)
      expect(await h.count(f.ownerA, files, both)).toBe(0)
      await withTeam(TEAM_DEFAULTS, async () => {
        for (const sql of [reqs, photos, files]) expect(await h.count(f.team, sql, both)).toBe(0)
      })
      await expect(h.probe('', reqs, both, null, 'anon')).rejects.toThrow(/permission denied/)
      await expect(h.probe('', photos, both, null, 'anon')).rejects.toThrow(/permission denied/)
      await withTeam(MODEL_STAFF, async () => {
        expect(await h.count(f.team, reqs, both)).toBe(2)
        expect(await h.count(f.team, photos, both)).toBe(3)
        expect(await h.count(f.team, files, both)).toBe(1)
      })
      expect(await h.count(f.admin, files, both)).toBe(1)
      // No API writes, for anyone.
      for (const who of [f.ownerA, f.admin, f.owner]) {
        await expect(h.probe(who, `insert into public.model_requests (id, business_id, product_id) values ($1, $2, $3)`, [f.free(86), f.bizA, f.productQ])).rejects.toThrow(/permission denied/)
        await expect(h.probe(who, `update public.model_requests set note = 'x' where id = $1`, [rA])).rejects.toThrow(/permission denied/)
        await expect(h.probe(who, `delete from public.model_requests where id = $1`, [rA])).rejects.toThrow(/permission denied/)
        await expect(h.probe(who, `delete from public.model_request_photos where request_id = $1`, [rA])).rejects.toThrow(/permission denied/)
        await expect(h.probe(who, `insert into public.model_request_files (request_id, format, storage_path, file_name) values ($1, 'usdz', 'x', 'x')`, [rA])).rejects.toThrow(/permission denied/)
      }
    } finally {
      await db.query('delete from public.model_requests where id = any($1)', both)
    }
  })

  it('the partial unique index refuses a second open row for the same target (23505) and allows one with another option or after the first is cancelled', async () => {
    const [r1, r2, r3, r4, r5] = [f.free(87), f.free(88), f.free(89), f.free(90), f.free(91)]
    try {
      await insertRequest(db, { id: r1, business: f.bizA, product: f.productP, status: 'requested' })
      await expect(insertRequest(db, { id: r2, business: f.bizA, product: f.productP, status: 'in_progress' })).rejects.toMatchObject({ code: '23505' })
      await insertRequest(db, { id: r3, business: f.bizA, product: f.productP, variant: f.variantV, status: 'requested' })
      await expect(insertRequest(db, { id: r4, business: f.bizA, product: f.productP, variant: f.variantV, status: 'requested' })).rejects.toMatchObject({ code: '23505' })
      await db.query(`update public.model_requests set status = 'cancelled', closed_at = now() where id = $1`, [r1])
      await insertRequest(db, { id: r5, business: f.bizA, product: f.productP, status: 'requested' })
      // Rows must match the target's business, and a rejected row needs a reason.
      await expect(insertRequest(db, { id: r2, business: f.bizB, product: f.productP, status: 'delivered' })).rejects.toMatchObject({ code: '23503' })
      await expect(db.query(`insert into public.model_requests (id, business_id, product_id, status, closed_at) values ($1, $2, $3, 'rejected', now())`, [r2, f.bizA, f.productQ])).rejects.toMatchObject({ code: '23514' })
      await expect(db.query(`insert into public.model_requests (id, business_id, product_id, status) values ($1, $2, $3, 'delivered')`, [r2, f.bizA, f.productQ])).rejects.toMatchObject({ code: '23514' })
    } finally {
      await db.query('delete from public.model_requests where id = any($1)', [[r1, r2, r3, r4, r5]])
    }
  })

  it('model-request-photos: anon and other businesses are refused; products.view alone reads nothing; the key reads; members insert {own}/{uuid}/{uuid}.jpg only before the request exists; delete while cancelled or absent, not while requested', async () => {
    const B = 'model-request-photos'
    const sent = f.free(92)
    const draft = f.free(93)
    const cancelled = f.free(94)
    const pathIn = (req: string, n: number, ext = 'jpg') => `${f.bizA}/${req}/${f.free(n)}.${ext}`
    await insertRequest(db, { id: sent, business: f.bizA, product: f.productP, status: 'requested' })
    await insertRequest(db, { id: cancelled, business: f.bizA, product: f.productQ, status: 'cancelled' })
    for (const p of [pathIn(sent, 50), pathIn(draft, 51), pathIn(cancelled, 52)]) await putObject(db, B, p)
    const read = `select count(*)::int as n from storage.objects where bucket_id = '${B}' and name like $1`
    const like = [`${f.bizA}/%`]
    const insert = (name: string) => `insert into storage.objects (bucket_id, name) values ('${B}', '${name}')`
    const del = (name: string) => `delete from storage.objects where bucket_id = '${B}' and name = '${name}'`
    try {
      expect(await h.count('', read, like, null, 'anon')).toBe(0)
      expect(await h.count(f.ownerB, read, like)).toBe(0)
      expect(await h.count(f.ownerA, read, like)).toBe(3)
      await withTeam(['products.view'], async () => {
        expect(await h.count(f.team, read, like)).toBe(0)
      })
      await withTeam(MODEL_STAFF, async () => {
        expect(await h.count(f.team, read, like)).toBe(3)
      })

      expect(await h.affected(f.ownerA, insert(pathIn(draft, 53)))).toBe(1)
      expect(await h.affected(f.ownerA, insert(pathIn(draft, 54, 'webp')))).toBe(1)
      await expect(h.probe(f.ownerB, insert(pathIn(draft, 55)))).rejects.toThrow(/row-level security/)
      await expect(h.probe(f.ownerA, insert(pathIn(sent, 56)))).rejects.toThrow(/row-level security/)
      await expect(h.probe(f.ownerA, insert(`${f.bizA}/not-a-uuid/${f.free(57)}.jpg`))).rejects.toThrow(/row-level security/)
      await expect(h.probe(f.ownerA, insert(`${f.bizA}/${draft}/${f.free(58)}.gif`))).rejects.toThrow(/row-level security/)
      await expect(h.probe(f.ownerA, insert(`new/${draft}/${f.free(59)}.jpg`))).rejects.toThrow(/row-level security/)
      await expect(h.probe('', insert(pathIn(draft, 60)), [], null, 'anon')).rejects.toThrow(/row-level security/)

      expect(await h.affected(f.ownerA, del(pathIn(draft, 51)))).toBe(1)
      expect(await h.affected(f.ownerA, del(pathIn(cancelled, 52)))).toBe(1)
      expect(await h.affected(f.ownerA, del(pathIn(sent, 50)))).toBe(0)
      expect(await h.affected(f.ownerB, del(pathIn(draft, 51)))).toBe(0)
      expect(await h.affected(f.admin, del(pathIn(sent, 50)))).toBe(1) // clean-up with products.delete / businesses.delete
      // No update policy.
      expect(await h.affected(f.ownerA, `update storage.objects set name = name where bucket_id = '${B}'`)).toBe(0)
    } finally {
      await db.query(`delete from storage.objects where bucket_id = $1`, [B])
      await db.query('delete from public.model_requests where id = any($1)', [[sent, cancelled]])
    }
  })

  it('a business owner reads model_request_delivered, model_request_rejected and business_own_models_changed of their business only; Team with the key reads model_request_* events, Team without it does not', async () => {
    const types = ['model_request_created', 'model_request_cancelled', 'model_request_started', 'model_request_delivered', 'model_request_rejected', 'business_own_models_changed']
    await db.query(`delete from public.audit_events where business_id = any($1) and event_type = any($2)`, [[f.bizA, f.bizB], types])
    for (const biz of [f.bizA, f.bizB]) {
      for (const t of types) await db.query(`insert into public.audit_events (event_type, business_id, metadata) values ($1, $2, '{}')`, [t, biz])
    }
    const read = (biz: string) => `select coalesce(array_agg(event_type order by event_type), '{}') as r from public.audit_events where business_id = '${biz}' and event_type = any(array['${types.join("','")}'])`
    const owned = ['business_own_models_changed', 'model_request_delivered', 'model_request_rejected']
    try {
      expect(await h.call(f.ownerA, read(f.bizA))).toEqual(owned)
      expect(await h.call(f.ownerA, read(f.bizB))).toEqual([])
      await withTeam(TEAM_DEFAULTS, async () => {
        expect(await h.call(f.team, read(f.bizA))).toEqual([])
      })
      await withTeam(MODEL_STAFF, async () => {
        expect(await h.call(f.team, read(f.bizA))).toEqual(types.filter((t) => t.startsWith('model_request_')).sort())
      })
    } finally {
      await db.query(`delete from public.audit_events where business_id = any($1) and event_type = any($2)`, [[f.bizA, f.bizB], types])
    }
  })

  it('anon cannot execute any function this migration creates; private trigger functions are not executable by authenticated', async () => {
    const fns = GONE_AFTER_ROLLBACK.filter((n) => n.includes('('))
    for (const fn of fns) {
      const { rows } = await db.query<{ anon: boolean; auth: boolean }>(
        `select has_function_privilege('anon', $1::regprocedure, 'execute') as anon, has_function_privilege('authenticated', $1::regprocedure, 'execute') as auth`, [fn])
      expect({ fn, anon: rows[0]!.anon }).toEqual({ fn, anon: false })
      if (fn.startsWith('private.')) expect({ fn, auth: rows[0]!.auth }).toEqual({ fn, auth: false })
    }
    const all = (await db.query<{ fn: string }>(
      `select p.oid::regprocedure::text as fn from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'private') and p.proname in ('my_platform_access', 'admin_set_role_permissions', 'permission_prerequisites')
          and has_function_privilege('anon', p.oid, 'execute')`)).rows
    expect(all).toEqual([])
  })

  describe('migration-time behaviour (fresh databases)', () => {
    it('backfills: the Admin set gains models.manage with one audit row; Team unchanged; a business with only a variant GLB gets true, one with photos only gets false; existing rows keep their dates', async () => {
      const pre = await freshDb((n) => n < S4_MIGRATION)
      const x = ids(2)
      try {
        await pre.exec(`
          insert into public.businesses (id, name, slug, status) values ('${x(10)}', 'Variant GLB', 'bf-variant', 'active'),
            ('${x(11)}', 'Photos only', 'bf-photos', 'active'), ('${x(12)}', 'Product GLB', 'bf-product', 'active');
          insert into public.products (id, business_id, slug, name, category, price, currency, width, height, depth, dimension_unit) values
            ('${x(20)}', '${x(10)}', 'a', '{"en":"A"}', 'sofa', 1, 'EUR', 1, 1, 1, 'cm'),
            ('${x(21)}', '${x(11)}', 'b', '{"en":"B"}', 'sofa', 1, 'EUR', 1, 1, 1, 'cm'),
            ('${x(22)}', '${x(12)}', 'c', '{"en":"C"}', 'sofa', 1, 'EUR', 1, 1, 1, 'cm');
          insert into public.product_variants (id, product_id, name) values ('${x(30)}', '${x(20)}', '{"en":"Oak"}');
          insert into public.product_variant_models (variant_id, product_id, format, storage_path, file_name)
            values ('${x(30)}', '${x(20)}', 'glb', '${x(10)}/${x(40)}.glb', 'v.glb');
          insert into public.product_images (product_id, storage_path) values ('${x(21)}', '${x(11)}/${x(41)}.jpg');
          insert into public.product_models (product_id, format, url, file_name) values ('${x(22)}', 'usdz', 'https://cdn.test/c.usdz', 'c.usdz');
          alter table public.businesses disable trigger businesses_set_updated_at;
          update public.businesses set updated_at = '2026-01-01T00:00:00Z' where id in ('${x(10)}', '${x(11)}', '${x(12)}');
          alter table public.businesses enable trigger businesses_set_updated_at;
        `)
        const team = (await pre.query<{ p: string }>(`select permission as p from public.platform_role_permissions where role = 'team' order by 1`)).rows.map((r) => r.p)
        expect((await pre.query(`select 1 from public.platform_role_permissions where role = 'admin'`)).rows).toHaveLength(15)

        await pre.exec(readFileSync(join(MIGRATIONS, S4_MIGRATION), 'utf8'))

        const admin = (await pre.query<{ p: string }>(`select permission as p from public.platform_role_permissions where role = 'admin'`)).rows.map((r) => r.p)
        expect(admin).toHaveLength(16)
        expect(admin).toContain('models.manage')
        expect((await pre.query<{ p: string }>(`select permission as p from public.platform_role_permissions where role = 'team' order by 1`)).rows.map((r) => r.p)).toEqual(team)
        expect((await pre.query(`select actor_id, metadata from public.audit_events where event_type = 'access_permissions_changed'`)).rows).toEqual([
          { actor_id: null, metadata: { role: 'admin', added: ['models.manage'], removed: [], reason: 'model_requests_backfill' } },
        ])
        const flags = (await pre.query<{ slug: string; a: boolean; u: Date }>(`select slug, allow_own_models as a, updated_at as u from public.businesses where id in ('${x(10)}', '${x(11)}', '${x(12)}') order by slug`)).rows
        expect(flags.map(({ slug, a }) => ({ slug, a }))).toEqual([{ slug: 'bf-photos', a: false }, { slug: 'bf-product', a: true }, { slug: 'bf-variant', a: true }])
        for (const r of flags) expect(new Date(r.u).toISOString()).toBe('2026-01-01T00:00:00.000Z')
        // New businesses start with the switch off.
        await pre.query(`insert into public.businesses (id, name, slug, status) values ('${x(13)}', 'New', 'bf-new', 'draft')`)
        expect((await pre.query<{ a: boolean }>(`select allow_own_models as a from public.businesses where id = '${x(13)}'`)).rows[0]!.a).toBe(false)
      } finally {
        await pre.close()
      }
    }, 60_000)

    it('the migration refuses when model-request-photos exists and is public', async () => {
      const pre = await freshDb((n) => n < S4_MIGRATION)
      try {
        await pre.query(`insert into storage.buckets (id, name, public) values ('model-request-photos', 'model-request-photos', true)`)
        await expect(pre.exec(readFileSync(join(MIGRATIONS, S4_MIGRATION), 'utf8'))).rejects.toThrow(/model-request-photos exists and is public/)
      } finally {
        await pre.close()
      }
    }, 60_000)
  })

  it('the bucket is private, 10 MB, JPG/PNG/WebP only', async () => {
    expect((await db.query(`select public, file_size_limit::int as size, allowed_mime_types as types from storage.buckets where id = 'model-request-photos'`)).rows).toEqual([
      { public: false, size: 10485760, types: ['image/jpeg', 'image/png', 'image/webp'] },
    ])
  })

  it('can_write_own_models answers per caller and business', async () => {
    expect(await h.flag(f.ownerA, `public.can_write_own_models('${f.bizA}')`)).toBe(false)
    expect(await h.flag(f.ownerB, `public.can_write_own_models('${f.bizB}')`)).toBe(true)
    expect(await h.flag(f.ownerB, `public.can_write_own_models('${f.bizA}')`)).toBe(false)
    expect(await h.flag(f.admin, `public.can_write_own_models('${f.bizA}')`)).toBe(true)
    await withTeam(MODEL_STAFF, async () => {
      expect(await h.flag(f.team, `public.can_write_own_models('${f.bizA}')`)).toBe(true)
    })
    await withTeam(['analytics.view'], async () => {
      expect(await h.flag(f.team, `public.can_write_own_models('${f.bizA}')`)).toBe(false)
    })
  })
})

describe('S4 rollback', () => {
  /** What the S4 migration redefines, as definitions, to compare with a database that never had it. */
  async function definitions(target: PGlite) {
    const fn = async (sig: string) =>
      (await target.query<{ d: string }>(`select pg_get_functiondef($1::regprocedure) as d`, [sig])).rows[0]!.d.replace(/\r\n/g, '\n')
    return {
      policies: (await target.query(
        `select schemaname, tablename, policyname, cmd, roles::text, qual, with_check from pg_policies order by 1, 2, 3`)).rows,
      access: await fn('public.my_platform_access()'),
      roles: await fn('public.admin_set_role_permissions(public.platform_role, text[])'),
      prereq: await fn('private.permission_prerequisites()'),
      save: await fn('public.save_product(jsonb, jsonb, jsonb, jsonb)'),
      check: (await target.query<{ d: string }>(
        `select pg_get_constraintdef(oid) as d from pg_constraint where conrelid = 'public.platform_role_permissions'::regclass and contype = 'c'`)).rows,
      buckets: (await target.query(`select id from storage.buckets order by 1`)).rows,
      columns: (await target.query(
        `select table_name, column_name from information_schema.columns
          where table_schema = 'public' and table_name in ('businesses', 'products') order by 1, 2`)).rows,
    }
  }

  it('apply → rollback → re-apply succeeds; every GONE_AFTER_ROLLBACK name is gone; policies, my_platform_access, admin_set_role_permissions, permission_prerequisites and save_product equal a database before S4', async () => {
    const before = await freshDb((n) => n < S4_MIGRATION)
    const rolled = await freshDb()
    try {
      const pre = await definitions(before)
      expect(GONE_AFTER_ROLLBACK.length).toBeGreaterThan(0)
      await rolled.exec(readFileSync(S4_ROLLBACK_SQL, 'utf8'))

      for (const name of GONE_AFTER_ROLLBACK) {
        const fn = name.includes('(')
        const { rows } = await rolled.query<{ o: string | null }>(`select ${fn ? 'to_regprocedure' : 'to_regclass'}($1)::text as o`, [name])
        expect({ name, o: rows[0]!.o }).toEqual({ name, o: null })
      }
      expect(await definitions(rolled)).toEqual(pre)
      // models.manage left the role sets with an audit row; Admin is back to its 15 keys.
      expect((await rolled.query(`select 1 from public.platform_role_permissions where role = 'admin'`)).rows).toHaveLength(15)
      expect((await rolled.query(`select metadata from public.audit_events where event_type = 'access_permissions_changed' and metadata ->> 'reason' = 'model_requests_rollback'`)).rows)
        .toEqual([{ metadata: { role: 'admin', added: [], removed: ['models.manage'], reason: 'model_requests_rollback' } }])

      await rolled.exec(readFileSync(join(MIGRATIONS, S4_MIGRATION), 'utf8'))
      expect((await rolled.query(`select to_regclass('public.model_requests')::text as o`)).rows[0]).toEqual({ o: 'model_requests' })
    } finally {
      await before.close()
      await rolled.close()
    }
  }, 120_000)

  it('fix round 1: a refused bucket delete (hosted storage.protect_delete) is only a notice; the rest of the rollback commits', async () => {
    const rolled = await freshDb()
    try {
      // Hosted Storage refuses direct deletes from its tables (storage.protect_delete); stand in with a trigger.
      await rolled.exec(`
        create function storage.refuse_delete() returns trigger language plpgsql as $$
        begin raise exception 'Direct deletion from storage tables is not allowed'; end; $$;
        create trigger refuse_delete before delete on storage.buckets for each row execute function storage.refuse_delete();`)
      await rolled.exec(readFileSync(S4_ROLLBACK_SQL, 'utf8'))
      expect((await rolled.query(`select to_regclass('public.model_requests') as t`)).rows[0]).toEqual({ t: null })
      expect((await rolled.query(`select 1 from storage.buckets where id = 'model-request-photos'`)).rows).toHaveLength(1)
    } finally {
      await rolled.close()
    }
  }, 60_000)

  it('rollback raises model_request_photos_not_empty while the bucket has objects', async () => {
    const rolled = await freshDb()
    try {
      await putObject(rolled, 'model-request-photos', `${ids(1)(10)}/${ids(1)(50)}/${ids(1)(51)}.jpg`)
      await expect(rolled.exec(readFileSync(S4_ROLLBACK_SQL, 'utf8'))).rejects.toThrow(/model_request_photos_not_empty/)
    } finally {
      await rolled.close()
    }
  }, 60_000)
})

// ---- S4 Task 3 tests ----
// ---- end S4 Task 3 tests ----

// ---- S4 Task 4 tests ----
// ---- end S4 Task 4 tests ----

// ---- S4 Task 6 tests ----
// ---- end S4 Task 6 tests ----

// ---- S4 Task 7 tests ----
// ---- end S4 Task 7 tests ----

// ---- S4 Task 8 tests ----
describe('S4 Task 8: clean-up paths', () => {
  GONE_AFTER_ROLLBACK.push('public.model_request_storage_paths(uuid)')
  let f: S4Fixture
  const id8 = ids(8)
  const reqCancelled = id8(50)
  const reqOpenV = id8(51)
  const reqPlain = id8(52)
  const reqOther = id8(53)
  const photo = (biz: string, req: string, n: number) => `${biz}/${req}/${id8(60 + n)}.jpg`
  const count = async (table: string, where: string, params: unknown[]) =>
    Number((await db.query<{ n: string }>(`select count(*)::text as n from public.${table} where ${where}`, params)).rows[0]!.n)

  beforeAll(async () => {
    f = await seedS4(db, 8)
    // P: a delivered request for the product itself, and an open one for option V; R (business B): one request.
    await insertRequest(db, { id: reqPlain, business: f.bizA, product: f.productP, status: 'delivered', photos: [photo(f.bizA, reqPlain, 1), photo(f.bizA, reqPlain, 2)] })
    await insertRequest(db, { id: reqOpenV, business: f.bizA, product: f.productP, variant: f.variantV, status: 'in_progress', photos: [photo(f.bizA, reqOpenV, 3), photo(f.bizA, reqOpenV, 4)] })
    await insertRequest(db, { id: reqCancelled, business: f.bizA, product: f.productQ, status: 'cancelled', photos: [photo(f.bizA, reqCancelled, 5)] })
    await insertRequest(db, { id: reqOther, business: f.bizB, product: f.productR, status: 'requested', photos: [photo(f.bizB, reqOther, 6), photo(f.bizB, reqOther, 7)] })
    await db.query(
      `insert into public.model_request_files (request_id, format, storage_path, file_name, size_bytes) values ($1, 'glb', $2, 'staged.glb', 10)`,
      [reqOpenV, `${f.bizA}/${id8(70)}.glb`])
  })

  const paths = (user: string, product: string) => h.call(user, 'select public.model_request_storage_paths($1) as r', [product])

  it('the owner and a products.delete staff member get the photo and staged paths; another business owner and Team without products.delete get forbidden', async () => {
    const expected = [
      { bucket: 'model-request-photos', path: photo(f.bizA, reqPlain, 1), variant_id: null },
      { bucket: 'model-request-photos', path: photo(f.bizA, reqPlain, 2), variant_id: null },
      { bucket: 'model-request-photos', path: photo(f.bizA, reqOpenV, 3), variant_id: f.variantV },
      { bucket: 'model-request-photos', path: photo(f.bizA, reqOpenV, 4), variant_id: f.variantV },
      { bucket: 'product-media', path: `${f.bizA}/${id8(70)}.glb`, variant_id: f.variantV },
    ].sort((a, b) => (a.bucket + a.path < b.bucket + b.path ? -1 : 1))
    expect(await paths(f.ownerA, f.productP)).toEqual(expected)
    expect(await paths(f.admin, f.productP)).toEqual(expected)
    expect(await paths(f.owner, f.productP)).toEqual(expected)
    // A product without requests gives an empty list, never null.
    expect(await paths(f.ownerB, f.productR)).toHaveLength(2)
    expect(await paths(f.ownerA, f.productQ)).toEqual([{ bucket: 'model-request-photos', path: photo(f.bizA, reqCancelled, 5), variant_id: null }])
    await expect(h.probe(f.ownerB, 'select public.model_request_storage_paths($1)', [f.productP])).rejects.toMatchObject({ message: 'forbidden', code: '42501' })
    await expect(h.probe(f.ownerA, 'select public.model_request_storage_paths($1)', [f.productR])).rejects.toMatchObject({ message: 'forbidden' })
    await withTeam(TEAM_DEFAULTS, async () => {
      await expect(h.probe(f.team, 'select public.model_request_storage_paths($1)', [f.productP])).rejects.toMatchObject({ message: 'forbidden', code: '42501' })
    })
    await withTeam([...TEAM_DEFAULTS, 'products.delete'], async () => {
      expect(await paths(f.team, f.productP)).toEqual(expected)
    })
    await expect(h.probe(f.ownerA, 'select public.model_request_storage_paths($1)', [f.free(99)])).rejects.toMatchObject({ message: 'forbidden' })
  })

  it('refuses at aal1 when the 2FA policy is on, and anon cannot call it', async () => {
    await h.withPolicy(false, true, async () => {
      await expect(h.probe(f.ownerA, 'select public.model_request_storage_paths($1)', [f.productP], 'aal1')).rejects.toMatchObject({ message: 'aal2_required', code: '42501' })
    })
    await expect(h.probe('', 'select public.model_request_storage_paths($1)', [f.productP], null, 'anon')).rejects.toBeDefined()
  })

  it('deleting an option cascades only that option requests, photo rows and staged rows', async () => {
    await db.query('delete from public.product_variants where id = $1', [f.variantV])
    expect(await count('model_requests', 'id = $1', [reqOpenV])).toBe(0)
    expect(await count('model_request_photos', 'request_id = $1', [reqOpenV])).toBe(0)
    expect(await count('model_request_files', 'request_id = $1', [reqOpenV])).toBe(0)
    expect(await count('model_requests', 'id = $1', [reqPlain])).toBe(1)
    expect(await count('model_request_photos', 'request_id = $1', [reqPlain])).toBe(2)
  })

  it('deleting the product cascades its requests, photo rows and staged rows, and leaves other products alone', async () => {
    await db.query('delete from public.products where id = $1', [f.productP])
    expect(await count('model_requests', 'product_id = $1', [f.productP])).toBe(0)
    expect(await count('model_request_photos', 'request_id = $1', [reqPlain])).toBe(0)
    expect(await count('model_requests', 'id = any($1::uuid[])', [[reqCancelled, reqOther]])).toBe(2)
    expect(await count('model_request_photos', 'request_id = any($1::uuid[])', [[reqCancelled, reqOther]])).toBe(3)
  })
})
// ---- end S4 Task 8 tests ----

// Fixture helpers for the later tasks' describes (referenced here so the linter sees them used before those exist).
void [seedS4, putObject, insertRequest, expectStaffGate, withTeam]
