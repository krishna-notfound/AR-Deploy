// @vitest-environment node
// QA round of 2026-11-14, group database-rules (ADR-0072): RLS on private.platform_invites, indexes on the auth.users foreign
// keys, a 4xx for cancel_model_request, a published product keeping its GLB, localized text that must be text, the slug lock,
// the push device cap, hidden categories and disabled currencies, and the form rules the browser had alone. PGlite only;
// nothing touches a live project.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MIGRATIONS, freshDb, ids, makeHelpers, type Helpers } from './harness'
import { emptySiteContent } from '../../src/domain/siteContent'

const MIGRATION = readdirSync(MIGRATIONS).find((n) => n.endsWith('_qa_database_rules.sql'))!
const ROLLBACK_SQL = join(__dirname, '..', 'rollback', '20261114_qa_database_rules_rollback.sql')

const id = ids(17)
const ADMIN = id(1)
const OWNER = id(2)
const OTHER = id(3)
const BIZ = id(10)
const BIZ2 = id(11)
const PUBLISHED = id(20)
const REQUEST = id(40)

let db: PGlite
let h: Helpers

const photo = (productId: string) => `insert into public.product_images (product_id, url, is_primary, kind) values ('${productId}', '/a.jpg', true, 'gallery')`
const model = (productId: string, format = 'glb') =>
  `insert into public.product_models (product_id, format, url, file_name) values ('${productId}', '${format}', 'https://example.test/${productId}.${format}', 'm.${format}')`
const product = (productId: string, business: string, slug: string, over: { category?: string; currency?: string; status?: string } = {}) =>
  `insert into public.products (id, business_id, slug, name, category, price, currency, status, width, height, depth, dimension_unit)
   values ('${productId}', '${business}', '${slug}', '{"en":"${slug}"}', '${over.category ?? 'sofa'}', 1000, '${over.currency ?? 'EUR'}', '${over.status ?? 'draft'}', 10, 10, 10, 'cm')`
const saveArgs = (over: Record<string, unknown> = {}) => [
  JSON.stringify({ business_id: BIZ, slug: 's-' + Math.random().toString(36).slice(2, 8), name: { en: 'Chair' }, category: 'sofa', price: 100, currency: 'EUR', width: 1, height: 1, depth: 1, dimension_unit: 'cm', ...over }),
  '[]',
  '[]',
  '[]',
]
const SAVE = 'select public.save_product($1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb) as r'

