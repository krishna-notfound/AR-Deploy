// Shared PGlite harness for the database suites (S1.5 onward). Applies every migration to a disposable in-process
// Postgres with Supabase stand-ins, and runs statements as the API roles at aal1/aal2. Nothing here touches a live
// project. Not a test file (Vitest collects only *.test.ts).
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite, type Transaction } from '@electric-sql/pglite'

export const MIGRATIONS = join(__dirname, '..', 'migrations')
/** File name of the one S1.5 migration (`<ts>_business_logic_fixes.sql`); undefined until it exists. */
export const S15_MIGRATION = readdirSync(MIGRATIONS).find((n) => n.endsWith('_business_logic_fixes.sql'))!
/** Path of the S1.5 rollback script. */
export const ROLLBACK_SQL = join(__dirname, '..', 'rollback', '20261026_business_logic_fixes_rollback.sql')

/** The parts of Supabase the migrations rely on: API roles, auth (users, uid/jwt from test settings, MFA), storage. */
export const SUPABASE_STUBS = `
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
  create table auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid);
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
  -- As on Supabase: new tables and functions in public are granted to the API roles unless a migration revokes them.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
`

/** Applies the migrations in name order; `filter` picks a prefix, e.g. `(n) => n < S15_MIGRATION`. */
export async function applyAll(db: PGlite, filter: (name: string) => boolean = () => true): Promise<void> {
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql') && filter(n)).sort()) await db.exec(readFileSync(join(MIGRATIONS, f), 'utf8'))
}

/** A new database with the stubs and the (filtered) migrations applied. The caller closes it. */
export async function freshDb(filter?: (name: string) => boolean): Promise<PGlite> {
  const db = await PGlite.create()
  await db.exec(SUPABASE_STUBS)
  await applyAll(db, filter)
  return db
}

/**
 * Fixture ids for one task: `ids(3)(7)` is `00000000-0000-0000-0003-000000000007`. Decimal digits are valid hex, so
 * every task (1 to 15) and n (0 to 99) gives a valid UUID, and no two tasks share one.
 */
export function ids(task: number): (n: number) => string {
  if (!Number.isInteger(task) || task < 1 || task > 15) throw new Error(`ids: task must be 1 to 15, got ${task}`)
  return (n: number) => {
    if (!Number.isInteger(n) || n < 0 || n > 99) throw new Error(`ids: n must be 0 to 99, got ${n}`)
    return `00000000-0000-0000-${String(task).padStart(4, '0')}-${String(n).padStart(12, '0')}`
  }
}

export type Aal = 'aal1' | 'aal2' | null
export type Role = 'authenticated' | 'anon' | 'service_role'
export type J = Record<string, unknown>

const ROLLBACK = new Error('rollback')

/** Helpers bound to one database (same signatures as the ones in accountSettings.test.ts). */
export function makeHelpers(db: PGlite) {
  /** Runs `fn` in one transaction as an API role, signed in as `uid` with the given assurance level. */
  async function as<T>(uid: string, fn: (tx: Transaction) => Promise<T>, role: Role = 'authenticated', aal: Aal = 'aal1'): Promise<T> {
    return db.transaction(async (tx) => {
      await tx.exec(`set local role ${role}`)
      await tx.query(`select set_config('test.uid', $1, true)`, [uid])
      await tx.query(`select set_config('test.jwt', $1, true)`, [aal ? JSON.stringify({ aal }) : ''])
      return fn(tx)
    })
  }

  /** Runs one statement as `uid` and always rolls back. Returns the result, or rejects with the DB error. */
  async function probe(uid: string, sql: string, params: unknown[] = [], aal: Aal = 'aal1', role: Role = 'authenticated') {
    let res: Awaited<ReturnType<Transaction['query']>> | undefined
    try {
      await as(uid, async (tx) => {
        res = await tx.query(sql, params)
        throw ROLLBACK
      }, role, aal)
    } catch (e) {
      if (e !== ROLLBACK) throw e
    }
    return res!
  }

  /** `sql` must select one row with an integer column `n`. */
  const count = async (uid: string, sql: string, params: unknown[] = [], aal: Aal = 'aal1', role: Role = 'authenticated') =>
    ((await probe(uid, sql, params, aal, role)).rows[0] as { n: number }).n
  /** Rows changed by `sql` (rolled back). */
  const affected = async (uid: string, sql: string, params: unknown[] = [], aal: Aal = 'aal1') => (await probe(uid, sql, params, aal)).affectedRows ?? 0
  /** Commits `sql`; it must select one row with a column `r`, which is returned. */
  const call = async (uid: string, sql: string, params: unknown[] = [], aal: Aal = 'aal1', role: Role = 'authenticated') =>
    (await as(uid, (tx) => tx.query<{ r: J }>(sql, params), role, aal)).rows[0]!.r
  /** A boolean SQL expression evaluated as `uid`. */
  const flag = async (uid: string, expr: string, aal: Aal = 'aal1') => (await call(uid, `select to_jsonb(${expr}) as r`, [], aal)) as unknown as boolean
  /** `call` as the service role (Edge Functions). */
  const svc = (sql: string, params: unknown[] = []) => call('', sql, params, null, 'service_role')

  /** Turns the 2FA policy on for the duration of `fn` (as the database owner), then off again. */
  async function withPolicy(staff: boolean, business: boolean, fn: () => Promise<void>) {
    await db.query('update public.platform_settings set require_2fa_staff = $1, require_2fa_business = $2', [staff, business])
    try {
      await fn()
    } finally {
      await db.query('update public.platform_settings set require_2fa_staff = false, require_2fa_business = false')
    }
  }

  return { as, probe, count, affected, call, flag, svc, withPolicy }
}

export type Helpers = ReturnType<typeof makeHelpers>
