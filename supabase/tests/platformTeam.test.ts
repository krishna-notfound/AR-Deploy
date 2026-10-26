// @vitest-environment node
// Platform team roles (ADR-0029): applies every migration to a disposable in-process Postgres (PGlite) with the
// same Supabase stand-ins as migrations.test.ts, then checks the role and permission rules as the API roles.
// Nothing here touches a live project.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite, type Transaction } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

const MIGRATIONS = join(__dirname, '..', 'migrations')

const SUPABASE_STUBS = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, last_sign_in_at timestamptz,
    raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('test.jwt', true), ''), '{}')::jsonb $$;
  create type auth.factor_status as enum ('unverified', 'verified'); create type auth.factor_type as enum ('totp', 'webauthn', 'phone');
  create table auth.mfa_factors (id uuid primary key default gen_random_uuid(), user_id uuid, status auth.factor_status not null,
    factor_type auth.factor_type not null);
  grant usage on schema auth to anon, authenticated, service_role;
  create schema storage;
  create table storage.buckets (id text primary key, name text not null, public boolean default false,
    file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id),
    name text, owner uuid, metadata jsonb, created_at timestamptz default now());
  alter table storage.objects enable row level security;
  grant select, insert, update, delete on storage.objects to anon, authenticated;
  create function storage.foldername(name text) returns text[] language sql immutable
    as $$ select (string_to_array(name, '/'))[1:cardinality(string_to_array(name, '/')) - 1] $$;
  grant usage on schema storage to anon, authenticated, service_role;
`

export const OWNER_U = '00000000-0000-0000-0000-0000000000a1'
export const ADMIN_U = '00000000-0000-0000-0000-0000000000a2'
export const TEAM_U = '00000000-0000-0000-0000-0000000000a3'
export const DEACT_U = '00000000-0000-0000-0000-0000000000a4'
export const INVITED_U = '00000000-0000-0000-0000-0000000000a5'
export const BIZ_OWNER_U = '00000000-0000-0000-0000-0000000000a6'
export const STRANGER_U = '00000000-0000-0000-0000-0000000000a7'
export const BIZ = '10000000-0000-0000-0000-0000000000b1'

const TEAM_DEFAULTS = ['analytics.view', 'applications.view', 'businesses.view', 'products.edit', 'products.view']
const ALL = [
  'access.view', 'analytics.view', 'applications.approve', 'applications.reject', 'applications.view', 'businesses.delete',
  'businesses.edit', 'businesses.status', 'businesses.view', 'owners.manage', 'products.delete', 'products.edit',
  'products.publish', 'products.view', 'records.view',
]

let db: PGlite

/** Runs `fn` in one transaction as an API role, signed in as `uid`. Rejects with the DB error. */
async function as<T>(uid: string, fn: (tx: Transaction) => Promise<T>, role: 'authenticated' | 'anon' | 'service_role' = 'authenticated'): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`)
    await tx.query(`select set_config('test.uid', $1, true)`, [uid])
    return fn(tx)
  })
}

const access = (uid: string) =>
  as(uid, async (tx) => (await tx.query<{ a: { role: string; permissions: string[] } | null }>('select public.my_platform_access() as a')).rows[0]!.a)

