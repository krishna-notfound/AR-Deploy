// @vitest-environment node
// Client requests round 2, W4 (ADR-0055): the managed category and currency lists. The seeds, the foreign keys that replace the
// old check constraints, who reads and writes (content.manage + 2FA), "other" being permanent, admin_delete_category moving
// products, a disabled currency staying on its rows, the landing-link category check, and the rollback. PGlite only.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MIGRATIONS, freshDb, ids, makeHelpers, type Helpers } from './harness'
import { emptySiteContent } from '../../src/domain/siteContent'

const LISTS_MIGRATION = readdirSync(MIGRATIONS).find((n) => n.endsWith('_managed_lists.sql'))!
const LISTS_ROLLBACK_SQL = join(__dirname, '..', 'rollback', '20261109_managed_lists_rollback.sql')

const id = ids(2)
const OWNER = id(1)
const ADMIN = id(2)
const TEAM = id(3)
const MEMBER = id(4)
const BIZ = id(10)
const P_SOFA = id(20)
const P_CHAIR = id(21)
const ANON = ''

let db: PGlite
let h: Helpers

beforeAll(async () => {
  db = await freshDb()
  h = makeHelpers(db)
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values
      ('${OWNER}', 'ml-owner@test', now()), ('${ADMIN}', 'ml-admin@test', now()), ('${TEAM}', 'ml-team@test', now()), ('${MEMBER}', 'ml-member@test', now());
    insert into public.platform_admins (user_id) values ('${OWNER}');
    insert into public.platform_members (user_id, email, role, status) values
      ('${ADMIN}', 'ml-admin@test', 'admin', 'active'), ('${TEAM}', 'ml-team@test', 'team', 'active');
    insert into public.businesses (id, name, slug, status) values ('${BIZ}', 'Lists Co', 'lists-co', 'active');
    insert into public.business_members (business_id, user_id) values ('${BIZ}', '${MEMBER}');
    insert into public.products (id, business_id, slug, name, category, price, currency, status, width, height, depth, dimension_unit) values
      ('${P_SOFA}', '${BIZ}', 'sofa-one', '{"en":"Sofa one"}', 'sofa', 1000, 'EUR', 'draft', 10, 10, 10, 'cm'),
      ('${P_CHAIR}', '${BIZ}', 'chair-one', '{"en":"Chair one"}', 'chair', 1000, 'USD', 'draft', 10, 10, 10, 'cm');
  `)
}, 120_000)
afterAll(async () => {
  await db?.close()
})

const cats = async () => (await db.query<{ slug: string; label_en: string; label_pt: string; sort: number; active: boolean }>(`select slug, label_en, label_pt, sort, active from public.product_categories order by sort`)).rows
const catOf = async (product: string) => (await db.query<{ category: string }>(`select category from public.products where id = $1`, [product])).rows[0]!.category
const insertCat = (slug: string, sort = 80) => `insert into public.product_categories (slug, label_en, label_pt, sort) values ('${slug}', 'Rugs', 'Tapetes', ${sort})`

describe('managed_lists migration: seeds', () => {
  it('sorts after every earlier migration', () => {
    expect(LISTS_MIGRATION).toMatch(/^\d{14}_managed_lists\.sql$/)
    expect(LISTS_MIGRATION > '20261105122617_application_catalogue.sql').toBe(true)
  })

  it('seeds the seven built-in categories and Other, with English and Portuguese labels', async () => {
    const rows = await cats()
    expect(rows.map((r) => r.slug)).toEqual(['sofa', 'chair', 'table', 'bed', 'storage', 'lighting', 'decor', 'other'])
    expect(rows.every((r) => r.active)).toBe(true)
    expect(rows[0]).toMatchObject({ label_en: 'Sofa', label_pt: 'Sofá' })
    expect(rows[7]).toMatchObject({ slug: 'other', label_en: 'Other', label_pt: 'Outro' })
  })

  it('seeds EUR, BRL and USD enabled and the rest of the ISO list disabled', async () => {
    const on = (await db.query<{ code: string }>(`select code from public.currencies where enabled order by sort`)).rows.map((r) => r.code)
    expect(on).toEqual(['EUR', 'BRL', 'USD'])
    const off = (await db.query<{ code: string }>(`select code from public.currencies where not enabled`)).rows.map((r) => r.code)
    expect(off).toEqual(expect.arrayContaining(['GBP', 'CHF', 'AED', 'INR', 'JPY', 'CAD', 'AUD', 'SEK', 'NOK', 'DKK', 'PLN', 'CZK', 'MXN', 'ZAR', 'CNY', 'SGD', 'HKD', 'NZD', 'TRY', 'SAR']))
    expect(off.length).toBeGreaterThanOrEqual(30)
  })

  it('currency codes must be three upper-case letters; category slugs must be lower-case slugs', async () => {
    await expect(db.exec(`insert into public.currencies (code) values ('usd')`)).rejects.toThrow()
    await expect(db.exec(`insert into public.currencies (code) values ('US')`)).rejects.toThrow()
    await expect(db.exec(insertCat('Not A Slug'))).rejects.toThrow()
    await expect(db.exec(`insert into public.product_categories (slug, label_en, label_pt) values ('empty', '  ', 'x')`)).rejects.toThrow()
  })
})

describe('foreign keys replace the check constraints', () => {
  it('a product needs a listed category and a listed currency; a business needs a listed default currency', async () => {
    await expect(db.exec(`update public.products set category = 'spaceship' where id = '${P_SOFA}'`)).rejects.toThrow(/products_category_fkey/)
    await expect(db.exec(`update public.products set currency = 'XXX' where id = '${P_SOFA}'`)).rejects.toThrow(/products_currency_fkey/)
    await expect(db.exec(`update public.businesses set default_currency = 'XXX' where id = '${BIZ}'`)).rejects.toThrow(/businesses_default_currency_fkey/)
  })

  it('a category added to the list is accepted at once, by the business member through save_product', async () => {
    await db.exec(insertCat('rugs'))
    const SAVE = `select public.save_product($1::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb) as r`
    const product = { id: P_SOFA, slug: 'sofa-one', name: { en: 'Sofa one' }, category: 'rugs', price: 1000, currency: 'EUR', width: 10, height: 10, depth: 10, dimension_unit: 'cm' }
    await h.call(MEMBER, SAVE, [JSON.stringify(product)])
    expect(await catOf(P_SOFA)).toBe('rugs')
    await expect(h.call(MEMBER, SAVE, [JSON.stringify({ ...product, category: 'nope' })])).rejects.toThrow()
    await db.exec(`update public.products set category = 'sofa' where id = '${P_SOFA}'; delete from public.product_categories where slug = 'rugs'`)
  })

  it('renaming a slug cascades to the products', async () => {
    await db.exec(insertCat('rugs'))
    await db.exec(`update public.products set category = 'rugs' where id = '${P_SOFA}'`)
    await db.exec(`update public.product_categories set slug = 'carpets' where slug = 'rugs'`)
    expect(await catOf(P_SOFA)).toBe('carpets')
    await db.exec(`update public.products set category = 'sofa' where id = '${P_SOFA}'; delete from public.product_categories where slug = 'carpets'`)
  })

  it('a category that products use cannot be deleted directly (admin_delete_category is the way)', async () => {
    await expect(db.exec(`delete from public.product_categories where slug = 'chair'`)).rejects.toThrow(/products_category_fkey/)
  })
})

describe('who reads and who writes', () => {
  it('anon and signed-in users read both lists', async () => {
    expect((await h.probe(ANON, 'select count(*)::int as n from public.product_categories', [], null, 'anon')).rows[0]).toEqual({ n: 8 })
    expect((await h.probe(MEMBER, 'select count(*)::int as n from public.currencies')).rows[0]!.n).toBeGreaterThan(40)
    expect((await h.probe(ANON, 'select count(*)::int as n from public.currencies where enabled', [], null, 'anon')).rows[0]).toEqual({ n: 3 })
  })

  it('Owner and Admin (content.manage) add, rename and hide a category; Team, a business member and anon cannot', async () => {
    await h.as(ADMIN, (tx) => tx.exec(insertCat('rugs')))
    await h.as(OWNER, (tx) => tx.exec(`update public.product_categories set label_pt = 'Tapetes novos', active = false where slug = 'rugs'`))
    expect((await cats()).find((c) => c.slug === 'rugs')).toMatchObject({ label_pt: 'Tapetes novos', active: false })
    for (const uid of [TEAM, MEMBER]) {
      await expect(h.as(uid, (tx) => tx.exec(insertCat('lamps')))).rejects.toThrow(/row-level security/)
      expect(await h.affected(uid, `update public.product_categories set label_en = 'Hacked' where slug = 'sofa'`)).toBe(0)
      expect(await h.affected(uid, `delete from public.product_categories where slug = 'rugs'`)).toBe(0)
    }
    await expect(h.as(ANON, (tx) => tx.exec(insertCat('lamps')), 'anon', null)).rejects.toThrow()
    expect((await cats()).find((c) => c.slug === 'sofa')!.label_en).toBe('Sofa')
    await db.exec(`delete from public.product_categories where slug = 'rugs'`)
  })

  it('with the staff 2FA policy on, writes need aal2', async () => {
    await h.withPolicy(true, false, async () => {
      await expect(h.as(ADMIN, (tx) => tx.exec(insertCat('lamps')), 'authenticated', 'aal1')).rejects.toThrow(/row-level security/)
      await h.as(ADMIN, (tx) => tx.exec(insertCat('lamps')), 'authenticated', 'aal2')
      await expect(h.call(ADMIN, `select public.admin_delete_category('lamps') as r`, [], 'aal1')).rejects.toMatchObject({ message: 'aal2_required', code: '42501' })
      await h.call(ADMIN, `select public.admin_delete_category('lamps') as r`, [], 'aal2')
    })
    expect((await cats()).some((c) => c.slug === 'lamps')).toBe(false)
  })

  it('currencies: Admin switches one on and off; Team and a member cannot', async () => {
    await h.as(ADMIN, (tx) => tx.exec(`update public.currencies set enabled = true where code = 'GBP'`))
    expect((await db.query(`select enabled from public.currencies where code = 'GBP'`)).rows).toEqual([{ enabled: true }])
    for (const uid of [TEAM, MEMBER]) expect(await h.affected(uid, `update public.currencies set enabled = false where code = 'GBP'`)).toBe(0)
    await h.as(ADMIN, (tx) => tx.exec(`update public.currencies set enabled = false where code = 'GBP'`))
    expect((await db.query(`select enabled from public.currencies where code = 'GBP'`)).rows).toEqual([{ enabled: false }])
  })
})

describe('Other is permanent; the last currency stays', () => {
  it('Other cannot be deleted, renamed to another slug, or hidden', async () => {
    await expect(db.exec(`delete from public.product_categories where slug = 'other'`)).rejects.toThrow(/category_protected/)
    await expect(db.exec(`update public.product_categories set slug = 'misc' where slug = 'other'`)).rejects.toThrow(/category_protected/)
    await expect(db.exec(`update public.product_categories set active = false where slug = 'other'`)).rejects.toThrow()
    // Its labels can be renamed.
    await db.exec(`update public.product_categories set label_en = 'Miscellaneous' where slug = 'other'`)
    await db.exec(`update public.product_categories set label_en = 'Other' where slug = 'other'`)
  })

  it('admin_delete_category refuses other and an unknown slug', async () => {
    await expect(h.call(ADMIN, `select public.admin_delete_category('other') as r`)).rejects.toMatchObject({ message: 'category_protected' })
    await expect(h.call(ADMIN, `select public.admin_delete_category('nothing-here') as r`)).rejects.toMatchObject({ message: 'category_not_found' })
  })

  it('the last enabled currency cannot be disabled', async () => {
    await db.exec(`update public.currencies set enabled = true where code = 'GBP'; update public.currencies set enabled = false where code in ('EUR', 'BRL')`)
    await db.exec(`update public.currencies set enabled = false where code = 'USD'`) // GBP remains
    await expect(db.exec(`update public.currencies set enabled = false where code = 'GBP'`)).rejects.toThrow(/last_currency/)
    await db.exec(`update public.currencies set enabled = true where code in ('EUR', 'BRL', 'USD'); update public.currencies set enabled = false where code = 'GBP'`)
  })
})

describe('admin_delete_category', () => {
  it('moves the products of the category to other, then removes it; returns the count', async () => {
    await db.exec(insertCat('rugs'))
    await db.exec(`update public.products set category = 'rugs'`)
    const moved = await h.call(ADMIN, `select public.admin_delete_category('rugs') as r`)
    expect(moved).toBe(2)
    expect(await catOf(P_SOFA)).toBe('other')
    expect(await catOf(P_CHAIR)).toBe('other')
    expect((await cats()).some((c) => c.slug === 'rugs')).toBe(false)
    await db.exec(`update public.products set category = 'sofa' where id = '${P_SOFA}'; update public.products set category = 'chair' where id = '${P_CHAIR}'`)
  })

  it('an empty category is just removed (0 moved); Team, a member and anon cannot call it', async () => {
    await db.exec(insertCat('rugs'))
    expect(await h.call(OWNER, `select public.admin_delete_category('rugs') as r`)).toBe(0)
    await db.exec(insertCat('rugs'))
    await expect(h.call(TEAM, `select public.admin_delete_category('rugs') as r`)).rejects.toMatchObject({ message: 'forbidden', code: '42501' })
    await expect(h.call(MEMBER, `select public.admin_delete_category('rugs') as r`)).rejects.toMatchObject({ message: 'forbidden' })
    await expect(h.call(ANON, `select public.admin_delete_category('rugs') as r`, [], null, 'anon')).rejects.toThrow()
    await db.exec(`delete from public.product_categories where slug = 'rugs'`)
  })
})

describe('a disabled currency stays on the rows that use it', () => {
  it('disabling USD keeps the product on USD; the product can still be saved with it', async () => {
    await db.exec(`update public.currencies set enabled = false where code = 'USD'`)
    expect((await db.query(`select currency from public.products where id = '${P_CHAIR}'`)).rows).toEqual([{ currency: 'USD' }])
    await db.exec(`update public.products set price = 1200 where id = '${P_CHAIR}'`)
    await db.exec(`update public.currencies set enabled = true where code = 'USD'`)
  })
})

describe('the landing collection publish gate', () => {
  it('accepts a custom category slug and still refuses a value that is not slug-shaped', async () => {
    const gate = async (category: unknown) => {
      const content = emptySiteContent()
      content.landing.collections = [{ id: crypto.randomUUID(), slug: 'rugs-card', products: [], title: { en: 'Rugs' }, text: { en: 'Soft.' }, image: 'sofa-travertine', link: { kind: 'catalog', businessSlug: 'lists-co', category } }] as never
      return (await db.query<{ r: string | null }>(`select private.validate_site_content($1::jsonb) as r`, [JSON.stringify(content)])).rows[0]!.r
    }
    expect(await gate('rugs')).toBeNull()
    expect(await gate('sofa')).toBeNull()
    expect(await gate('Space Ship')).toBe('landing.collections.0.link.category|invalid_value')
    expect(await gate(7)).toBe('landing.collections.0.link.category|invalid_value')
  })
})

describe('rollback', () => {
  it('refuses while a product uses a custom category or currency; then restores the checks and the gate', async () => {
    const rolled = await freshDb()
    const before = await freshDb((n) => n < LISTS_MIGRATION)
    try {
      const gateDef = async (target: PGlite) =>
        (await target.query<{ d: string }>(`select pg_get_functiondef('private.validate_site_content(jsonb)'::regprocedure) as d`)).rows[0]!.d.replace(/\r\n/g, '\n')
      expect(await gateDef(rolled)).not.toEqual(await gateDef(before))

      await rolled.exec(`
        insert into public.businesses (id, name, slug, status) values ('${BIZ}', 'Lists Co', 'lists-co', 'active');
        insert into public.product_categories (slug, label_en, label_pt, sort) values ('rugs', 'Rugs', 'Tapetes', 80);
        insert into public.products (id, business_id, slug, name, category, price, currency, status, width, height, depth, dimension_unit)
          values ('${P_SOFA}', '${BIZ}', 'rug-one', '{"en":"Rug"}', 'rugs', 1000, 'EUR', 'draft', 10, 10, 10, 'cm');
      `)
      await expect(rolled.exec(readFileSync(LISTS_ROLLBACK_SQL, 'utf8'))).rejects.toThrow(/rollback refused/)
      await rolled.exec('rollback')
      // Refused means unchanged: the tables are still there.
      expect((await rolled.query(`select 1 from public.product_categories where slug = 'rugs'`)).rows).toHaveLength(1)
      await rolled.exec(`update public.products set category = 'decor'; update public.product_categories set active = true; delete from public.product_categories where slug = 'rugs'`)
      await rolled.exec(`update public.currencies set enabled = true where code = 'GBP'; update public.products set currency = 'GBP'`)
      await expect(rolled.exec(readFileSync(LISTS_ROLLBACK_SQL, 'utf8'))).rejects.toThrow(/rollback refused/)
      await rolled.exec('rollback')
      await rolled.exec(`update public.products set currency = 'EUR'`)

      await rolled.exec(readFileSync(LISTS_ROLLBACK_SQL, 'utf8'))
      expect((await rolled.query(`select to_regclass('public.product_categories') as a, to_regclass('public.currencies') as b`)).rows[0]).toEqual({ a: null, b: null })
      await expect(rolled.exec(`update public.products set category = 'spaceship'`)).rejects.toThrow(/products_category_check/)
      await expect(rolled.exec(`update public.products set currency = 'GBP'`)).rejects.toThrow(/products_currency_check/)
      await expect(rolled.exec(`update public.businesses set default_currency = 'GBP'`)).rejects.toThrow(/businesses_default_currency_check/)
      expect(await gateDef(rolled)).toEqual(await gateDef(before))

      // Re-applying works.
      await rolled.exec(readFileSync(join(MIGRATIONS, LISTS_MIGRATION), 'utf8'))
      expect((await rolled.query(`select count(*)::int as n from public.product_categories`)).rows[0]).toEqual({ n: 8 })
      expect(await gateDef(rolled)).not.toEqual(await gateDef(before))
    } finally {
      await rolled.close()
      await before.close()
    }
  }, 120_000)
})

