// @vitest-environment node
// Account settings, security and 2FA (S1): applies every migration to a disposable in-process Postgres (PGlite)
// with the same Supabase stand-ins as platformTeam.test.ts, then checks the rules as the API roles, at aal1 and aal2.
// Nothing here touches a live project.
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite, type Transaction } from '@electric-sql/pglite'
import { beforeAll, describe, expect, it } from 'vitest'

const MIGRATIONS = join(__dirname, '..', 'migrations')
const ACCOUNT_MIGRATION = readdirSync(MIGRATIONS).find((n) => n.endsWith('_account_settings.sql'))!

const SUPABASE_STUBS = `
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, last_sign_in_at timestamptz,
    raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
  create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('test.jwt', true), ''), '{}')::jsonb $$;
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
`

const OWNER_U = '00000000-0000-0000-0000-0000000000a1'
const ADMIN_U = '00000000-0000-0000-0000-0000000000a2'
const TEAM_U = '00000000-0000-0000-0000-0000000000a3'
const BIZ_OWNER_U = '00000000-0000-0000-0000-0000000000a6'
const STRANGER_U = '00000000-0000-0000-0000-0000000000a7'
const NEW_U = '00000000-0000-0000-0000-0000000000a8'
const BIZ = '10000000-0000-0000-0000-0000000000b1'

type Aal = 'aal1' | 'aal2' | null
type Role = 'authenticated' | 'anon' | 'service_role'
type J = Record<string, unknown>

let db: PGlite

/** Runs `fn` in one transaction as an API role, signed in as `uid` with the given assurance level. */
async function as<T>(uid: string, fn: (tx: Transaction) => Promise<T>, role: Role = 'authenticated', aal: Aal = 'aal1'): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role ${role}`)
    await tx.query(`select set_config('test.uid', $1, true)`, [uid])
    await tx.query(`select set_config('test.jwt', $1, true)`, [aal ? JSON.stringify({ aal }) : ''])
    return fn(tx)
  })
}

const ROLLBACK = new Error('rollback')
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
const count = async (uid: string, sql: string, params: unknown[] = [], aal: Aal = 'aal1', role: Role = 'authenticated') =>
  ((await probe(uid, sql, params, aal, role)).rows[0] as { n: number }).n
const affected = async (uid: string, sql: string, params: unknown[] = [], aal: Aal = 'aal1') => (await probe(uid, sql, params, aal)).affectedRows ?? 0
const call = async (uid: string, sql: string, params: unknown[] = [], aal: Aal = 'aal1', role: Role = 'authenticated') =>
  (await as(uid, (tx) => tx.query<{ r: J }>(sql, params), role, aal)).rows[0]!.r
const flag = async (uid: string, expr: string, aal: Aal = 'aal1') => (await call(uid, `select to_jsonb(${expr}) as r`, [], aal)) as unknown as boolean
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

async function applyAll(target: PGlite, filter: (name: string) => boolean = () => true) {
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql') && filter(n)).sort()) await target.exec(readFileSync(join(MIGRATIONS, f), 'utf8'))
}

let application = ''

beforeAll(async () => {
  db = await PGlite.create()
  await db.exec(SUPABASE_STUBS)
  await applyAll(db)
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values
      ('${OWNER_U}', 'owner@test', now()), ('${ADMIN_U}', 'admin@test', now()), ('${TEAM_U}', 'team@test', now()),
      ('${BIZ_OWNER_U}', 'bizowner@test', now()), ('${STRANGER_U}', 'stranger@test', now());
    insert into public.platform_admins (user_id) values ('${OWNER_U}');
    insert into public.platform_members (user_id, email, role, status) values
      ('${ADMIN_U}', 'admin@test', 'admin', 'active'), ('${TEAM_U}', 'team@test', 'team', 'active');
    insert into public.businesses (id, name, slug, status) values ('${BIZ}', 'Biz', 'biz', 'active');
    insert into public.business_members (business_id, user_id) values ('${BIZ}', '${BIZ_OWNER_U}');
  `)
  application = (await db.query<{ id: string }>(
    `insert into public.business_applications (business_name, applicant_name, applicant_email, country, city, category, submission_key, answers)
     values ('Casa', 'Ana', 'ana@example.test', 'Portugal', 'Lisboa', 'Lighting', gen_random_uuid(), '{"description":"Lamps"}') returning id`,
  )).rows[0]!.id
}, 60_000)

