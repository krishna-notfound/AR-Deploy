// @vitest-environment node
// Applies every migration to a disposable in-process Postgres (PGlite, ADR-0020) with minimal stand-ins for
// Supabase's auth and storage schemas, then checks the database rules as the API role `authenticated`.
// Nothing here touches a live project.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite, type Transaction } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'
import type { ProductInput } from '../../src/services/catalogService'
import { toSaveProductArgs } from '../../src/services/supabase/supabaseCatalogService'

const MIGRATIONS = join(__dirname, '..', 'migrations')

// Just enough of Supabase for the migrations to apply: API roles, auth.uid() from a setting, storage tables.
const SUPABASE_STUBS = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, last_sign_in_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id),
    name text, owner uuid, metadata jsonb, created_at timestamptz default now());
  alter table storage.objects enable row level security;
  -- As on Supabase: the API roles hold table grants; RLS policies decide row access.
  grant select, insert, update, delete on storage.objects to anon, authenticated;
  create function storage.foldername(name text) returns text[] language sql immutable
    as $$ select (string_to_array(name, '/'))[1:cardinality(string_to_array(name, '/')) - 1] $$;
  grant usage on schema storage to anon, authenticated, service_role;
`

const ADMIN = '00000000-0000-0000-0000-00000000000a'
const OWNER = '00000000-0000-0000-0000-00000000000b'
const STRANGER = '00000000-0000-0000-0000-00000000000c'
const BIZ = '10000000-0000-0000-0000-000000000001'
const OTHER_BIZ = '10000000-0000-0000-0000-000000000002'
const OTHER_OWNER = '00000000-0000-0000-0000-00000000000d'

let db: PGlite

/** Runs `fn` in one transaction as the API role `authenticated`, signed in as `uid`. Rejects with the DB error. */
async function as<T>(uid: string, fn: (tx: Transaction) => Promise<T>, role: 'authenticated' | 'anon' = 'authenticated'): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`)
    await tx.query(`select set_config('test.uid', $1, true)`, [uid])
    return fn(tx)
  })
}

const input = (over: Partial<ProductInput> = {}): ProductInput => ({
  businessId: BIZ,
  slug: `p-${Math.random().toString(36).slice(2, 8)}`,
  name: { en: 'Chair' },
  shortDescription: { en: '' },
  description: { en: '' },
  category: 'chair',
  price: 10000,
  currency: 'EUR',
  images: [{ id: 'i1', url: 'https://img.test/a.jpg', isPrimary: true, kind: 'gallery' }],
  models: {},
  dimensions: { width: 80, height: 70, depth: 60, unit: 'cm' },
  material: { en: '' },
  variants: [],
  cta: { label: { en: 'Contact' } },
  ...over,
})

/** Creates a draft through the real save_product RPC, as the business owner. */
async function saveDraft(over: Partial<ProductInput> = {}, id: string | null = null): Promise<string> {
  const args = toSaveProductArgs(id, input(over))
  const r = await as(OWNER, (tx) => tx.query<{ id: string }>('select public.save_product($1, $2, $3, $4) as id', [args.p_product, args.p_images, args.p_models, args.p_variants]))
  return r.rows[0]!.id
}

const publish = (id: string, publishedAt = '2000-01-01T00:00:00Z') =>
  as(OWNER, (tx) => tx.query(`update public.products set status = 'published', published_at = $2 where id = $1`, [id, publishedAt]))

beforeAll(async () => {
  db = await PGlite.create()
  await db.exec(SUPABASE_STUBS)
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()) await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'))
  await db.exec(`
    insert into auth.users values ('${ADMIN}', 'admin@test', now()), ('${OWNER}', 'owner@test', now()), ('${STRANGER}', 'stranger@test', null),
      ('${OTHER_OWNER}', 'other@test', now());
    insert into public.platform_admins (user_id) values ('${ADMIN}');
    insert into public.businesses (id, name, slug, status) values ('${BIZ}', 'Biz', 'biz', 'active');
    insert into public.businesses (id, name, slug, status) values ('${OTHER_BIZ}', 'Other', 'other', 'active');
    insert into public.business_members (business_id, user_id) values ('${BIZ}', '${OWNER}'), ('${OTHER_BIZ}', '${OTHER_OWNER}');
  `)
}, 60_000)

describe('publish rules (20261013093006_publish_rules)', () => {
  it('refuses publishing a product without a gallery image, even through a direct API update', async () => {
    const id = await saveDraft({ images: [] })
    await expect(publish(id)).rejects.toThrow('publish_requires_gallery_image')
  })

  it('publishes a product with a gallery image and stamps published_at on the server', async () => {
    const id = await saveDraft()
    await publish(id, '2000-01-01T00:00:00Z') // the client tries to back-date it
    const r = await db.query<{ status: string; published_at: Date }>('select status, published_at from public.products where id = $1', [id])
    expect(r.rows[0]!.status).toBe('published')
    expect(r.rows[0]!.published_at.getUTCFullYear()).toBeGreaterThan(2000)
  })

  it('refuses removing the last gallery image of a published product', async () => {
    const id = await saveDraft()
    await publish(id)
    await expect(as(OWNER, (tx) => tx.query('delete from public.product_images where product_id = $1', [id]))).rejects.toThrow('publish_requires_gallery_image')
  })

  it('lets save_product replace the images of a published product (checked at commit, not mid-transaction)', async () => {
    const id = await saveDraft()
    await publish(id)
    await saveDraft({ images: [{ id: 'i2', url: 'https://img.test/b.jpg', isPrimary: true, kind: 'gallery' }] }, id)
    const r = await db.query<{ url: string }>('select url from public.product_images where product_id = $1', [id])
    expect(r.rows.map((x) => x.url)).toEqual(['https://img.test/b.jpg'])
  })

  it('never blocks unpublishing or deleting a published product', async () => {
    const id = await saveDraft()
    await publish(id)
    await as(OWNER, (tx) => tx.query(`update public.products set status = 'draft' where id = $1`, [id]))
    await publish(id)
    await as(OWNER, (tx) => tx.query('delete from public.products where id = $1', [id]))
    const r = await db.query('select 1 from public.products where id = $1', [id])
    expect(r.rows).toHaveLength(0)
  })
})

