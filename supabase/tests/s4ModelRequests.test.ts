// @vitest-environment node
// S4 3D model requests (docs/superpowers/specs/2026-10-26-s4-3d-model-requests-design.md): one describe per task, on
// the shared PGlite harness. Each describe seeds its own rows with seedS4(db, task) (ids(task)), so describes are
// independent; a test that changes shared settings (role sets, the 2FA policy) restores them before it ends.
//
// Slots: Task 1 owns the fixtures, its describe and the rollback describe. Tasks 3, 4, 6, 7 and 8 put their whole
// describe between their own `// ---- S4 Task N tests ----` markers at the end of this file, and call
// GONE_AFTER_ROLLBACK.push(...) at their describe's body level.
import { randomUUID } from 'node:crypto'
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
describe('S4 Task 3: save and storage with the switch', () => {
  // save_product and two storage policies are redefinitions (the rollback describe compares them with a database
  // before S4). The stamp trigger function is new: save_product runs as the caller, who has no grant on
  // models_changed_at.
  GONE_AFTER_ROLLBACK.push('private.stamp_models_changed()')
  let f: S4Fixture
  const OLD = '2026-01-01T00:00:00+00:00'
  beforeAll(async () => {
    f = await seedS4(db, 3)
    // P (switch off) has a product GLB and option V a GLB; R (switch on) has a product GLB. Seeded as the database owner.
    await db.exec(`
      insert into public.product_models (product_id, format, storage_path, file_name, created_at) values
        ('${f.productP}', 'glb', '${f.bizA}/${f.free(60)}.glb', 'p.glb', '${OLD}'),
        ('${f.productR}', 'glb', '${f.bizB}/${f.free(61)}.glb', 'r.glb', '${OLD}');
      insert into public.product_variant_models (variant_id, product_id, format, storage_path, file_name, created_at) values
        ('${f.variantV}', '${f.productP}', 'glb', '${f.bizA}/${f.free(62)}.glb', 'v.glb', '${OLD}');`)
  })

  type Tx = Parameters<Parameters<Helpers['as']>[1]>[0]
  const ROLL = new Error('rollback')
  /** Runs `fn` in one transaction as `uid`, returns its value and rolls everything back. */
  async function inTx<T>(uid: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    let out: T | undefined
    try {
      await h.as(uid, async (tx) => {
        out = await fn(tx)
        throw ROLL
      })
    } catch (e) {
      if (e !== ROLL) throw e
    }
    return out as T
  }
  const model = (format: 'glb' | 'usdz', path: string, file = `m.${format}`) => ({ format, storage_path: path, file_name: file, size_bytes: 1000 })
  const productP = (extra: Record<string, unknown> = {}) => ({
    id: f.productP, business_id: f.bizA, slug: 'p', name: { en: 'Sofa P renamed' }, category: 'sofa', price: 100000,
    currency: 'EUR', width: 200, height: 80, depth: 90, dimension_unit: 'cm', ...extra,
  })
  const productR = (extra: Record<string, unknown> = {}) => ({
    id: f.productR, business_id: f.bizB, slug: 'r', name: { en: 'Table R renamed' }, category: 'table', price: 50000,
    currency: 'EUR', width: 160, height: 75, depth: 90, dimension_unit: 'cm', ...extra,
  })
  const storedP = () => [model('glb', `${f.bizA}/${f.free(60)}.glb`, 'p.glb')]
  const storedR = () => [model('glb', `${f.bizB}/${f.free(61)}.glb`, 'r.glb')]
  const optionV = (models = [model('glb', `${f.bizA}/${f.free(62)}.glb`, 'v.glb')]) => ({ id: f.variantV, name: { en: 'Oak' }, images: [], models })
  const SAVE = `select public.save_product($1::jsonb, '[]'::jsonb, $2::jsonb, $3::jsonb) as r`
  const args = (p: unknown, models: unknown, variants: unknown) => [JSON.stringify(p), JSON.stringify(models), JSON.stringify(variants)]
  const state = async (tx: Tx, product: string) => ({
    name: (await tx.query<{ n: string }>(`select name ->> 'en' as n from public.products where id = $1`, [product])).rows[0]!.n,
    changedAt: (await tx.query<{ t: string | null }>(`select models_changed_at::text as t from public.products where id = $1`, [product])).rows[0]!.t,
    models: (await tx.query(`select format, storage_path, created_at = '${OLD}'::timestamptz as old from public.product_models where product_id = $1 order by format`, [product])).rows,
    variantModels: (await tx.query(`select variant_id, format, created_at = '${OLD}'::timestamptz as old from public.product_variant_models where product_id = $1 order by 1, 2`, [product])).rows,
    options: (await tx.query(`select id from public.product_variants where product_id = $1`, [product])).rows.length,
  })
  const committed = async (product: string) => {
    let s: Awaited<ReturnType<typeof state>> | undefined
    await db.transaction(async (tx) => {
      s = await state(tx, product)
    })
    return s!
  }

  it('switch off, owner: an extra usdz row → own_models_not_allowed and nothing written; unchanged models → saved; keep_models with a changed name → saved and model rows untouched; deleting an option with a GLB → allowed', async () => {
    const before = await committed(f.productP)
    const extra = [...storedP(), model('usdz', `${f.bizA}/${f.free(63)}.usdz`)]
    await expect(h.call(f.ownerA, SAVE, args(productP(), extra, [optionV()]))).rejects.toMatchObject({ message: 'own_models_not_allowed', code: '42501' })
    expect(await committed(f.productP)).toEqual(before)
    // A changed option model, and removing the product GLB, are changes too.
    await expect(h.call(f.ownerA, SAVE, args(productP(), storedP(), [optionV([model('glb', `${f.bizA}/${f.free(64)}.glb`)])])))
      .rejects.toMatchObject({ message: 'own_models_not_allowed' })
    await expect(h.call(f.ownerA, SAVE, args(productP(), [], [optionV()]))).rejects.toMatchObject({ message: 'own_models_not_allowed' })
    expect(await committed(f.productP)).toEqual(before)

    const unchanged = await inTx(f.ownerA, async (tx) => {
      await tx.query(SAVE, args(productP(), storedP(), [optionV()]))
      return state(tx, f.productP)
    })
    expect(unchanged).toEqual({ ...before, name: 'Sofa P renamed' })

    const kept = await inTx(f.ownerA, async (tx) => {
      await tx.query(SAVE, args(productP({ keep_models: true }), [], [optionV([])]))
      return state(tx, f.productP)
    })
    expect(kept).toEqual({ ...before, name: 'Sofa P renamed' })

    const dropped = await inTx(f.ownerA, async (tx) => {
      await tx.query(SAVE, args(productP({ keep_models: true }), [], []))
      return state(tx, f.productP)
    })
    expect(dropped).toMatchObject({ options: 0, variantModels: [], models: before.models })
  })

  it('switch on, owner, and Admin (products.edit) with the switch off: a changed model set is saved and models_changed_at is set', async () => {
    const usdz = model('usdz', `${f.bizB}/${f.free(65)}.usdz`)
    const onB = await inTx(f.ownerB, async (tx) => {
      await tx.query(SAVE, args(productR({ expected_models_changed_at: null }), [...storedR(), usdz], []))
      return state(tx, f.productR)
    })
    expect(onB.models).toEqual([
      { format: 'glb', storage_path: `${f.bizB}/${f.free(61)}.glb`, old: false },
      { format: 'usdz', storage_path: usdz.storage_path, old: false },
    ])
    expect(onB.changedAt).not.toBeNull()

    const byAdmin = await inTx(f.admin, async (tx) => {
      await tx.query(SAVE, args(productP({ expected_models_changed_at: null }), [], [optionV([model('glb', `${f.bizA}/${f.free(66)}.glb`)])]))
      return state(tx, f.productP)
    })
    expect(byAdmin.models).toEqual([])
    expect(byAdmin.variantModels).toEqual([{ variant_id: f.variantV, format: 'glb', old: false }])
    expect(byAdmin.changedAt).not.toBeNull()
  })

  it('unchanged models leave models_changed_at as it was; an old client that resends unchanged models (no keep_models, no expected_models_changed_at) saves fine', async () => {
    for (const p of [productP({ expected_models_changed_at: null }), productP()]) {
      const s = await inTx(f.ownerA, async (tx) => {
        await tx.query(SAVE, args(p, storedP(), [optionV()]))
        return state(tx, f.productP)
      })
      expect(s).toMatchObject({ name: 'Sofa P renamed', changedAt: null })
      expect(s.models).toEqual([{ format: 'glb', storage_path: `${f.bizA}/${f.free(60)}.glb`, old: true }])
      expect(s.variantModels).toEqual([{ variant_id: f.variantV, format: 'glb', old: true }])
    }
  })

  it('expected_models_changed_at older than the stored value (or null) and a changed set → models_changed_elsewhere, nothing written; with keep_models or unchanged models → saved', async () => {
    await db.query(`update public.products set models_changed_at = '2026-03-03 00:00:00+00' where id = $1`, [f.productR])
    try {
      const before = await committed(f.productR)
      const changed = [...storedR(), model('usdz', `${f.bizB}/${f.free(67)}.usdz`)]
      for (const expected of ['2026-03-02T00:00:00Z', null]) {
        await expect(h.call(f.ownerB, SAVE, args(productR({ expected_models_changed_at: expected }), changed, [])))
          .rejects.toMatchObject({ message: 'models_changed_elsewhere', code: 'P0001' })
      }
      expect(await committed(f.productR)).toEqual(before)
      // The value the editor loaded: saved, and the stamp moves.
      const fresh = await inTx(f.ownerB, async (tx) => {
        await tx.query(SAVE, args(productR({ expected_models_changed_at: '2026-03-03T00:00:00Z' }), changed, []))
        return state(tx, f.productR)
      })
      expect(fresh.models).toHaveLength(2)
      expect(fresh.changedAt).not.toBe(before.changedAt)
      const stale = '2026-03-02T00:00:00Z'
      for (const [p, models] of [[productR({ expected_models_changed_at: stale, keep_models: true }), []], [productR({ expected_models_changed_at: stale }), storedR()]] as const) {
        const s = await inTx(f.ownerB, async (tx) => {
          await tx.query(SAVE, args(p, models, []))
          return state(tx, f.productR)
        })
        expect(s).toEqual({ ...before, name: 'Table R renamed' })
      }
    } finally {
      await db.query(`update public.products set models_changed_at = null where id = $1`, [f.productR])
    }
  })

  it('storage, switch off: an owner insert of {business}/{uuid}.glb and .usdz is refused, .png allowed; switch on: all allowed; a first folder that is not a uuid is refused without an error', async () => {
    const insert = (name: string) => `insert into storage.objects (bucket_id, name) values ('product-media', '${name}')`
    for (const ext of ['glb', 'usdz', 'GLB']) {
      await expect(h.probe(f.ownerA, insert(`${f.bizA}/${f.free(70)}.${ext}`))).rejects.toThrow(/row-level security/)
    }
    expect(await h.affected(f.ownerA, insert(`${f.bizA}/${f.free(70)}.png`))).toBe(1)
    for (const ext of ['glb', 'usdz', 'png']) {
      expect(await h.affected(f.ownerB, insert(`${f.bizB}/${f.free(71)}.${ext}`))).toBe(1)
      expect(await h.affected(f.admin, insert(`${f.bizA}/${f.free(72)}.${ext}`))).toBe(1)
    }
    await expect(h.probe(f.ownerA, insert(`not-a-uuid/${f.free(73)}.glb`))).rejects.toThrow(/row-level security/)
    await expect(h.probe(f.ownerA, insert(`not-a-uuid/${f.free(73)}.png`))).rejects.toThrow(/row-level security/)
    // Update: renaming an image to a .glb is refused with the switch off, allowed with it on.
    await putObject(db, 'product-media', `${f.bizA}/${f.free(74)}.png`)
    await putObject(db, 'product-media', `${f.bizB}/${f.free(75)}.png`)
    try {
      await expect(h.probe(f.ownerA, `update storage.objects set name = '${f.bizA}/${f.free(74)}.glb' where name = '${f.bizA}/${f.free(74)}.png'`))
        .rejects.toThrow(/row-level security/)
      expect(await h.affected(f.ownerB, `update storage.objects set name = '${f.bizB}/${f.free(75)}.glb' where name = '${f.bizB}/${f.free(75)}.png'`)).toBe(1)
    } finally {
      await db.query(`delete from storage.objects where name in ($1, $2)`, [`${f.bizA}/${f.free(74)}.png`, `${f.bizB}/${f.free(75)}.png`])
    }
  })
})
// ---- end S4 Task 3 tests ----

