// @vitest-environment node
// S2 business-logic database suite (PGlite). One describe per task, appended at the end; nothing touches a live project.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { BEFORE_S2, MIGRATIONS, ROLLBACK_SQL, S15_MIGRATION, S2_MIGRATION, S2_ROLLBACK_SQL, S4_MIGRATION, UP_TO_S2, freshDb, ids, makeHelpers, type Helpers } from './harness'

/** Names S2 adds that must be gone after the S2 rollback (`schema.name` or `schema.name(args)`). Tasks push onto it. */
const GONE_AFTER_ROLLBACK: string[] = []

let db: PGlite
let h: Helpers

// This suite runs on the database as S2 left it (UP_TO_S2): S1.5 and S2, without the later S4. S4 on top of S2 (the
// live order) and the full rollback chain (S4, S2, S1.5) are checked in s4ModelRequests.test.ts.
beforeAll(async () => {
  db = await freshDb(UP_TO_S2)
  h = makeHelpers(db)
}, 120_000)

afterAll(async () => {
  await db.close()
})

describe('S2 scaffold and rollback', () => {
  it('the S2 migration comes after S1.5 and before S4, and applies on the database just before it (up to S1.5, no S4)', async () => {
    const all = readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()
    expect(all.indexOf(S2_MIGRATION)).toBe(all.indexOf(S15_MIGRATION) + 1)
    expect(all.indexOf(S4_MIGRATION)).toBeGreaterThan(all.indexOf(S2_MIGRATION))
    expect(all.filter(BEFORE_S2)).not.toContain(S4_MIGRATION)
    const earlier = await freshDb(BEFORE_S2)
    try {
      await earlier.exec(readFileSync(join(MIGRATIONS, S2_MIGRATION), 'utf8'))
    } finally {
      await earlier.close()
    }
  }, 120_000)

  it('apply → S2 rollback → re-apply S2 succeeds, and every GONE_AFTER_ROLLBACK name is gone after the rollback', async () => {
    const rolled = await freshDb(UP_TO_S2)
    try {
      await rolled.exec(readFileSync(S2_ROLLBACK_SQL, 'utf8'))
      for (const name of GONE_AFTER_ROLLBACK) {
        const fn = name.includes('(')
        const { rows } = await rolled.query<{ o: string | null }>(`select ${fn ? 'to_regprocedure' : 'to_regclass'}($1)::text as o`, [name])
        expect({ name, o: rows[0]!.o }).toEqual({ name, o: null })
      }
      await rolled.exec(readFileSync(join(MIGRATIONS, S2_MIGRATION), 'utf8'))
    } finally {
      await rolled.close()
    }
  }, 120_000)

  it('the rollbacks chain in reverse order on the S2 database: S2, then S1.5 both succeed', async () => {
    const rolled = await freshDb(UP_TO_S2)
    try {
      await rolled.exec(readFileSync(S2_ROLLBACK_SQL, 'utf8'))
      await rolled.exec(readFileSync(ROLLBACK_SQL, 'utf8'))
    } finally {
      await rolled.close()
    }
  }, 120_000)
})


describe('S2 Task 2: one description limit', () => {
  const id = ids(2)
  const OWNER = id(1)
  const APP = id(10)
  /** Line endings follow the checkout (CRLF on Windows), so they are normalised before comparing. */
  const fnDef = async (target: PGlite) =>
    (await target.query<{ d: string }>(`select pg_get_functiondef('public.admin_review_application(uuid, text, text)'::regprocedure) as d`)).rows[0]!.d
      .replace(/\r\n/g, '\n')

  beforeAll(async () => {
    await db.exec(`
      insert into auth.users (id, email, email_confirmed_at) values ('${OWNER}', 's2t2-owner@test', now());
      insert into public.platform_admins (user_id) values ('${OWNER}');
    `)
  })

  it('approving an application whose answers.description has 1200 characters creates a business whose description has 1000', async () => {
    await db.query(
      `insert into public.business_applications
         (id, business_name, applicant_name, applicant_email, country, city, category, submission_key, status, answers)
       values ($1, 'Long Story Co', 'Ana Applicant', 's2t2-applicant@s2t2.test', 'Portugal', 'Lisboa', 'Furniture', gen_random_uuid(), 'submitted', $2)`,
      [APP, JSON.stringify({ description: 'd'.repeat(1200) })])
    const r = (await h.call(OWNER, 'select to_jsonb(public.admin_review_application($1, $2)) as r', [APP, 'approve'])) as { business_id: string }
    const { rows } = await db.query<{ n: number }>('select char_length(description) as n from public.businesses where id = $1', [r.business_id])
    expect(rows[0]!.n).toBe(1000)
  })

  it('after the S2 rollback, pg_get_functiondef(admin_review_application) equals the one on freshDb(BEFORE_S2)', async () => {
    const before = await freshDb(BEFORE_S2)
    const rolled = await freshDb(UP_TO_S2)
    try {
      const pre = await fnDef(before)
      expect(await fnDef(rolled)).not.toEqual(pre)
      await rolled.exec(readFileSync(S2_ROLLBACK_SQL, 'utf8'))
      expect(await fnDef(rolled)).toEqual(pre)
      const grants = async (target: PGlite) => (await target.query<{ g: string }>(
        `select coalesce(array_to_string(proacl, ','), '') as g from pg_proc where oid = 'public.admin_review_application(uuid, text, text)'::regprocedure`)).rows[0]!.g
      expect(await grants(rolled)).toEqual(await grants(before))
    } finally {
      await before.close()
      await rolled.close()
    }
  }, 120_000)
})