describe('access control (RLS, as the Data API roles)', () => {
  const DENIED = /permission denied|row-level security/
  const visibleTo = async (uid: string, id: string, role: 'authenticated' | 'anon' = 'authenticated') =>
    (await as(uid, (tx) => tx.query('select id from public.products where id = $1', [id]), role)).rows.length

  it('anonymous visitors see published products of active catalogs only', async () => {
    const draft = await saveDraft()
    const live = await saveDraft()
    await publish(live)
    expect(await visibleTo('', live, 'anon')).toBe(1)
    expect(await visibleTo('', draft, 'anon')).toBe(0)
    await db.query(`update public.businesses set status = 'inactive' where id = $1`, [BIZ])
    expect(await visibleTo('', live, 'anon')).toBe(0)
    await db.query(`update public.businesses set status = 'active' where id = $1`, [BIZ])
  })

  it('anonymous visitors cannot write anything', async () => {
    await expect(as('', (tx) => tx.query(`insert into public.businesses (name, slug) values ('X', 'x-anon')`), 'anon')).rejects.toThrow(DENIED)
    const id = await saveDraft()
    await as('', (tx) => tx.query(`update public.products set price = 1 where id = $1`, [id]), 'anon').catch(() => {})
    const r = await db.query<{ price: number }>('select price from public.products where id = $1', [id])
    expect(r.rows[0]!.price).toBe(10000)
  })

  it("an owner cannot see or change another business's drafts", async () => {
    const id = await saveDraft()
    expect(await visibleTo(OTHER_OWNER, id)).toBe(0)
    const upd = await as(OTHER_OWNER, (tx) => tx.query(`update public.products set price = 1 where id = $1`, [id]))
    expect(upd.affectedRows ?? 0).toBe(0)
    await expect(saveDraftAs(OTHER_OWNER, { businessId: BIZ })).rejects.toThrow(DENIED)
  })

  it('a signed-in stranger (no membership) gets no write access', async () => {
    await expect(saveDraftAs(STRANGER, {})).rejects.toThrow(DENIED)
    await expect(as(STRANGER, (tx) => tx.query(`insert into public.businesses (name, slug) values ('S', 's-stranger')`))).rejects.toThrow(DENIED)
  })

  it('platform admins can manage any business', async () => {
    await as(ADMIN, (tx) => tx.query(`update public.businesses set description = 'edited by admin' where id = $1`, [OTHER_BIZ]))
    const r = await db.query<{ description: string }>('select description from public.businesses where id = $1', [OTHER_BIZ])
    expect(r.rows[0]!.description).toBe('edited by admin')
  })
})

async function saveDraftAs(uid: string, over: Partial<ProductInput>): Promise<unknown> {
  const args = toSaveProductArgs(null, input(over))
  return as(uid, (tx) => tx.query('select public.save_product($1, $2, $3, $4)', [args.p_product, args.p_images, args.p_models, args.p_variants]))
}

describe('isolation between businesses (storage, analytics, members)', () => {
  const objectsVisibleTo = async (uid: string, name: string, role: 'authenticated' | 'anon' = 'authenticated') =>
    (await as(uid, (tx) => tx.query(`select 1 from storage.objects where bucket_id = 'product-media' and name = $1`, [name]), role)).rows.length

  it("an owner cannot read, delete or plant another business's media", async () => {
    const path = `${BIZ}/models/secret-draft.glb`
    await db.query(`insert into storage.objects (bucket_id, name) values ('product-media', $1)`, [path])
    expect(await objectsVisibleTo(OWNER, path)).toBe(1)
    expect(await objectsVisibleTo(OTHER_OWNER, path)).toBe(0)
    expect(await objectsVisibleTo('', path, 'anon')).toBe(0) // not referenced by a published product
    const del = await as(OTHER_OWNER, (tx) => tx.query(`delete from storage.objects where name = $1`, [path]))
    expect(del.affectedRows ?? 0).toBe(0)
    await expect(
      as(OTHER_OWNER, (tx) => tx.query(`insert into storage.objects (bucket_id, name) values ('product-media', $1)`, [`${BIZ}/models/planted.glb`])),
    ).rejects.toThrow(/row-level security/)
  })

  it("an owner cannot expose another business's media by referencing its path from their own product", async () => {
    const theirs = await as(OTHER_OWNER, async (tx) => {
      const args = toSaveProductArgs(null, input({ businessId: OTHER_BIZ }))
      return (await tx.query<{ id: string }>('select public.save_product($1, $2, $3, $4) as id', [args.p_product, args.p_images, args.p_models, args.p_variants])).rows[0]!.id
    })
    await expect(
      as(OTHER_OWNER, (tx) => tx.query(`insert into public.product_images (product_id, storage_path, kind) values ($1, $2, 'gallery')`, [theirs, `${BIZ}/models/secret-draft.glb`])),
    ).rejects.toThrow(/row-level security/)
  })

  it("an owner cannot read another business's analytics or members", async () => {
    const live = await saveDraft()
    await publish(live)
    await db.query(`insert into public.product_analytics (product_id, business_id, event_type) values ($1, $2, 'view')`, [live, BIZ])
    const mine = await as(OWNER, (tx) => tx.query('select 1 from public.product_analytics where business_id = $1', [BIZ]))
    const theirs = await as(OTHER_OWNER, (tx) => tx.query('select 1 from public.product_analytics where business_id = $1', [BIZ]))
    expect(mine.rows.length).toBeGreaterThan(0)
    expect(theirs.rows).toHaveLength(0)
    const members = await as(OTHER_OWNER, (tx) => tx.query('select 1 from public.business_members where business_id = $1', [BIZ]))
    expect(members.rows).toHaveLength(0)
  })
})