beforeAll(async () => {
  db = await freshDb()
  h = makeHelpers(db)
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values
      ('${ADMIN}', 'admin@qa', now()), ('${OWNER}', 'owner@qa', now()), ('${OTHER}', 'other@qa', now());
    insert into public.platform_members (user_id, email, role, status) values ('${ADMIN}', 'admin@qa', 'admin', 'active');
    insert into public.businesses (id, name, slug, status, allow_own_models) values
      ('${BIZ}', 'Casa', 'casa', 'active', true), ('${BIZ2}', 'Outro', 'outro', 'active', false);
    insert into public.business_members (business_id, user_id) values ('${BIZ}', '${OWNER}'), ('${BIZ2}', '${OTHER}');
    ${product(PUBLISHED, BIZ, 'published-one')};
    ${photo(PUBLISHED)};
    ${model(PUBLISHED)};
    update public.products set status = 'published' where id = '${PUBLISHED}';
    insert into public.model_requests (id, business_id, product_id) values ('${REQUEST}', '${BIZ}', '${PUBLISHED}');
  `)
}, 120_000)
afterAll(async () => {
  await db?.close()
})

describe('the migration', () => {
  it('sorts after the latest earlier migration', () => {
    expect(MIGRATION).toMatch(/^\d{14}_qa_database_rules\.sql$/)
    expect(MIGRATION > '20261113084852_website_editor_signin_panel_heading.sql').toBe(true)
  })

  it('does not touch storage buckets or storage.objects policies', () => {
    const sql = readFileSync(join(MIGRATIONS, MIGRATION), 'utf8').replace(/^--.*$/gm, '')
    expect(sql).not.toMatch(/storage\.(buckets|objects)|on storage\./i)
    const rb = readFileSync(ROLLBACK_SQL, 'utf8').replace(/^--.*$/gm, '')
    expect(rb).not.toMatch(/storage\.(buckets|objects)|on storage\./i)
  })
})

describe('RLS-05: every private table has row level security', () => {
  it('private.platform_invites has it on, and so does every other table in the private schema', async () => {
    const r = await db.query<{ n: string }>(
      `select c.relname as n from pg_class c where c.relnamespace = 'private'::regnamespace and c.relkind = 'r' and not c.relrowsecurity`,
    )
    expect(r.rows).toEqual([])
    const on = await db.query<{ s: boolean }>(`select relrowsecurity as s from pg_class where oid = 'private.platform_invites'::regclass`)
    expect(on.rows[0]!.s).toBe(true)
  })

  it('the API roles still cannot read it (no grant), and a definer function still can', async () => {
    await expect(h.probe(ADMIN, `select 1 from private.platform_invites`)).rejects.toThrow(/permission denied/)
    await expect(h.probe(ADMIN, `select 1 from private.platform_invites`, [], null, 'anon')).rejects.toThrow(/permission denied/)
    // The table owner (what the SECURITY DEFINER team functions run as) is not subject to the row level security.
    const r = await db.query(`select count(*)::int as n from private.platform_invites`)
    expect(r.rows).toHaveLength(1)
  })
})

describe('DB-F4: foreign keys to auth.users are indexed', () => {
  const COLUMNS: [string, string, string][] = [
    ['public', 'platform_members', 'invited_by'],
    ['public', 'platform_settings', 'updated_by'],
    ['public', 'model_requests', 'requested_by'],
    ['public', 'model_requests', 'handled_by'],
    ['public', 'model_request_files', 'uploaded_by'],
    ['private', 'platform_invites', 'created_by'],
    ['private', 'platform_invites', 'revoked_by'],
    ['private', 'owner_invite_attempts', 'actor'],
  ]
  it.each(COLUMNS)('%s.%s.%s is the first column of an index', async (schema, table, column) => {
    const r = await db.query<{ n: number }>(
      `select count(*)::int as n
         from pg_index i
         join pg_attribute a on a.attrelid = i.indrelid and a.attnum = i.indkey[0]
        where i.indrelid = format('%I.%I', $1::text, $2::text)::regclass and a.attname = $3 and i.indpred is null`,
      [schema, table, column],
    )
    expect(r.rows[0]!.n).toBeGreaterThan(0)
  })
})

describe('F-TI-2: cancel_model_request refuses with a 4xx class error', () => {
  const CANCEL = 'select public.cancel_model_request($1) as r'
  it('an unknown request, and another business\'s request, raise model_request_not_found with P0001 (400), not P0002 (500)', async () => {
    await expect(h.probe(OTHER, CANCEL, [REQUEST])).rejects.toMatchObject({ message: 'model_request_not_found', code: 'P0001' })
    await expect(h.probe(OWNER, CANCEL, [id(99)])).rejects.toMatchObject({ message: 'model_request_not_found', code: 'P0001' })
    await expect(h.probe(ADMIN, CANCEL, [REQUEST])).rejects.toMatchObject({ message: 'model_request_not_found', code: 'P0001' })
  })
  it('the member can still cancel their own request', async () => {
    const r = (await h.probe(OWNER, CANCEL, [REQUEST])).rows[0] as { r: { status: string } }
    expect(r.r.status).toBe('cancelled')
  })
})

describe('BL-3: a published product keeps its GLB', () => {
  const NEW = id(21)
  const LEGACY = id(22)
  const glbCount = async (p: string) => (await db.query<{ n: number }>(`select count(*)::int as n from public.product_models where product_id = $1 and format = 'glb'`, [p])).rows[0]!.n

  it('refuses deleting the last GLB of a published product (the row stays), and changing it to another format', async () => {
    await expect(db.exec(`delete from public.product_models where product_id = '${PUBLISHED}'`)).rejects.toThrow('publish_needs_model')
    await expect(db.exec(`update public.product_models set format = 'usdz' where product_id = '${PUBLISHED}'`)).rejects.toThrow('publish_needs_model')
    expect(await glbCount(PUBLISHED)).toBe(1)
  })

  it('refuses it through save_product too (an owner whose company may upload models)', async () => {
    const args = [
      JSON.stringify({ id: PUBLISHED, business_id: BIZ, slug: 'published-one', name: { en: 'published-one' }, category: 'sofa', price: 1000, currency: 'EUR', width: 10, height: 10, depth: 10, dimension_unit: 'cm' }),
      JSON.stringify([{ url: '/a.jpg', is_primary: true, kind: 'gallery', sort_order: 0 }]),
      '[]',
      '[]',
    ]
    // Committed (not probed): the rule is checked at commit.
    await expect(h.as(OWNER, (tx) => tx.query(SAVE, args))).rejects.toThrow('publish_needs_model')
    expect(await glbCount(PUBLISHED)).toBe(1)
  })

  it('allows replacing the GLB in one transaction, unpublishing with it, deleting the product, and removing the GLB of a draft', async () => {
    await db.exec(`begin; delete from public.product_models where product_id = '${PUBLISHED}'; ${model(PUBLISHED)}; commit;`)
    expect(await glbCount(PUBLISHED)).toBe(1)
    await db.exec(`${product(NEW, BIZ, 'will-go', { status: 'draft' })}; ${photo(NEW)}; ${model(NEW)}; update public.products set status = 'published' where id = '${NEW}'`)
    await db.exec(`begin; update public.products set status = 'draft' where id = '${NEW}'; delete from public.product_models where product_id = '${NEW}'; commit;`)
    expect(await glbCount(NEW)).toBe(0)
    await db.exec(`${model(NEW)}; update public.products set status = 'published' where id = '${NEW}'`)
    await db.exec(`delete from public.products where id = '${NEW}'`)
    expect((await db.query(`select 1 from public.products where id = '${NEW}'`)).rows).toHaveLength(0)
  })

  it('never touches a product that was published without any GLB (ADR-0054): its other model rows and edits are free', async () => {
    await db.exec(`
      ${product(LEGACY, BIZ, 'legacy')}; ${photo(LEGACY)}; ${model(LEGACY, 'usdz')};
      set session_replication_role = replica;
      update public.products set status = 'published' where id = '${LEGACY}';
      set session_replication_role = origin;
    `)
    await db.exec(`delete from public.product_models where product_id = '${LEGACY}'`)
    await h.as(OWNER, (tx) => tx.query(`update public.products set price = 5000 where id = $1`, [LEGACY]))
    expect((await db.query<{ s: string }>(`select status as s from public.products where id = '${LEGACY}'`)).rows[0]!.s).toBe('published')
    await db.exec(`delete from public.products where id = '${LEGACY}'`)
  })
})

describe('BL-4: localized text must be text', () => {
  const ins = (name: string, extra = '') =>
    `insert into public.products (id, business_id, slug, name, ${extra ? extra.split('=')[0] + ',' : ''} category, price, currency, status, width, height, depth, dimension_unit)
     values (gen_random_uuid(), '${BIZ}', 'loc-${Math.random().toString(36).slice(2, 9)}', '${name}', ${extra ? extra.split('=')[1] + ',' : ''} 'sofa', 1, 'EUR', 'draft', 1, 1, 1, 'cm')`

  it.each([
    ['null en', '{"en": null}'],
    ['number en', '{"en": 5}'],
    ['object en', '{"en": {"x": "y"}}'],
    ['null pt', '{"en": "Chair", "pt": null}'],
    ['number pt', '{"en": "Chair", "pt": 7}'],
    ['array pt', '{"en": "Chair", "pt": ["a"]}'],
  ])('refuses a name with %s', async (_label, json) => {
    await expect(db.exec(ins(json))).rejects.toThrow(/products_name_strings|products_name_en_not_blank|violates check/)
  })

  it.each(['short_description', 'description', 'material', 'cta_label'])('refuses a %s whose en or pt is not a string, and takes en alone or en and pt', async (col) => {
    await expect(db.exec(ins('{"en": "Chair"}', `${col}='{"en": null}'`))).rejects.toThrow(new RegExp(`products_${col}_strings`))
    await expect(db.exec(ins('{"en": "Chair"}', `${col}='{"en": "x", "pt": null}'`))).rejects.toThrow(new RegExp(`products_${col}_strings`))
    await db.exec(ins('{"en": "Chair"}', `${col}='{"en": "x"}'`))
    await db.exec(ins('{"en": "Chair"}', `${col}='{"en": "x", "pt": "y"}'`))
    await db.exec(`delete from public.products where slug like 'loc-%'`)
  })

  it('the same holds for an update and for a colour or option name, and through save_product', async () => {
    await expect(db.exec(`update public.products set material = '{"en": 3}' where id = '${PUBLISHED}'`)).rejects.toThrow(/products_material_strings/)
    await expect(db.exec(`insert into public.product_variants (product_id, name) values ('${PUBLISHED}', '{"en": null}')`)).rejects.toThrow(/product_variants_name_strings/)
    await db.exec(`insert into public.product_variants (product_id, name) values ('${PUBLISHED}', '{"en": "Walnut", "pt": "Nogueira"}')`)
    await expect(h.probe(OWNER, SAVE, saveArgs({ name: { en: 'Chair', pt: null } }))).rejects.toThrow(/products_name_strings/)
    await expect(h.probe(OWNER, SAVE, saveArgs({ name: { en: 12 } }))).rejects.toThrow(/products_name_strings/)
    await h.probe(OWNER, SAVE, saveArgs({ name: { en: 'Chair', pt: 'Cadeira' } }))
  })
})

describe('BL-6: slug allocation is serialised', () => {
  it('private.unique_business_slug takes a transaction-level advisory lock, still builds the same slugs, and releases the lock at commit', async () => {
    const lock = `select count(*)::int as n from pg_locks where locktype = 'advisory' and pid = pg_backend_pid()`
    const during = await db.transaction(async (tx) => {
      const a = (await tx.query<{ s: string }>(`select private.unique_business_slug('Café  Ação') as s`)).rows[0]!.s
      const taken = (await tx.query<{ s: string }>(`select private.unique_business_slug('Casa') as s`)).rows[0]!.s
      const n = (await tx.query<{ n: number }>(lock)).rows[0]!.n
      return { a, taken, n }
    })
    expect(during.a).toBe('cafe-acao')
    expect(during.taken).toBe('casa-2')
    expect(during.n).toBeGreaterThan(0)
    expect((await db.query<{ n: number }>(lock)).rows[0]!.n).toBe(0)
  })
})

describe('RLS-04: the 10-device cap holds for a direct insert', () => {
  const sub = (n: number, day: number) =>
    `insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, created_at) values ($1, 'https://fcm.googleapis.com/fcm/send/${n}', 'k', 'a', '2026-02-${String(day).padStart(2, '0')}')`
  const endpoints = async (uid: string) => (await db.query<{ e: string }>(`select endpoint as e from public.push_subscriptions where user_id = $1 order by created_at`, [uid])).rows.map((r) => r.e)

  it('twelve direct inserts by one user leave the newest ten; another user keeps theirs', async () => {
    await h.as(OTHER, (tx) => tx.query(sub(900, 1), [OTHER]))
    for (let i = 1; i <= 12; i++) await h.as(OWNER, (tx) => tx.query(sub(i, i), [OWNER]))
    const mine = await endpoints(OWNER)
    expect(mine).toHaveLength(10)
    expect(mine[0]).toBe('https://fcm.googleapis.com/fcm/send/3')
    expect(mine.at(-1)).toBe('https://fcm.googleapis.com/fcm/send/12')
    expect(await endpoints(OTHER)).toEqual(['https://fcm.googleapis.com/fcm/send/900'])
  })

  it('a batch of inserts in one statement is capped too, and register_push_subscription still works', async () => {
    await db.exec(`delete from public.push_subscriptions where user_id = '${OWNER}'`)
    await h.as(OWNER, (tx) =>
      tx.query(`insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) select $1, 'https://fcm.googleapis.com/fcm/send/b' || g, 'k', 'a' from generate_series(1, 15) g`, [OWNER]),
    )
    expect(await endpoints(OWNER)).toHaveLength(10)
    await h.as(OWNER, (tx) => tx.query(`select public.register_push_subscription('https://fcm.googleapis.com/fcm/send/rpc', 'k', 'a', 'ua')`))
    expect(await endpoints(OWNER)).toHaveLength(10)
    expect(await endpoints(OWNER)).toContain('https://fcm.googleapis.com/fcm/send/rpc')
  })
})

describe('FV-06: a new category must be active and a new currency enabled', () => {
  const HID = id(50)
  const DIS = id(51)

  beforeAll(async () => {
    await db.exec(`
      ${product(HID, BIZ, 'old-hidden', { category: 'bed' })}; ${product(DIS, BIZ, 'old-disabled', { currency: 'USD' })};
      update public.product_categories set active = false where slug in ('bed', 'decor');
      update public.currencies set enabled = false where code = 'USD';
    `)
  })
  afterAll(async () => {
    await db.exec(`update public.product_categories set active = true; update public.currencies set enabled = true where code = 'USD'`)
  })

  it('save_product refuses a new product in a hidden category or a disabled currency, with stable keys', async () => {
    await expect(h.probe(OWNER, SAVE, saveArgs({ category: 'decor' }))).rejects.toThrow('category_hidden')
    await expect(h.probe(OWNER, SAVE, saveArgs({ currency: 'USD' }))).rejects.toThrow('currency_disabled')
    await expect(h.probe(OWNER, SAVE, saveArgs({ currency: 'GBP' }))).rejects.toThrow('currency_disabled')
    await h.probe(OWNER, SAVE, saveArgs({ category: 'chair', currency: 'BRL' }))
  })

  it('an existing product that kept a hidden category or a disabled currency stays valid; changing TO one is refused', async () => {
    const keep = (id_: string, slug: string, over: Record<string, unknown>) => saveArgs({ id: id_, slug, ...over })
    await h.probe(OWNER, SAVE, keep(HID, 'old-hidden', { category: 'bed', price: 5000 }))
    await h.probe(OWNER, SAVE, keep(DIS, 'old-disabled', { currency: 'USD', price: 5000 }))
    await h.as(OWNER, (tx) => tx.query(`update public.products set price = 7 where id = $1`, [HID]))
    await expect(h.probe(OWNER, SAVE, keep(HID, 'old-hidden', { category: 'decor' }))).rejects.toThrow('category_hidden')
    await expect(h.probe(OWNER, SAVE, keep(DIS, 'old-disabled', { currency: 'GBP' }))).rejects.toThrow('currency_disabled')
    await h.probe(OWNER, SAVE, keep(HID, 'old-hidden', { category: 'table' })) // moving out of a hidden category is fine
  })

  it('an API update is checked the same way, and the foreign keys still refuse an unknown value', async () => {
    await expect(h.probe(OWNER, `update public.products set category = 'decor' where id = $1`, [PUBLISHED])).rejects.toThrow('category_hidden')
    await expect(h.probe(OWNER, `update public.products set currency = 'GBP' where id = $1`, [PUBLISHED])).rejects.toThrow('currency_disabled')
    await expect(h.probe(OWNER, `update public.products set category = 'nope' where id = $1`, [PUBLISHED])).rejects.toMatchObject({ code: '23503' })
  })

  it('renaming the slug of a hidden category (the foreign key updates its products) is not blocked', async () => {
    await db.exec(`update public.product_categories set active = true where slug = 'bed'; ${product(id(52), BIZ, 'to-rename', { category: 'bed' })}; update public.product_categories set active = false where slug = 'bed'`)
    await db.exec(`update public.product_categories set slug = 'bed-renamed' where slug = 'bed'`)
    expect((await db.query<{ c: string }>(`select category as c from public.products where id = '${id(52)}'`)).rows[0]!.c).toBe('bed-renamed')
    await db.exec(`update public.product_categories set slug = 'bed' where slug = 'bed-renamed'`)
  })
})

describe('FV-07: the form rules now also hold in the database', () => {
  const bizUpdate = (set: string) => h.as(ADMIN, (tx) => tx.query(`update public.businesses set ${set} where id = $1`, [BIZ]))

  it('business description: 1000 characters after trimming', async () => {
    await bizUpdate(`description = '${'x'.repeat(1000)}'`)
    await bizUpdate(`description = '${'x'.repeat(1000)}   '`)
    await expect(bizUpdate(`description = '${'x'.repeat(1001)}'`)).rejects.toThrow(/businesses_description_len/)
  })

  it('contact e-mail shape (same as the editor) and website host', async () => {
    await bizUpdate(`contact_email = 'hello@casa.pt'`)
    await bizUpdate(`contact_email = null`)
    for (const bad of ['hello', 'hello@casa', 'a b@c.pt', '@c.pt', 'a@@c.pt']) {
      await expect(bizUpdate(`contact_email = '${bad}'`), bad).rejects.toThrow(/businesses_contact_email_shape/)
    }
    await bizUpdate(`contact_website = 'https://casa.pt/en?x=1'`)
    await bizUpdate(`contact_website = 'http://casa.pt'`)
    for (const bad of ['https://', 'http:///x', 'https:// casa.pt', 'ftp://casa.pt', 'casa.pt']) {
      await expect(bizUpdate(`contact_website = '${bad}'`), bad).rejects.toThrow(/businesses_contact_website_host|violates check/)
    }
  })

  it('product CTA URL needs a host', async () => {
    await h.as(OWNER, (tx) => tx.query(`update public.products set cta_url = 'https://casa.pt/buy' where id = $1`, [PUBLISHED]))
    await expect(h.as(OWNER, (tx) => tx.query(`update public.products set cta_url = 'https://' where id = $1`, [PUBLISHED]))).rejects.toThrow(/products_cta_url_host/)
    await h.as(OWNER, (tx) => tx.query(`update public.products set cta_url = null where id = $1`, [PUBLISHED]))
  })

  describe('Website Editor social links stay on the network\'s own domain', () => {
    const gate = async (social: Record<string, unknown>) => {
      const content = { ...emptySiteContent(), social }
      return (await db.query<{ r: string | null }>('select private.validate_site_content($1::jsonb) as r', [JSON.stringify(content)])).rows[0]!.r
    }
    it.each([
      ['instagram', 'https://instagram.com/sanctus'],
      ['instagram', 'https://www.instagram.com/sanctus/'],
      ['instagram', 'https://WWW.Instagram.com/sanctus'],
      ['facebook', 'https://fb.com/sanctus'],
      ['youtube', 'https://youtu.be/abc'],
      ['pinterest', 'https://www.pinterest.pt/sanctus'],
      ['tiktok', 'https://tiktok.com'],
      ['linkedin', 'https://pt.linkedin.com/company/sanctus?x=1#y'],
    ])('accepts %s %s', async (net, url) => {
      expect(await gate({ [net]: url })).toBeNull()
    })
    it.each([
      ['instagram', 'https://facebook.com/sanctus'],
      ['instagram', 'https://instagram.com.evil.example/x'],
      ['instagram', 'https://evil.example/instagram.com'],
      ['instagram', 'https://notinstagram.com/x'],
      ['instagram', 'https://user@instagram.com/x'],
      ['instagram', 'https://instagram.com@evil.example/x'],
      ['instagram', 'https://instagram.com:8443/x'],
      ['instagram', 'https://instagram.com/a b'],
      ['instagram', `https://instagram.com/${'a'.repeat(300)}`],
      ['youtube', 'https://instagram.com/x'],
      ['instagram', 'http://instagram.com/x'],
    ])('refuses %s %s', async (net, url) => {
      expect(await gate({ [net]: url })).toBe(`social.${net}|invalid_url`)
    })
  })
})

