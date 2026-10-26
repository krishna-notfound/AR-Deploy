// @vitest-environment node
// S2 business-logic database suite (PGlite). One describe per task, appended at the end; nothing touches a live project.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MIGRATIONS, ROLLBACK_SQL, S2_MIGRATION, S2_ROLLBACK_SQL, UP_TO_S15, freshDb, ids, makeHelpers, type Helpers } from './harness'

/** Names S2 adds that must be gone after the S2 rollback (`schema.name` or `schema.name(args)`). Tasks push onto it. */
const GONE_AFTER_ROLLBACK: string[] = []

let db: PGlite
let h: Helpers

beforeAll(async () => {
  db = await freshDb()
  h = makeHelpers(db)
}, 120_000)

afterAll(async () => {
  await db.close()
})

describe('S2 scaffold and rollback', () => {
  it('the S2 migration is the last migration and applies after every earlier one', async () => {
    const all = readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql')).sort()
    expect(all.at(-1)).toBe(S2_MIGRATION)
    const earlier = await freshDb(UP_TO_S15)
    try {
      await earlier.exec(readFileSync(join(MIGRATIONS, S2_MIGRATION), 'utf8'))
    } finally {
      await earlier.close()
    }
  }, 120_000)

  it('apply → S2 rollback → re-apply S2 succeeds, and every GONE_AFTER_ROLLBACK name is gone after the rollback', async () => {
    const rolled = await freshDb()
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

  it('the S2 rollback followed by the S1.5 rollback both succeed', async () => {
    const rolled = await freshDb()
    try {
      await rolled.exec(readFileSync(S2_ROLLBACK_SQL, 'utf8'))
      await rolled.exec(readFileSync(ROLLBACK_SQL, 'utf8'))
    } finally {
      await rolled.close()
    }
  }, 120_000)
})

