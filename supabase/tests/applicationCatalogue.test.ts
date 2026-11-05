// @vitest-environment node
// Application catalogue (ADR-0050): the private bucket, business_applications.catalogue_path, who may read the files, the
// application-form SQL gate with the new field `catalogue`, and the rollback script. Runs on the shared PGlite harness;
// nothing here touches a live project.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MIGRATIONS, freshDb, ids, makeHelpers, type Helpers } from './harness'

const MIGRATION = readdirSync(MIGRATIONS).find((n) => n.endsWith('_application_catalogue.sql'))!
const ROLLBACK_SQL = join(__dirname, '..', 'rollback', '20261105_application_catalogue_rollback.sql')

const id = ids(2)
const STAFF = id(41) // team member: applications.view
const NO_VIEW = id(42) // team member after applications.view is taken from the role (below)
const OWNER = id(43) // business owner
const BIZ = id(44)
const KEY = '6f1c1b1e-3c55-4a1c-9d47-0a3c1e2b9f10'
const PATH = `pending/${KEY}/catalogue.pdf`

let db: PGlite
let h: Helpers

beforeAll(async () => {
  db = await freshDb()
  h = makeHelpers(db)
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values ('${STAFF}', 'ac-staff@test', now()), ('${NO_VIEW}', 'ac-noview@test', now()), ('${OWNER}', 'ac-owner@test', now());
    insert into public.platform_members (user_id, email, role, status) values ('${STAFF}', 'ac-staff@test', 'team', 'active');
    insert into public.businesses (id, name, slug, status) values ('${BIZ}', 'Biz', 'biz', 'active');
    insert into public.business_members (business_id, user_id) values ('${BIZ}', '${OWNER}');
    insert into storage.objects (bucket_id, name, metadata) values ('application-files', '${PATH}', '{"mimetype":"application/pdf","size":1234}');
  `)
}, 60_000)
afterAll(async () => {
  await db?.close()
})

const readable = (uid: string, aal: 'aal1' | 'aal2' | null = 'aal1', role: 'authenticated' | 'anon' = 'authenticated') =>
  h.count(uid, `select count(*)::int as n from storage.objects where bucket_id = 'application-files'`, [], aal, role)

describe('the application-files bucket', () => {
  it('is private, 20 MB, PDF only', async () => {
    const r = await db.query(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'application-files'`)
    expect(r.rows[0]).toEqual({ public: false, file_size_limit: 20971520, allowed_mime_types: ['application/pdf'] })
  })

  it('refuses to continue when the bucket already exists and is public', async () => {
    const fresh = await freshDb((n) => n < MIGRATION)
    try {
      await fresh.exec(`insert into storage.buckets (id, name, public) values ('application-files', 'application-files', true)`)
      await expect(fresh.exec(readFileSync(join(MIGRATIONS, MIGRATION), 'utf8'))).rejects.toThrow(/exists and is public/)
    } finally {
      await fresh.close()
    }
  }, 120_000)
})

describe('who reads the files', () => {
  it('platform staff with applications.view read them; a business owner, a stranger and anon do not', async () => {
    expect(await readable(STAFF)).toBe(1)
    expect(await readable(OWNER)).toBe(0)
    expect(await readable(NO_VIEW)).toBe(0)
    expect(await readable('', null, 'anon')).toBe(0)
  })

  it('a staff role without applications.view reads nothing', async () => {
    await db.exec(`delete from public.platform_role_permissions where role = 'team' and permission = 'applications.view'`)
    try {
      expect(await readable(STAFF)).toBe(0)
    } finally {
      await db.exec(`insert into public.platform_role_permissions (role, permission) values ('team', 'applications.view')`)
    }
    expect(await readable(STAFF)).toBe(1)
  })

  it('with the staff 2FA policy on, staff read at aal2 only', async () => {
    await h.withPolicy(true, false, async () => {
      expect(await readable(STAFF, 'aal1')).toBe(0)
      expect(await readable(STAFF, 'aal2')).toBe(1)
    })
  })
})

describe('writes through the API roles', () => {
  const insertSql = `insert into storage.objects (bucket_id, name) values ('application-files', 'pending/${KEY}/other.pdf')`
  it('no insert, update or delete for anon, a business owner or staff (uploads use signed URLs from the service role)', async () => {
    await expect(h.probe('', insertSql, [], null, 'anon')).rejects.toThrow(/row-level security/)
    await expect(h.probe(OWNER, insertSql)).rejects.toThrow(/row-level security/)
    await expect(h.probe(STAFF, insertSql)).rejects.toThrow(/row-level security/)
    expect(await h.affected(STAFF, `update storage.objects set metadata = '{}' where bucket_id = 'application-files'`)).toBe(0)
    expect(await h.affected(STAFF, `delete from storage.objects where bucket_id = 'application-files'`)).toBe(0)
    expect(await h.affected(OWNER, `delete from storage.objects where bucket_id = 'application-files'`)).toBe(0)
  })
})