beforeAll(async () => {
  db = await PGlite.create()
  await db.exec(SUPABASE_STUBS)
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()) await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'))
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values
      ('${OWNER_U}', 'owner@test', now()), ('${ADMIN_U}', 'admin@test', now()), ('${TEAM_U}', 'team@test', now()),
      ('${DEACT_U}', 'deact@test', now()), ('${INVITED_U}', 'invited@test', now()), ('${BIZ_OWNER_U}', 'bizowner@test', now()),
      ('${STRANGER_U}', 'stranger@test', now());
    insert into public.platform_admins (user_id) values ('${OWNER_U}');
    insert into public.platform_members (user_id, email, role, status) values
      ('${ADMIN_U}', 'admin@test', 'admin', 'active'), ('${TEAM_U}', 'team@test', 'team', 'active'),
      ('${DEACT_U}', 'deact@test', 'admin', 'deactivated'), ('${INVITED_U}', 'invited@test', 'team', 'invited');
    insert into public.businesses (id, name, slug, status) values ('${BIZ}', 'Biz', 'biz', 'active');
    insert into public.business_members (business_id, user_id) values ('${BIZ}', '${BIZ_OWNER_U}');
  `)
}, 60_000)

describe('membership tables and platform_can (Task 1)', () => {
  it('seeds the default permissions', async () => {
    const { rows } = await db.query<{ role: string; permission: string }>('select role::text, permission from public.platform_role_permissions order by 1, 2')
    expect(rows.filter((r) => r.role === 'admin').map((r) => r.permission)).toEqual(ALL)
    expect(rows.filter((r) => r.role === 'team').map((r) => r.permission)).toEqual(TEAM_DEFAULTS)
  })

  it('my_platform_access reports each role', async () => {
    const owner = await access(OWNER_U)
    expect(owner?.role).toBe('owner')
    expect([...(owner?.permissions ?? [])].sort()).toEqual(ALL)
    expect((await access(ADMIN_U))?.role).toBe('admin')
    expect([...((await access(ADMIN_U))?.permissions ?? [])].sort()).toEqual(ALL)
    expect([...((await access(TEAM_U))?.permissions ?? [])].sort()).toEqual(TEAM_DEFAULTS)
    for (const u of [DEACT_U, INVITED_U, BIZ_OWNER_U, STRANGER_U]) expect(await access(u)).toBeNull()
  })

  it('platform_can is false for deactivated and invited members', async () => {
    for (const u of [DEACT_U, INVITED_U]) {
      const r = await as(u, (tx) => tx.query<{ c: boolean }>(`select public.platform_can('products.view') as c`))
      expect(r.rows[0]!.c).toBe(false)
    }
    const team = await as(TEAM_U, (tx) => tx.query<{ c: boolean }>(`select public.platform_can('products.view') as c, public.platform_can('products.publish') as p`))
    expect(team.rows[0]).toMatchObject({ c: true, p: false })
  })

  it('rejects unknown permission keys', async () => {
    await expect(db.query(`insert into public.platform_role_permissions (role, permission) values ('team', 'products.nuke')`)).rejects.toThrow(/check/)
  })

  it('stores member emails lower-cased only', async () => {
    await expect(db.query(`insert into public.platform_members (email, role) values ('Mixed@Case.test', 'team')`)).rejects.toThrow(/check/)
  })

  it('members cannot write membership tables', async () => {
    await expect(as(ADMIN_U, (tx) => tx.query(`update public.platform_members set role = 'admin' where user_id = '${TEAM_U}'`))).rejects.toThrow()
    await expect(as(ADMIN_U, (tx) => tx.query(`insert into public.platform_role_permissions (role, permission) values ('team', 'products.publish')`))).rejects.toThrow()
    await expect(as(ADMIN_U, (tx) => tx.query(`insert into public.platform_admins (user_id) values ('${ADMIN_U}')`))).rejects.toThrow()
  })

  it('a member reads only their own membership row; the owner reads all', async () => {
    const own = await as(TEAM_U, (tx) => tx.query<{ n: number }>('select count(*)::int as n from public.platform_members'))
    expect(own.rows[0]!.n).toBe(1)
    const all = await as(OWNER_U, (tx) => tx.query<{ n: number }>('select count(*)::int as n from public.platform_members'))
    expect(all.rows[0]!.n).toBe(4)
    const perms = await as(TEAM_U, (tx) => tx.query<{ n: number }>('select count(*)::int as n from public.platform_role_permissions'))
    expect(perms.rows[0]!.n).toBe(TEAM_DEFAULTS.length)
  })

  it('anon sees nothing', async () => {
    await expect(as(STRANGER_U, (tx) => tx.query('select * from public.platform_members'), 'anon')).rejects.toThrow()
  })
})

// ---------------------------------------------------------------------------
// Task 2: permission rules on the existing tables
// ---------------------------------------------------------------------------

const ROLLBACK = new Error('rollback')
/** Runs one statement as `uid` and always rolls back. Returns the result, or rejects with the DB error. */
async function probe(uid: string, sql: string, params: unknown[] = []) {
  let res: Awaited<ReturnType<Transaction['query']>> | undefined
  try {
    await as(uid, async (tx) => {
      res = await tx.query(sql, params)
      throw ROLLBACK
    })
  } catch (e) {
    if (e !== ROLLBACK) throw e
  }
  return res!
}
const count = async (uid: string, sql: string, params: unknown[] = []) => ((await probe(uid, sql, params)).rows[0] as { n: number }).n
const affected = async (uid: string, sql: string, params: unknown[] = []) => (await probe(uid, sql, params)).affectedRows ?? 0
const ACCESS_EVENTS = `select count(*)::int as n from public.audit_events where event_type like 'access%'`
const OTHER_EVENTS = `select count(*)::int as n from public.audit_events where event_type not like 'access%'`

describe('permission matrix (Task 2)', () => {
  let product = ''
  let application = ''

  beforeAll(async () => {
    const { toSaveProductArgs } = await import('../../src/services/supabase/supabaseCatalogService')
    const args = toSaveProductArgs(null, {
      businessId: BIZ, slug: 'chair', name: { en: 'Chair' }, shortDescription: { en: '' }, description: { en: '' }, category: 'chair',
      price: 100, currency: 'EUR', images: [{ id: 'i1', url: 'https://img.test/a.jpg', isPrimary: true, kind: 'gallery' }], models: {},
      dimensions: { width: 80, height: 70, depth: 60, unit: 'cm' }, material: { en: '' }, variants: [], cta: { label: { en: 'Contact' } },
    } as never)
    product = (await as(BIZ_OWNER_U, (tx) => tx.query<{ id: string }>('select public.save_product($1, $2, $3, $4) as id', [args.p_product, args.p_images, args.p_models, args.p_variants]))).rows[0]!.id
    application = (await db.query<{ id: string }>(
      `insert into public.business_applications (business_name, applicant_name, applicant_email, country, city, category, submission_key, answers)
       values ('Casa', 'Ana', 'ana@example.test', 'Portugal', 'Lisboa', 'Lighting', gen_random_uuid(), '{"description":"Lamps"}') returning id`,
    )).rows[0]!.id
    await db.exec(`
      insert into public.product_analytics (product_id, business_id, event_type) values ('${product}', '${BIZ}', 'view');
      insert into public.email_log (kind, recipient, subject, status) values ('test', 'x@y.z', 'T', 'accepted');
      insert into public.audit_events (event_type, metadata) values ('business_updated', '{}'), ('access_role_changed', '{}');
    `)
  })

  async function asDraftBusiness(fn: () => Promise<void>) {
    await db.exec(`update public.businesses set status = 'draft' where id = '${BIZ}'`)
    try {
      await fn()
    } finally {
      await db.exec(`update public.businesses set status = 'active' where id = '${BIZ}'`)
    }
  }

  it('businesses.view: team reads a draft business, deactivated and strangers do not', async () => {
    await asDraftBusiness(async () => {
      expect(await count(TEAM_U, 'select count(*)::int as n from public.businesses')).toBe(1)
      expect(await count(DEACT_U, 'select count(*)::int as n from public.businesses')).toBe(0)
      expect(await count(STRANGER_U, 'select count(*)::int as n from public.businesses')).toBe(0)
    })
    expect(await count(TEAM_U, 'select count(*)::int as n from public.business_members')).toBe(1)
  })

  it('businesses.edit: admin renames, team cannot', async () => {
    expect(await affected(ADMIN_U, `update public.businesses set name = 'X' where id = $1`, [BIZ])).toBe(1)
    expect(await affected(TEAM_U, `update public.businesses set name = 'X' where id = $1`, [BIZ])).toBe(0)
  })

  it('businesses.status: an admin without it can rename but not change the status', async () => {
    await db.exec(`delete from public.platform_role_permissions where role = 'admin' and permission = 'businesses.status'`)
    try {
      expect(await affected(ADMIN_U, `update public.businesses set name = 'Y' where id = $1`, [BIZ])).toBe(1)
      await expect(probe(ADMIN_U, `update public.businesses set status = 'inactive' where id = $1`, [BIZ])).rejects.toThrow()
    } finally {
      await db.exec(`insert into public.platform_role_permissions values ('admin', 'businesses.status')`)
    }
    expect(await affected(ADMIN_U, `update public.businesses set status = 'inactive' where id = $1`, [BIZ])).toBe(1)
  })

  it('businesses.delete: admin may delete, team may not', async () => {
    expect(await affected(ADMIN_U, 'delete from public.businesses where id = $1', [BIZ])).toBe(1)
    expect(await affected(TEAM_U, 'delete from public.businesses where id = $1', [BIZ])).toBe(0)
  })

  it('applications.view: team reads applications, deactivated does not', async () => {
    expect(await count(TEAM_U, 'select count(*)::int as n from public.business_applications')).toBe(1)
    expect(await count(DEACT_U, 'select count(*)::int as n from public.business_applications')).toBe(0)
  })

  it('applications.approve / reject: admin may review, team may not', async () => {
    const r = await probe(ADMIN_U, `select status from public.admin_review_application($1, 'start_review')`, [application])
    expect((r.rows[0] as { status: string }).status).toBe('under_review')
    await expect(probe(TEAM_U, `select public.admin_review_application($1, 'start_review')`, [application])).rejects.toThrow(/platform_admin_only/)
    await expect(probe(TEAM_U, `select public.admin_review_application($1, 'reject', 'No')`, [application])).rejects.toThrow(/platform_admin_only/)
  })

  it('products.view: team reads drafts, deactivated does not', async () => {
    expect(await count(TEAM_U, 'select count(*)::int as n from public.products')).toBe(1)
    expect(await count(TEAM_U, 'select count(*)::int as n from public.product_images')).toBe(1)
    expect(await count(DEACT_U, 'select count(*)::int as n from public.products')).toBe(0)
  })

  it('products.edit: team edits products, deactivated cannot', async () => {
    expect(await affected(TEAM_U, `update public.products set price = 200 where id = $1`, [product])).toBe(1)
    expect(await affected(DEACT_U, `update public.products set price = 200 where id = $1`, [product])).toBe(0)
  })

  it('team cannot publish through a direct update; admin can', async () => {
    await expect(probe(TEAM_U, `update public.products set status = 'published' where id = $1`, [product])).rejects.toThrow(/publish/)
    expect(await affected(ADMIN_U, `update public.products set status = 'published' where id = $1`, [product])).toBe(1)
  })

  it('products.delete: admin may delete, team may not', async () => {
    expect(await affected(ADMIN_U, 'delete from public.products where id = $1', [product])).toBe(1)
    expect(await affected(TEAM_U, 'delete from public.products where id = $1', [product])).toBe(0)
  })

  it('analytics.view: team reads analytics, deactivated does not', async () => {
    expect(await count(TEAM_U, 'select count(*)::int as n from public.product_analytics')).toBe(1)
    expect(await count(DEACT_U, 'select count(*)::int as n from public.product_analytics')).toBe(0)
  })

  it('records.view and access.view split the audit log', async () => {
    expect(await count(ADMIN_U, 'select count(*)::int as n from public.email_log')).toBe(1)
    expect(await count(TEAM_U, 'select count(*)::int as n from public.email_log')).toBe(0)
    expect(await count(ADMIN_U, ACCESS_EVENTS)).toBeGreaterThan(0)
    expect(await count(ADMIN_U, OTHER_EVENTS)).toBeGreaterThan(0)
    expect(await count(TEAM_U, 'select count(*)::int as n from public.audit_events')).toBe(0)
    await db.exec(`delete from public.platform_role_permissions where role = 'admin' and permission = 'access.view'`)
    try {
      expect(await count(ADMIN_U, ACCESS_EVENTS)).toBe(0)
      expect(await count(ADMIN_U, OTHER_EVENTS)).toBeGreaterThan(0)
    } finally {
      await db.exec(`insert into public.platform_role_permissions values ('admin', 'access.view')`)
    }
  })

  it('owners.manage: admin may remove a business owner, team may not; team may list owners', async () => {
    expect(await affected(ADMIN_U, 'delete from public.business_members where business_id = $1', [BIZ])).toBe(1)
    expect(await affected(TEAM_U, 'delete from public.business_members where business_id = $1', [BIZ])).toBe(0)
    expect((await probe(TEAM_U, 'select * from public.admin_list_business_members($1)', [BIZ])).rows).toHaveLength(1)
    await expect(probe(DEACT_U, 'select * from public.admin_list_business_members($1)', [BIZ])).rejects.toThrow(/platform_admin_only/)
  })

  it('storage: team uploads product media, deactivated cannot', async () => {
    await db.exec(`insert into storage.buckets (id, name) values ('product-media', 'product-media') on conflict do nothing`)
    const path = `${BIZ}/00000000-0000-4000-8000-000000000001.png`
    expect(await affected(TEAM_U, `insert into storage.objects (bucket_id, name) values ('product-media', $1)`, [path])).toBe(1)
    await expect(probe(DEACT_U, `insert into storage.objects (bucket_id, name) values ('product-media', $1)`, [path])).rejects.toThrow()
  })

  it('deactivated admin reads zero businesses', async () => {
    await asDraftBusiness(async () => {
      expect(await count(DEACT_U, 'select count(*)::int as n from public.businesses')).toBe(0)
    })
  })

  it('business owner still edits own products and sees nothing platform-wide', async () => {
    expect(await affected(BIZ_OWNER_U, `update public.products set price = 300 where id = $1`, [product])).toBe(1)
    expect(await count(BIZ_OWNER_U, 'select count(*)::int as n from public.business_applications')).toBe(0)
    expect(await count(BIZ_OWNER_U, 'select count(*)::int as n from public.email_log')).toBe(0)
  })

  it('owner keeps full access', async () => {
    expect(await affected(OWNER_U, `update public.products set status = 'published' where id = $1`, [product])).toBe(1)
    expect(await count(OWNER_U, 'select count(*)::int as n from public.email_log')).toBe(1)
  })

  it('a platform member cannot become a business owner, and a business owner cannot become a member', async () => {
    await db.exec(`insert into public.businesses (id, name, slug, status) values ('10000000-0000-0000-0000-0000000000b9', 'Spare', 'spare', 'draft') on conflict do nothing`)
    await expect(db.query(`insert into public.business_members (business_id, user_id) values ('10000000-0000-0000-0000-0000000000b9', $1)`, [TEAM_U])).rejects.toThrow(/platform_member_cannot_own/)
    await expect(db.query(`insert into public.platform_members (user_id, email, role) values ($1, 'bizowner@test', 'team')`, [BIZ_OWNER_U])).rejects.toThrow(/business_owner/)
  })
})

// ---------------------------------------------------------------------------
// Task 3: member management and invitation functions
// ---------------------------------------------------------------------------

type J = Record<string, unknown>
const call = async (uid: string, sql: string, params: unknown[] = [], role: 'authenticated' | 'service_role' = 'authenticated') =>
  (await as(uid, (tx) => tx.query<{ r: J }>(sql, params), role)).rows[0]!.r
const svc = (sql: string, params: unknown[] = []) => call('', sql, params, 'service_role')
const hash = (n: number) => n.toString(16).padStart(64, '0')
const auditCount = async (type: string, actor?: string) =>
  (await db.query<{ n: number }>(`select count(*)::int as n from public.audit_events where event_type = $1 ${actor ? 'and actor_id = $2' : ''}`, actor ? [type, actor] : [type])).rows[0]!.n

describe('member management (Task 3)', () => {
  it('only the owner can invite, and a refused call is audited', async () => {
    const before = await auditCount('access_denied', ADMIN_U)
    expect(await call(ADMIN_U, `select public.admin_invite_member('x@studio.test', 'team') as r`)).toEqual({ error: 'forbidden' })
    expect(await auditCount('access_denied', ADMIN_U)).toBe(before + 1)
  })

  it('invite is case and space insensitive', async () => {
    const first = await call(OWNER_U, `select public.admin_invite_member('  Ana@Studio.test ', 'admin') as r`)
    expect(first.ok).toBe(true)
    expect(await call(OWNER_U, `select public.admin_invite_member('ana@studio.test', 'team') as r`)).toEqual({ error: 'already_member' })
    expect((await db.query(`select 1 from public.platform_members where email = 'ana@studio.test' and status = 'invited'`)).rows).toHaveLength(1)
    expect(await auditCount('access_invite_created', OWNER_U)).toBeGreaterThan(0)
  })

  it('rejects invalid emails, business owners and owners', async () => {
    expect(await call(OWNER_U, `select public.admin_invite_member('not-an-email', 'team') as r`)).toEqual({ error: 'invalid_email' })
    await db.exec(`update auth.users set email = 'bizowner@shop.test' where id = '${BIZ_OWNER_U}'; update auth.users set email = 'owner@sanctus.test' where id = '${OWNER_U}'`)
    try {
      expect(await call(OWNER_U, `select public.admin_invite_member('BizOwner@Shop.test', 'team') as r`)).toEqual({ error: 'business_owner' })
      expect(await call(OWNER_U, `select public.admin_invite_member('owner@sanctus.test', 'team') as r`)).toEqual({ error: 'owner_protected' })
    } finally {
      await db.exec(`update auth.users set email = 'bizowner@test' where id = '${BIZ_OWNER_U}'; update auth.users set email = 'owner@test' where id = '${OWNER_U}'`)
    }
  })

  it('changes roles, never the owner, and audits the change', async () => {
    const team = (await db.query<{ id: string }>(`select id from public.platform_members where user_id = '${TEAM_U}'`)).rows[0]!.id
    expect(await call(ADMIN_U, `select public.admin_set_member_role($1, 'admin') as r`, [team])).toEqual({ error: 'forbidden' })
    expect(await call(OWNER_U, `select public.admin_set_member_role($1, 'admin') as r`, [team])).toEqual({ ok: true })
    const ev = await db.query<{ from_status: string; to_status: string }>(`select from_status, to_status from public.audit_events where event_type = 'access_role_changed' order by created_at desc limit 1`)
    expect(ev.rows[0]).toEqual({ from_status: 'team', to_status: 'admin' })
    expect(await call(OWNER_U, `select public.admin_set_member_role($1, 'team') as r`, [team])).toEqual({ ok: true })
    expect(await call(OWNER_U, `select public.admin_set_member_role($1, 'team') as r`, [OWNER_U])).toEqual({ error: 'not_found' })
  })

  it('deactivates and reactivates', async () => {
    const team = (await db.query<{ id: string }>(`select id from public.platform_members where user_id = '${TEAM_U}'`)).rows[0]!.id
    expect(await call(OWNER_U, `select public.admin_deactivate_member($1) as r`, [team])).toEqual({ ok: true, userId: TEAM_U })
    expect(await count(TEAM_U, 'select count(*)::int as n from public.business_applications')).toBe(0)
    expect(await call(OWNER_U, `select public.admin_reactivate_member($1) as r`, [team])).toEqual({ ok: true })
    expect(await count(TEAM_U, 'select count(*)::int as n from public.business_applications')).toBeGreaterThan(0)
  })

  it('rejects unknown permissions and audits permission changes', async () => {
    expect(await call(OWNER_U, `select public.admin_set_role_permissions('team', array['products.view', 'x']) as r`)).toEqual({ error: 'unknown_permission' })
    expect(await call(ADMIN_U, `select public.admin_set_role_permissions('team', array['products.view']) as r`)).toEqual({ error: 'forbidden' })
    const r = await call(OWNER_U, `select public.admin_set_role_permissions('team', array['businesses.view', 'applications.view', 'products.view', 'analytics.view', 'products.publish']) as r`)
    // S1.5 R-W3-3: products.publish includes products.edit, so it is kept (and answered as added) rather than removed.
    expect(r).toEqual({ ok: true, added: ['products.edit'] })
    const ev = await db.query<{ metadata: J }>(`select metadata from public.audit_events where event_type = 'access_permissions_changed' order by created_at desc limit 1`)
    expect(ev.rows[0]!.metadata).toEqual({ role: 'team', added: ['products.publish'], removed: [] })
    await call(OWNER_U, `select public.admin_set_role_permissions('team', array['businesses.view', 'applications.view', 'products.view', 'analytics.view', 'products.edit']) as r`)
  })

  it('lists members (owner included) and refuses non-owners', async () => {
    const list = await call(OWNER_U, `select public.admin_list_members() as r`)
    const members = list.members as J[]
    expect(members.find((m) => m.role === 'owner')?.email).toBe('owner@test')
    expect(members.find((m) => m.userId === TEAM_U)).toMatchObject({ role: 'team', status: 'active', email: 'team@test' })
    expect(await call(TEAM_U, `select public.admin_list_members() as r`)).toEqual({ error: 'forbidden' })
  })
})

describe('invitations (Task 3)', () => {
  let member = ''
  beforeAll(async () => {
    member = (await call(OWNER_U, `select public.admin_invite_member('invitee@studio.test', 'team') as r`)).memberId as string
    await db.exec(`insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-0000000000c1', 'invitee@studio.test', now())`)
  })

  it('rate limits invitations and keeps only the newest live', async () => {
    const m = (await call(OWNER_U, `select public.admin_invite_member('limit@studio.test', 'team') as r`)).memberId as string
    for (let i = 1; i <= 5; i++) {
      const r = await svc(`select public.service_create_member_invite($1, $2, now() + interval '7 days', $3) as r`, [m, hash(1000 + i), OWNER_U])
      expect(r.ok).toBe(true)
    }
    expect(await svc(`select public.service_create_member_invite($1, $2, now() + interval '7 days', $3) as r`, [m, hash(1006), OWNER_U])).toEqual({ error: 'rate_limited' })
    const live = await db.query(`select 1 from private.platform_invites where member_id = $1 and status in ('pending', 'sent', 'email_failed')`, [m])
    expect(live.rows).toHaveLength(1)
  })

  it('records the email result', async () => {
    const r = await svc(`select public.service_create_member_invite($1, $2, now() + interval '7 days', $3) as r`, [member, hash(2001), OWNER_U])
    await svc(`select public.service_record_invite_email($1, false, 'provider down') as r`, [r.inviteId])
    const row = await db.query<{ status: string; last_email_result: string }>('select status, last_email_result from private.platform_invites where id = $1', [r.inviteId])
    expect(row.rows[0]).toEqual({ status: 'email_failed', last_email_result: 'failed: provider down' })
    expect(await auditCount('access_invite_email_failed')).toBeGreaterThan(0)
  })

  it('accepts once, with the right email only', async () => {
    const r = await svc(`select public.service_create_member_invite($1, $2, now() + interval '7 days', $3) as r`, [member, hash(3001), OWNER_U])
    expect(r.ok).toBe(true)
    const seen = await svc(`select public.service_inspect_invite($1) as r`, [hash(3001)])
    expect(seen).toMatchObject({ state: 'valid', email: 'invitee@studio.test', role: 'team', invitedBy: 'owner@test', userExists: true })
    expect(await svc(`select to_jsonb(public.service_accept_invite($1, $2)) as r`, [hash(3001), STRANGER_U])).toBe('email_mismatch')
    expect(await svc(`select to_jsonb(public.service_accept_invite($1, $2, 'Ina Vitee')) as r`, [hash(3001), '00000000-0000-0000-0000-0000000000c1'])).toBe('ok')
    const m = await db.query<{ status: string; user_id: string; full_name: string }>('select status, user_id, full_name from public.platform_members where id = $1', [member])
    expect(m.rows[0]).toEqual({ status: 'active', user_id: '00000000-0000-0000-0000-0000000000c1', full_name: 'Ina Vitee' })
    expect(await svc(`select to_jsonb(public.service_accept_invite($1, $2)) as r`, [hash(3001), '00000000-0000-0000-0000-0000000000c1'])).toBe('invite_used')
    expect((await svc(`select public.service_inspect_invite($1) as r`, [hash(3001)])).state).toBe('used')
    expect((await svc(`select public.service_inspect_invite($1) as r`, [hash(9999)])).state).toBe('invalid')
  })

  it('refuses expired and revoked invitations', async () => {
    const m = (await call(OWNER_U, `select public.admin_invite_member('late@studio.test', 'team') as r`)).memberId as string
    await svc(`select public.service_create_member_invite($1, $2, now() - interval '1 minute', $3) as r`, [m, hash(4001), OWNER_U])
    expect((await svc(`select public.service_inspect_invite($1) as r`, [hash(4001)])).state).toBe('expired')
    expect(await svc(`select to_jsonb(public.service_accept_invite($1, $2)) as r`, [hash(4001), STRANGER_U])).toBe('invite_expired')
    await svc(`select public.service_create_member_invite($1, $2, now() + interval '7 days', $3) as r`, [m, hash(4002), OWNER_U])
    expect(await call(OWNER_U, `select public.admin_revoke_member_invite($1) as r`, [m])).toEqual({ ok: true })
    expect((await svc(`select public.service_inspect_invite($1) as r`, [hash(4002)])).state).toBe('revoked')
    expect(await svc(`select to_jsonb(public.service_accept_invite($1, $2)) as r`, [hash(4002), STRANGER_U])).toBe('invite_revoked')
  })

  it('service functions are not callable by signed-in users', async () => {
    await expect(as(OWNER_U, (tx) => tx.query(`select public.service_inspect_invite($1)`, [hash(3001)]))).rejects.toThrow(/permission denied/)
    await expect(as(OWNER_U, (tx) => tx.query(`select * from private.platform_invites`))).rejects.toThrow(/permission denied/)
  })

  it('never stores the secret hash in audit metadata', async () => {
    const leaked = await db.query(`select 1 from public.audit_events where metadata::text ~ '[0-9a-f]{64}'`)
    expect(leaked.rows).toHaveLength(0)
  })
})

