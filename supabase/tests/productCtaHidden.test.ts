// @vitest-environment node
// Client feedback 2026-11-05, piece 1: products.cta_hidden. The column defaults false, save_product stores it on insert and
// update (the missing key means false), anon reads it, and the rollback puts save_product back and drops the column.
// PGlite only; nothing touches a live project.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MIGRATIONS, freshDb, ids, makeHelpers, type Helpers } from './harness'

const CTA_MIGRATION = readdirSync(MIGRATIONS).find((n) => n.endsWith('_product_cta_hidden.sql'))!
const CTA_ROLLBACK_SQL = join(__dirname, '..', 'rollback', '20261105_product_cta_hidden_rollback.sql')

const id = ids(17)
const MEMBER = id(1)
const STRANGER = id(2)
const BIZ = id(10)
const PRODUCT = id(20)

let db: PGlite
let h: Helpers

beforeAll(async () => {
  db = await freshDb()
  h = makeHelpers(db)
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values
      ('${MEMBER}', 'cta-member@test', now()), ('${STRANGER}', 'cta-stranger@test', now());
    insert into public.businesses (id, name, slug, status) values ('${BIZ}', 'Cta Co', 'cta-co', 'active');
    insert into public.business_members (business_id, user_id) values ('${BIZ}', '${MEMBER}');
    insert into public.products (id, business_id, slug, name, category, price, currency, status, width, height, depth, dimension_unit) values
      ('${PRODUCT}', '${BIZ}', 'chair', '{"en":"Chair"}', 'sofa', 1000, 'EUR', 'draft', 10, 10, 10, 'cm');
    insert into public.product_images (product_id, url, is_primary) values ('${PRODUCT}', '/a.jpg', true);
    update public.products set status = 'published' where id = '${PRODUCT}';
  `)
}, 120_000)

afterAll(async () => {
  await db.close()
})

const SAVE = `select public.save_product($1::jsonb, '[{"url":"/a.jpg","is_primary":true}]'::jsonb, '[]'::jsonb, '[]'::jsonb) as r`
const product = (extra: Record<string, unknown> = {}) => ({
  business_id: BIZ, slug: 'new-one', name: { en: 'New one' }, category: 'sofa', price: 1000, currency: 'EUR',
  width: 10, height: 10, depth: 10, dimension_unit: 'cm', ...extra,
})
const hidden = async (where: string) => (await db.query<{ h: boolean }>(`select cta_hidden as h from public.products where ${where}`)).rows[0]!.h

describe('product_cta_hidden migration', () => {
  it('sorts after every earlier migration', () => {
    expect(CTA_MIGRATION).toMatch(/^\d{14}_product_cta_hidden\.sql$/)
    expect(CTA_MIGRATION > '20261103200807_landing_hero.sql').toBe(true)
  })

  it('the column defaults to false for rows written without it', async () => {
    expect(await hidden(`id = '${PRODUCT}'`)).toBe(false)
  })

  it('save_product stores cta_hidden on insert and on update; a missing key means false again', async () => {
    await h.call(MEMBER, SAVE, [JSON.stringify(product({ cta_hidden: true }))])
    expect(await hidden(`slug = 'new-one'`)).toBe(true)
    await h.call(MEMBER, SAVE, [JSON.stringify(product({ id: PRODUCT, slug: 'chair', cta_hidden: true }))])
    expect(await hidden(`id = '${PRODUCT}'`)).toBe(true)
    await h.call(MEMBER, SAVE, [JSON.stringify(product({ id: PRODUCT, slug: 'chair', cta_hidden: false }))])
    expect(await hidden(`id = '${PRODUCT}'`)).toBe(false)
    await h.call(MEMBER, SAVE, [JSON.stringify(product({ id: PRODUCT, slug: 'chair', cta_hidden: true }))])
    await h.call(MEMBER, SAVE, [JSON.stringify(product({ id: PRODUCT, slug: 'chair' }))])
    expect(await hidden(`id = '${PRODUCT}'`)).toBe(false)
  })

  it('a stranger still cannot save the product, and anon reads the column of a published product', async () => {
    await expect(h.call(STRANGER, SAVE, [JSON.stringify(product({ id: PRODUCT, slug: 'chair', cta_hidden: true }))])).rejects.toThrow()
    expect(await hidden(`id = '${PRODUCT}'`)).toBe(false)
    const r = await h.probe('', `select cta_hidden from public.products where id = '${PRODUCT}'`, [], null, 'anon')
    expect(r.rows).toEqual([{ cta_hidden: false }])
  })
})

describe('rollback', () => {
  it('apply → rollback → re-apply: save_product equals its earlier body, the column is gone, grants kept; re-applying works', async () => {
    const before = await freshDb((n) => n < CTA_MIGRATION)
    const rolled = await freshDb()
    try {
      const def = async (target: PGlite) =>
        (await target.query<{ d: string }>(`select pg_get_functiondef('public.save_product(jsonb,jsonb,jsonb,jsonb)'::regprocedure) as d`)).rows[0]!.d.replace(/\r\n/g, '\n')
      const column = async (target: PGlite) =>
        (await target.query(`select 1 from information_schema.columns where table_schema = 'public' and table_name = 'products' and column_name = 'cta_hidden'`)).rows.length
      expect(await column(rolled)).toBe(1)
      expect(await def(rolled)).not.toEqual(await def(before))
      await rolled.exec(readFileSync(CTA_ROLLBACK_SQL, 'utf8'))
      expect(await column(rolled)).toBe(0)
      expect(await def(rolled)).toEqual(await def(before))
      const grants = await rolled.query<{ a: boolean; u: boolean; s: boolean }>(
        `select has_function_privilege('anon', 'public.save_product(jsonb,jsonb,jsonb,jsonb)', 'execute') as a,
                has_function_privilege('authenticated', 'public.save_product(jsonb,jsonb,jsonb,jsonb)', 'execute') as u,
                has_function_privilege('service_role', 'public.save_product(jsonb,jsonb,jsonb,jsonb)', 'execute') as s`,
      )
      expect(grants.rows[0]).toEqual({ a: false, u: true, s: true })
      await rolled.exec(readFileSync(join(MIGRATIONS, CTA_MIGRATION), 'utf8'))
      expect(await column(rolled)).toBe(1)
      expect(await def(rolled)).not.toEqual(await def(before))
    } finally {
      await before.close()
      await rolled.close()
    }
  }, 120_000)
})