describe('variant media (20261020143507_variant_media)', () => {
  const DENIED = /permission denied|row-level security/
  const uuid = () => crypto.randomUUID()
  const img = (biz: string, ext = 'png') => `${biz}/${uuid()}.${ext}`
  const photo = (path: string) => ({ id: 'vi', url: '', storagePath: path, isPrimary: true, kind: 'gallery' as const })
  const glbAsset = (path: string, requiredExtensions?: string[]) => ({ format: 'glb' as const, url: '', fileName: 'v.glb', status: 'valid' as const, storagePath: path, ...(requiredExtensions ? { requiredExtensions } : {}) })
  type V = ProductInput['variants'][number]
  const variant = (over: Partial<V> = {}): V => ({ id: 'var_new', name: { en: 'Oak' }, ...over })

  /** save_product as `uid` (default the owner); returns the product id. */
  async function save(over: Partial<ProductInput>, id: string | null = null, uid = OWNER): Promise<string> {
    const args = toSaveProductArgs(id, input(over))
    const r = await as(uid, (tx) => tx.query<{ id: string }>('select public.save_product($1, $2, $3, $4) as id', [args.p_product, args.p_images, args.p_models, args.p_variants]))
    return r.rows[0]!.id
  }
  const variantsOf = async (productId: string) =>
    (await db.query<{ id: string; en: string }>(`select id, name->>'en' as en from public.product_variants where product_id = $1 order by sort_order`, [productId])).rows
  const countMedia = async (productId: string, uid = '', role: 'authenticated' | 'anon' = 'anon') =>
    as(
      uid,
      async (tx) => {
        const r = await tx.query<{ i: number; m: number }>(
          `select (select count(*)::int from public.product_variant_images where product_id = $1) as i,
                  (select count(*)::int from public.product_variant_models where product_id = $1) as m`,
          [productId],
        )
        return r.rows[0]!
      },
      role,
    )

  it("an owner attaches photos and models of their own business to a variant; ids stay stable across saves", async () => {
    const path = img(BIZ)
    const model = img(BIZ, 'glb')
    const id = await save({ variants: [variant({ images: [photo(path)], models: { glb: glbAsset(model, ['KHR_texture_transform', 'EXT_texture_webp']) } })] })
    const [first] = await variantsOf(id)
    expect(await countMedia(id, OWNER, 'authenticated')).toEqual({ i: 1, m: 1 })
    const stored = await db.query<{ required_extensions: string[] }>('select required_extensions from public.product_variant_models where variant_id = $1', [first!.id])
    expect(stored.rows[0]!.required_extensions).toEqual(['KHR_texture_transform', 'EXT_texture_webp'])

    // Saving again with the stored id keeps the variant (and so any link to it) and replaces its media.
    const second = img(BIZ, 'webp')
    await save({ variants: [variant({ id: first!.id, name: { en: 'Oak (renamed)' }, images: [photo(path), photo(second)] })] }, id)
    const after = await variantsOf(id)
    expect(after).toEqual([{ id: first!.id, en: 'Oak (renamed)' }])
    expect(await countMedia(id, OWNER, 'authenticated')).toEqual({ i: 2, m: 0 })
  })

  it("refuses another business's folder, traversal or sub-folder paths and a model in a photo slot", async () => {
    const id = await save({ variants: [variant()] })
    const [v] = await variantsOf(id)
    for (const bad of [img(OTHER_BIZ), `${BIZ}/../${OTHER_BIZ}/x.png`, `${BIZ}/sub/${uuid()}.png`, img(BIZ, 'glb')])
      await expect(save({ variants: [variant({ id: v!.id, images: [photo(bad)] })] }, id)).rejects.toThrow(DENIED)
    await expect(save({ variants: [variant({ id: v!.id, models: { glb: glbAsset(img(OTHER_BIZ, 'glb')) } })] }, id)).rejects.toThrow(DENIED)
    await expect(save({ variants: [variant({ id: v!.id, models: { glb: glbAsset(img(BIZ, 'png')) } })] }, id)).rejects.toThrow(DENIED)
  })

  it("cannot reference another product's variant", async () => {
    const theirs = await save({ businessId: OTHER_BIZ, variants: [variant({ name: { en: 'Theirs' } })] }, null, OTHER_OWNER)
    const [their] = await variantsOf(theirs)
    // save_product ignores a foreign id: the owner gets a new variant, the other one is untouched.
    const mine = await save({ variants: [variant({ id: their!.id, name: { en: 'Hijack' }, images: [photo(img(BIZ))] })] })
    const [own] = await variantsOf(mine)
    expect(own!.id).not.toBe(their!.id)
    expect(await variantsOf(theirs)).toEqual([{ id: their!.id, en: 'Theirs' }])
    // Direct API writes: a foreign variant paired with an own product breaks the composite FK; a foreign product is RLS.
    await expect(
      as(OWNER, (tx) => tx.query('insert into public.product_variant_images (variant_id, product_id, storage_path) values ($1, $2, $3)', [their!.id, mine, img(BIZ)])),
    ).rejects.toThrow(/foreign key/)
    await expect(
      as(OWNER, (tx) => tx.query('insert into public.product_variant_images (variant_id, product_id, storage_path) values ($1, $2, $3)', [their!.id, theirs, img(OTHER_BIZ)])),
    ).rejects.toThrow(DENIED)
    // No UPDATE grant: rows can never be re-pointed. Visitors cannot write at all.
    await expect(as(OWNER, (tx) => tx.query('update public.product_variant_images set product_id = $1 where product_id = $2', [theirs, mine]))).rejects.toThrow(/permission denied/)
    await expect(
      as('', (tx) => tx.query('insert into public.product_variant_images (variant_id, product_id, storage_path) values ($1, $2, $3)', [own!.id, mine, img(BIZ)]), 'anon'),
    ).rejects.toThrow(/permission denied/)
    expect(await countMedia(mine, OTHER_OWNER, 'authenticated')).toEqual({ i: 0, m: 0 }) // a draft of another business
  })

  it('the public sees variant media (rows and files) only for published products of active businesses', async () => {
    const path = img(BIZ)
    await db.query(`insert into storage.objects (bucket_id, name) values ('product-media', $1)`, [path])
    const fileVisible = async () => (await as('', (tx) => tx.query(`select 1 from storage.objects where bucket_id = 'product-media' and name = $1`, [path]), 'anon')).rows.length
    const id = await save({ variants: [variant({ images: [photo(path)] })] })
    expect(await countMedia(id)).toEqual({ i: 0, m: 0 })
    expect(await fileVisible()).toBe(0)
    await publish(id)
    expect(await countMedia(id)).toEqual({ i: 1, m: 0 })
    expect(await fileVisible()).toBe(1)
    await db.query(`update public.businesses set status = 'inactive' where id = $1`, [BIZ])
    try {
      expect(await countMedia(id)).toEqual({ i: 0, m: 0 })
      expect(await fileVisible()).toBe(0)
    } finally {
      await db.query(`update public.businesses set status = 'active' where id = $1`, [BIZ])
    }
    // Removing the variant deletes its media rows, and the file is no longer readable through it.
    await save({ variants: [] }, id)
    expect(await countMedia(id, OWNER, 'authenticated')).toEqual({ i: 0, m: 0 })
    expect(await fileVisible()).toBe(0)
  })

  it('caps variants and photos per variant', async () => {
    const many = Array.from({ length: 51 }, (_, i) => variant({ id: `var_${i}`, name: { en: `V${i}` } }))
    await expect(save({ variants: many })).rejects.toThrow('too_many_variants')
    const photos = Array.from({ length: 21 }, () => photo(img(BIZ)))
    await expect(save({ variants: [variant({ images: photos })] })).rejects.toThrow('too_many_variant_images')
  })

  it("stores the product GLB's required extensions (Scene Viewer warning survives a reload)", async () => {
    const id = await save({ models: { glb: { format: 'glb', url: 'https://x.test/a.glb', fileName: 'a.glb', status: 'valid', requiredExtensions: ['EXT_texture_webp'] } } })
    const r = await db.query<{ required_extensions: string[] }>('select required_extensions from public.product_models where product_id = $1', [id])
    expect(r.rows[0]!.required_extensions).toEqual(['EXT_texture_webp'])
  })

  it('a product can never move to another business, not even by a platform admin (OWN-01)', async () => {
    const SECOND = '10000000-0000-0000-0000-000000000003'
    await db.exec(`insert into public.businesses (id, name, slug, status) values ('${SECOND}', 'Second', 'second', 'active') on conflict do nothing`)
    const id = await save({})
    await expect(as(OWNER, (tx) => tx.query('update public.products set business_id = $2 where id = $1', [id, SECOND]))).rejects.toThrow(/product_business_immutable|row-level security/)
    await expect(as(ADMIN, (tx) => tx.query('update public.products set business_id = $2 where id = $1', [id, SECOND]))).rejects.toThrow('product_business_immutable')
    const r = await db.query<{ business_id: string }>('select business_id from public.products where id = $1', [id])
    expect(r.rows[0]!.business_id).toBe(BIZ)
  })

  it('grants: visitors read only, owners read/insert/delete (no update), anon cannot run save_product', async () => {
    const g = await db.query<{ g: string }>(`select string_agg(grantee || ':' || privilege_type, ' ' order by grantee, privilege_type) as g
      from information_schema.role_table_grants where table_name = 'product_variant_models' and grantee in ('anon', 'authenticated')`)
    expect(g.rows[0]!.g).toBe('anon:SELECT authenticated:DELETE authenticated:INSERT authenticated:SELECT')
    const args = toSaveProductArgs(null, input())
    await expect(as('', (tx) => tx.query('select public.save_product($1, $2, $3, $4)', [args.p_product, args.p_images, args.p_models, args.p_variants]), 'anon')).rejects.toThrow(/permission denied/)
  })
})