// ---- S4 Task 4 tests ----
describe('S4 Task 4: request and cancel', () => {
  GONE_AFTER_ROLLBACK.push('public.request_model(uuid,uuid,uuid,text,jsonb)', 'public.cancel_model_request(uuid)')
  const B = 'model-request-photos'
  const SEND = 'select public.request_model($1, $2, $3, $4, $5::jsonb) as r'
  let f: S4Fixture
  beforeAll(async () => {
    f = await seedS4(db, 4)
  })

  /** n uploaded photos under {biz}/{request}/ (objects put as the database owner), as p_photos entries. */
  async function upload(biz: string, request: string, n: number) {
    const photos = []
    for (let i = 0; i < n; i++) {
      const path = `${biz}/${request}/${randomUUID()}.jpg`
      await putObject(db, B, path)
      photos.push({ storage_path: path, file_name: `photo-${i + 1}.jpg`, size_bytes: 1000 + i })
    }
    return photos
  }
  const send = (who: string, request: string, product: string, variant: string | null, photos: unknown[], note: string | null = null, aal: 'aal1' | 'aal2' = 'aal1') =>
    h.call(who, SEND, [request, product, variant, note, JSON.stringify(photos)], aal)
  const refuse = (who: string, request: string, product: string, variant: string | null, photos: unknown[], note: string | null = null) =>
    h.probe(who, SEND, [request, product, variant, note, JSON.stringify(photos)])
  const written = async () => ({
    requests: (await db.query<{ n: number }>('select count(*)::int as n from public.model_requests where business_id = any($1)', [[f.bizA, f.bizB]])).rows[0]!.n,
    photos: (await db.query<{ n: number }>('select count(*)::int as n from public.model_request_photos p join public.model_requests r on r.id = p.request_id where r.business_id = any($1)', [[f.bizA, f.bizB]])).rows[0]!.n,
    audit: (await db.query<{ n: number }>(`select count(*)::int as n from public.audit_events where business_id = any($1) and event_type like 'model_request_%'`, [[f.bizA, f.bizB]])).rows[0]!.n,
  })
  const clear = async () => {
    await db.query('delete from public.model_requests where business_id = any($1)', [[f.bizA, f.bizB]])
    await db.query(`delete from public.audit_events where business_id = any($1) and event_type like 'model_request_%'`, [[f.bizA, f.bizB]])
    await db.query('delete from storage.objects where bucket_id = $1', [B])
  }

  it('1 photo → model_request_photos_count; 11 → the same; a path in another business\'s folder → model_request_photo_missing; a path under another request id → the same; a path with no object → the same', async () => {
    try {
      const id = randomUUID()
      await expect(refuse(f.ownerA, id, f.productP, null, await upload(f.bizA, id, 1))).rejects.toMatchObject({ message: 'model_request_photos_count', code: '22023' })
      await expect(refuse(f.ownerA, id, f.productP, null, await upload(f.bizA, id, 11))).rejects.toMatchObject({ message: 'model_request_photos_count' })
      const two = await upload(f.bizA, id, 2)
      await expect(refuse(f.ownerA, id, f.productP, null, [two[0], two[0]])).rejects.toMatchObject({ message: 'model_request_photos_count' })
      await expect(refuse(f.ownerA, id, f.productP, null, [two[0], ...(await upload(f.bizB, id, 1))])).rejects.toMatchObject({ message: 'model_request_photo_missing', code: '22023' })
      await expect(refuse(f.ownerA, id, f.productP, null, [two[0], ...(await upload(f.bizA, randomUUID(), 1))])).rejects.toMatchObject({ message: 'model_request_photo_missing' })
      const ghost = { storage_path: `${f.bizA}/${id}/${randomUUID()}.jpg`, file_name: 'ghost.jpg', size_bytes: 10 }
      await expect(refuse(f.ownerA, id, f.productP, null, [two[0], ghost])).rejects.toMatchObject({ message: 'model_request_photo_missing' })
      expect((await written()).requests).toBe(0)
    } finally {
      await clear()
    }
  })

  it('a second open request for the same target → model_request_open; the same product with another option → allowed; after the first is cancelled → allowed', async () => {
    try {
      const first = randomUUID()
      expect(await send(f.ownerA, first, f.productP, null, await upload(f.bizA, first, 2))).toEqual({ id: first, status: 'requested' })
      const second = randomUUID()
      await expect(refuse(f.ownerA, second, f.productP, null, await upload(f.bizA, second, 2))).rejects.toMatchObject({ message: 'model_request_open', code: '23505' })
      const option = randomUUID()
      expect(await send(f.ownerA, option, f.productP, f.variantV, await upload(f.bizA, option, 2))).toEqual({ id: option, status: 'requested' })
      await h.call(f.ownerA, 'select public.cancel_model_request($1) as r', [first])
      expect(await send(f.ownerA, second, f.productP, null, await upload(f.bizA, second, 2))).toEqual({ id: second, status: 'requested' })
    } finally {
      await clear()
    }
  })

  it('a product with depth 0 → model_request_needs_dimensions; an option of another product → model_request_target_invalid; a 1001-character note → model_request_note_too_long; a request id already used → forbidden', async () => {
    try {
      const id = randomUUID()
      const photos = await upload(f.bizA, id, 2)
      await expect(refuse(f.ownerA, id, f.productQ, null, photos)).rejects.toMatchObject({ message: 'model_request_needs_dimensions', code: '22023' })
      await expect(refuse(f.ownerA, id, f.productQ, f.variantV, photos)).rejects.toMatchObject({ message: 'model_request_target_invalid', code: '22023' })
      await expect(refuse(f.ownerA, id, f.productP, null, photos, 'x'.repeat(1001))).rejects.toMatchObject({ message: 'model_request_note_too_long', code: '22023' })
      // Review note (Task 1): the upload policy can't see another business's request, so the function checks the id.
      const taken = randomUUID()
      await insertRequest(db, { id: taken, business: f.bizB, product: f.productR, status: 'cancelled' })
      await expect(refuse(f.ownerA, taken, f.productP, null, await upload(f.bizA, taken, 2))).rejects.toMatchObject({ message: 'forbidden', code: '42501' })
      expect(await send(f.ownerA, id, f.productP, null, photos, 'x'.repeat(1000))).toEqual({ id, status: 'requested' })
    } finally {
      await clear()
    }
  })

  it('a staff caller → forbidden; a member at aal1 with the business 2FA policy on → aal2_required', async () => {
    try {
      const id = randomUUID()
      const photos = await upload(f.bizA, id, 2)
      for (const staff of [f.owner, f.admin]) await expect(refuse(staff, id, f.productP, null, photos)).rejects.toMatchObject({ message: 'forbidden', code: '42501' })
      await withTeam(MODEL_STAFF, async () => {
        await expect(refuse(f.team, id, f.productP, null, photos)).rejects.toMatchObject({ message: 'forbidden' })
      })
      await expect(refuse(f.ownerB, id, f.productP, null, photos)).rejects.toMatchObject({ message: 'forbidden' })
      await h.withPolicy(false, true, async () => {
        await expect(refuse(f.ownerA, id, f.productP, null, photos)).rejects.toMatchObject({ message: 'aal2_required', code: '42501' })
      })
      expect(await written()).toEqual({ requests: 0, photos: 0, audit: 0 })
    } finally {
      await clear()
    }
  })

  it('the request, its photo rows and one model_request_created audit row are written; nothing is written on any refusal', async () => {
    try {
      const bad = randomUUID()
      await expect(refuse(f.ownerA, bad, f.productQ, null, await upload(f.bizA, bad, 2))).rejects.toThrow()
      expect(await written()).toEqual({ requests: 0, photos: 0, audit: 0 })
      const id = randomUUID()
      const photos = await upload(f.bizA, id, 3)
      photos[1]!.file_name = 'n'.repeat(300)
      expect(await send(f.ownerA, id, f.productP, f.variantV, photos, '  Oak legs  ')).toEqual({ id, status: 'requested' })
      expect((await db.query('select business_id, product_id, variant_id, status, note, requested_by, closed_at from public.model_requests where id = $1', [id])).rows)
        .toEqual([{ business_id: f.bizA, product_id: f.productP, variant_id: f.variantV, status: 'requested', note: 'Oak legs', requested_by: f.ownerA, closed_at: null }])
      expect((await db.query('select storage_path, char_length(file_name) as len, size_bytes::int as size, sort_order from public.model_request_photos where request_id = $1 order by sort_order', [id])).rows)
        .toEqual(photos.map((p, i) => ({ storage_path: p.storage_path, len: i === 1 ? 255 : p.file_name.length, size: p.size_bytes, sort_order: i })))
      expect((await db.query(`select actor_id, metadata from public.audit_events where event_type = 'model_request_created' and business_id = $1`, [f.bizA])).rows)
        .toEqual([{ actor_id: f.ownerA, metadata: expect.objectContaining({ request_id: id, product_id: f.productP, variant_id: f.variantV }) }])
    } finally {
      await clear()
    }
  })

  it('cancel when requested → cancelled with closed_at and the photo paths, and the member may then delete those objects; when in_progress → model_request_not_cancellable and nothing changes; another business\'s member → model_request_not_found', async () => {
    const CANCEL = 'select public.cancel_model_request($1) as r'
    try {
      const id = randomUUID()
      const photos = await upload(f.bizA, id, 2)
      await send(f.ownerA, id, f.productP, null, photos)
      await expect(h.probe(f.ownerB, CANCEL, [id])).rejects.toMatchObject({ message: 'model_request_not_found', code: 'P0002' })
      await expect(h.probe(f.admin, CANCEL, [id])).rejects.toMatchObject({ message: 'model_request_not_found' })
      await expect(h.probe(f.ownerA, CANCEL, [randomUUID()])).rejects.toMatchObject({ message: 'model_request_not_found' })
      // Photos of a sent request can't be deleted by the member until it is cancelled.
      const delOne = `delete from storage.objects where bucket_id = '${B}' and name = $1`
      expect(await h.affected(f.ownerA, delOne, [photos[0]!.storage_path])).toBe(0)
      await h.withPolicy(false, true, async () => {
        await expect(h.probe(f.ownerA, CANCEL, [id])).rejects.toMatchObject({ message: 'aal2_required' })
      })
      expect(await h.call(f.ownerA, CANCEL, [id])).toEqual({ status: 'cancelled', photo_paths: photos.map((p) => p.storage_path) })
      const row = (await db.query<{ status: string; closed: boolean }>('select status, closed_at is not null as closed from public.model_requests where id = $1', [id])).rows[0]
      expect(row).toEqual({ status: 'cancelled', closed: true })
      expect((await db.query(`select actor_id from public.audit_events where event_type = 'model_request_cancelled' and business_id = $1`, [f.bizA])).rows).toEqual([{ actor_id: f.ownerA }])
      for (const p of photos) expect(await h.affected(f.ownerA, delOne, [p.storage_path])).toBe(1)
      await expect(h.probe(f.ownerA, CANCEL, [id])).rejects.toMatchObject({ message: 'model_request_not_cancellable', code: 'P0001' })

      const started = randomUUID()
      await insertRequest(db, { id: started, business: f.bizA, product: f.productP, status: 'in_progress' })
      const snapshot = async () => (await db.query('select status, closed_at, updated_at from public.model_requests where id = $1', [started])).rows
      const before = await snapshot()
      await expect(h.probe(f.ownerA, CANCEL, [started])).rejects.toMatchObject({ message: 'model_request_not_cancellable', code: 'P0001' })
      expect(await snapshot()).toEqual(before)
    } finally {
      await clear()
    }
  })
})
// ---- end S4 Task 4 tests ----