describe('business_applications.catalogue_path', () => {
  const row = (path: string | null, key: string) =>
    db.query(
      `insert into public.business_applications (business_name, applicant_name, applicant_email, language, submission_key, catalogue_path)
       values ('Atelier', 'Ana Silva', 'ana@studio.test', 'en', $1, $2)`,
      [key, path],
    )

  it('is nullable and accepts pending/ and imports/ PDF paths', async () => {
    await row(null, id(51))
    await row(PATH, id(52))
    await row(`imports/${KEY}/price-list.pdf`, id(53))
    const r = await db.query<{ n: number }>(`select count(*)::int as n from public.business_applications where catalogue_path is not null`)
    expect(r.rows[0]!.n).toBe(2)
  })

  it('refuses any other path shape', async () => {
    for (const [i, bad] of ['pending/x/catalogue.pdf', `other/${KEY}/catalogue.pdf`, `pending/${KEY}/catalogue.png`, `pending/${KEY}/../x.pdf`, `pending/${KEY}/Catalogue.pdf`, `/pending/${KEY}/catalogue.pdf`].entries())
      await expect(row(bad, id(60 + i)), bad).rejects.toThrow(/business_applications_catalogue_path_check/)
  })

  it('stays readable by staff through the existing row policy and writable by the service role only', async () => {
    expect(await h.count(STAFF, `select count(*)::int as n from public.business_applications where catalogue_path = '${PATH}'`)).toBe(1)
    expect(await h.count(OWNER, `select count(*)::int as n from public.business_applications`)).toBe(0)
    await expect(h.probe(STAFF, `update public.business_applications set catalogue_path = null`)).rejects.toThrow(/permission denied/)
  })
})

describe('the application-form SQL gate knows the field "catalogue"', () => {
  const form = (fields: unknown[]) => ({
    steps: [
      { id: 'business', builtin: 'business' },
      { id: 'review', builtin: 'review' },
    ],
    fields,
  })
  const gate = async (p: unknown) => (await db.query<{ r: string | null }>(`select private.validate_apply_form($1::jsonb) as r`, [JSON.stringify(p)])).rows[0]!.r

  it('accepts it as a placed, hidden or required field and still refuses an unknown key', async () => {
    expect(await gate(form([{ key: 'catalogue', stepId: 'business' }]))).toBeNull()
    expect(await gate(form([{ key: 'catalogue', stepId: 'business', hidden: true }]))).toBeNull()
    expect(await gate(form([{ key: 'catalogue', stepId: 'business', required: true }]))).toBeNull()
    expect(await gate(form([{ key: 'cataloguee', stepId: 'business' }]))).toBe('fields.0.key|unknown_key')
    expect(await gate(form([{ key: 'catalogue', stepId: 'review' }]))).toBe('fields.0.stepId|review_misplaced')
  })
})

describe('rollback', () => {
  it('refuses while a file or a catalogue_path exists; when empty it removes the column, the policy and the bucket, and re-applies', async () => {
    const before = await freshDb((n) => n < MIGRATION)
    const rolled = await freshDb()
    try {
      const fn = async (target: PGlite) => (await target.query<{ d: string }>(`select pg_get_functiondef('private.validate_apply_form(jsonb)'::regprocedure) as d`)).rows[0]!.d.replace(/\r\n/g, '\n')
      expect(await fn(rolled)).not.toEqual(await fn(before))

      await rolled.exec(`insert into storage.objects (bucket_id, name) values ('application-files', '${PATH}')`)
      await expect(rolled.exec(readFileSync(ROLLBACK_SQL, 'utf8'))).rejects.toThrow(/application_catalogues_not_empty/)
      await rolled.exec('rollback') // psql would stop at the error; the open transaction is ended here
      await rolled.exec(`delete from storage.objects where bucket_id = 'application-files'`)
      await rolled.exec(`insert into public.business_applications (business_name, applicant_name, applicant_email, language, submission_key, catalogue_path)
        values ('Atelier', 'Ana Silva', 'ana@studio.test', 'en', '${id(70)}', '${PATH}')`)
      await expect(rolled.exec(readFileSync(ROLLBACK_SQL, 'utf8'))).rejects.toThrow(/application_catalogues_not_empty/)
      await rolled.exec('rollback') // psql would stop at the error; the open transaction is ended here
      await rolled.exec(`update public.business_applications set catalogue_path = null`)

      await rolled.exec(readFileSync(ROLLBACK_SQL, 'utf8'))
      expect(await fn(rolled)).toEqual(await fn(before))
      const col = await rolled.query(`select 1 from information_schema.columns where table_name = 'business_applications' and column_name = 'catalogue_path'`)
      expect(col.rows).toEqual([])
      const pol = await rolled.query(`select 1 from pg_policies where schemaname = 'storage' and policyname = 'Staff read application catalogues'`)
      expect(pol.rows).toEqual([])
      expect((await rolled.query(`select 1 from storage.buckets where id = 'application-files'`)).rows).toEqual([])
      const grants = await rolled.query<{ a: boolean; n: boolean }>(
        `select has_function_privilege('anon', 'private.validate_apply_form(jsonb)', 'execute') as a, has_function_privilege('authenticated', 'private.validate_apply_form(jsonb)', 'execute') as n`,
      )
      expect(grants.rows[0]).toEqual({ a: false, n: false })

      await rolled.exec(readFileSync(join(MIGRATIONS, MIGRATION), 'utf8'))
      expect(await fn(rolled)).not.toEqual(await fn(before))
      expect((await rolled.query(`select public from storage.buckets where id = 'application-files'`)).rows[0]).toEqual({ public: false })
    } finally {
      await before.close()
      await rolled.close()
    }
  }, 120_000)
})
