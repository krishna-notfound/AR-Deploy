// @vitest-environment node
// Account settings, security and 2FA (S1): applies every migration to a disposable in-process Postgres (PGlite)
// with the same Supabase stand-ins as platformTeam.test.ts, then checks the rules as the API roles, at aal1 and aal2.
// Nothing here touches a live project.
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
    const s = (await db.query<{ updated_by: string }>('select updated_by from public.platform_settings')).rows[0]!
    expect(s.updated_by).toBe(OWNER_U)
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