describe('email log (20261020084414_email_log)', () => {
  const insertAsService = (status: string, recipient = 'delivered@resend.dev') =>
    db.transaction(async (tx) => {
      await tx.exec('set local role service_role')
      return tx.query<{ id: string }>(`insert into public.email_log (kind, recipient, subject, status) values ('test', $1, 'Test', $2) returning id`, [recipient, status])
    })

  it('only the service role writes; only platform admins read', async () => {
    await insertAsService('accepted')
    expect((await as(ADMIN, (tx) => tx.query('select * from public.email_log'))).rows.length).toBeGreaterThan(0)
    expect((await as(OWNER, (tx) => tx.query('select * from public.email_log'))).rows).toHaveLength(0)
    await expect(as(STRANGER, (tx) => tx.query('select * from public.email_log'), 'anon')).rejects.toThrow(/permission denied/)
    await expect(as(ADMIN, (tx) => tx.query(`insert into public.email_log (kind, recipient, subject, status) values ('test', 'x@y.z', 'T', 'accepted')`))).rejects.toThrow(/permission denied/)
    await expect(as(OWNER, (tx) => tx.query(`update public.email_log set status = 'delivered'`))).rejects.toThrow(/permission denied/)
  })

  it('accepts only known statuses, so "delivered" cannot be written as free text', async () => {
    await expect(insertAsService('queued')).rejects.toThrow(/check constraint/)
    await expect(insertAsService('accepted', 'x')).rejects.toThrow(/check constraint/)
  })
})

