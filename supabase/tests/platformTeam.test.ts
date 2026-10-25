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
  create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, last_sign_in_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
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