describe('account settings: profiles and policy (Task 1)', () => {
  it('creates a profile row for a new auth user and backfills existing users from display_name, then platform_members.full_name', async () => {
    await db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, 'new@test', '{"display_name":"  Nova  "}')`, [NEW_U])
    const row = (await db.query<J>('select display_name, timezone, date_format, clock, notify_new_applications from public.profiles where user_id = $1', [NEW_U])).rows[0]
    expect(row).toEqual({ display_name: 'Nova', timezone: 'Europe/Lisbon', date_format: 'd MMM yyyy', clock: '24h', notify_new_applications: true })
    expect((await db.query(`select 1 from public.profiles where user_id = $1`, [STRANGER_U])).rows).toHaveLength(1)

    const fresh = await PGlite.create()
    try {
      await fresh.exec(SUPABASE_STUBS)
      await applyAll(fresh, (n) => n !== ACCOUNT_MIGRATION)
      await fresh.exec(`
        insert into auth.users (id, email, raw_user_meta_data) values
          ('${OWNER_U}', 'o@test', '{"display_name":"Meta Name"}'), ('${TEAM_U}', 't@test', '{}'), ('${STRANGER_U}', 's@test', null),
          ('${ADMIN_U}', 'a@test', '{"display_name":"Meta Wins"}');
        insert into public.platform_members (user_id, email, role, status) values
          ('${TEAM_U}', 't@test', 'team', 'active'), ('${ADMIN_U}', 'a@test', 'admin', 'active');
        update public.platform_members set full_name = 'Member Name' where user_id = '${TEAM_U}';
        update public.platform_members set full_name = 'Member Loses' where user_id = '${ADMIN_U}';
      `)
      await fresh.exec(readFileSync(join(MIGRATIONS, ACCOUNT_MIGRATION), 'utf8'))
      const names = (await fresh.query<{ user_id: string; display_name: string | null }>('select user_id, display_name from public.profiles order by user_id')).rows
      expect(names).toEqual([
        { user_id: OWNER_U, display_name: 'Meta Name' },
        { user_id: ADMIN_U, display_name: 'Meta Wins' },
        { user_id: TEAM_U, display_name: 'Member Name' },
        { user_id: STRANGER_U, display_name: null },
      ])
    } finally {
      await fresh.close()
    }
  })

  it('a user reads and updates only their own profile; staff can read other profiles; a stranger cannot', async () => {
    expect(await count(STRANGER_U, 'select count(*)::int as n from public.profiles')).toBe(1)
    expect(await count(BIZ_OWNER_U, 'select count(*)::int as n from public.profiles where user_id = $1', [STRANGER_U])).toBe(0)
    const all = (await db.query<{ n: number }>('select count(*)::int as n from public.profiles')).rows[0]!.n
    expect(await count(TEAM_U, 'select count(*)::int as n from public.profiles')).toBe(all)
    expect(await count(OWNER_U, 'select count(*)::int as n from public.profiles')).toBe(all)
    expect(await affected(STRANGER_U, `update public.profiles set display_name = 'Me' where user_id = $1`, [STRANGER_U])).toBe(1)
    expect(await affected(STRANGER_U, `update public.profiles set display_name = 'You' where user_id = $1`, [BIZ_OWNER_U])).toBe(0)
    expect(await affected(TEAM_U, `update public.profiles set display_name = 'You' where user_id = $1`, [BIZ_OWNER_U])).toBe(0)
    await expect(probe(STRANGER_U, `update public.profiles set user_id = $1 where user_id = $2`, [BIZ_OWNER_U, STRANGER_U])).rejects.toThrow()
    await db.query('delete from public.profiles where user_id = $1', [NEW_U])
    await expect(probe(STRANGER_U, `insert into public.profiles (user_id) values ($1)`, [NEW_U])).rejects.toThrow(/row-level security/)
    expect(await affected(NEW_U, `insert into public.profiles (user_id, display_name) values ($1, 'Nova')`, [NEW_U])).toBe(1)
    await db.query(`insert into public.profiles (user_id) values ($1) on conflict do nothing`, [NEW_U])
    // An avatar path must sit in the user's own folder.
    await expect(probe(STRANGER_U, `update public.profiles set avatar_path = $1 where user_id = $2`, [`${BIZ_OWNER_U}/a.png`, STRANGER_U])).rejects.toThrow(/row-level security/)
    await expect(probe(STRANGER_U, `update public.profiles set avatar_path = 'a.png' where user_id = $1`, [STRANGER_U])).rejects.toThrow(/row-level security/)
    expect(await affected(STRANGER_U, `update public.profiles set avatar_path = $1 || '/a.png' where user_id = $1`, [STRANGER_U])).toBe(1)
    await expect(probe(STRANGER_U, 'select * from public.profiles', [], null, 'anon')).rejects.toThrow(/permission denied/)
  })

  it('rejects an unknown timezone and an unknown date_format', async () => {
    await expect(probe(STRANGER_U, `update public.profiles set timezone = 'Mars/Olympus' where user_id = $1`, [STRANGER_U])).rejects.toThrow(/timezone/)
    await expect(probe(STRANGER_U, `update public.profiles set date_format = 'MM/dd/yyyy' where user_id = $1`, [STRANGER_U])).rejects.toThrow(/check/)
    await expect(probe(STRANGER_U, `update public.profiles set clock = '13h' where user_id = $1`, [STRANGER_U])).rejects.toThrow(/check/)
    await expect(probe(STRANGER_U, `update public.profiles set display_name = '' where user_id = $1`, [STRANGER_U])).rejects.toThrow(/check/)
    await expect(probe(STRANGER_U, `update public.profiles set display_name = repeat('x', 81) where user_id = $1`, [STRANGER_U])).rejects.toThrow(/check/)
    expect(await affected(STRANGER_U, `update public.profiles set timezone = 'America/New_York', date_format = 'yyyy-MM-dd', clock = '12h' where user_id = $1`, [STRANGER_U])).toBe(1)
  })

  it('platform_settings: readable by any signed-in user; only the Owner at aal2 can update; Owner at aal1 and Admin are refused', async () => {
    for (const u of [STRANGER_U, BIZ_OWNER_U, TEAM_U]) expect(await count(u, 'select count(*)::int as n from public.platform_settings')).toBe(1)
    await expect(probe(STRANGER_U, 'select * from public.platform_settings', [], null, 'anon')).rejects.toThrow(/permission denied/)
    const set = 'update public.platform_settings set require_2fa_business = true'
    expect(await affected(OWNER_U, set, [], 'aal1')).toBe(0)
    expect(await affected(ADMIN_U, set, [], 'aal2')).toBe(0)
    expect(await affected(STRANGER_U, set, [], 'aal2')).toBe(0)
    expect(await affected(OWNER_U, set, [], 'aal2')).toBe(1)
    await expect(probe(OWNER_U, 'update public.platform_settings set id = false', [], 'aal2')).rejects.toThrow()
    await expect(probe(OWNER_U, 'insert into public.platform_settings (id) values (true)', [], 'aal2')).rejects.toThrow()
    await expect(probe(OWNER_U, 'delete from public.platform_settings', [], 'aal2')).rejects.toThrow()
  })

  it('staff policy on: platform_can, is_platform_member and is_platform_admin are false at aal1 and true at aal2; profiles and my_security_state still work at aal1', async () => {
    await withPolicy(true, false, async () => {
      expect(await flag(OWNER_U, 'public.is_platform_admin()', 'aal1')).toBe(false)
      expect(await flag(OWNER_U, 'public.is_platform_admin()', 'aal2')).toBe(true)
      expect(await flag(OWNER_U, `public.platform_can('products.view')`, 'aal1')).toBe(false)
      expect(await flag(OWNER_U, `public.platform_can('products.view')`, 'aal2')).toBe(true)
      expect(await flag(TEAM_U, 'public.is_platform_member()', 'aal1')).toBe(false)
      expect(await flag(TEAM_U, 'public.is_platform_member()', 'aal2')).toBe(true)
      expect(await flag(TEAM_U, `public.platform_can('products.view')`, 'aal1')).toBe(false)
      expect(await flag(TEAM_U, `public.platform_can('products.view')`, 'aal2')).toBe(true)
      expect(await flag(TEAM_U, 'public.is_platform_member()', null)).toBe(false)
      expect(await count(TEAM_U, 'select count(*)::int as n from public.business_applications', [], 'aal1')).toBe(0)
      expect(await count(TEAM_U, 'select count(*)::int as n from public.business_applications', [], 'aal2')).toBe(1)
      // The 2FA gate does not lock the user out of their own profile or the state that guides setup.
      expect(await count(TEAM_U, 'select count(*)::int as n from public.profiles where user_id = $1', [TEAM_U], 'aal1')).toBe(1)
      expect(await affected(TEAM_U, `update public.profiles set clock = '12h' where user_id = $1`, [TEAM_U], 'aal1')).toBe(1)
      expect(await call(TEAM_U, 'select public.my_security_state() as r', [], 'aal1')).toMatchObject({ requires_2fa: true, aal: 'aal1' })
      expect(await count(TEAM_U, 'select count(*)::int as n from public.platform_settings', [], 'aal1')).toBe(1)
      // The business scope is untouched by the staff policy.
      expect(await flag(BIZ_OWNER_U, `public.is_business_member('${BIZ}')`, 'aal1')).toBe(true)
    })
    expect(await flag(TEAM_U, `public.platform_can('products.view')`, 'aal1')).toBe(true)
    expect(await flag(OWNER_U, 'public.is_platform_admin()', 'aal1')).toBe(true)
  })

  it('business policy on: is_business_member is false at aal1 and true at aal2; public catalog reads are unaffected', async () => {
    await withPolicy(false, true, async () => {
      expect(await flag(BIZ_OWNER_U, `public.is_business_member('${BIZ}')`, 'aal1')).toBe(false)
      expect(await flag(BIZ_OWNER_U, `public.is_business_member('${BIZ}')`, 'aal2')).toBe(true)
      const rename = `update public.businesses set name = 'Biz 2' where id = '${BIZ}'`
      expect(await affected(BIZ_OWNER_U, rename, [], 'aal1')).toBe(0)
      expect(await affected(BIZ_OWNER_U, rename, [], 'aal2')).toBe(1)
      expect(await count('', `select count(*)::int as n from public.businesses where id = '${BIZ}'`, [], null, 'anon')).toBe(1)
      expect(await flag(TEAM_U, `public.platform_can('products.view')`, 'aal1')).toBe(true)
    })
    expect(await flag(BIZ_OWNER_U, `public.is_business_member('${BIZ}')`, 'aal1')).toBe(true)
  })

  it("my_security_state reports requires_2fa for the caller's group only", async () => {
    const state = (u: string, aal: Aal = 'aal1') => call(u, 'select public.my_security_state() as r', [], aal)
    expect(await state(STRANGER_U)).toEqual({ requires_2fa: false, aal: 'aal1', closure: null, onboarding: { completed_at: null, dismissed_at: null } })
    expect((await state(STRANGER_U, null)).aal).toBe('aal1')
    expect((await state(STRANGER_U, 'aal2')).aal).toBe('aal2')
    await withPolicy(true, false, async () => {
      expect((await state(OWNER_U)).requires_2fa).toBe(true)
      expect((await state(ADMIN_U)).requires_2fa).toBe(true)
      expect((await state(TEAM_U, 'aal2')).requires_2fa).toBe(true)
      expect((await state(BIZ_OWNER_U)).requires_2fa).toBe(false)
      expect((await state(STRANGER_U)).requires_2fa).toBe(false)
    })
    await withPolicy(false, true, async () => {
      expect((await state(BIZ_OWNER_U)).requires_2fa).toBe(true)
      expect((await state(TEAM_U)).requires_2fa).toBe(false)
      expect((await state(OWNER_U)).requires_2fa).toBe(false)
    })
    await db.query(`update public.profiles set onboarding_completed_at = '2026-10-01T10:00:00Z' where user_id = $1`, [STRANGER_U])
    expect(new Date(((await state(STRANGER_U)).onboarding as J).completed_at as string).toISOString()).toBe('2026-10-01T10:00:00.000Z')
    await expect(probe('', 'select public.my_security_state()', [], null, 'anon')).rejects.toThrow(/permission denied/)
  })

  it('staff policy on: admin_list_members and admin_review_application return forbidden or no rows at aal1 and work at aal2', async () => {
    await withPolicy(true, false, async () => {
      expect(await call(OWNER_U, 'select public.admin_list_members() as r', [], 'aal1')).toEqual({ error: 'forbidden' })
      expect(((await call(OWNER_U, 'select public.admin_list_members() as r', [], 'aal2')).members as J[]).length).toBeGreaterThan(0)
      const review = `select to_jsonb(public.admin_review_application($1, 'start_review')) as r`
      await expect(probe(ADMIN_U, review, [application], 'aal1')).rejects.toThrow(/platform_admin_only/)
      expect((await probe(ADMIN_U, review, [application], 'aal2')).rows[0]).toMatchObject({ r: { status: 'under_review' } })
      expect(await count(ADMIN_U, 'select count(*)::int as n from public.business_applications', [], 'aal1')).toBe(0)
      expect(await count(ADMIN_U, 'select count(*)::int as n from public.business_applications', [], 'aal2')).toBe(1)
    })
  })

  it('record_sign_in records once, then returns rate_limited within 60 seconds', async () => {
    const ua = 'Mozilla/5.0 '.repeat(40)
    const sign = () => call(STRANGER_U, `select to_jsonb(public.record_sign_in($1)) as r`, [ua])
    expect(await sign()).toBe('recorded')
    expect(await sign()).toBe('rate_limited')
    const ev = await db.query<{ actor_id: string; metadata: { user_agent: string } }>(
      `select actor_id, metadata from public.audit_events where event_type = 'account_signed_in' and actor_id = $1`, [STRANGER_U])
    expect(ev.rows).toHaveLength(1)
    expect(ev.rows[0]!.metadata.user_agent).toHaveLength(200)
    await db.query(`update public.audit_events set created_at = now() - interval '61 seconds' where event_type = 'account_signed_in' and actor_id = $1`, [STRANGER_U])
    expect(await sign()).toBe('recorded')
    expect(await call(BIZ_OWNER_U, `select to_jsonb(public.record_sign_in(null)) as r`)).toBe('recorded')
    await expect(probe('', `select public.record_sign_in('x')`, [], null, 'anon')).rejects.toThrow(/permission denied/)
  })

  it('log_account_event accepts only the two client events', async () => {
    for (const e of ['account_email_change_requested', 'account_password_changed']) {
      await call(BIZ_OWNER_U, `select to_jsonb(public.log_account_event($1)) as r`, [e])
      expect((await db.query(`select 1 from public.audit_events where event_type = $1 and actor_id = $2`, [e, BIZ_OWNER_U])).rows).toHaveLength(1)
    }
    for (const e of ['account_2fa_disabled', 'account_signed_in', 'account_deleted', 'access_denied', ''])
      await expect(probe(BIZ_OWNER_U, `select public.log_account_event($1)`, [e])).rejects.toThrow(/event/)
    await expect(probe('', `select public.log_account_event('account_password_changed')`, [], null, 'anon')).rejects.toThrow(/permission denied/)
  })

  it("list_my_security_events returns only the caller's account_ events, newest first, at most 50", async () => {
    const me = TEAM_U
    await db.query(
      `insert into public.audit_events (event_type, actor_id, created_at)
       select 'account_signed_in', $1, now() - (g || ' minutes')::interval from generate_series(1, 55) g`, [me])
    await db.query(`insert into public.audit_events (event_type, actor_id) values ('access_denied', $1), ('accountish', $1)`, [me])
    await db.query(`insert into public.audit_events (event_type, actor_id) values ('account_signed_in', $1)`, [ADMIN_U])
    await db.query(`insert into public.audit_events (event_type, actor_id, metadata, created_at) values ('account_2fa_reset_by_owner', $1, $2, now() + interval '1 minute')`,
      [OWNER_U, JSON.stringify({ subject_id: me })])
    const rows = (await as(me, (tx) => tx.query<{ event_type: string; actor_id: string; created_at: string }>('select * from public.list_my_security_events()'))).rows
    expect(rows).toHaveLength(50)
    expect(rows[0]!.event_type).toBe('account_2fa_reset_by_owner')
    expect(rows.every((r) => r.event_type.startsWith('account_'))).toBe(true)
    expect(rows.filter((r) => r.actor_id === ADMIN_U)).toHaveLength(0)
    const times = rows.map((r) => new Date(r.created_at).getTime())
    expect([...times].sort((a, b) => b - a)).toEqual(times)
    // The additive read policy: the user's own account events are readable directly, nothing else is.
    await withPolicy(true, false, async () => {
      const seen = await count(me, `select count(*)::int as n from public.audit_events`, [], 'aal1')
      expect(seen).toBe(56)
    })
    expect(await count(STRANGER_U, `select count(*)::int as n from public.audit_events where actor_id <> $1`, [STRANGER_U])).toBe(0)
  })

  it('avatars bucket: a user may write only under their own folder', async () => {
    expect((await db.query('select public, file_size_limit, allowed_mime_types from storage.buckets where id = $1', ['avatars'])).rows[0])
      .toEqual({ public: true, file_size_limit: 524288, allowed_mime_types: ['image/jpeg', 'image/png', 'image/webp'] })
    const put = (u: string, folder: string) => affected(u, `insert into storage.objects (bucket_id, name, owner) values ('avatars', $1, $2)`, [`${folder}/x.webp`, u])
    expect(await put(STRANGER_U, STRANGER_U)).toBe(1)
    await expect(put(STRANGER_U, BIZ_OWNER_U)).rejects.toThrow(/row-level security/)
    await expect(put(STRANGER_U, 'public')).rejects.toThrow(/row-level security/)
    await expect(probe('', `insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [`${STRANGER_U}/x.webp`], null, 'anon')).rejects.toThrow(/row-level security/)
    await db.query(`insert into storage.objects (bucket_id, name) values ('avatars', $1), ('avatars', $2)`, [`${BIZ_OWNER_U}/a.webp`, `${STRANGER_U}/b.webp`])
    expect(await affected(STRANGER_U, `delete from storage.objects where bucket_id = 'avatars' and name = $1`, [`${BIZ_OWNER_U}/a.webp`])).toBe(0)
    expect(await affected(STRANGER_U, `update storage.objects set metadata = '{}' where bucket_id = 'avatars' and name = $1`, [`${BIZ_OWNER_U}/a.webp`])).toBe(0)
    expect(await affected(STRANGER_U, `delete from storage.objects where bucket_id = 'avatars' and name = $1`, [`${STRANGER_U}/b.webp`])).toBe(1)
    await expect(probe(STRANGER_U, `update storage.objects set name = $1 where bucket_id = 'avatars' and name = $2`, [`${BIZ_OWNER_U}/b.webp`, `${STRANGER_U}/b.webp`])).rejects.toThrow(/row-level security/)
  })

  it('a platform_security_policy_changed audit event is written when platform_settings changes', async () => {
    await db.query('update public.platform_settings set require_2fa_staff = false, require_2fa_business = false')
    const before = (await db.query<{ n: number }>(`select count(*)::int as n from public.audit_events where event_type = 'platform_security_policy_changed'`)).rows[0]!.n
    await as(OWNER_U, (tx) => tx.query('update public.platform_settings set require_2fa_business = true'), 'authenticated', 'aal2')
    const ev = await db.query<{ actor_id: string; metadata: J }>(
      `select actor_id, metadata from public.audit_events where event_type = 'platform_security_policy_changed' order by created_at desc limit 1`)
    expect(ev.rows[0]).toEqual({
      actor_id: OWNER_U,
      metadata: { from: { require_2fa_staff: false, require_2fa_business: false }, to: { require_2fa_staff: false, require_2fa_business: true } },
    })
    // The trigger stamps who and when (the service layer sends neither).
    const s = (await db.query<{ updated_by: string; fresh: boolean }>(
      `select updated_by, updated_at > now() - interval '1 minute' as fresh from public.platform_settings`)).rows[0]!
    expect(s).toEqual({ updated_by: OWNER_U, fresh: true })
    await expect(probe(OWNER_U, `update public.platform_settings set updated_by = $1`, [ADMIN_U], 'aal2')).rejects.toThrow(/permission denied/)
    // A no-op update writes nothing.
    await as(OWNER_U, (tx) => tx.query('update public.platform_settings set require_2fa_business = true'), 'authenticated', 'aal2')
    expect((await db.query<{ n: number }>(`select count(*)::int as n from public.audit_events where event_type = 'platform_security_policy_changed'`)).rows[0]!.n).toBe(before + 1)
    await db.query('update public.platform_settings set require_2fa_business = false')
  })

  it('the email log accepts the security kinds', async () => {
    for (const kind of ['security_code', 'security_notice', 'closure_request'])
      await svc(`with x as (insert into public.email_log (kind, recipient, subject, status) values ($1, 'a@studio.test', 'Code', 'accepted') returning id) select to_jsonb(id) as r from x`, [kind])
    await expect(db.query(`insert into public.email_log (kind, recipient, subject, status) values ('nope', 'a@studio.test', 'x', 'accepted')`)).rejects.toThrow(/check/)
  })
})