describe('applications, review, one owner, audit (20261020091428_applications_and_owner_access)', () => {
  const NEW_OWNER = '00000000-0000-0000-0000-0000000000f1'
  const SECOND = '00000000-0000-0000-0000-0000000000f2'
  const asService = <T,>(fn: (tx: Transaction) => Promise<T>) =>
    db.transaction(async (tx) => {
      await tx.exec('set local role service_role')
      return fn(tx)
    })
  const submit = (name = 'Casa Teste', key = crypto.randomUUID()) =>
    asService((tx) =>
      tx.query<{ id: string }>(
        `insert into public.business_applications (business_name, applicant_name, applicant_email, country, city, category, submission_key, answers)
         values ($1, 'Ana Lima', 'ana@example.test', 'Portugal', 'Lisboa', 'Lighting', $2, '{"description":"Hand-made lamps"}') returning id`,
        [name, key],
      ),
    ).then((r) => r.rows[0]!.id)
  const review = (uid: string, id: string, action: string, reason: string | null = null) =>
    as(uid, (tx) => tx.query<{ status: string; business_id: string | null; reviewed_by: string }>('select * from public.admin_review_application($1, $2, $3)', [id, action, reason])).then(
      (r) => r.rows[0]!,
    )

  beforeAll(async () => {
    await db.exec(`insert into auth.users values ('${NEW_OWNER}', 'invitee@test', null), ('${SECOND}', 'second@test', now());`)
  })

  it('removes self-registration, claim links and the old link-by-email function', async () => {
    const left = await db.query<{ n: number }>(`select count(*)::int as n from pg_proc where proname in
      ('register_business', 'redeem_business_claim', 'admin_create_business_claim', 'admin_add_business_member', 'caller_email_confirmed')`)
    expect(left.rows[0]!.n).toBe(0)
  })

  it('applications are private: only the service role inserts, only platform admins read', async () => {
    const id = await submit()
    expect((await as(ADMIN, (tx) => tx.query('select 1 from public.business_applications where id = $1', [id]))).rows).toHaveLength(1)
    expect((await as(OWNER, (tx) => tx.query('select 1 from public.business_applications'))).rows).toHaveLength(0)
    await expect(as('', (tx) => tx.query('select 1 from public.business_applications'), 'anon')).rejects.toThrow(/permission denied/)
    await expect(
      as(
        OWNER,
        (tx) => tx.query(`insert into public.business_applications (business_name, applicant_name, applicant_email, country, city, category, submission_key) values ('X X', 'Y Y', 'y@t.co', 'PT', 'L', 'Decor', gen_random_uuid())`),
      ),
    ).rejects.toThrow(/permission denied/)
    await expect(as(ADMIN, (tx) => tx.query(`update public.business_applications set status = 'approved' where id = $1`, [id]))).rejects.toThrow(/permission denied/)
  })

  it('the same submission key creates one application (duplicate submissions)', async () => {
    const key = crypto.randomUUID()
    await submit('Dup Biz', key)
    await expect(submit('Dup Biz', key)).rejects.toThrow(/duplicate key/)
  })

  it('only platform admins review; approval creates one private draft business and is idempotent', async () => {
    const id = await submit('Atelier Ção')
    await expect(review(OWNER, id, 'approve')).rejects.toThrow(/platform_admin_only/)
    expect((await review(ADMIN, id, 'start_review')).status).toBe('under_review')
    const approved = await review(ADMIN, id, 'approve')
    expect(approved.status).toBe('approved')
    expect(approved.reviewed_by).toBe(ADMIN)
    const again = await review(ADMIN, id, 'approve')
    expect(again.business_id).toBe(approved.business_id)
    const biz = await db.query<{ slug: string; status: string; contact_email: string | null; description: string }>('select * from public.businesses where id = $1', [approved.business_id])
    expect(biz.rows[0]).toMatchObject({ slug: 'atelier-cao', status: 'draft', contact_email: null, description: 'Hand-made lamps' })
    expect((await as('', (tx) => tx.query('select 1 from public.businesses where id = $1', [approved.business_id]), 'anon')).rows).toHaveLength(0)
    await expect(review(ADMIN, id, 'reject', 'Too late')).rejects.toThrow(/invalid_transition/)
    const events = await db.query<{ event_type: string; actor_id: string; from_status: string | null; to_status: string | null }>(
      'select event_type, actor_id, from_status, to_status from public.audit_events where application_id = $1 order by created_at, event_type',
      [id],
    )
    expect(events.rows.map((e) => [e.event_type, e.from_status, e.to_status])).toEqual(
      expect.arrayContaining([
        ['application_status_changed', 'submitted', 'under_review'],
        ['business_created', null, null],
        ['application_status_changed', 'under_review', 'approved'],
      ]),
    )
    expect(events.rows.every((e) => e.actor_id === ADMIN)).toBe(true)
  })

  it('rejection needs a reason, keeps the answers and creates no business; it can be reopened', async () => {
    const id = await submit('No Biz')
    await expect(review(ADMIN, id, 'reject')).rejects.toThrow(/reason_required/)
    const rejected = await review(ADMIN, id, 'reject', 'Outside our scope')
    expect(rejected).toMatchObject({ status: 'rejected', business_id: null })
    const row = await db.query<{ answers: { description: string }; decision_reason: string }>('select * from public.business_applications where id = $1', [id])
    expect(row.rows[0]).toMatchObject({ answers: { description: 'Hand-made lamps' }, decision_reason: 'Outside our scope' })
    expect((await review(ADMIN, id, 'start_review')).status).toBe('under_review')
  })

  it('exactly one owner per business; provisioning helpers are server-only', async () => {
    const id = await submit('Owner Biz')
    const biz = (await review(ADMIN, id, 'approve')).business_id!
    const link = (uid: string) => asService((tx) => tx.query<{ r: string }>('select public.service_link_owner($1, $2, $3, $4) as r', [biz, uid, ADMIN, id])).then((r) => r.rows[0]!.r)
    expect(await link(NEW_OWNER)).toBe('linked')
    expect(await link(NEW_OWNER)).toBe('already_linked')
    await expect(link(SECOND)).rejects.toThrow(/business_has_owner/)
    await expect(db.query(`insert into public.business_members (business_id, user_id) values ($1, $2)`, [biz, SECOND])).rejects.toThrow(/duplicate key/)
    await expect(as(ADMIN, (tx) => tx.query('select public.service_link_owner($1, $2, $3)', [biz, SECOND, ADMIN]))).rejects.toThrow(/permission denied/)
    await expect(as(ADMIN, (tx) => tx.query(`select public.service_user_id_by_email('owner@test')`))).rejects.toThrow(/permission denied/)
    expect((await asService((tx) => tx.query<{ id: string }>(`select public.service_user_id_by_email(' OWNER@test ') as id`))).rows[0]!.id).toBe(OWNER)

    // The invited owner finishes onboarding; acceptance is recorded once, by the owner themselves.
    expect((await as(NEW_OWNER, (tx) => tx.query<{ b: string }>('select public.complete_owner_onboarding() as b'))).rows[0]!.b).toBe(biz)
    const member = await db.query<{ accepted_at: Date | null; invited_at: Date | null }>('select accepted_at, invited_at from public.business_members where business_id = $1', [biz])
    expect(member.rows[0]!.accepted_at).not.toBeNull()
    expect(member.rows[0]!.invited_at).not.toBeNull()
    const owners = await as(ADMIN, (tx) => tx.query<{ email: string; accepted_at: Date | null }>('select * from public.admin_list_business_members($1)', [biz]))
    expect(owners.rows).toHaveLength(1)
    expect(owners.rows[0]!.email).toBe('invitee@test')

    // Actor emails for the audit log: platform admins only.
    const emails = await as(ADMIN, (tx) => tx.query<{ id: string; email: string }>('select * from public.admin_user_emails($1)', [[NEW_OWNER]]))
    expect(emails.rows).toEqual([{ id: NEW_OWNER, email: 'invitee@test' }])
    await expect(as(OWNER, (tx) => tx.query('select * from public.admin_user_emails($1)', [[NEW_OWNER]]))).rejects.toThrow(/platform_admin_only/)
    await expect(as(OWNER, (tx) => tx.query('select * from public.admin_user_emails($1)', [[NEW_OWNER]]), 'anon')).rejects.toThrow(/permission denied/)
  })

  it('the audit trail is append-only and readable by platform admins only', async () => {
    await asService((tx) => tx.query(`insert into public.audit_events (event_type) values ('invitation_requested')`))
    await expect(asService((tx) => tx.query(`update public.audit_events set event_type = 'x_x_x'`))).rejects.toThrow(/permission denied/)
    await expect(asService((tx) => tx.query('delete from public.audit_events'))).rejects.toThrow(/permission denied/)
    await expect(as(ADMIN, (tx) => tx.query(`insert into public.audit_events (event_type) values ('forged_event')`))).rejects.toThrow(/permission denied/)
    expect((await as(ADMIN, (tx) => tx.query('select 1 from public.audit_events'))).rows.length).toBeGreaterThan(0)
    expect((await as(OWNER, (tx) => tx.query('select 1 from public.audit_events'))).rows).toHaveLength(0)
  })

  it('records who changed a catalogue status', async () => {
    await as(ADMIN, (tx) => tx.query(`update public.businesses set status = 'inactive' where id = $1`, [OTHER_BIZ]))
    const ev = await db.query<{ actor_id: string; from_status: string; to_status: string }>(
      `select actor_id, from_status, to_status from public.audit_events where business_id = $1 and event_type = 'business_status_changed'`,
      [OTHER_BIZ],
    )
    expect(ev.rows[0]).toEqual({ actor_id: ADMIN, from_status: 'active', to_status: 'inactive' })
    await as(ADMIN, (tx) => tx.query(`update public.businesses set status = 'active' where id = $1`, [OTHER_BIZ]))
  })

  it('records each provider event once and never moves an email status backwards', async () => {
    await asService((tx) => tx.query(`insert into public.email_log (kind, recipient, subject, status, provider_message_id) values ('test', 'delivered@resend.dev', 'T', 'accepted', 'msg-wh-1')`))
    const event = (svix: string, type: string) =>
      asService((tx) => tx.query<{ r: boolean }>('select public.service_record_email_event($1, $2, $3) as r', [svix, 'msg-wh-1', type])).then((r) => r.rows[0]!.r)
    const status = async () => (await db.query<{ status: string }>(`select status from public.email_log where provider_message_id = 'msg-wh-1'`)).rows[0]!.status
    expect(await event('svix-1', 'email.delivered')).toBe(true)
    expect(await event('svix-1', 'email.delivered')).toBe(false)
    expect(await status()).toBe('delivered')
    expect(await event('svix-2', 'email.sent')).toBe(true)
    expect(await status()).toBe('delivered')
    await expect(as(ADMIN, (tx) => tx.query(`select public.service_record_email_event('x', 'msg-wh-1', 'email.bounced')`))).rejects.toThrow(/permission denied/)
  })
})