describe('the rollback', () => {
  it('puts the earlier behaviour back and drops what the migration added', async () => {
    const scratch = await freshDb()
    try {
      await scratch.exec(readFileSync(ROLLBACK_SQL, 'utf8'))
      const q = async <T>(sql: string) => (await scratch.query<T>(sql)).rows
      expect((await q<{ s: boolean }>(`select relrowsecurity as s from pg_class where oid = 'private.platform_invites'::regclass`))[0]!.s).toBe(false)
      expect(await q(`select 1 from pg_indexes where indexname in ('platform_members_invited_by_idx', 'owner_invite_attempts_actor_idx')`)).toHaveLength(0)
      expect(await q(`select 1 from pg_trigger where tgname in ('push_subscriptions_cap', 'products_list_values_check', 'product_models_published_keeps_glb_del')`)).toHaveLength(0)
      expect(await q(`select 1 from pg_constraint where conname like '%\\_strings' or conname in ('businesses_description_len', 'products_cta_url_host')`)).toHaveLength(0)
      expect(await q<{ d: string }>(`select pg_get_functiondef('public.cancel_model_request(uuid)'::regprocedure) as d`)).toEqual([expect.objectContaining({ d: expect.stringContaining('P0002') })])
      expect((await q<{ d: string }>(`select pg_get_functiondef('private.unique_business_slug(text)'::regprocedure) as d`))[0]!.d).not.toContain('advisory')
      expect((await q<{ d: string }>(`select pg_get_functiondef('private.validate_site_content(jsonb)'::regprocedure) as d`))[0]!.d).not.toContain('social_url_ok')
      // and the migration applies again on top of the rolled-back database
      await scratch.exec(readFileSync(join(MIGRATIONS, MIGRATION), 'utf8'))
      expect((await q<{ s: boolean }>(`select relrowsecurity as s from pg_class where oid = 'private.platform_invites'::regclass`))[0]!.s).toBe(true)
    } finally {
      await scratch.close()
    }
  }, 180_000)
})