describe('rollback script for 20261025070915_platform_team_roles', () => {
  it('removes everything and restores the admin-only checks', async () => {
    const fresh = await PGlite.create()
    await fresh.exec(SUPABASE_STUBS)
    // Later migrations are rolled back first (their own rollback scripts), so apply only up to this one.
    for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql') && n.slice(0, 14) <= '20261025070915').sort())
      await fresh.exec(readFileSync(join(MIGRATIONS, f), 'utf8'))
    await fresh.exec(readFileSync(join(__dirname, '..', 'rollback', '20261025_platform_team_roles_rollback.sql'), 'utf8'))
    expect((await fresh.query(`select to_regclass('public.platform_members') as t`)).rows[0]).toEqual({ t: null })
    expect((await fresh.query(`select count(*)::int as n from pg_policies where policyname like 'Platform members%'`)).rows[0]).toEqual({ n: 0 })
    const defs = await fresh.query<{ d: string }>(
      `select pg_get_functiondef(p.oid) as d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname in ('guard_business_admin_fields', 'admin_review_application', 'admin_list_business_members', 'admin_user_emails')`,
    )
    expect(defs.rows).toHaveLength(4)
    for (const r of defs.rows) expect(r.d).not.toContain('platform_can')
    await fresh.close()
  })
})