describe('security hardening (20261024065538_security_hardening)', () => {
  const DENIED = /permission denied|row-level security/
  const HB = '10000000-0000-0000-0000-0000000000b1'
  const HOWNER = '00000000-0000-0000-0000-0000000000b1'
  const uuid = () => crypto.randomUUID()
  const asService = <T,>(fn: (tx: Transaction) => Promise<T>) =>
    db.transaction(async (tx) => {
      await tx.exec('set local role service_role')
      return fn(tx)
    })
  const biz = async () => (await db.query<Record<string, unknown>>('select * from public.businesses where id = $1', [HB])).rows[0]!
  const rpc = (uid: string, args: ReturnType<typeof toSaveProductArgs>) =>
    as(uid, (tx) => tx.query<{ id: string }>('select public.save_product($1, $2, $3, $4) as id', [args.p_product, args.p_images, args.p_models, args.p_variants])).then(
      (r) => r.rows[0]!.id,
    )
  const photo = (storagePath: string) => ({ id: 'p1', url: '', storagePath, isPrimary: true, kind: 'gallery' as const })
  const model = (m: { storagePath?: string; url?: string }) => ({
    glb: { format: 'glb' as const, url: m.url ?? '', fileName: 'a.glb', status: 'valid' as const, ...(m.storagePath ? { storagePath: m.storagePath } : {}) },
  })
  const httpImage = [{ id: 'h', url: 'http://img.test/a.jpg', isPrimary: true, kind: 'gallery' as const }]

  beforeAll(async () => {
    await db.exec(`
      insert into auth.users values ('${HOWNER}', 'hardening-owner@test', now());
      insert into public.businesses (id, name, slug, status, logo_url) values ('${HB}', 'Hardened', 'hardened', 'active', 'https://cdn.test/logo.png');
      insert into public.business_members (business_id, user_id) values ('${HB}', '${HOWNER}');
    `)
  })

  describe('SEC-27 / OWN-06: owner columns, timestamps, https URLs', () => {
    it('an owner edits name, logo, description and contact fields of their business', async () => {
      await as(HOWNER, (tx) =>
        tx.query(
          `update public.businesses set name = 'Hardened Co', logo_url = 'https://cdn.test/new.png', description = 'Hand-made',
             contact_email = 'shop@test', contact_phone = '+351 1', contact_website = 'https://shop.test', contact_address = 'Lisboa' where id = $1`,
          [HB],
        ),
      )
      expect(await biz()).toMatchObject({ name: 'Hardened Co', logo_url: 'https://cdn.test/new.png', description: 'Hand-made', contact_address: 'Lisboa' })
    })

    it('an owner cannot change status, slug, accent colour or currency (unchanged values in the payload are fine)', async () => {
      const ownerSet = (sql: string) => as(HOWNER, (tx) => tx.query(`update public.businesses set ${sql} where id = $1`, [HB]))
      await expect(ownerSet(`status = 'inactive'`)).rejects.toThrow(/Only platform admins/)
      await expect(ownerSet(`slug = 'renamed'`)).rejects.toThrow(/Only platform admins/)
      await expect(ownerSet(`accent_color = '#000000'`)).rejects.toThrow(/business_field_admin_only/)
      await expect(ownerSet(`default_currency = 'USD'`)).rejects.toThrow(/business_field_admin_only/)
      await ownerSet(`slug = 'hardened', status = 'active', accent_color = accent_color, description = 'Same values re-sent'`)
      expect((await biz()).description).toBe('Same values re-sent')
    })

    it('no API role writes ids or timestamps, platform admins included; admins still manage admin fields', async () => {
      for (const uid of [HOWNER, ADMIN]) {
        for (const set of [`created_at = '2000-01-01'`, `updated_at = '2000-01-01'`, 'id = gen_random_uuid()'])
          await expect(as(uid, (tx) => tx.query(`update public.businesses set ${set} where id = $1`, [HB]))).rejects.toThrow(/permission denied/)
      }
      await as(ADMIN, (tx) => tx.query(`update public.businesses set accent_color = '#112233', default_currency = 'BRL', status = 'inactive' where id = $1`, [HB]))
      expect(await biz()).toMatchObject({ accent_color: '#112233', default_currency: 'BRL', status: 'inactive' })
      await as(ADMIN, (tx) => tx.query(`update public.businesses set status = 'active' where id = $1`, [HB]))
      await expect(as('', (tx) => tx.query(`update public.businesses set name = 'x' where id = $1`, [HB]), 'anon')).rejects.toThrow(/permission denied/)
    })

    it('logo_url must be https, for owners and admins alike', async () => {
      for (const uid of [HOWNER, ADMIN])
        await expect(as(uid, (tx) => tx.query(`update public.businesses set logo_url = 'http://tracker.test/p.png' where id = $1`, [HB]))).rejects.toThrow(
          /businesses_logo_url_https/,
        )
      await as(HOWNER, (tx) => tx.query(`update public.businesses set logo_url = null where id = $1`, [HB]))
      expect((await biz()).logo_url).toBeNull()
    })

    it('products: no back-dated created_at, a draft keeps its published_at, publishing still stamps it', async () => {
      const id = await saveDraft()
      for (const uid of [OWNER, ADMIN])
        await expect(as(uid, (tx) => tx.query(`update public.products set created_at = '2000-01-01' where id = $1`, [id]))).rejects.toThrow(/permission denied/)
      await as(OWNER, (tx) => tx.query(`update public.products set published_at = '2000-01-01' where id = $1`, [id]))
      const draft = await db.query<{ published_at: Date | null }>('select published_at from public.products where id = $1', [id])
      expect(draft.rows[0]!.published_at).toBeNull()
      await publish(id)
      const live = await db.query<{ published_at: Date }>('select published_at from public.products where id = $1', [id])
      expect(live.rows[0]!.published_at.getFullYear()).toBeGreaterThan(2000)
    })

    it('product image and model URLs must be https (or a same-origin /path)', async () => {
      await expect(saveDraftAs(OWNER, { images: httpImage })).rejects.toThrow(/product_images_url_https/)
      await expect(saveDraftAs(ADMIN, { images: httpImage })).rejects.toThrow(/product_images_url_https/)
      await expect(saveDraftAs(OWNER, { models: model({ url: 'http://cdn.test/a.glb' }) })).rejects.toThrow(/product_models_url_https/)
      await saveDraftAs(OWNER, { images: [{ id: 'h', url: '/demo/a.jpg', isPrimary: true, kind: 'gallery' }], models: model({ url: 'https://cdn.test/a.glb' }) })
    })
  })

  describe('OWN-02: exact storage_path shape for product images and models', () => {
    it('accepts <business>/<uuid>.<ext> uploads of the own business', async () => {
      await saveDraftAs(OWNER, { images: [photo(`${BIZ}/${uuid()}.webp`)], models: model({ storagePath: `${BIZ}/${uuid()}.glb` }) })
      await saveDraftAs(ADMIN, { images: [photo(`${BIZ}/${uuid()}.jpeg`)], models: model({ storagePath: `${BIZ}/${uuid()}.usdz` }) })
    })

    it('refuses traversal, sub-folders, odd names and a model in a photo slot, for owners and admins', async () => {
      const bad = [`${BIZ}/../${OTHER_BIZ}/x.png`, `${BIZ}/sub/${uuid()}.png`, `${BIZ}/draft.png`, `${BIZ}/${uuid()}.glb`, `${BIZ}/${uuid()}.svg`]
      for (const p of bad) {
        await expect(saveDraftAs(OWNER, { images: [photo(p)] })).rejects.toThrow(DENIED)
        await expect(saveDraftAs(ADMIN, { images: [photo(p)] })).rejects.toThrow(DENIED)
      }
      await expect(saveDraftAs(OWNER, { models: model({ storagePath: `${BIZ}/${uuid()}.png` }) })).rejects.toThrow(DENIED)
      await expect(saveDraftAs(OWNER, { models: model({ storagePath: `${OTHER_BIZ}/${uuid()}.glb` }) })).rejects.toThrow(DENIED)
    })
  })

  describe('OWN-03: integrity rules', () => {
    it('refuses a whitespace-only English name, on create and on direct update', async () => {
      await expect(saveDraftAs(OWNER, { name: { en: ' \t ' } })).rejects.toThrow(/products_name_en_not_blank/)
      const id = await saveDraft()
      await expect(as(OWNER, (tx) => tx.query(`update public.products set name = '{"en":"   "}' where id = $1`, [id]))).rejects.toThrow(/products_name_en_not_blank/)
    })

    it('refuses a negative variant price difference; zero and positive are fine', async () => {
      await expect(saveDraftAs(OWNER, { variants: [{ id: 'v', name: { en: 'Oak' }, priceDelta: -1000 }] })).rejects.toThrow(/product_variants_price_delta_nonneg/)
      await saveDraftAs(OWNER, { variants: [{ id: 'v1', name: { en: 'Oak' }, priceDelta: 0 }, { id: 'v2', name: { en: 'Walnut' }, priceDelta: 2500 }] })
    })

    it('allows at most one primary image per product and per variant (the editor sends one)', async () => {
      const args = toSaveProductArgs(
        null,
        input({ images: [{ id: 'a', url: 'https://img.test/a.jpg', isPrimary: true, kind: 'gallery' }, { id: 'b', url: 'https://img.test/b.jpg', isPrimary: false, kind: 'gallery' }] }),
      )
      await rpc(OWNER, args)
      const two = { ...args, p_product: { ...args.p_product, slug: `p-${uuid().slice(0, 6)}` }, p_images: args.p_images.map((i) => ({ ...i, is_primary: true })) }
      await expect(rpc(OWNER, two)).rejects.toThrow(/product_images_one_primary_idx/)
      const v = toSaveProductArgs(null, input({ variants: [{ id: 'v', name: { en: 'Oak' }, images: [photo(`${BIZ}/${uuid()}.png`), { ...photo(`${BIZ}/${uuid()}.png`), id: 'p2', isPrimary: false }] }] }))
      await rpc(OWNER, v)
      const twoV = {
        ...v,
        p_product: { ...v.p_product, slug: `p-${uuid().slice(0, 6)}` },
        p_variants: v.p_variants.map((x) => ({ ...x, images: x.images.map((i) => ({ ...i, is_primary: true })) })),
      }
      await expect(rpc(OWNER, twoV)).rejects.toThrow(/product_variant_images_one_primary_idx/)
    })
  })

  describe('OWN-04: AR and 3D events need a model', () => {
    const key = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('')
    const record = (product: string, type: string) =>
      asService((tx) => tx.query<{ r: string }>('select public.record_event_limited($1, $2, $3, $4) as r', [key(), product, BIZ, type])).then((r) => r.rows[0]!.r)

    it('refuses ar_activation and model_interaction for a product without a model; views still count', async () => {
      const id = await saveDraft()
      await publish(id)
      expect(await record(id, 'view')).toBe('recorded')
      expect(await record(id, 'ar_activation')).toBe('invalid')
      expect(await record(id, 'model_interaction')).toBe('invalid')
    })

    it('records them when the product or one of its variants has a model', async () => {
      const withModel = await saveDraft({ models: model({ storagePath: `${BIZ}/${uuid()}.glb` }) })
      await publish(withModel)
      expect(await record(withModel, 'ar_activation')).toBe('recorded')
      const variantOnly = await saveDraft({ variants: [{ id: 'v', name: { en: 'Oak' }, models: model({ storagePath: `${BIZ}/${uuid()}.glb` }) }] })
      await publish(variantOnly)
      expect(await record(variantOnly, 'model_interaction')).toBe('recorded')
    })

    it('keeps its grants: only the service role may call it', async () => {
      const call = `select public.record_event_limited('${'a'.repeat(64)}', gen_random_uuid(), gen_random_uuid(), 'view')`
      await expect(as(OWNER, (tx) => tx.query(call))).rejects.toThrow(/permission denied/)
      await expect(as('', (tx) => tx.query(call), 'anon')).rejects.toThrow(/permission denied/)
    })
  })

  describe('COR-05: catalogue address changes are audited', () => {
    const slugEvents = async () =>
      (
        await db.query<{ actor_id: string; metadata: { from: string; to: string } }>(
          `select actor_id, metadata from public.audit_events where business_id = $1 and event_type = 'business_slug_changed' order by created_at, id`,
          [HB],
        )
      ).rows

    it('records who changed the slug, from and to; nothing when the slug is unchanged', async () => {
      const before = (await slugEvents()).length
      await as(ADMIN, (tx) => tx.query(`update public.businesses set description = 'no slug change', slug = slug where id = $1`, [HB]))
      expect(await slugEvents()).toHaveLength(before)
      await as(ADMIN, (tx) => tx.query(`update public.businesses set slug = 'hardened-new', status = 'inactive' where id = $1`, [HB]))
      const ev = await slugEvents()
      expect(ev).toHaveLength(before + 1)
      expect(ev.at(-1)).toEqual({ actor_id: ADMIN, metadata: { from: 'hardened', to: 'hardened-new' } })
      const status = await db.query(`select 1 from public.audit_events where business_id = $1 and event_type = 'business_status_changed' and to_status = 'inactive'`, [HB])
      expect(status.rows.length).toBeGreaterThan(0)
      await as(ADMIN, (tx) => tx.query(`update public.businesses set slug = 'hardened', status = 'active' where id = $1`, [HB]))
    })
  })

  describe('COR-16: onboarding with several pending memberships', () => {
    it('accepts every pending membership once and returns the newest business', async () => {
      const U = '00000000-0000-0000-0000-0000000000b2'
      const [A, B] = ['10000000-0000-0000-0000-0000000000b2', '10000000-0000-0000-0000-0000000000b3']
      await db.exec(`
        insert into auth.users values ('${U}', 'two-invites@test', now());
        insert into public.businesses (id, name, slug) values ('${A}', 'First', 'first-invite'), ('${B}', 'Second', 'second-invite');
        insert into public.business_members (business_id, user_id, invited_at, created_at)
          values ('${A}', '${U}', now(), now() - interval '1 day'), ('${B}', '${U}', now(), now());
      `)
      const onboard = () => as(U, (tx) => tx.query<{ b: string }>('select public.complete_owner_onboarding() as b')).then((r) => r.rows[0]!.b)
      expect(await onboard()).toBe(B)
      const members = await db.query<{ accepted_at: Date | null }>('select accepted_at from public.business_members where user_id = $1', [U])
      expect(members.rows.every((m) => m.accepted_at !== null)).toBe(true)
      const audit = async () => (await db.query(`select 1 from public.audit_events where actor_id = $1 and event_type = 'owner_onboarding_completed'`, [U])).rows.length
      expect(await audit()).toBe(2)
      expect(await onboard()).toBe(B)
      expect(await audit()).toBe(2)
      await expect(as('', (tx) => tx.query('select public.complete_owner_onboarding()'))).rejects.toThrow(/sign_in_required/)
    })
  })
})

