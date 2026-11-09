// @vitest-environment node
// Client requests round 2, W3 (ADR-0054): businesses.share_enabled (staff-only), publish needs a product GLB (existing
// published rows untouched), and the company description unreadable by anon (column privileges). PGlite only; nothing
// touches a live project.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MIGRATIONS, freshDb, ids, makeHelpers, type Helpers } from './harness'

const MIGRATION = readdirSync(MIGRATIONS).find((n) => n.endsWith('_catalogue_rules_round2.sql'))!
const ROLLBACK_SQL = join(__dirname, '..', 'rollback', '20261109_catalogue_rules_round2_rollback.sql')

const id = ids(18)
const ADMIN = id(1)
const TEAM = id(2)
const OWNER = id(3)
const OTHER_OWNER = id(4)
const BIZ = id(10)
const BIZ_DRAFT = id(11)
const OTHER_BIZ = id(12)
const NO_MODEL = id(20)
const WITH_MODEL = id(21)
const LEGACY = id(22)

let db: PGlite
let h: Helpers

const model = (productId: string, format = 'glb') =>
  `insert into public.product_models (product_id, format, url, file_name) values ('${productId}', '${format}', 'https://example.test/${productId}.${format}', 'm.${format}')`
const photo = (productId: string) => `insert into public.product_images (product_id, url, is_primary, kind) values ('${productId}', '/a.jpg', true, 'gallery')`
const product = (productId: string, business: string, slug: string, status = 'draft') =>
  `insert into public.products (id, business_id, slug, name, category, price, currency, status, width, height, depth, dimension_unit)
   values ('${productId}', '${business}', '${slug}', '{"en":"${slug}"}', 'sofa', 1000, 'EUR', '${status}', 10, 10, 10, 'cm')`
const publishAs = (uid: string, productId: string) => h.as(uid, (tx) => tx.query(`update public.products set status = 'published' where id = $1`, [productId]))
const statusOf = async (productId: string) => (await db.query<{ s: string }>(`select status as s from public.products where id = '${productId}'`)).rows[0]!.s

