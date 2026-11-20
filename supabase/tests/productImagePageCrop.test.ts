// @vitest-environment node
// Two crops per main product photo (ADR-0081): product_images and product_variant_images get page_path and page_crop;
// save_product stores them (optional, so old callers still work); the write policies hold page_path to the product's business
// folder; a page copy counts as in use; a visitor can read the page copy of a published product (unlike an original); the
// rollback puts everything back. PGlite only; nothing touches a live project.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MIGRATIONS, freshDb, ids, makeHelpers, type Helpers } from './harness'

const MIGRATION = readdirSync(MIGRATIONS).find((n) => n.endsWith('_product_image_page_crop.sql'))!
const ROLLBACK_SQL = join(__dirname, '..', 'rollback', '20261120_product_image_page_crop_rollback.sql')

const id = ids(18)
const MEMBER = id(1)
const STRANGER = id(2)
const BIZ = id(10)
const OTHER_BIZ = id(11)
const PRODUCT = id(20)
const DRAFT = id(21)
const OPTION = id(30)

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const path = (biz: string, n: number, ext = 'webp') => `${biz}/${uuid(n)}.${ext}`
const CROP = { x: -120.5, y: 0, width: 1200, height: 1500 }
const PAGE_CROP = { x: 0, y: 200, width: 1600, height: 1000 }

let db: PGlite
let h: Helpers