// ---------------------------------------------------------------------------
// Task 2: action codes, recovery codes and account closure
// ---------------------------------------------------------------------------

const CLOSE_BIZ_U = '00000000-0000-0000-0000-0000000000c1'
const DRAFT_OWNER_U = '00000000-0000-0000-0000-0000000000c2'
const CLOSE_STAFF_U = '00000000-0000-0000-0000-0000000000c3'
const CODES_U = '00000000-0000-0000-0000-0000000000c4'
const BIZ_C = '10000000-0000-0000-0000-0000000000c1'
const BIZ_D = '10000000-0000-0000-0000-0000000000c2'
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

const SERVICE_FUNCTIONS = [
  'service_create_action_code(uuid, text, text, text)', 'service_check_action_code(uuid, text, text)',
  'service_discard_action_code(uuid, uuid)', 'service_set_recovery_codes(uuid, text[], text)',
  'service_use_recovery_code(uuid, text)', 'service_clear_recovery_codes(uuid)', 'service_has_recovery_codes(uuid)',
  'service_log_account_event(uuid, text, jsonb, text)', 'service_requires_2fa(uuid)', 'service_request_closure(uuid)',
  'service_restore_closure(uuid, uuid)', 'service_closure_target(uuid)', 'service_classify_user(uuid)',
]