beforeAll(async () => {
  db = await freshDb()
  h = makeHelpers(db)
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values
      ('${ADMIN}', 'admin@w3', now()), ('${TEAM}', 'team@w3', now()), ('${OWNER}', 'owner@w3', now()), ('${OTHER_OWNER}', 'other@w3', now());
    insert into public.platform_members (user_id, email, role, status) values
      ('${ADMIN}', 'admin@w3', 'admin', 'active'), ('${TEAM}', 'team@w3', 'team', 'active');
    insert into public.businesses (id, name, slug, status, description) values
      ('${BIZ}', 'Casa', 'casa', 'active', 'Internal note about Casa'),
      ('${BIZ_DRAFT}', 'Draft Co', 'draft-co', 'draft', 'Internal note about Draft Co'),
      ('${OTHER_BIZ}', 'Outro', 'outro', 'active', 'Internal note about Outro');
    insert into public.business_members (business_id, user_id) values ('${BIZ}', '${OWNER}'), ('${OTHER_BIZ}', '${OTHER_OWNER}');
    ${product(NO_MODEL, BIZ, 'no-model')};
    ${photo(NO_MODEL)};
    ${product(WITH_MODEL, BIZ, 'with-model')};
    ${photo(WITH_MODEL)};
    ${model(WITH_MODEL)};
  `)
}, 120_000)

afterAll(async () => {
  await db.close()
})

describe('catalogue_rules_round2 migration', () => {
  it('sorts after every earlier migration', () => {
    expect(MIGRATION).toMatch(/^\d{14}_catalogue_rules_round2\.sql$/)
    expect(MIGRATION > '20261105122617_application_catalogue.sql').toBe(true)
  })
})

describe('share_enabled', () => {
  const share = async () => (await db.query<{ s: boolean }>(`select share_enabled as s from public.businesses where id = '${BIZ}'`)).rows[0]!.s

  it('defaults to true for every existing and new company', async () => {
    expect(await share()).toBe(true)
  })

  it('the company owner cannot change it (the existing admin-only error); the value stays', async () => {
    await expect(h.as(OWNER, (tx) => tx.query(`update public.businesses set share_enabled = false where id = $1`, [BIZ]))).rejects.toThrow(/business_field_admin_only/)
    expect(await share()).toBe(true)
  })

  it('an owner still edits the fields they own', async () => {
    expect(await h.affected(OWNER, `update public.businesses set description = 'New note' where id = $1`, [BIZ])).toBe(1)
  })

  it('platform staff without businesses.edit cannot change it', async () => {
    expect(await h.affected(TEAM, `update public.businesses set share_enabled = false where id = $1`, [BIZ])).toBe(0)
    expect(await share()).toBe(true)
  })

  it('staff with businesses.edit change it, both ways', async () => {
    await h.as(ADMIN, (tx) => tx.query(`update public.businesses set share_enabled = false where id = $1`, [BIZ]))
    expect(await share()).toBe(false)
    await h.as(ADMIN, (tx) => tx.query(`update public.businesses set share_enabled = true where id = $1`, [BIZ]))
    expect(await share()).toBe(true)
  })

  it('anon reads it with the catalogue, and cannot write it', async () => {
    const r = await h.probe('', `select share_enabled from public.businesses where slug = 'casa'`, [], null, 'anon')
    expect(r.rows).toEqual([{ share_enabled: true }])
    await expect(h.probe('', `update public.businesses set share_enabled = false where id = $1`, [BIZ], null, 'anon')).rejects.toThrow(/permission denied/)
  })
})

describe('publish needs the product GLB', () => {
  it('refuses a draft to published without a model row, with the stable key; the row stays a draft', async () => {
    await expect(publishAs(OWNER, NO_MODEL)).rejects.toThrow('publish_needs_model')
    await expect(publishAs(ADMIN, NO_MODEL)).rejects.toThrow('publish_needs_model')
    expect(await statusOf(NO_MODEL)).toBe('draft')
  })

  it('a USDZ alone is not a model', async () => {
    await db.exec(model(NO_MODEL, 'usdz'))
    await expect(publishAs(OWNER, NO_MODEL)).rejects.toThrow('publish_needs_model')
    await db.exec(`delete from public.product_models where product_id = '${NO_MODEL}'`)
  })

  it('refuses a new product inserted as published without a model', async () => {
    await expect(db.exec(`${product(id(30), BIZ, 'born-published', 'published')}; ${photo(id(30))}`)).rejects.toThrow()
    expect((await db.query(`select 1 from public.products where id = '${id(30)}'`)).rows).toHaveLength(0)
  })

  it('publishes a product that has a gallery image and a GLB', async () => {
    await publishAs(OWNER, WITH_MODEL)
    expect(await statusOf(WITH_MODEL)).toBe('published')
  })

  it('checks at commit: a model added in the same transaction counts', async () => {
    await h.as(OWNER, async (tx) => {
      await tx.query(`update public.products set status = 'published' where id = $1`, [NO_MODEL])
      await tx.exec(model(NO_MODEL))
    })
    expect(await statusOf(NO_MODEL)).toBe('published')
    await db.exec(`update public.products set status = 'draft' where id = '${NO_MODEL}'; delete from public.product_models where product_id = '${NO_MODEL}'`)
  })

  it('never blocks unpublishing or deleting, and a published product can be edited and saved', async () => {
    await h.as(OWNER, (tx) => tx.query(`update public.products set status = 'draft' where id = $1`, [WITH_MODEL]))
    expect(await statusOf(WITH_MODEL)).toBe('draft')
    await publishAs(OWNER, WITH_MODEL)
    await h.as(OWNER, (tx) => tx.query(`update public.products set price = 2000 where id = $1`, [WITH_MODEL]))
    await h.as(OWNER, (tx) => tx.query(`update public.products set status = 'published' where id = $1`, [WITH_MODEL])) // same value again: no transition
    await h.as(OWNER, (tx) => tx.query(`delete from public.products where id = $1`, [WITH_MODEL]))
    expect((await db.query(`select 1 from public.products where id = '${WITH_MODEL}'`)).rows).toHaveLength(0)
  })
})

describe('products published before the rule stay published and editable', () => {
  it('applying the migration leaves a photo-only published product as it was; only a new transition needs a model', async () => {
    const before = await freshDb((n) => n < MIGRATION)
    try {
      const hb = makeHelpers(before)
      await before.exec(`
        insert into auth.users (id, email, email_confirmed_at) values ('${OWNER}', 'owner@w3', now());
        insert into public.businesses (id, name, slug, status) values ('${BIZ}', 'Casa', 'casa', 'active');
        insert into public.business_members (business_id, user_id) values ('${BIZ}', '${OWNER}');
        ${product(LEGACY, BIZ, 'legacy')};
        ${photo(LEGACY)};
        update public.products set status = 'published' where id = '${LEGACY}';
      `)
      await before.exec(readFileSync(join(MIGRATIONS, MIGRATION), 'utf8'))
      const status = async () => (await before.query<{ s: string }>(`select status as s from public.products where id = '${LEGACY}'`)).rows[0]!.s
      expect(await status()).toBe('published')
      // Edits, including a status write that does not change the value, are not a transition.
      await hb.as(OWNER, (tx) => tx.query(`update public.products set price = 5000, status = 'published' where id = $1`, [LEGACY]))
      expect(await status()).toBe('published')
      // Unpublish works; republishing is a transition and needs a model.
      await hb.as(OWNER, (tx) => tx.query(`update public.products set status = 'draft' where id = $1`, [LEGACY]))
      await expect(hb.as(OWNER, (tx) => tx.query(`update public.products set status = 'published' where id = $1`, [LEGACY]))).rejects.toThrow('publish_needs_model')
      await before.exec(model(LEGACY))
      await hb.as(OWNER, (tx) => tx.query(`update public.products set status = 'published' where id = $1`, [LEGACY]))
      expect(await status()).toBe('published')
    } finally {
      await before.close()
    }
  }, 120_000)

  it('the trigger functions are not callable by API roles', async () => {
    const r = await db.query<{ n: string; a: boolean; u: boolean }>(
      `select p.proname as n, has_function_privilege('anon', p.oid, 'execute') as a, has_function_privilege('authenticated', p.oid, 'execute') as u
         from pg_proc p where p.pronamespace = 'private'::regnamespace and p.proname in ('assert_publish_model', 'products_publish_model_check')`,
    )
    expect(r.rows).toHaveLength(2)
    for (const row of r.rows) expect(row).toMatchObject({ a: false, u: false })
  })
})

describe('the company description is internal', () => {
  const COLUMNS = `id, name, slug, logo_url, contact_email, contact_phone, contact_website, contact_address, status, accent_color, default_currency, allow_own_models, is_house, share_enabled, created_at, updated_at`

  it('anon cannot read the description column, directly or through select *', async () => {
    await expect(h.probe('', `select description from public.businesses`, [], null, 'anon')).rejects.toThrow(/permission denied/)
    await expect(h.probe('', `select * from public.businesses`, [], null, 'anon')).rejects.toThrow(/permission denied/)
    await expect(h.probe('', `select to_jsonb(b) from public.businesses b`, [], null, 'anon')).rejects.toThrow(/permission denied/)
    await expect(h.probe('', `select count(*) from public.businesses where description <> ''`, [], null, 'anon')).rejects.toThrow(/permission denied/)
  })

  it('anon still reads every public column of the active businesses, and nothing of a draft one', async () => {
    const r = await h.probe('', `select ${COLUMNS} from public.businesses order by slug`, [], null, 'anon')
    expect(r.rows.map((x) => (x as { slug: string }).slug)).toEqual(['casa', 'outro'])
  })

  it('anon still reads the catalogue: a published product of an active business, with its images and models', async () => {
    await db.exec(`${product(id(40), BIZ, 'public-chair')}; ${photo(id(40))}; ${model(id(40))}; update public.products set status = 'published' where id = '${id(40)}'`)
    const r = await h.probe(
      '',
      `select p.slug, b.name, (select count(*)::int from public.product_images i where i.product_id = p.id) as images,
              (select count(*)::int from public.product_models m where m.product_id = p.id) as models
         from public.products p join public.businesses b on b.id = p.business_id where p.slug = 'public-chair'`,
      [],
      null,
      'anon',
    )
    expect(r.rows).toEqual([{ slug: 'public-chair', name: 'Casa', images: 1, models: 1 }])
  })

  it('the company owner, platform staff and the service role keep reading and editing it', async () => {
    const own = await h.probe(OWNER, `select description from public.businesses where id = $1`, [BIZ])
    expect(own.rows).toEqual([{ description: 'New note' }])
    const staff = await h.probe(ADMIN, `select description from public.businesses where id = $1`, [BIZ_DRAFT])
    expect(staff.rows).toEqual([{ description: 'Internal note about Draft Co' }])
    const svc = await h.probe('', `select count(*)::int as n from public.businesses where description <> ''`, [], null, 'service_role')
    expect(svc.rows).toEqual([{ n: 3 }])
    expect(await h.affected(OWNER, `update public.businesses set description = 'Edited by owner' where id = $1`, [BIZ])).toBe(1)
    expect(await h.affected(ADMIN, `update public.businesses set description = 'Edited by staff' where id = $1`, [BIZ])).toBe(1)
  })

  it('every column but description is granted to anon, and a column added later is not', async () => {
    const granted = await db.query<{ c: string }>(
      `select column_name as c from information_schema.column_privileges
        where table_schema = 'public' and table_name = 'businesses' and grantee = 'anon' and privilege_type = 'SELECT' order by 1`,
    )
    const all = await db.query<{ c: string }>(`select column_name as c from information_schema.columns where table_schema = 'public' and table_name = 'businesses' order by 1`)
    expect(granted.rows.map((r) => r.c)).toEqual(all.rows.map((r) => r.c).filter((c) => c !== 'description'))
  })
})

describe('rollback', () => {
  it('apply -> rollback -> re-apply: the rule, the column and the privileges come and go, no data is changed', async () => {
    const before = await freshDb((n) => n < MIGRATION)
    const rolled = await freshDb()
    try {
      const column = async (target: PGlite) =>
        (await target.query(`select 1 from information_schema.columns where table_schema = 'public' and table_name = 'businesses' and column_name = 'share_enabled'`)).rows.length
      const triggers = async (target: PGlite) =>
        (await target.query(`select 1 from pg_trigger where tgname in ('products_publish_requires_model_ins', 'products_publish_requires_model_upd')`)).rows.length
      const anonDescription = (target: PGlite) => makeHelpers(target).probe('', `select description from public.businesses`, [], null, 'anon')
      expect(await column(rolled)).toBe(1)
      expect(await triggers(rolled)).toBe(2)
      expect(await column(before)).toBe(0)
      expect(await triggers(before)).toBe(0)
      await expect(anonDescription(rolled)).rejects.toThrow(/permission denied/)

      await rolled.exec(`
        insert into public.businesses (id, name, slug, status, description) values ('${BIZ}', 'Casa', 'casa', 'active', 'kept');
        ${product(LEGACY, BIZ, 'legacy')};
        ${photo(LEGACY)};
        ${model(LEGACY)};
        update public.products set status = 'published' where id = '${LEGACY}';
      `)
      await rolled.exec(readFileSync(ROLLBACK_SQL, 'utf8'))
      expect(await column(rolled)).toBe(0)
      expect(await triggers(rolled)).toBe(0)
      expect((await anonDescription(rolled)).rows).toEqual([{ description: 'kept' }])
      expect((await rolled.query(`select 1 from public.products where id = '${LEGACY}' and status = 'published'`)).rows).toHaveLength(1)
      // Photo-only products can be published again.
      await rolled.exec(`${product(NO_MODEL, BIZ, 'photo-only')}; ${photo(NO_MODEL)}; update public.products set status = 'published' where id = '${NO_MODEL}'`)
      // The privileges the earlier migrations gave anon are back: table-level select on businesses.
      const priv = await rolled.query<{ t: boolean }>(`select has_table_privilege('anon', 'public.businesses', 'select') as t`)
      expect(priv.rows[0]!.t).toBe(true)

      await rolled.exec(readFileSync(join(MIGRATIONS, MIGRATION), 'utf8'))
      expect(await column(rolled)).toBe(1)
      expect(await triggers(rolled)).toBe(2)
      await expect(anonDescription(rolled)).rejects.toThrow(/permission denied/)
    } finally {
      await before.close()
      await rolled.close()
    }
  }, 120_000)
})