beforeAll(async () => {
  db = await freshDb()
  h = makeHelpers(db)
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values
      ('${MEMBER}', 'page-member@test', now()), ('${STRANGER}', 'page-stranger@test', now());
    insert into public.businesses (id, name, slug, status, allow_own_models) values
      ('${BIZ}', 'Page Co', 'page-co', 'active', true), ('${OTHER_BIZ}', 'Other Co', 'other-co', 'active', true);
    insert into public.business_members (business_id, user_id) values ('${BIZ}', '${MEMBER}');
    insert into public.products (id, business_id, slug, name, category, price, currency, status, width, height, depth, dimension_unit) values
      ('${PRODUCT}', '${BIZ}', 'chair', '{"en":"Chair"}', 'sofa', 1000, 'EUR', 'draft', 10, 10, 10, 'cm'),
      ('${DRAFT}', '${BIZ}', 'stool', '{"en":"Stool"}', 'sofa', 1000, 'EUR', 'draft', 10, 10, 10, 'cm');
    insert into public.product_images (product_id, url, is_primary) values ('${PRODUCT}', '/a.jpg', true);
    insert into public.product_models (product_id, format, url, file_name) values ('${PRODUCT}', 'glb', '/a.glb', 'a.glb');
    update public.products set status = 'published' where id = '${PRODUCT}';
    insert into public.product_variants (id, product_id, name, sort_order) values ('${OPTION}', '${PRODUCT}', '{"en":"Oak"}', 0);
  `)
}, 120_000)

afterAll(async () => {
  await db.close()
})

const product = (pid = PRODUCT, slug = 'chair') => ({
  id: pid, business_id: BIZ, slug, name: { en: 'Chair' }, category: 'sofa', price: 1000, currency: 'EUR',
  width: 10, height: 10, depth: 10, dimension_unit: 'cm', keep_models: true,
})
const SAVE = `select public.save_product($1::jsonb, $2::jsonb, '[]'::jsonb, $3::jsonb) as r`
const save = (images: unknown[], variants: unknown[] = [], uid = MEMBER, pid = PRODUCT, slug = 'chair') =>
  h.call(uid, SAVE, [JSON.stringify(product(pid, slug)), JSON.stringify(images), JSON.stringify(variants)])
const photoRows = async () => (await db.query<{ storage_path: string | null; page_path: string | null; page_crop: unknown }>(
  `select storage_path, page_path, page_crop from public.product_images where product_id = '${PRODUCT}' order by sort_order`)).rows
const optionRows = async () => (await db.query<{ storage_path: string; page_path: string | null; page_crop: unknown }>(
  `select storage_path, page_path, page_crop from public.product_variant_images where product_id = '${PRODUCT}' order by sort_order`)).rows
const option = (images: unknown[]) => [{ id: OPTION, name: { en: 'Oak' }, images }]
const keep = { url: '/a.jpg', is_primary: true }

describe('product_image_page_crop migration', () => {
  it('sorts after the latest earlier migration', () => {
    expect(MIGRATION).toMatch(/^\d{14}_product_image_page_crop\.sql$/)
    expect(MIGRATION > '20261114165650_email_preferences.sql').toBe(true)
  })

  it('an old caller that sends no page_path or page_crop still saves; both columns are null', async () => {
    await save([{ storage_path: path(BIZ, 1), original_path: path(BIZ, 2), crop: CROP, is_primary: true, kind: 'gallery', sort_order: 0 }])
    expect(await photoRows()).toEqual([{ storage_path: path(BIZ, 1), page_path: null, page_crop: null }])
    await save([keep], option([{ storage_path: path(BIZ, 3), alt: null, is_primary: true }]))
    expect(await optionRows()).toEqual([{ storage_path: path(BIZ, 3), page_path: null, page_crop: null }])
  })

  it('stores page_path and page_crop per photo and per option photo, next to original_path and crop', async () => {
    await save(
      [
        { storage_path: path(BIZ, 4), original_path: path(BIZ, 5, 'jpg'), crop: CROP, page_path: path(BIZ, 6), page_crop: PAGE_CROP, is_primary: true, kind: 'gallery', sort_order: 0 },
        { storage_path: path(BIZ, 7), page_path: null, page_crop: null, is_primary: false, kind: 'additional', sort_order: 1 },
      ],
      option([{ storage_path: path(BIZ, 8), original_path: path(BIZ, 9, 'png'), crop: CROP, page_path: path(BIZ, 10), page_crop: PAGE_CROP, alt: null, is_primary: true }]),
    )
    expect(await photoRows()).toEqual([
      { storage_path: path(BIZ, 4), page_path: path(BIZ, 6), page_crop: PAGE_CROP },
      { storage_path: path(BIZ, 7), page_path: null, page_crop: null },
    ])
    expect(await optionRows()).toEqual([{ storage_path: path(BIZ, 8), page_path: path(BIZ, 10), page_crop: PAGE_CROP }])
    const kept = await db.query<{ original_path: string; crop: unknown }>(`select original_path, crop from public.product_images where product_id = '${PRODUCT}' and sort_order = 0`)
    expect(kept.rows[0]).toEqual({ original_path: path(BIZ, 5, 'jpg'), crop: CROP })
  })

  it.each([
    ['a string', 'wide'],
    ['a missing key', { x: 0, y: 0, width: 10 }],
    ['a text number', { x: 0, y: 0, width: '10', height: 10 }],
    ['a zero width', { x: 0, y: 0, width: 0, height: 10 }],
    ['an extra key', { x: 0, y: 0, width: 10, height: 10, note: 'x' }],
  ])('refuses a page_crop that is %s', async (_name, page_crop) => {
    await expect(save([{ storage_path: path(BIZ, 11), page_crop, is_primary: true, kind: 'gallery', sort_order: 0 }])).rejects.toThrow()
    await expect(save([keep], option([{ storage_path: path(BIZ, 12), page_crop, is_primary: true }]))).rejects.toThrow()
  })

  it('refuses a page copy in another business folder, with a bad shape, or from a stranger', async () => {
    const photo = (page: string) => [{ storage_path: path(BIZ, 13), page_path: page, is_primary: true, kind: 'gallery', sort_order: 0 }]
    await expect(save(photo(path(OTHER_BIZ, 14)))).rejects.toThrow()
    await expect(save(photo(`${BIZ}/../${uuid(15)}.webp`))).rejects.toThrow()
    await expect(save(photo(`${BIZ}/not-a-uuid.webp`))).rejects.toThrow()
    await expect(save(photo(path(BIZ, 16, 'gif')))).rejects.toThrow()
    await expect(save([keep], option([{ storage_path: path(BIZ, 17), page_path: path(OTHER_BIZ, 18), is_primary: true }]))).rejects.toThrow()
    await expect(save(photo(path(BIZ, 19)), [], STRANGER)).rejects.toThrow()
  })

  it('a visitor can read the page copy of a published product (not its original, not a draft’s page copy); a member reads all', async () => {
    await save(
      [{ storage_path: path(BIZ, 20), original_path: path(BIZ, 21), crop: CROP, page_path: path(BIZ, 22), page_crop: PAGE_CROP, is_primary: true, kind: 'gallery', sort_order: 0 }],
      option([{ storage_path: path(BIZ, 23), page_path: path(BIZ, 24), page_crop: PAGE_CROP, is_primary: true }]),
    )
    await save([{ storage_path: path(BIZ, 25), page_path: path(BIZ, 26), page_crop: PAGE_CROP, is_primary: true, kind: 'gallery', sort_order: 0 }], [], MEMBER, DRAFT, 'stool')
    const files = [20, 21, 22, 23, 24, 25, 26].map((n) => `('product-media', '${path(BIZ, n)}')`).join(', ')
    await db.exec(`insert into storage.objects (bucket_id, name) values ${files}`)
    const visitor = await h.probe('', `select name from storage.objects where bucket_id = 'product-media' order by name`, [], null, 'anon')
    expect((visitor.rows as { name: string }[]).map((r) => r.name)).toEqual([path(BIZ, 20), path(BIZ, 22), path(BIZ, 23), path(BIZ, 24)].sort())
    const member = await h.probe(MEMBER, `select name from storage.objects where bucket_id = 'product-media' order by name`)
    expect((member.rows as { name: string }[]).map((r) => r.name)).toEqual([20, 21, 22, 23, 24, 25, 26].map((n) => path(BIZ, n)).sort())
  })

  it('a file that is some photo’s page copy counts as in use until the photo is gone', async () => {
    const unref = async (p: string) =>
      (await db.query<{ r: string[] }>(`select private.unreferenced_media_paths(array['${p}']) as r`)).rows[0]!.r
    expect(await unref(path(BIZ, 22))).toEqual([])
    expect(await unref(path(BIZ, 24))).toEqual([])
    expect(await unref(path(BIZ, 21))).toEqual([])
    await save([keep])
    expect(await unref(path(BIZ, 22))).toEqual([path(BIZ, 22)])
    expect(await unref(path(BIZ, 24))).toEqual([path(BIZ, 24)])
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
  it('apply → rollback → re-apply: functions and policies equal their earlier definitions, the columns are gone', async () => {
    const before = await freshDb((n) => n < MIGRATION)
    const rolled = await freshDb()
    try {
      const def = async (target: PGlite, fn: string) =>
        (await target.query<{ d: string }>(`select pg_get_functiondef('${fn}'::regprocedure) as d`)).rows[0]!.d.replace(/\r\n/g, '\n')
      const policies = async (target: PGlite) =>
        (await target.query<{ p: string }>(
          `select tablename || ' | ' || policyname || ' | ' || coalesce(qual, '') || ' | ' || coalesce(with_check, '') as p from pg_policies
            where (schemaname = 'public' and tablename in ('product_images', 'product_variant_images'))
               or (schemaname = 'storage' and tablename = 'objects') order by 1`,
        )).rows.map((r) => r.p)
      const columns = async (target: PGlite) =>
        (await target.query<{ c: string }>(
          `select table_name || '.' || column_name as c from information_schema.columns
            where table_schema = 'public' and column_name in ('page_path', 'page_crop') order by 1`,
        )).rows.map((r) => r.c)
      const SAVE_FN = 'public.save_product(jsonb,jsonb,jsonb,jsonb)'
      const SWEEP_FN = 'private.unreferenced_media_paths(text[])'

      expect(await columns(rolled)).toEqual(['product_images.page_crop', 'product_images.page_path', 'product_variant_images.page_crop', 'product_variant_images.page_path'])
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