describe('rollback script for 20261024065538_security_hardening', () => {
  it('restores the previous grants, policies and functions and keeps business data', async () => {
    const fresh = await PGlite.create()
    await fresh.exec(SUPABASE_STUBS + 'create schema supabase_migrations; create table supabase_migrations.schema_migrations (version text primary key);')
    for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql') && n.slice(0, 14) <= '20261024065538').sort())
      await fresh.exec(readFileSync(join(MIGRATIONS, f), 'utf8'))
    await fresh.exec(`insert into supabase_migrations.schema_migrations values ('20261024065538');
      insert into public.businesses (name, slug) values ('Kept', 'kept');`)
    await fresh.exec(readFileSync(join(__dirname, '..', 'rollback', '20261024_security_hardening_rollback.sql'), 'utf8'))
    const q = async (sql: string) => (await fresh.query<Record<string, unknown>>(sql)).rows
    expect(
      await q(`select conname from pg_constraint where conname in ('businesses_logo_url_https', 'product_images_url_https',
        'product_models_url_https', 'products_name_en_not_blank', 'product_variants_price_delta_nonneg')`),
    ).toHaveLength(0)
    expect(await q(`select 1 from pg_indexes where indexname in ('product_images_one_primary_idx', 'product_variant_images_one_primary_idx')`)).toHaveLength(0)
    expect(
      await q(`select 1 where has_table_privilege('authenticated', 'public.businesses', 'UPDATE') and has_table_privilege('authenticated', 'public.products', 'UPDATE')`),
    ).toHaveLength(1)
    for (const policy of ['Members and admins write images', 'Members and admins write models'])
      expect((await q(`select with_check as c from pg_policies where policyname = '${policy}'`))[0]!.c).toMatch(/split_part/)
    expect(
      await q(`select 1 from pg_proc where proname in ('record_event_limited', 'audit_business_change', 'guard_business_admin_fields', 'complete_owner_onboarding')
        and (prosrc like '%product_variant_models%' or prosrc like '%business_slug_changed%' or prosrc like '%business_field_admin_only%' or prosrc like '%with accepted%')`),
    ).toHaveLength(0)
    expect(await q(`select 1 from public.businesses where slug = 'kept'`)).toHaveLength(1)
    expect(await q('select 1 from supabase_migrations.schema_migrations')).toHaveLength(0)
    await fresh.close()
  }, 60_000)
})

