// @vitest-environment node
// Application form, delete anything (ADR-0057): nullable business and applicant names, the SQL gate with only the email locked,
// the new `removedFields`, the higher caps (12 sections, 30 own questions), admin_review_application with a company name typed at
// approval, the duplicate check with null names, and the rollback script. Runs on the shared PGlite harness; nothing here touches
// a live project.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { DEFAULT_APPLY_FORM, validateApplyForm, type ApplyFormConfig } from '../functions/_shared/applyForm'
import { MIGRATIONS, freshDb, ids, makeHelpers, type Helpers } from './harness'

const MIGRATION = readdirSync(MIGRATIONS).find((n) => n.endsWith('_apply_form_delete_anything.sql'))!
const ROLLBACK_SQL = join(__dirname, '..', 'rollback', '20261111_apply_form_delete_anything_rollback.sql')

const id = ids(3)
const OWNER = id(81)
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

let db: PGlite
let h: Helpers

beforeAll(async () => {
  db = await freshDb()
  h = makeHelpers(db)
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values ('${OWNER}', 'r2-owner@test', now());
    insert into public.platform_admins (user_id) values ('${OWNER}');
  `)
}, 60_000)
afterAll(async () => {
  await db?.close()
})

describe('migration order', () => {
  it('sorts after the landing_sections migration that came before it', () => {
    expect(MIGRATION > '20261111083034_landing_sections.sql').toBe(true)
  })
})

const form = (mutate: (f: ApplyFormConfig) => void = () => {}): ApplyFormConfig => {
  const f = clone(DEFAULT_APPLY_FORM)
  mutate(f)
  return f
}
const without = (f: ApplyFormConfig, ...keys: string[]) => void (f.fields = f.fields.filter((x) => !keys.includes(x.key)))
/** `n` own short-text questions, each placed on the first step. */
const withQuestions = (f: ApplyFormConfig, n: number) => {
  for (let i = 0; i < n; i++) {
    f.customQuestions.push({ id: `q${i}`, type: 'short_text', label: { en: `Q ${i}` } })
    f.fields.push({ key: `custom:q${i}`, stepId: 'business', required: false })
  }
}
const withSteps = (f: ApplyFormConfig, total: number) => {
  const review = f.steps.pop()!
  while (f.steps.length < total - 1) f.steps.push({ id: `s${f.steps.length}`, title: { en: `Section ${f.steps.length}` } })
  f.steps.push(review)
}

describe('private.validate_apply_form (ADR-0057)', () => {
  const sql = async (f: unknown) => (await db.query<{ r: string | null }>(`select private.validate_apply_form($1::jsonb) as r`, [JSON.stringify(f)])).rows[0]!.r

  const good: [string, (f: ApplyFormConfig) => void][] = [
    ['the default form', () => {}],
    ['a hidden business name', (f) => void (f.fields.find((x) => x.key === 'businessName')!.hidden = true)],
    ['an optional applicant name', (f) => void (f.fields.find((x) => x.key === 'applicantName')!.required = false)],
    ['deleted business and applicant names', (f) => { f.removedFields = ['businessName', 'applicantName']; without(f, 'businessName', 'applicantName') }],
    ['a deleted built-in step with its fields moved', (f) => {
      f.steps = f.steps.filter((s) => s.id !== 'location')
      f.fields = f.fields.map((x) => (x.stepId === 'location' ? { ...x, stepId: 'business' } : x))
    }],
    ['every field deleted except the email', (f) => {
      const all = ['businessName', 'website', 'category', 'description', 'country', 'city', 'applicantName', 'applicantRole', 'applicantPhone', 'language', 'productCount', 'photoReadiness', 'modelReadiness', 'notes', 'catalogue'] as const
      f.removedFields = [...all]
      without(f, ...all)
    }],
    ['start from blank: one section with the email, Review, no own questions', (f) => {
      f.steps = [{ id: 'contact', builtin: 'contact' }, { id: 'review', builtin: 'review' }] as never
      f.fields = [{ key: 'applicantEmail', stepId: 'contact', required: true }]
      f.customQuestions = []
      f.hiddenOptions = {}
      f.removedFields = ['businessName', 'website', 'category', 'description', 'country', 'city', 'applicantName', 'applicantRole', 'applicantPhone', 'language', 'productCount', 'photoReadiness', 'modelReadiness', 'notes', 'catalogue']
    }],
    ['30 own questions', (f) => withQuestions(f, 30)],
    ['12 sections including Review', (f) => withSteps(f, 12)],
  ]
  const bad: [string, (f: ApplyFormConfig) => void, string][] = [
    ['a hidden email', (f) => void (f.fields.find((x) => x.key === 'applicantEmail')!.hidden = true), 'fields.8.hidden|locked'],
    ['an optional email', (f) => void (f.fields.find((x) => x.key === 'applicantEmail')!.required = false), 'fields.8.required|locked'],
    ['a deleted email', (f) => { f.removedFields = ['applicantEmail']; without(f, 'applicantEmail') }, 'removedFields.0|locked'],
    ['an unknown removed field', (f) => void (f.removedFields = ['nope'] as never), 'removedFields.0|unknown_key'],
    ['a removed field listed twice', (f) => { f.removedFields = ['city', 'city']; without(f, 'city') }, 'removedFields.1|duplicate_key'],
    ['a removed field that still has a placement', (f) => void (f.removedFields = ['city']), 'fields.5.key|duplicate_key'],
    ['removedFields that is not a list', (f) => void (f.removedFields = 'city' as never), 'removedFields|invalid_value'],
    ['only the Review step', (f) => { f.steps = f.steps.filter((s) => s.builtin === 'review'); f.fields = [] }, 'steps|required'],
    ['31 own questions', (f) => withQuestions(f, 31), 'customQuestions|too_many'],
    ['13 sections including Review', (f) => withSteps(f, 13), 'steps|too_many'],
  ]
  it.each(good)('accepts %s (SQL and TypeScript agree)', async (_name, mutate) => {
    const f = form(mutate)
    expect(await sql(f)).toBeNull()
    expect(validateApplyForm(f)).toEqual({})
  })
  it.each(bad)('refuses %s with the same verdict in SQL and TypeScript', async (_name, mutate, expected) => {
    const f = form(mutate)
    expect(await sql(f)).toBe(expected)
    const [path, key] = expected.split('|') as [string, string]
    expect(validateApplyForm(f)[path]).toBe(key)
  })

  it('is not executable by the API roles', async () => {
    await expect(h.probe(OWNER, `select private.validate_apply_form('{}'::jsonb)`)).rejects.toMatchObject({ code: '42501' })
  })
})

describe('private.check_site_content_shape (draft caps)', () => {
  const shape = async (f: unknown) => (await db.query<{ r: string | null }>(`select private.check_site_content_shape($1::jsonb) as r`, [JSON.stringify({ schema: 1, applyForm: f })])).rows[0]!.r

  it('lets a full form through: 12 sections, 30 own questions, and the 46 placements they make', async () => {
    const f = form((x) => { withSteps(x, 12); withQuestions(x, 30) })
    expect(f.fields.length).toBeLessThanOrEqual(50)
    expect(await shape(f)).toBeNull()
  })
  it('refuses 13 sections, 31 own questions and 51 placements', async () => {
    expect(await shape(form((x) => withSteps(x, 13)))).toBe('applyForm.steps|too_many')
    expect(await shape(form((x) => withQuestions(x, 31)))).toBe('applyForm.customQuestions|too_many')
    expect(await shape(form((x) => { for (let i = 0; i < 40; i++) x.fields.push({ key: 'city', stepId: 'business' }) }))).toBe('applyForm.fields|too_many')
  })
  it('keeps the other draft checks (document size, schema)', async () => {
    expect((await db.query<{ r: string | null }>(`select private.check_site_content_shape('{"schema":2}'::jsonb) as r`)).rows[0]!.r).toBe('schema|invalid_value')
  })
  it('private.validate_site_content passes a start-from-blank form and reports a bad one with the applyForm. prefix', async () => {
    const blank = form((x) => {
      x.steps = [{ id: 'contact', builtin: 'contact' }, { id: 'review', builtin: 'review' }] as never
      x.fields = [{ key: 'applicantEmail', stepId: 'contact', required: true }]
      x.removedFields = ['businessName', 'website', 'category', 'description', 'country', 'city', 'applicantName', 'applicantRole', 'applicantPhone', 'language', 'productCount', 'photoReadiness', 'modelReadiness', 'notes', 'catalogue']
    })
    const gate = async (f: unknown) => (await db.query<{ r: string | null }>(`select private.validate_site_content($1::jsonb) as r`, [JSON.stringify({ schema: 1, applyForm: f })])).rows[0]!.r
    expect(await gate(blank)).toBeNull()
    expect(await gate(form((x) => void (x.removedFields = ['applicantEmail'] as never)))).toBe('applyForm.removedFields.0|locked')
  })
})

describe('business_applications names', () => {
  it('business_name and applicant_name may be null; a stored value still has to be 2 to 80 / 2 to 120 characters; the email stays required', async () => {
    await db.query(`insert into public.business_applications (applicant_email, submission_key) values ('nonames@acme.test', gen_random_uuid())`)
    await expect(db.query(`insert into public.business_applications (business_name, applicant_email, submission_key) values ('X', 'x@acme.test', gen_random_uuid())`)).rejects.toMatchObject({ code: '23514' })
    await expect(db.query(`insert into public.business_applications (applicant_name, applicant_email, submission_key) values ('Y', 'y@acme.test', gen_random_uuid())`)).rejects.toMatchObject({ code: '23514' })
    await expect(db.query(`insert into public.business_applications (business_name, applicant_name, submission_key) values ('Acme', 'Ana', gen_random_uuid())`)).rejects.toMatchObject({ code: '23502' })
  })
})

describe('admin_review_application with a company name', () => {
  type Row = { status: string; business_id: string; business_name: string | null }
  const review = (appId: string, action: string, name?: string | null) =>
    h.call(OWNER, 'select to_jsonb(public.admin_review_application($1, $2, null, $3)) as r', [appId, action, name ?? null]) as unknown as Promise<Row>
  const insertApp = async (n: number, name: string | null, email = `r2-${n}@acme.test`) =>
    db.query(
      `insert into public.business_applications (id, business_name, applicant_name, applicant_email, submission_key, status, answers) values ($1, $2, null, $3, gen_random_uuid(), 'submitted', '{"description":"Fine pieces"}')`,
      [id(n), name, email],
    )

  it('an application without a name is refused with business_name_required, and nothing is created', async () => {
    await insertApp(10, null)
    await expect(review(id(10), 'approve')).rejects.toMatchObject({ message: 'business_name_required', code: '22023' })
    await expect(review(id(10), 'approve', '   ')).rejects.toMatchObject({ message: 'business_name_required' })
    expect((await db.query(`select status, business_id from public.business_applications where id = $1`, [id(10)])).rows).toEqual([{ status: 'submitted', business_id: null }])
    expect((await db.query(`select 1 from public.businesses where name = 'Typed Co'`)).rows).toEqual([])
  })

  it('the typed name creates the business and is kept on the application', async () => {
    const r = await review(id(10), 'approve', '  Typed Co  ')
    expect(r.status).toBe('approved')
    expect(r.business_name).toBe('Typed Co')
    expect((await db.query(`select name, slug, description, status from public.businesses where id = $1`, [r.business_id])).rows).toEqual([{ name: 'Typed Co', slug: 'typed-co', description: 'Fine pieces', status: 'draft' }])
  })

  it('a name outside 2 to 80 characters is refused', async () => {
    await insertApp(11, null)
    await expect(review(id(11), 'approve', 'A')).rejects.toMatchObject({ message: 'business_name_invalid' })
    await expect(review(id(11), 'approve', 'N'.repeat(81))).rejects.toMatchObject({ message: 'business_name_invalid' })
  })

  it("the typed name wins over the application's own (the dialog is prefilled, the reviewer may correct it)", async () => {
    await insertApp(12, 'Own Name Ltd')
    const r = await review(id(12), 'approve', 'Own Name Limited')
    expect(r.business_name).toBe('Own Name Limited')
    expect((await db.query(`select name from public.businesses where id = $1`, [r.business_id])).rows).toEqual([{ name: 'Own Name Limited' }])
  })

  it('without a typed name the application name is used, and the old three-argument function is gone', async () => {
    await insertApp(13, 'Plain Co')
    const r = (await h.call(OWNER, `select to_jsonb(public.admin_review_application($1, 'approve')) as r`, [id(13)])) as unknown as Row
    expect(r.status).toBe('approved')
    expect(r.business_name).toBe('Plain Co')
    const fns = await db.query<{ n: string }>(`select pg_get_function_identity_arguments(p.oid) as n from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = 'admin_review_application'`)
    expect(fns.rows.map((x) => x.n)).toEqual(['p_application_id uuid, p_action text, p_reason text, p_business_name text'])
  })

  it('reject and start_review need no name', async () => {
    await insertApp(14, null)
    expect((await review(id(14), 'start_review')).status).toBe('under_review')
    expect((await h.call(OWNER, `select to_jsonb(public.admin_review_application($1, 'reject', 'Not a fit')) as r`, [id(14)])) as unknown as { status: string }).toMatchObject({ status: 'rejected' })
  })

  it('anon cannot execute it', async () => {
    await expect(h.probe('', `select public.admin_review_application($1, 'approve', null, 'X Co')`, [id(10)], null, 'anon')).rejects.toThrow(/permission denied/)
  })
})

describe('admin_application_duplicates with null names', () => {
  const dups = (appId: string) => h.call(OWNER, 'select public.admin_application_duplicates($1) as r', [appId]) as unknown as Promise<{ applications: { id: string; business_name: string | null; match: string }[]; businesses: { name: string }[] }>

  it('matches on the email only when the subject has no name, never on a missing name', async () => {
    await db.query(`insert into public.business_applications (id, business_name, applicant_email, submission_key, status) values
      ($1, null, 'same@acme.test', gen_random_uuid(), 'submitted'),
      ($2, null, 'same@acme.test', gen_random_uuid(), 'submitted'),
      ($3, null, 'other@acme.test', gen_random_uuid(), 'submitted'),
      ($4, 'Named Co', 'same@acme.test', gen_random_uuid(), 'submitted')`, [id(20), id(21), id(22), id(23)])
    const r = await dups(id(20))
    expect(r.applications.map((a) => [a.id, a.business_name, a.match]).sort()).toEqual([
      [id(21), null, 'email'],
      [id(23), 'Named Co', 'email'],
    ])
    expect(r.businesses).toEqual([])
  })

  it('a named subject still matches an application with no name by email, not by name', async () => {
    const r = await dups(id(23))
    expect(r.applications.map((a) => a.match)).toEqual(['email', 'email'])
  })
})

describe('rollback', () => {
  it('refuses while an application has no name or the form uses what the older gate refuses; when clear it restores the earlier functions and NOT NULL, and the migration re-applies', async () => {
    const before = await freshDb((n) => n < MIGRATION)
    const rolled = await freshDb()
    try {
      const fn = async (target: PGlite, sig: string) => (await target.query<{ d: string }>(`select pg_get_functiondef('${sig}'::regprocedure) as d`)).rows[0]!.d.replace(/\r\n/g, '\n')
      const SIGS = ['private.validate_apply_form(jsonb)', 'private.check_site_content_shape(jsonb)']
      for (const s of SIGS) expect(await fn(rolled, s)).not.toEqual(await fn(before, s))
      const script = readFileSync(ROLLBACK_SQL, 'utf8')
      const blocked = async () => {
        await expect(rolled.exec(script)).rejects.toThrow(/apply_form_delete_anything_rollback_blocked/)
        await rolled.exec('rollback')
      }

      await rolled.exec(`insert into public.business_applications (applicant_email, submission_key) values ('nn@acme.test', gen_random_uuid())`)
      await blocked()
      await rolled.exec(`delete from public.business_applications`)

      const setDraft = (f: ApplyFormConfig) => rolled.query(`update public.site_content set draft = jsonb_build_object('applyForm', $1::jsonb)`, [JSON.stringify(f)])
      for (const f of [
        form((x) => { x.removedFields = ['city']; without(x, 'city') }),
        form((x) => void (x.fields.find((y) => y.key === 'businessName')!.hidden = true)),
        form((x) => withSteps(x, 9)),
        form((x) => withQuestions(x, 11)),
      ]) {
        await setDraft(f)
        await blocked()
      }
      await rolled.exec(`update public.site_content set draft = '{}'`)

      await rolled.exec(script)
      for (const s of SIGS) expect(await fn(rolled, s)).toEqual(await fn(before, s))
      expect(await fn(rolled, 'public.admin_review_application(uuid, text, text)')).toEqual(await fn(before, 'public.admin_review_application(uuid, text, text)'))
      const nullable = await rolled.query(`select column_name, is_nullable from information_schema.columns where table_name = 'business_applications' and column_name in ('business_name','applicant_name') order by 1`)
      expect(nullable.rows).toEqual([{ column_name: 'applicant_name', is_nullable: 'NO' }, { column_name: 'business_name', is_nullable: 'NO' }])
      const grants = await rolled.query<{ a: boolean; n: boolean; r: boolean; s: boolean }>(
        `select has_function_privilege('anon', 'public.admin_review_application(uuid, text, text)', 'execute') as a,
                has_function_privilege('authenticated', 'public.admin_review_application(uuid, text, text)', 'execute') as n,
                has_function_privilege('authenticated', 'private.validate_apply_form(jsonb)', 'execute') as r,
                has_function_privilege('authenticated', 'private.check_site_content_shape(jsonb)', 'execute') as s`,
      )
      expect(grants.rows[0]).toEqual({ a: false, n: true, r: false, s: false })

      await rolled.exec(readFileSync(join(MIGRATIONS, MIGRATION), 'utf8'))
      for (const s of SIGS) expect(await fn(rolled, s)).not.toEqual(await fn(before, s))
    } finally {
      await before.close()
      await rolled.close()
    }
  }, 120_000)
})