describe('service_user_can (provision-owner caller check, Task 5)', () => {
  it('answers for owners, active members with the permission, and nobody else', async () => {
    const ask = (u: string, perm: string) => svc(`select to_jsonb(public.service_user_can($1, $2)) as r`, [u, perm])
    expect(await ask(OWNER_U, 'owners.manage')).toBe(true)
    expect(await ask(ADMIN_U, 'owners.manage')).toBe(true)
    expect(await ask(TEAM_U, 'owners.manage')).toBe(false)
    expect(await ask(DEACT_U, 'owners.manage')).toBe(false)
    await expect(as(OWNER_U, (tx) => tx.query(`select public.service_user_can($1, 'owners.manage')`, [OWNER_U]))).rejects.toThrow(/permission denied/)
  })
})

describe('service_end_sessions (manage-member sign-out, Task 6)', () => {
  it('deletes every session of the user and nobody else', async () => {
    await db.exec(`create table if not exists auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid)`)
    await db.exec(`insert into auth.sessions (user_id) values ('${TEAM_U}'), ('${TEAM_U}'), ('${ADMIN_U}')`)
    await svc(`select to_jsonb(public.service_end_sessions($1)) as r`, [TEAM_U])
    const left = await db.query<{ user_id: string }>('select user_id from auth.sessions')
    expect(left.rows.map((r) => r.user_id)).toEqual([ADMIN_U])
    await expect(as(OWNER_U, (tx) => tx.query(`select public.service_end_sessions($1)`, [TEAM_U]))).rejects.toThrow(/permission denied/)
  })
})

describe('final review fixes', () => {
  it('the email log accepts team invitations (review C1)', async () => {
    const r = await svc(`with x as (insert into public.email_log (kind, recipient, subject, status) values ('team_invitation', 'a@studio.test', 'You are invited', 'accepted') returning id) select to_jsonb(id) as r from x`)
    expect(r).toBeTruthy()
  })

  it('creating an active business needs businesses.status too (review)', async () => {
    await db.exec(`delete from public.platform_role_permissions where role = 'admin' and permission = 'businesses.status'`)
    try {
      await expect(probe(ADMIN_U, `insert into public.businesses (name, slug, status) values ('New', 'new-live', 'active')`)).rejects.toThrow()
      expect(await affected(ADMIN_U, `insert into public.businesses (name, slug, status) values ('New', 'new-draft', 'draft')`)).toBe(1)
    } finally {
      await db.exec(`insert into public.platform_role_permissions values ('admin', 'businesses.status')`)
    }
  })
})
