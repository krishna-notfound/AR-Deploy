// @vitest-environment node
// Image crop on upload (ADR-0063), migration A: product_images and product_variant_images get original_path and crop;
// save_product stores them (optional, so old callers still work); the write policies hold original_path to the product's
// business folder; a file that is some photo's original counts as in use; the rollback puts everything back.
// PGlite only; nothing touches a live project.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MIGRATIONS, freshDb, ids, makeHelpers, type Helpers } from './harness'

const MIGRATION = readdirSync(MIGRATIONS).find((n) => n.endsWith('_product_image_crop.sql'))!
const ROLLBACK_SQL = join(__dirname, '..', 'rollback', '20261111_product_image_crop_rollback.sql')

const id = ids(17)
const MEMBER = id(1)
const STRANGER = id(2)
const BIZ = id(10)
const OTHER_BIZ = id(11)
const PRODUCT = id(20)
const OPTION = id(30)

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const path = (biz: string, n: number, ext = 'webp') => `${biz}/${uuid(n)}.${ext}`
const CROP = { x: -120.5, y: 0, width: 1200, height: 1500 }

let db: PGlite
let h: Helpers

beforeAll(async () => {
  db = await freshDb()
  h = makeHelpers(db)
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values
      ('${MEMBER}', 'crop-member@test', now()), ('${STRANGER}', 'crop-stranger@test', now());
    insert into public.businesses (id, name, slug, status, allow_own_models) values
      ('${BIZ}', 'Crop Co', 'crop-co', 'active', true), ('${OTHER_BIZ}', 'Other Co', 'other-co', 'active', true);
    insert into public.business_members (business_id, user_id) values ('${BIZ}', '${MEMBER}');
    insert into public.products (id, business_id, slug, name, category, price, currency, status, width, height, depth, dimension_unit) values
      ('${PRODUCT}', '${BIZ}', 'chair', '{"en":"Chair"}', 'sofa', 1000, 'EUR', 'draft', 10, 10, 10, 'cm');
    insert into public.product_images (product_id, url, is_primary) values ('${PRODUCT}', '/a.jpg', true);
    insert into public.product_models (product_id, format, url, file_name) values ('${PRODUCT}', 'glb', '/a.glb', 'a.glb');
    update public.products set status = 'published' where id = '${PRODUCT}';
    insert into public.product_variants (id, product_id, name, sort_order) values ('${OPTION}', '${PRODUCT}', '{"en":"Oak"}', 0);
  `)
}, 120_000)

afterAll(async () => {
  await db.close()
})

const product = () => ({
  id: PRODUCT, business_id: BIZ, slug: 'chair', name: { en: 'Chair' }, category: 'sofa', price: 1000, currency: 'EUR',
  width: 10, height: 10, depth: 10, dimension_unit: 'cm', keep_models: true,
})
const SAVE = `select public.save_product($1::jsonb, $2::jsonb, '[]'::jsonb, $3::jsonb) as r`
const save = (images: unknown[], variants: unknown[] = [], uid = MEMBER) => h.call(uid, SAVE, [JSON.stringify(product()), JSON.stringify(images), JSON.stringify(variants)])
const photoRows = async () => (await db.query<{ storage_path: string | null; original_path: string | null; crop: unknown }>(
  `select storage_path, original_path, crop from public.product_images where product_id = '${PRODUCT}' order by sort_order`)).rows
const optionRows = async () => (await db.query<{ storage_path: string; original_path: string | null; crop: unknown }>(
  `select storage_path, original_path, crop from public.product_variant_images where product_id = '${PRODUCT}' order by sort_order`)).rows

describe('product_image_crop migration', () => {
  it('sorts after the latest earlier migration', () => {
    expect(MIGRATION).toMatch(/^\d{14}_product_image_crop\.sql$/)
    expect(MIGRATION > '20261111095614_apply_form_delete_anything.sql').toBe(true)
  })

  it('an old caller that sends no original_path or crop still saves; both columns are null', async () => {
    await save([{ storage_path: path(BIZ, 1), alt: 'a', is_primary: true, kind: 'gallery', sort_order: 0 }])
    expect(await photoRows()).toEqual([{ storage_path: path(BIZ, 1), original_path: null, crop: null }])
    await save([{ url: '/a.jpg', is_primary: true }], [{ id: OPTION, name: { en: 'Oak' }, images: [{ storage_path: path(BIZ, 2), alt: null, is_primary: true }] }])
    expect(await optionRows()).toEqual([{ storage_path: path(BIZ, 2), original_path: null, crop: null }])
  })

  it('stores original_path and crop per photo and per option photo, and an explicit null crop', async () => {
    await save(
      [
        { storage_path: path(BIZ, 3), original_path: path(BIZ, 4, 'jpg'), crop: CROP, is_primary: true, kind: 'gallery', sort_order: 0 },
        { storage_path: path(BIZ, 5), original_path: null, crop: null, is_primary: false, kind: 'additional', sort_order: 1 },
      ],
      [{ id: OPTION, name: { en: 'Oak' }, images: [{ storage_path: path(BIZ, 6), original_path: path(BIZ, 7, 'png'), crop: CROP, alt: null, is_primary: true }] }],
    )
    expect(await photoRows()).toEqual([
      { storage_path: path(BIZ, 3), original_path: path(BIZ, 4, 'jpg'), crop: CROP },
      { storage_path: path(BIZ, 5), original_path: null, crop: null },
    ])
    expect(await optionRows()).toEqual([{ storage_path: path(BIZ, 6), original_path: path(BIZ, 7, 'png'), crop: CROP }])
  })

  it.each([
    ['a string', 'wide'],
    ['an array', [1, 2, 3, 4]],
    ['a missing key', { x: 0, y: 0, width: 10 }],
    ['a text number', { x: 0, y: 0, width: '10', height: 10 }],
    ['a zero width', { x: 0, y: 0, width: 0, height: 10 }],
    ['a negative height', { x: 0, y: 0, width: 10, height: -1 }],
    ['an extra key', { x: 0, y: 0, width: 10, height: 10, note: 'x' }],
  ])('refuses a crop that is %s', async (_name, crop) => {
    await expect(save([{ storage_path: path(BIZ, 8), crop, is_primary: true, kind: 'gallery', sort_order: 0 }])).rejects.toThrow()
    await expect(save([{ url: '/a.jpg', is_primary: true }], [{ id: OPTION, name: { en: 'Oak' }, images: [{ storage_path: path(BIZ, 9), crop, is_primary: true }] }])).rejects.toThrow()
  })

  it('refuses an original in another business folder, with a bad shape, or from a stranger', async () => {
    const photo = (original: string) => [{ storage_path: path(BIZ, 10), original_path: original, is_primary: true, kind: 'gallery', sort_order: 0 }]
    await expect(save(photo(path(OTHER_BIZ, 11)))).rejects.toThrow()
    await expect(save(photo(`${BIZ}/../${uuid(12)}.webp`))).rejects.toThrow()
    await expect(save(photo(`${BIZ}/not-a-uuid.webp`))).rejects.toThrow()
    await expect(save(photo(path(BIZ, 13, 'gif')))).rejects.toThrow()
    const option = [{ id: OPTION, name: { en: 'Oak' }, images: [{ storage_path: path(BIZ, 14), original_path: path(OTHER_BIZ, 15), is_primary: true }] }]
    await expect(save([{ url: '/a.jpg', is_primary: true }], option)).rejects.toThrow()
    await expect(save(photo(path(BIZ, 16)), [], STRANGER)).rejects.toThrow()
  })

  it('a visitor can read the columns but not the original file; a member can read both', async () => {
    await save([{ storage_path: path(BIZ, 20), original_path: path(BIZ, 21), crop: CROP, is_primary: true, kind: 'gallery', sort_order: 0 }])
    await db.exec(`insert into storage.objects (bucket_id, name) values ('product-media', '${path(BIZ, 20)}'), ('product-media', '${path(BIZ, 21)}')`)
    const cols = await h.probe('', `select original_path, crop from public.product_images where product_id = '${PRODUCT}'`, [], null, 'anon')
    expect(cols.rows).toEqual([{ original_path: path(BIZ, 21), crop: CROP }])
    const visitor = await h.probe('', `select name from storage.objects where bucket_id = 'product-media' order by name`, [], null, 'anon')
    expect((visitor.rows as { name: string }[]).map((r) => r.name)).toEqual([path(BIZ, 20)])
    const member = await h.probe(MEMBER, `select name from storage.objects where bucket_id = 'product-media' order by name`)
    expect((member.rows as { name: string }[]).map((r) => r.name)).toEqual([path(BIZ, 20), path(BIZ, 21)].sort())
  })

  it('a file that is some photo’s original counts as in use until the photo is gone', async () => {
    const unref = async (p: string) =>
      (await db.query<{ r: string[] }>(`select private.unreferenced_media_paths(array['${p}']) as r`)).rows[0]!.r
    expect(await unref(path(BIZ, 21))).toEqual([])
    expect(await unref(path(BIZ, 20))).toEqual([])
    expect(await unref(path(BIZ, 99))).toEqual([path(BIZ, 99)])
    await save([{ url: '/a.jpg', is_primary: true }])
    expect(await unref(path(BIZ, 21))).toEqual([path(BIZ, 21)])
    await save([{ url: '/a.jpg', is_primary: true }], [{ id: OPTION, name: { en: 'Oak' }, images: [{ storage_path: path(BIZ, 22), original_path: path(BIZ, 23), crop: CROP, is_primary: true }] }])
    expect(await unref(path(BIZ, 23))).toEqual([])
  })

  it('keeps the grants: save_product for authenticated and service only; the sweeper function for nobody', async () => {
    const g = await db.query<{ a: boolean; u: boolean; s: boolean; sa: boolean; su: boolean }>(
      `select has_function_privilege('anon', 'public.save_product(jsonb,jsonb,jsonb,jsonb)', 'execute') as a,
              has_function_privilege('authenticated', 'public.save_product(jsonb,jsonb,jsonb,jsonb)', 'execute') as u,
              has_function_privilege('service_role', 'public.save_product(jsonb,jsonb,jsonb,jsonb)', 'execute') as s,
              has_function_privilege('anon', 'private.unreferenced_media_paths(text[])', 'execute') as sa,
              has_function_privilege('authenticated', 'private.unreferenced_media_paths(text[])', 'execute') as su`,
    )
    expect(g.rows[0]).toEqual({ a: false, u: true, s: true, sa: false, su: false })
  })
})

describe('rollback', () => {
  it('apply → rollback → re-apply: both functions and the four policies equal their earlier definitions, the columns are gone', async () => {
    const before = await freshDb((n) => n < MIGRATION)
    const rolled = await freshDb()
    try {
      const def = async (target: PGlite, fn: string) =>
        (await target.query<{ d: string }>(`select pg_get_functiondef('${fn}'::regprocedure) as d`)).rows[0]!.d.replace(/\r\n/g, '\n')
      const policies = async (target: PGlite) =>
        (await target.query<{ p: string }>(
          `select policyname || ' | ' || coalesce(qual, '') || ' | ' || coalesce(with_check, '') as p from pg_policies
            where schemaname = 'public' and tablename in ('product_images', 'product_variant_images') order by tablename, policyname`,
        )).rows.map((r) => r.p)
      const columns = async (target: PGlite) =>
        (await target.query<{ c: string }>(
          `select table_name || '.' || column_name as c from information_schema.columns
            where table_schema = 'public' and column_name in ('original_path', 'crop') order by 1`,
        )).rows.map((r) => r.c)
      const SAVE_FN = 'public.save_product(jsonb,jsonb,jsonb,jsonb)'
      const SWEEP_FN = 'private.unreferenced_media_paths(text[])'

      expect(await columns(rolled)).toEqual(['product_images.crop', 'product_images.original_path', 'product_variant_images.crop', 'product_variant_images.original_path'])
      expect(await def(rolled, SAVE_FN)).not.toEqual(await def(before, SAVE_FN))
      expect(await policies(rolled)).not.toEqual(await policies(before))

      await rolled.exec(readFileSync(ROLLBACK_SQL, 'utf8'))
      expect(await columns(rolled)).toEqual([])
      expect(await def(rolled, SAVE_FN)).toEqual(await def(before, SAVE_FN))
      expect(await def(rolled, SWEEP_FN)).toEqual(await def(before, SWEEP_FN))
      expect(await policies(rolled)).toEqual(await policies(before))
      const grants = await rolled.query<{ a: boolean; u: boolean; s: boolean }>(
        `select has_function_privilege('anon', '${SAVE_FN}', 'execute') as a,
                has_function_privilege('authenticated', '${SAVE_FN}', 'execute') as u,
                has_function_privilege('service_role', '${SAVE_FN}', 'execute') as s`,
      )
      expect(grants.rows[0]).toEqual({ a: false, u: true, s: true })

      await rolled.exec(readFileSync(join(MIGRATIONS, MIGRATION), 'utf8'))
      expect(await columns(rolled)).toHaveLength(4)
      expect(await def(rolled, SAVE_FN)).not.toEqual(await def(before, SAVE_FN))
    } finally {
      await before.close()
      await rolled.close()
    }
  }, 180_000)
})