describe('rollback script for 20261013093006 + 20261013144121', () => {
  it('removes the new rules and functions, restores owner linking, and keeps business data', async () => {
    const fresh = await PGlite.create()
    await fresh.exec(SUPABASE_STUBS + 'create schema supabase_migrations; create table supabase_migrations.schema_migrations (version text primary key);')
    // The state this script rolls back: migrations up to 20261013144121 (later ones are not part of it).
    for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql') && n.slice(0, 14) <= '20261013144121').sort())
      await fresh.exec(readFileSync(join(MIGRATIONS, f), 'utf8'))
    await fresh.exec(`insert into supabase_migrations.schema_migrations values ('20261013093006'), ('20261013144121');
      insert into public.businesses (name, slug) values ('Kept', 'kept');`)
    await fresh.exec(readFileSync(join(__dirname, '..', 'rollback', '20261013_publish_rules_and_claims_rollback.sql'), 'utf8'))
    const left = await fresh.query<{ n: number }>(`select count(*)::int as n from pg_proc where proname in
      ('register_business', 'redeem_business_claim', 'admin_create_business_claim', 'assert_publishable', 'products_set_published_at')`)
    expect(left.rows[0]!.n).toBe(0)
    expect((await fresh.query(`select 1 from pg_tables where schemaname = 'private' and tablename = 'business_claims'`)).rows).toHaveLength(0)
    expect((await fresh.query(`select 1 from pg_proc where proname = 'admin_add_business_member'`)).rows).toHaveLength(1)
    expect((await fresh.query(`select 1 from public.businesses where slug = 'kept'`)).rows).toHaveLength(1)
    expect((await fresh.query('select 1 from supabase_migrations.schema_migrations')).rows).toHaveLength(0)
    await fresh.close()
  }, 60_000)
})