// ---- S4 Task 6 tests ----
// ---- end S4 Task 6 tests ----

// ---- S4 Task 7 tests ----
describe('S4 Task 7: email kind', () => {
  const insert = (target: PGlite, kind: string) =>
    target.query(`insert into public.email_log (kind, recipient, subject, status) values ($1, 't7@test', 'Subject', 'sent')`, [kind])

  it("email_log accepts model_request_update and still rejects 'nope'", async () => {
    await insert(db, 'model_request_update')
    await expect(insert(db, 'nope')).rejects.toThrow(/email_log_kind_check/)
  })

  it('rollback restores the 12-kind check when no model_request_update row exists', async () => {
    const rolled = await freshDb()
    try {
      await rolled.exec(readFileSync(S4_ROLLBACK_SQL, 'utf8'))
      await expect(insert(rolled, 'model_request_update')).rejects.toThrow(/email_log_kind_check/)
      await insert(rolled, 'team_notice')
    } finally {
      await rolled.close()
    }
  }, 60_000)

  it('rollback keeps the wider check when a model_request_update row exists', async () => {
    const rolled = await freshDb()
    try {
      await insert(rolled, 'model_request_update')
      await rolled.exec(readFileSync(S4_ROLLBACK_SQL, 'utf8'))
      expect((await rolled.query(`select 1 from public.email_log where kind = 'model_request_update'`)).rows).toHaveLength(1)
      await insert(rolled, 'model_request_update')
    } finally {
      await rolled.close()
    }
  }, 60_000)
})
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
