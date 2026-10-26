// @vitest-environment node
// Public AR model copies (owner decision 2026-10-26): the public ar-models bucket, product_models / product_variant_models
// .public_url, and can_sync_ar_models. PGlite only; nothing touches a live project.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MIGRATIONS, S2_MIGRATION, freshDb, ids, makeHelpers, type Helpers } from './harness'

const AR_MIGRATION = readdirSync(MIGRATIONS).find((n) => n.endsWith('_ar_public_models.sql'))!
const AR_ROLLBACK_SQL = join(__dirname, '..', 'rollback', '20261026_ar_public_models_rollback.sql')

const id = ids(17)
const OWNER = id(1)
const TEAM = id(2)
const MEMBER = id(3)
const STRANGER = id(4)
const BIZ = id(10)
const OTHER_BIZ = id(11)
const PRODUCT = id(20)
const OTHER_PRODUCT = id(21)
const MISSING = id(29)
const VARIANT = id(30)
const PATH = `${BIZ}/${id(40)}.glb`
const PUBLIC = `https://abc.supabase.co/storage/v1/object/public/ar-models/${BIZ}/${PRODUCT}/base/glb-x.glb`

let db: PGlite
let h: Helpers

beforeAll(async () => {
  db = await freshDb()
  h = makeHelpers(db)
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values
      ('${OWNER}', 'ar-owner@test', now()), ('${TEAM}', 'ar-team@test', now()), ('${MEMBER}', 'ar-member@test', now()),
      ('${STRANGER}', 'ar-stranger@test', now());
    insert into public.platform_admins (user_id) values ('${OWNER}');
    insert into public.platform_members (user_id, email, role, status) values ('${TEAM}', 'ar-team@test', 'team', 'active');
    insert into public.businesses (id, name, slug, status) values ('${BIZ}', 'AR Co', 'ar-co', 'active'), ('${OTHER_BIZ}', 'Other Co', 'other-co', 'active');
    -- S4: the member writes 3D rows themselves below, so their business may upload its own models.
    select set_config('app.own_models', 'on', false);
    update public.businesses set allow_own_models = true where id = '${BIZ}';
    select set_config('app.own_models', '', false);
    insert into public.business_members (business_id, user_id) values ('${BIZ}', '${MEMBER}');
    insert into public.products (id, business_id, slug, name, category, price, currency, status, width, height, depth, dimension_unit) values
      ('${PRODUCT}', '${BIZ}', 'chair', '{"en":"Chair"}', 'sofa', 1000, 'EUR', 'draft', 10, 10, 10, 'cm'),
      ('${OTHER_PRODUCT}', '${OTHER_BIZ}', 'other', '{"en":"Other"}', 'sofa', 1000, 'EUR', 'draft', 10, 10, 10, 'cm');
    insert into public.product_variants (id, product_id, name, sort_order) values ('${VARIANT}', '${PRODUCT}', '{"en":"Oak"}', 0);
  `)
}, 120_000)

afterAll(async () => {
  await db.close()
})

describe('ar_public_models migration', () => {
  it('sorts after every earlier migration, including S2, and applies on top of them', async () => {
    expect(AR_MIGRATION).toMatch(/^\d{14}_ar_public_models\.sql$/)
    expect(AR_MIGRATION > S2_MIGRATION).toBe(true)
    expect(AR_MIGRATION > '20261026120000_s4_model_requests.sql').toBe(true) // released after S4
    const all = readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()
    expect(all.at(-1)).toBe(AR_MIGRATION)
  })

  it('creates the public ar-models bucket: 50 MB, GLB and USDZ only', async () => {
    const { rows } = await db.query<{ public: boolean; file_size_limit: string; allowed_mime_types: string[] }>(
      `select public, file_size_limit::text, allowed_mime_types from storage.buckets where id = 'ar-models'`,
    )
    expect(rows).toEqual([{ public: true, file_size_limit: '52428800', allowed_mime_types: ['model/gltf-binary', 'model/vnd.usdz+zip'] }])
  })

  it('no client role can write ar-models objects (only the service role writes)', async () => {
    await db.query(`insert into storage.objects (bucket_id, name) values ('ar-models', $1)`, [`${BIZ}/${PRODUCT}/base/glb-x.glb`])
    const insert = `insert into storage.objects (bucket_id, name) values ('ar-models', '${BIZ}/${PRODUCT}/base/evil.glb')`
    for (const uid of [MEMBER, OWNER, TEAM]) {
      await expect(h.probe(uid, insert, [], 'aal2')).rejects.toThrow(/row-level security/)
      expect(await h.affected(uid, `update storage.objects set name = name || 'x' where bucket_id = 'ar-models'`, [], 'aal2')).toBe(0)
      expect(await h.affected(uid, `delete from storage.objects where bucket_id = 'ar-models'`, [], 'aal2')).toBe(0)
    }
    await expect(h.probe('', insert, [], null, 'anon')).rejects.toThrow(/row-level security/)
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from pg_policies where schemaname = 'storage' and (qual ilike '%ar-models%' or with_check ilike '%ar-models%')`)
    expect(rows[0]!.n).toBe(0)
  })

  it('adds a nullable https-only public_url to product_models and product_variant_models', async () => {
    for (const table of ['product_models', 'product_variant_models']) {
      const { rows } = await db.query<{ is_nullable: string; data_type: string }>(
        `select is_nullable, data_type from information_schema.columns where table_schema = 'public' and table_name = $1 and column_name = 'public_url'`,
        [table],
      )
      expect({ table, rows }).toEqual({ table, rows: [{ is_nullable: 'YES', data_type: 'text' }] })
    }
    await db.query(`insert into public.product_models (product_id, format, storage_path, file_name) values ($1, 'glb', $2, 'chair.glb')`, [PRODUCT, PATH])
    await db.query(`insert into public.product_variant_models (variant_id, product_id, format, storage_path, file_name) values ($1, $2, 'glb', $3, 'oak.glb')`, [VARIANT, PRODUCT, PATH])
    for (const bad of ['http://abc.supabase.co/x.glb', 'javascript:alert(1)', '/storage/v1/object/public/ar-models/x.glb', `https://x.test/${'a'.repeat(2050)}`]) {
      await expect(db.query(`update public.product_models set public_url = $1 where product_id = $2`, [bad, PRODUCT])).rejects.toThrow(/check constraint/)
      await expect(db.query(`update public.product_variant_models set public_url = $1 where variant_id = $2`, [bad, VARIANT])).rejects.toThrow(/check constraint/)
    }
    // The service role (the sync-ar-models Edge Function) sets it.
    await h.svc(`with u as (update public.product_models set public_url = $1 where product_id = $2 returning 1) select to_jsonb(count(*)) as r from u`, [PUBLIC, PRODUCT])
    await h.svc(`with u as (update public.product_variant_models set public_url = $1 where variant_id = $2 returning 1) select to_jsonb(count(*)) as r from u`, [PUBLIC, VARIANT])
    const { rows } = await db.query<{ a: string; b: string }>(
      `select (select public_url from public.product_models where product_id = $1) as a, (select public_url from public.product_variant_models where variant_id = $2) as b`,
      [PRODUCT, VARIANT],
    )
    expect(rows[0]).toEqual({ a: PUBLIC, b: PUBLIC })
  })

  it('a signed-in member cannot point public_url anywhere: their insert stores null, their update keeps the old value', async () => {
    const other = `${BIZ}/${id(41)}.usdz`
    const stored = await h.as(MEMBER, async (tx) => {
      await tx.query(`insert into public.product_models (product_id, format, storage_path, file_name, public_url) values ($1, 'usdz', $2, 'c.usdz', 'https://evil.test/x.usdz')`, [PRODUCT, other])
      await tx.query(`update public.product_models set public_url = 'https://evil.test/y.glb' where product_id = $1 and format = 'glb'`, [PRODUCT])
      return (await tx.query<{ format: string; public_url: string | null }>(`select format, public_url from public.product_models where product_id = $1 order by format`, [PRODUCT])).rows
    })
    expect(stored).toEqual([
      { format: 'glb', public_url: PUBLIC },
      { format: 'usdz', public_url: null },
    ])
    await db.query(`delete from public.product_models where product_id = $1 and format = 'usdz'`, [PRODUCT])
  })

  it('can_sync_ar_models: business members of the product and staff with products.publish/edit; nobody else', async () => {
    const can = (uid: string, product: string, business: string | null = null) =>
      h.call(uid, `select to_jsonb(public.can_sync_ar_models($1::uuid, $2::uuid)) as r`, [product, business], 'aal1') as unknown as Promise<boolean>
    expect(await can(MEMBER, PRODUCT)).toBe(true)
    expect(await can(MEMBER, OTHER_PRODUCT)).toBe(false)
    expect(await can(MEMBER, OTHER_PRODUCT, BIZ)).toBe(false) // an existing product's own business decides
    expect(await can(STRANGER, PRODUCT)).toBe(false)
    expect(await can(TEAM, PRODUCT)).toBe(true) // team holds products.edit
    expect(await can(OWNER, OTHER_PRODUCT)).toBe(true)
    // A deleted product: the business the caller names decides (only folder removal follows).
    expect(await can(MEMBER, MISSING, BIZ)).toBe(true)
    expect(await can(MEMBER, MISSING, OTHER_BIZ)).toBe(false)
    expect(await can(MEMBER, MISSING)).toBe(false)
    expect(await can(STRANGER, MISSING, BIZ)).toBe(false)
    expect(await can(TEAM, MISSING)).toBe(true)
  })

  it('can_sync_ar_models follows the 2FA gates (a required, unmet 2FA step answers false)', async () => {
    await h.withPolicy(true, true, async () => {
      expect(await h.flag(MEMBER, `public.can_sync_ar_models('${PRODUCT}'::uuid)`, 'aal1')).toBe(false)
      expect(await h.flag(MEMBER, `public.can_sync_ar_models('${PRODUCT}'::uuid)`, 'aal2')).toBe(true)
      expect(await h.flag(TEAM, `public.can_sync_ar_models('${PRODUCT}'::uuid)`, 'aal1')).toBe(false)
    })
  })

  it('grants: authenticated and service_role may execute can_sync_ar_models; anon and public may not', async () => {
    const { rows } = await db.query<{ anon: boolean; auth: boolean; svc: boolean; pub: boolean; definer: boolean }>(`
      select has_function_privilege('anon', 'public.can_sync_ar_models(uuid, uuid)', 'execute') as anon,
             has_function_privilege('authenticated', 'public.can_sync_ar_models(uuid, uuid)', 'execute') as auth,
             has_function_privilege('service_role', 'public.can_sync_ar_models(uuid, uuid)', 'execute') as svc,
             exists (select 1 from pg_proc p, aclexplode(p.proacl) a where p.oid = 'public.can_sync_ar_models(uuid, uuid)'::regprocedure and a.grantee = 0) as pub,
             (select prosecdef from pg_proc where oid = 'public.can_sync_ar_models(uuid, uuid)'::regprocedure) as definer`)
    expect(rows[0]).toEqual({ anon: false, auth: true, svc: true, pub: false, definer: true })
  })

  it('rollback removes the columns, the function and the empty bucket; the migration then re-applies', async () => {
    const rolled = await freshDb()
    try {
      await rolled.exec(readFileSync(AR_ROLLBACK_SQL, 'utf8'))
      const { rows } = await rolled.query<{ cols: number; fn: string | null; trig: string | null; bucket: number }>(`
        select (select count(*)::int from information_schema.columns where table_schema = 'public' and column_name = 'public_url'
                  and table_name in ('product_models', 'product_variant_models')) as cols,
               to_regprocedure('public.can_sync_ar_models(uuid, uuid)')::text as fn,
               to_regprocedure('private.ar_models_keep_public_url()')::text as trig,
               (select count(*)::int from storage.buckets where id = 'ar-models') as bucket`)
      expect(rows[0]).toEqual({ cols: 0, fn: null, trig: null, bucket: 0 })
      await rolled.exec(readFileSync(join(MIGRATIONS, AR_MIGRATION), 'utf8'))
    } finally {
      await rolled.close()
    }
  }, 120_000)
})