const NEW_FUNCTIONS = [
  'mfa_satisfied', 'my_security_state', 'record_sign_in', 'log_account_event', 'list_my_security_events', 'cancel_account_closure',
  'my_recovery_codes_left', 'admin_list_closure_requests', 'account_group', 'requires_2fa', 'undo_closure', 'create_profile_for_new_user',
  'profiles_valid_timezone', 'platform_settings_stamp', 'platform_settings_audit',
  ...SERVICE_FUNCTIONS.map((f) => f.slice(0, f.indexOf('('))),
]

describe('account settings: codes and closure (Task 2)', () => {
  beforeAll(async () => {
    await db.exec(`
      insert into auth.users (id, email) values ('${CLOSE_BIZ_U}', 'close@shop.test'), ('${DRAFT_OWNER_U}', 'draft@shop.test'),
        ('${CLOSE_STAFF_U}', 'leaver@studio.test'), ('${CODES_U}', 'codes@test');
      insert into public.businesses (id, name, slug, status) values ('${BIZ_C}', 'Closing Co', 'closing-co', 'active'),
        ('${BIZ_D}', 'Draft Co', 'draft-co', 'draft');
      insert into public.business_members (business_id, user_id) values ('${BIZ_C}', '${CLOSE_BIZ_U}'), ('${BIZ_D}', '${DRAFT_OWNER_U}');
      insert into public.platform_members (user_id, email, role, status) values ('${CLOSE_STAFF_U}', 'leaver@studio.test', 'team', 'active');
      insert into auth.sessions (user_id) values ('${CLOSE_STAFF_U}'), ('${CLOSE_STAFF_U}'), ('${TEAM_U}');
    `)
  })

  it('action code: correct code passes once, then invalid_code; expired code gives code_expired; the 6th wrong attempt gives too_many_attempts; a newer code invalidates an older one; the 6th code within an hour gives rate_limited', async () => {
    const create = (purpose: string, code: string, salt = 'salt-' + code) =>
      svc('select public.service_create_action_code($1, $2, $3, $4) as r', [CODES_U, purpose, sha(salt + code), salt])
    const check = (purpose: string, code: string) => svc('select public.service_check_action_code($1, $2, $3) as r', [CODES_U, purpose, code])

    expect(await svc('select public.service_create_action_code($1, $2, $3, $4) as r', [CODES_U, 'make_coffee', sha('x'), 'x'])).toEqual({ error: 'invalid_request' })
    expect(await svc('select public.service_create_action_code($1, $2, $3, $4) as r', [CODES_U, 'disable_2fa', 'not-a-hash', 'x'])).toEqual({ error: 'invalid_request' })

    const first = await create('disable_2fa', '123456')
    expect(first).toMatchObject({ ok: true })
    expect(typeof first.id).toBe('string')
    expect(await check('request_closure', '123456')).toEqual({ error: 'invalid_code' })
    expect(await check('disable_2fa', ' 123 456 ')).toEqual({ ok: true })
    expect(await check('disable_2fa', '123456')).toEqual({ error: 'invalid_code' })

    const late = await create('disable_2fa', '222222')
    await db.query(`update private.action_codes set expires_at = now() - interval '1 second' where id = $1`, [late.id])
    expect(await check('disable_2fa', '222222')).toEqual({ error: 'code_expired' })

    await create('disable_2fa', '333333')
    for (let i = 0; i < 5; i++) expect(await check('disable_2fa', '000000')).toEqual({ error: 'invalid_code' })
    expect(await check('disable_2fa', '333333')).toEqual({ error: 'too_many_attempts' })

    await create('regenerate_recovery', '444444')
    await create('regenerate_recovery', '555555')
    expect(await check('regenerate_recovery', '444444')).toEqual({ error: 'invalid_code' })
    expect(await check('regenerate_recovery', '555555')).toEqual({ ok: true })

    expect(await create('owner_reset_2fa', '666666')).toEqual({ error: 'rate_limited' })
    const stored = await db.query<{ code_hash: string }>('select code_hash from private.action_codes where user_id = $1', [CODES_U])
    expect(stored.rows.every((r) => /^[0-9a-f]{64}$/.test(r.code_hash))).toBe(true)

    // A discarded code (the email failed) is unusable but still counts towards the hourly limit.
    await db.query(`update private.action_codes set created_at = now() - interval '2 hours' where user_id = $1`, [CODES_U])
    const unsent = await create('complete_closure', '777777')
    expect(await svc('select public.service_discard_action_code($1, $2) as r', [CODES_U, unsent.id])).toEqual({ ok: true })
    expect(await check('complete_closure', '777777')).toEqual({ error: 'invalid_code' })
    expect((await db.query(`select 1 from private.action_codes where id = $1`, [unsent.id])).rows).toHaveLength(1)
  })

  it('recovery codes: a set replaces the previous set; each code works once (case-insensitive, dash ignored); service_has_recovery_codes and my_recovery_codes_left count unused codes (own only)', async () => {
    const codes = (prefix: string) => Array.from({ length: 8 }, (_, i) => `${prefix}${'23456789'[i]}`)
    const setOf = (list: string[], salt: string) => svc('select public.service_set_recovery_codes($1, $2, $3) as r', [CODES_U, list.map((c) => sha(salt + c)), salt])
    const use = (code: string) => svc('select public.service_use_recovery_code($1, $2) as r', [CODES_U, code])

    expect(await setOf(codes('ABCDEFGHJ'), 'salt-one')).toEqual({ ok: true })
    expect(await svc('select public.service_has_recovery_codes($1) as r', [CODES_U])).toEqual({ ok: true, count: 8 })
    expect(await setOf(codes('KMNPQRSTU'), 'salt-two')).toEqual({ ok: true })
    expect(await use('ABCDEFGHJ2')).toEqual({ error: 'invalid_code' })
    expect(await use('kmnpq-rstu2 ')).toEqual({ ok: true, remaining: 7 })
    expect(await use('KMNPQRSTU2')).toEqual({ error: 'invalid_code' })
    expect(await use(' KMNPQ RSTU3')).toEqual({ ok: true, remaining: 6 })
    expect(await use('')).toEqual({ error: 'invalid_code' })
    expect(await use('KMNPQ-RSTU1')).toEqual({ error: 'invalid_code' })
    expect(await svc('select public.service_has_recovery_codes($1) as r', [CODES_U])).toEqual({ ok: true, count: 6 })
    expect(await call(CODES_U, 'select to_jsonb(public.my_recovery_codes_left()) as r')).toBe(6)
    expect(await call(STRANGER_U, 'select to_jsonb(public.my_recovery_codes_left()) as r')).toBe(0)
    expect(await svc('select public.service_set_recovery_codes($1, $2, $3) as r', [CODES_U, [sha('a')], 'salt'])).toEqual({ error: 'invalid_request' })
    expect(await svc('select public.service_has_recovery_codes($1) as r', [CODES_U])).toEqual({ ok: true, count: 6 })
    expect(await svc('select public.service_clear_recovery_codes($1) as r', [CODES_U])).toEqual({ ok: true })
    expect(await svc('select public.service_has_recovery_codes($1) as r', [CODES_U])).toEqual({ ok: true, count: 0 })
    await expect(probe('', 'select public.my_recovery_codes_left()', [], null, 'anon')).rejects.toThrow(/permission denied/)
  })

  it('private tables and service_* functions are not reachable from anon or authenticated', async () => {
    for (const fn of SERVICE_FUNCTIONS) {
      const r = (await db.query<J>(
        `select has_function_privilege('anon', $1, 'execute') as anon, has_function_privilege('authenticated', $1, 'execute') as auth,
                has_function_privilege('service_role', $1, 'execute') as svc`, [`public.${fn}`])).rows[0]
      expect({ fn, ...r }).toEqual({ fn, anon: false, auth: false, svc: true })
    }
    for (const role of ['authenticated', 'anon'] as const) {
      await expect(probe(OWNER_U, 'select * from private.action_codes', [], 'aal2', role)).rejects.toThrow(/permission denied/)
      await expect(probe(OWNER_U, 'select * from private.recovery_codes', [], 'aal2', role)).rejects.toThrow(/permission denied/)
      await expect(probe(OWNER_U, `select public.service_check_action_code($1, 'disable_2fa', '123456')`, [OWNER_U], 'aal2', role)).rejects.toThrow(/permission denied/)
    }
  })

  it("service_request_closure: a business owner's business goes inactive and a request row exists; staff are deactivated; the Owner gets owner_cannot_close; a second request gets already_requested", async () => {
    const req = (u: string) => svc('select public.service_request_closure($1) as r', [u])
    expect(await req(CLOSE_BIZ_U)).toEqual({ ok: true, kind: 'business', business_id: BIZ_C })
    expect((await db.query('select status from public.businesses where id = $1', [BIZ_C])).rows[0]).toEqual({ status: 'inactive' })
    expect((await db.query('select business_id, previous_business_status from public.account_closure_requests where user_id = $1', [CLOSE_BIZ_U])).rows[0])
      .toEqual({ business_id: BIZ_C, previous_business_status: 'active' })
    expect(await req(CLOSE_BIZ_U)).toEqual({ error: 'already_requested' })

    expect(await req(CLOSE_STAFF_U)).toEqual({ ok: true, kind: 'staff' })
    expect((await db.query('select status from public.platform_members where user_id = $1', [CLOSE_STAFF_U])).rows[0]).toEqual({ status: 'deactivated' })
    expect((await db.query<{ user_id: string }>('select user_id from auth.sessions')).rows.map((r) => r.user_id)).toEqual([TEAM_U])

    expect(await req(OWNER_U)).toEqual({ error: 'owner_cannot_close' })
    expect(await req(STRANGER_U)).toEqual({ error: 'not_allowed' })
    // The Edge Function logs account_closure_requested (controller ruling): the SQL side writes no row of its own.
    expect((await db.query(`select 1 from public.audit_events where event_type = 'account_closure_requested'`)).rows).toHaveLength(0)
    const state = await call(CLOSE_BIZ_U, 'select public.my_security_state() as r')
    expect(state.closure).toEqual({ business_id: BIZ_C, requested_at: expect.any(String) })
  })

  it('cancel restores the previous business status', async () => {
    expect(await svc('select public.service_request_closure($1) as r', [DRAFT_OWNER_U])).toEqual({ ok: true, kind: 'business', business_id: BIZ_D })
    expect((await db.query('select status from public.businesses where id = $1', [BIZ_D])).rows[0]).toEqual({ status: 'inactive' })
    expect(await call(DRAFT_OWNER_U, 'select public.cancel_account_closure() as r')).toEqual({ ok: true })
    expect((await db.query('select status from public.businesses where id = $1', [BIZ_D])).rows[0]).toEqual({ status: 'draft' })
    expect((await db.query('select 1 from public.account_closure_requests where user_id = $1', [DRAFT_OWNER_U])).rows).toHaveLength(0)
    expect(await call(DRAFT_OWNER_U, 'select public.my_security_state() as r')).toMatchObject({ closure: null })
    expect(await call(DRAFT_OWNER_U, 'select public.cancel_account_closure() as r')).toEqual({ error: 'not_found' })
    const ev = await db.query<J>(`select actor_id, business_id, to_status, metadata from public.audit_events where event_type = 'account_closure_cancelled'`)
    expect(ev.rows).toEqual([{ actor_id: DRAFT_OWNER_U, business_id: BIZ_D, to_status: 'draft', metadata: { subject_id: DRAFT_OWNER_U } }])
    await expect(probe('', 'select public.cancel_account_closure()', [], null, 'anon')).rejects.toThrow(/permission denied/)
  })

  it('account_closure_requests: readable by the requester and staff with businesses.view only', async () => {
    const n = (u: string, aal: Aal = 'aal1') => count(u, 'select count(*)::int as n from public.account_closure_requests', [], aal)
    expect(await n(CLOSE_BIZ_U)).toBe(1)
    expect(await n(TEAM_U)).toBe(1)
    expect(await n(OWNER_U)).toBe(1)
    expect(await n(BIZ_OWNER_U)).toBe(0)
    expect(await n(STRANGER_U)).toBe(0)
    await db.exec(`delete from public.platform_role_permissions where role = 'team' and permission = 'businesses.view'`)
    try {
      expect(await n(TEAM_U)).toBe(0)
    } finally {
      await db.exec(`insert into public.platform_role_permissions values ('team', 'businesses.view')`)
    }
    await withPolicy(true, false, async () => {
      expect(await n(TEAM_U, 'aal1')).toBe(0)
      expect(await n(TEAM_U, 'aal2')).toBe(1)
    })
    await expect(probe(CLOSE_BIZ_U, 'delete from public.account_closure_requests')).rejects.toThrow(/permission denied/)
    await expect(probe(CLOSE_BIZ_U, `update public.account_closure_requests set previous_business_status = 'active'`)).rejects.toThrow(/permission denied/)
    await expect(probe(STRANGER_U, `insert into public.account_closure_requests (user_id) values ($1)`, [STRANGER_U])).rejects.toThrow(/permission denied/)
  })

  it('admin_list_closure_requests requires businesses.view', async () => {
    const list = (u: string, aal: Aal = 'aal1') => call(u, 'select public.admin_list_closure_requests() as r', [], aal)
    const rows = (await list(TEAM_U)) as unknown as J[]
    expect(rows).toEqual([{ user_id: CLOSE_BIZ_U, email: 'close@shop.test', business_id: BIZ_C, business_name: 'Closing Co', requested_at: expect.any(String) }])
    expect(await list(OWNER_U)).toHaveLength(1)
    expect(await list(STRANGER_U)).toEqual({ error: 'forbidden' })
    expect(await list(CLOSE_BIZ_U)).toEqual({ error: 'forbidden' })
    await withPolicy(true, false, async () => {
      expect(await list(TEAM_U, 'aal1')).toEqual({ error: 'forbidden' })
    })
    await expect(probe('', 'select public.admin_list_closure_requests()', [], null, 'anon')).rejects.toThrow(/permission denied/)
  })

  it('service_requires_2fa, service_classify_user, service_closure_target and service_log_account_event', async () => {
    const kind = async (u: string) => (await svc('select public.service_classify_user($1) as r', [u])).kind
    expect([await kind(OWNER_U), await kind(TEAM_U), await kind(CLOSE_STAFF_U), await kind(BIZ_OWNER_U), await kind(STRANGER_U)])
      .toEqual(['owner', 'staff', 'staff', 'business', 'none'])
    await withPolicy(true, false, async () => {
      expect(await svc('select public.service_requires_2fa($1) as r', [TEAM_U])).toEqual({ ok: true, requires: true, group: 'staff' })
      expect(await svc('select public.service_requires_2fa($1) as r', [BIZ_OWNER_U])).toEqual({ ok: true, requires: false, group: 'business' })
      expect(await svc('select public.service_requires_2fa($1) as r', [STRANGER_U])).toEqual({ ok: true, requires: false, group: 'none' })
    })
    expect(await svc('select public.service_closure_target($1) as r', [CLOSE_BIZ_U])).toEqual({ ok: true, business_id: BIZ_C, email: 'close@shop.test' })
    expect(await svc('select public.service_closure_target($1) as r', [STRANGER_U])).toEqual({ error: 'not_found' })

    expect(await svc('select public.service_log_account_event($1, $2, $3, $4) as r', [STRANGER_U, 'account_2fa_enabled', { factor: 'totp' }, '203.0.113.9'])).toEqual({ ok: true })
    const ev = await db.query<J>(`select actor_id, metadata from public.audit_events where event_type = 'account_2fa_enabled'`)
    expect(ev.rows).toEqual([{ actor_id: STRANGER_U, metadata: { factor: 'totp', ip: '203.0.113.9' } }])
    expect(await svc('select public.service_log_account_event($1, $2, $3, $4) as r', [STRANGER_U, 'access_denied', {}, null])).toEqual({ error: 'invalid_request' })
    // The subject may already be deleted (account_deleted): logged without an actor.
    const gone = '00000000-0000-0000-0000-0000000000ff'
    expect(await svc('select public.service_log_account_event($1, $2, $3, $4) as r', [gone, 'account_deleted', { email_hash: sha('x') }, null])).toEqual({ ok: true })
    expect((await db.query(`select actor_id from public.audit_events where event_type = 'account_deleted'`)).rows).toEqual([{ actor_id: null }])
  })

  it('service_restore_closure restores the status and logs account_closure_restored', async () => {
    expect(await svc('select public.service_restore_closure($1, $2) as r', [CLOSE_BIZ_U, OWNER_U])).toEqual({ ok: true })
    expect((await db.query('select status from public.businesses where id = $1', [BIZ_C])).rows[0]).toEqual({ status: 'active' })
    expect((await db.query('select 1 from public.account_closure_requests where user_id = $1', [CLOSE_BIZ_U])).rows).toHaveLength(0)
    const ev = await db.query<J>(`select actor_id, business_id, metadata from public.audit_events where event_type = 'account_closure_restored'`)
    expect(ev.rows).toEqual([{ actor_id: OWNER_U, business_id: BIZ_C, metadata: { subject_id: CLOSE_BIZ_U } }])
    expect(await svc('select public.service_restore_closure($1, $2) as r', [CLOSE_BIZ_U, OWNER_U])).toEqual({ error: 'not_found' })
    // The subject sees the Owner's restore in their own activity.
    const mine = (await as(CLOSE_BIZ_U, (tx) => tx.query<{ event_type: string }>('select event_type from public.list_my_security_events()'))).rows.map((r) => r.event_type)
    expect(mine).toEqual(['account_closure_restored'])
  })

  it('rollback script restores the four helpers without the 2FA clause and drops the new objects', async () => {
    const fresh = await PGlite.create()
    try {
      await fresh.exec(SUPABASE_STUBS)
      await applyAll(fresh, (n) => n <= ACCOUNT_MIGRATION)
      await fresh.exec(readFileSync(join(__dirname, '..', 'rollback', '20261025_account_settings_rollback.sql'), 'utf8'))
      const gone = await fresh.query<J>(
        `select to_regclass('public.profiles') as a, to_regclass('public.platform_settings') as b, to_regclass('public.account_closure_requests') as c,
                to_regclass('private.action_codes') as d, to_regclass('private.recovery_codes') as e`)
      expect(gone.rows[0]).toEqual({ a: null, b: null, c: null, d: null, e: null })
      const left = await fresh.query<{ proname: string }>(
        `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('public', 'private') and p.proname = any($1)`, [NEW_FUNCTIONS])
      expect(left.rows).toEqual([])
      const defs = await fresh.query<{ d: string }>(
        `select pg_get_functiondef(p.oid) as d from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname in ('is_platform_admin', 'is_business_member', 'platform_can', 'is_platform_member')`)
      expect(defs.rows).toHaveLength(4)
      for (const r of defs.rows) {
        expect(r.d).not.toContain('mfa_satisfied')
        expect(r.d).not.toContain('platform_settings')
      }
      const policies = await fresh.query(`select policyname from pg_policies where policyname in ('Users read their own account events',
        'Users upload their own avatar', 'Users replace their own avatar', 'Users delete their own avatar', 'Users read their own avatar files')`)
      expect(policies.rows).toEqual([])
      expect((await fresh.query(`select 1 from storage.buckets where id = 'avatars'`)).rows).toEqual([])
      await fresh.exec(`insert into auth.users (id, email) values ('${OWNER_U}', 'o@test'); insert into public.platform_admins (user_id) values ('${OWNER_U}')`)
      const ok = await fresh.transaction(async (tx) => {
        await tx.exec('set local role authenticated')
        await tx.query(`select set_config('test.uid', $1, true)`, [OWNER_U])
        return (await tx.query<{ a: boolean; c: boolean }>(`select public.is_platform_admin() as a, public.platform_can('products.view') as c`)).rows[0]
      })
      expect(ok).toEqual({ a: true, c: true })
      // The earlier migration's rollback still applies on top.
      await fresh.exec(readFileSync(join(__dirname, '..', 'rollback', '20261025_platform_team_roles_rollback.sql'), 'utf8'))
    } finally {
      await fresh.close()
    }
  })
})
