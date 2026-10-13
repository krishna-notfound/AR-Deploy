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
  create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz);
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

describe('owner linking (admin_add_business_member)', () => {
  it('refuses an account that has not confirmed its email', async () => {
    await expect(as(ADMIN, (tx) => tx.query(`select public.admin_add_business_member($1, 'stranger@test')`, [BIZ]))).rejects.toThrow('not confirmed')
  })

  it('links a confirmed account, and is still admin-only', async () => {
    await as(ADMIN, (tx) => tx.query(`select public.admin_add_business_member($1, 'owner@test')`, [BIZ]))
    await expect(as(OWNER, (tx) => tx.query(`select public.admin_add_business_member($1, 'owner@test')`, [BIZ]))).rejects.toThrow('Only platform admins')
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

describe('owner registration and claim links (20261013144121_owner_registration_and_claims)', () => {
  const NEWCOMER = '00000000-0000-0000-0000-0000000000e1'
  const UNCONFIRMED = '00000000-0000-0000-0000-0000000000e2'
  const CLAIMER = '00000000-0000-0000-0000-0000000000e3'
  const CLAIM_BIZ = '10000000-0000-0000-0000-0000000000c1'

  beforeAll(async () => {
    await db.exec(`
      insert into auth.users values ('${NEWCOMER}', 'new@test', now()), ('${UNCONFIRMED}', 'unconfirmed@test', null),
        ('${CLAIMER}', 'claimer@test', now());
      -- contact_email equals the claimer's email: must grant nothing on its own.
      insert into public.businesses (id, name, slug, status, contact_email) values ('${CLAIM_BIZ}', 'Claimable', 'claimable', 'active', 'claimer@test');
    `)
  })

  const register = (uid: string, name: string, slug: string) =>
    as(uid, (tx) => tx.query<{ id: string }>('select public.register_business($1, $2) as id', [name, slug])).then((r) => r.rows[0]!.id)
  const createClaim = (uid: string, biz: string) =>
    as(uid, (tx) => tx.query<{ token: string; expires_at: Date }>('select * from public.admin_create_business_claim($1)', [biz])).then((r) => r.rows[0]!)
  const redeem = (uid: string, token: string) =>
    as(uid, (tx) => tx.query<{ id: string }>('select public.redeem_business_claim($1) as id', [token])).then((r) => r.rows[0]!.id)
  const isMember = async (uid: string, biz: string) =>
    (await db.query('select 1 from public.business_members where user_id = $1 and business_id = $2', [uid, biz])).rows.length === 1

  it('registers a new business as a draft owned by the caller, invisible to the public', async () => {
    const id = await register(NEWCOMER, 'Newcomer Home', 'newcomer-home')
    const r = await db.query<{ status: string }>('select status from public.businesses where id = $1', [id])
    expect(r.rows[0]!.status).toBe('draft')
    expect(await isMember(NEWCOMER, id)).toBe(true)
    const anon = await as('', (tx) => tx.query('select 1 from public.businesses where id = $1', [id]), 'anon')
    expect(anon.rows).toHaveLength(0)
  })

  it('allows one pending registration per account, and only an admin can activate it', async () => {
    await expect(register(NEWCOMER, 'Second', 'newcomer-second')).rejects.toThrow('registration_pending')
    const id = (await db.query<{ id: string }>(`select id from public.businesses where slug = 'newcomer-home'`)).rows[0]!.id
    await expect(as(NEWCOMER, (tx) => tx.query(`update public.businesses set status = 'active' where id = $1`, [id]))).rejects.toThrow('Only platform admins')
    await as(ADMIN, (tx) => tx.query(`update public.businesses set status = 'active' where id = $1`, [id])) // admin approval
    const r = await as('', (tx) => tx.query('select 1 from public.businesses where id = $1', [id]), 'anon')
    expect(r.rows).toHaveLength(1)
  })

  it('refuses registration without a confirmed email, with a taken address, a reserved one, or anonymously', async () => {
    await expect(register(UNCONFIRMED, 'Nope', 'nope-unconfirmed')).rejects.toThrow('email_not_confirmed')
    await expect(register(CLAIMER, 'Copy', 'claimable')).rejects.toThrow('slug_taken')
    await expect(register(CLAIMER, 'Admin', 'admin')).rejects.toThrow(/check constraint/)
    await expect(as('', (tx) => tx.query(`select public.register_business('A', 'anon-biz')`), 'anon')).rejects.toThrow(/permission denied/)
  })

  it('a matching contact email or name grants no ownership', async () => {
    expect(await isMember(CLAIMER, CLAIM_BIZ)).toBe(false)
    const upd = await as(CLAIMER, (tx) => tx.query(`update public.businesses set description = 'hijack' where id = $1`, [CLAIM_BIZ]))
    expect(upd.affectedRows ?? 0).toBe(0)
  })

  it('only platform admins issue claim links, and only a hash is stored', async () => {
    await expect(createClaim(OWNER, CLAIM_BIZ)).rejects.toThrow('Only platform admins')
    const { token } = await createClaim(ADMIN, CLAIM_BIZ)
    expect(token).toMatch(/^[0-9a-f]{64}$/)
    const hashed = await db.query(`select 1 from private.business_claims where token_hash = sha256(convert_to($1, 'UTF8'))`, [token])
    expect(hashed.rows).toHaveLength(1)
    const plain = await db.query(`select 1 from private.business_claims c where c::text like '%' || $1 || '%'`, [token])
    expect(plain.rows).toHaveLength(0)
    await expect(as(OWNER, (tx) => tx.query('select * from private.business_claims'))).rejects.toThrow(/permission denied/)
  })

  it('a claim link makes a confirmed account an owner exactly once', async () => {
    const { token } = await createClaim(ADMIN, CLAIM_BIZ)
    await expect(redeem(UNCONFIRMED, token)).rejects.toThrow('email_not_confirmed')
    expect(await redeem(CLAIMER, token)).toBe(CLAIM_BIZ)
    expect(await isMember(CLAIMER, CLAIM_BIZ)).toBe(true)
    await expect(redeem(NEWCOMER, token)).rejects.toThrow('claim_invalid') // single use
    expect(await isMember(NEWCOMER, CLAIM_BIZ)).toBe(false)
  })

  it('rejects unknown, replaced and expired claim links with the same error', async () => {
    await expect(redeem(NEWCOMER, 'f'.repeat(64))).rejects.toThrow('claim_invalid')
    const first = await createClaim(ADMIN, OTHER_BIZ)
    await createClaim(ADMIN, OTHER_BIZ) // issuing a new link cancels the unused one
    await expect(redeem(NEWCOMER, first.token)).rejects.toThrow('claim_invalid')
    const expiring = await createClaim(ADMIN, OTHER_BIZ)
    await db.query(`update private.business_claims set expires_at = now() - interval '1 second' where token_hash = sha256(convert_to($1, 'UTF8'))`, [expiring.token])
    await expect(redeem(NEWCOMER, expiring.token)).rejects.toThrow('claim_invalid')
    expect(await isMember(NEWCOMER, OTHER_BIZ)).toBe(false)
  })
})

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
