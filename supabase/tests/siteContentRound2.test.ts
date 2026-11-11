// @vitest-environment node
// Site icon and editable landing texts (ADR-0053): chrome.favicon and landing.texts in the draft shape check, the publish gate and the
// public read ('chrome' returns favicon and landingTexts), the SQL whitelist against the TypeScript one, and the rollback script.
// Runs on the shared PGlite harness; nothing here touches a live project.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MIGRATIONS, freshDb, ids, makeHelpers, type Helpers } from './harness'
import { LANDING_EDITABLE_KEYS, LANDING_LEGACY_TEXT_LIMITS, LANDING_TEXT_LIMITS, emptySiteContent, type SiteContent } from '../../src/domain/siteContent'

const R2_MIGRATION = readdirSync(MIGRATIONS).find((n) => n.endsWith('_site_content_round2.sql'))!
const R2_ROLLBACK_SQL = join(__dirname, '..', 'rollback', '20261109_site_content_round2_rollback.sql')

const id = ids(1)
const ADMIN = id(41)
const ANON = ''

let db: PGlite
let h: Helpers

beforeAll(async () => {
  db = await freshDb()
  h = makeHelpers(db)
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values ('${ADMIN}', 'r2-admin@test', now());
    insert into public.platform_members (user_id, email, role, status) values ('${ADMIN}', 'r2-admin@test', 'admin', 'active');
  `)
}, 60_000)
afterAll(async () => {
  await db?.close()
})

const PNG = { path: 'landing/0a1b2c3d-1111-4222-8333-444455556666.png' }
const doc = (patch: (c: Record<string, any>) => void): SiteContent => {
  const c = emptySiteContent() as unknown as Record<string, any>
  patch(c)
  return c as SiteContent
}
async function forceDraft(content: unknown): Promise<string> {
  const { rows } = await db.query<{ b: string }>(`update public.site_content set draft = $1::jsonb, draft_updated_at = clock_timestamp() returning to_jsonb(draft_updated_at) #>> '{}' as b`, [JSON.stringify(content)])
  return rows[0]!.b
}
const baseOf = async () => ((await h.call(ADMIN, 'select public.admin_get_site_content() as r')) as unknown as { draftUpdatedAt: string }).draftUpdatedAt
const publish = async (b: string) => (await h.call(ADMIN, 'select public.admin_publish_site_content($1::timestamptz) as r', [b])) as unknown as { version: number }
const refuses = async (content: unknown, detail: string) => {
  const b = await forceDraft(content)
  await expect(h.probe(ADMIN, 'select public.admin_publish_site_content($1::timestamptz)', [b])).rejects.toMatchObject({ message: 'invalid_content', detail })
}
const chrome = async () => ((await h.call(ANON, `select public.get_published_site_content('chrome', null) as r`, [], null, 'anon')) as unknown as { content: Record<string, unknown> | null }).content
const reset = () =>
  db.exec(`update public.site_content set draft = '{}', draft_updated_at = clock_timestamp(), published = null, published_version = 0, published_at = null, published_by = null;
           delete from public.site_content_versions; delete from public.audit_events where event_type like 'site_content_%';`)

describe('the whitelist', () => {
  it('private.landing_text_limits() has exactly the keys and limits of LANDING_TEXT_LIMITS', async () => {
    const { rows } = await db.query<{ l: Record<string, number> }>('select private.landing_text_limits() as l')
    expect(rows[0]!.l).toEqual({ ...LANDING_TEXT_LIMITS })
    // The editable keys plus the legacy ones (landing.hero.body, ADR-0061), which the database still accepts.
    expect(Object.keys(rows[0]!.l).sort()).toEqual([...LANDING_EDITABLE_KEYS, ...Object.keys(LANDING_LEGACY_TEXT_LIMITS)].sort())
  })

  it('is not callable by the API roles', async () => {
    const { rows } = await db.query<{ a: boolean; n: boolean }>(
      `select has_function_privilege('anon', 'private.landing_text_limits()', 'execute') as a, has_function_privilege('authenticated', 'private.landing_text_limits()', 'execute') as n`,
    )
    expect(rows[0]).toEqual({ a: false, n: false })
  })
})

describe('draft save (shape check)', () => {
  it('refuses chrome and landing.texts that are not objects; objects save', async () => {
    await reset()
    for (const bad of ['nope', 5, [1], null, true]) {
      await expect(h.probe(ADMIN, 'select public.admin_save_site_content_draft($1::jsonb, $2::timestamptz)', [JSON.stringify(doc((c) => (c.chrome = bad))), await baseOf()])).rejects.toMatchObject({
        message: 'invalid_content',
        detail: 'chrome|invalid_value',
      })
      await expect(h.probe(ADMIN, 'select public.admin_save_site_content_draft($1::jsonb, $2::timestamptz)', [JSON.stringify(doc((c) => (c.landing.texts = bad))), await baseOf()])).rejects.toMatchObject({
        message: 'invalid_content',
        detail: 'landing.texts|invalid_value',
      })
    }
    await h.call(ADMIN, 'select to_jsonb(public.admin_save_site_content_draft($1::jsonb, $2::timestamptz)) as r', [JSON.stringify(doc((c) => ((c.chrome = { favicon: PNG }), (c.landing.texts = { 'landing.hero.title1': { en: 'Hi' } })))), await baseOf()])
    await reset()
  })
})

describe('publish gate', () => {
  it('publishes a favicon and texts; a document with neither still publishes', async () => {
    await reset()
    expect((await publish(await forceDraft(emptySiteContent()))).version).toBeGreaterThan(0)
    expect(await chrome()).not.toHaveProperty('favicon')
    expect(await chrome()).not.toHaveProperty('landingTexts')
    const withBoth = doc((c) => ((c.chrome = { favicon: PNG }), (c.landing.texts = { 'landing.hero.title1': { en: 'Hello', pt: 'Olá' }, 'landing.biz.body': { pt: 'x'.repeat(600) } })))
    expect((await publish(await forceDraft(withBoth))).version).toBeGreaterThan(1)
    expect(await chrome()).toMatchObject({ favicon: PNG, landingTexts: { 'landing.hero.title1': { en: 'Hello', pt: 'Olá' }, 'landing.biz.body': { pt: 'x'.repeat(600) } } })
    await reset()
  })

  it('refuses a favicon that is not an uploaded PNG', async () => {
    await reset()
    for (const bad of [{ path: 'landing/abc.jpg' }, { path: 'landing/abc.webp' }, { path: 'landing/abc.glb' }, { path: 'https://evil.test/a.png' }, { path: 'landing/ABC.png' }, 'landing/abc.png', {}, null])
      await refuses(doc((c) => (c.chrome = { favicon: bad })), 'chrome.favicon|invalid_value')
    await reset()
  })

  it('refuses a text key that is not in the list, with unknown_key', async () => {
    await reset()
    await refuses(doc((c) => (c.landing.texts = { 'landing.nope': { en: 'x' } })), 'landing.texts.landing.nope|unknown_key')
    await refuses(doc((c) => (c.landing.texts = { 'site.apply': { en: 'x' } })), 'landing.texts.site.apply|unknown_key')
    await reset()
  })

  it('holds every language to the limit of its key: the limit passes, one more is refused; non-text and non-objects are refused', async () => {
    await reset()
    const limits: [string, number][] = [['landing.hero.eyebrow', 60], ['landing.hero.cta3d', 40], ['landing.hero.title1', 200], ['landing.hero.body', 600]]
    for (const [key, max] of limits) {
      for (const lang of ['en', 'pt']) {
        await refuses(doc((c) => (c.landing.texts = { [key]: { [lang]: 'x'.repeat(max + 1) } })), `landing.texts.${key}.${lang}|too_long`)
      }
      expect((await publish(await forceDraft(doc((c) => (c.landing.texts = { [key]: { en: 'x'.repeat(max), pt: 'y'.repeat(max) } }))))).version).toBeGreaterThan(0)
    }
    await refuses(doc((c) => (c.landing.texts = { 'landing.hero.title1': { en: 7 } })), 'landing.texts.landing.hero.title1.en|invalid_value')
    await refuses(doc((c) => (c.landing.texts = { 'landing.hero.title1': 'text' })), 'landing.texts.landing.hero.title1|invalid_value')
    await reset()
  })

  it('the public read returns the published copy only, and drops keys that are no longer in the list', async () => {
    await reset()
    expect(await publish(await forceDraft(doc((c) => (c.landing.texts = { 'landing.hero.title1': { en: 'Live' } }))))).toBeTruthy()
    await forceDraft(doc((c) => ((c.landing.texts = { 'landing.hero.title1': { en: 'Draft only' } }), (c.chrome = { favicon: PNG }))))
    expect(await chrome()).toMatchObject({ landingTexts: { 'landing.hero.title1': { en: 'Live' } } })
    expect(await chrome()).not.toHaveProperty('favicon')
    // A key that left the list later (forced into the published copy) is not returned.
    await db.exec(`update public.site_content set published = jsonb_set(published, '{landing,texts}', '{"landing.hero.title1":{"en":"Live"},"landing.gone":{"en":"old"},"landing.hero.body":"bad"}'::jsonb)`)
    expect((await chrome())!.landingTexts).toEqual({ 'landing.hero.title1': { en: 'Live' } })
    await reset()
  })
})

describe('rollback', () => {
  it('apply → rollback → re-apply: the three functions are back to their earlier bodies, grants kept, the new function is dropped and returns', async () => {
    const before = await freshDb((n) => n < R2_MIGRATION)
    const rolled = await freshDb()
    try {
      const defs = async (target: PGlite) => {
        const out: string[] = []
        for (const sig of ['private.check_site_content_shape(jsonb)', 'private.validate_site_content(jsonb)', 'public.get_published_site_content(text,text)'])
          out.push((await target.query<{ d: string }>(`select pg_get_functiondef($1::regprocedure) as d`, [sig])).rows[0]!.d.replace(/\r\n/g, '\n'))
        return out
      }
      const shape = (target: PGlite) => target.query<{ r: string | null }>(`select private.check_site_content_shape('{"schema":1,"chrome":"x"}'::jsonb) as r`)
      const limitsFn = (target: PGlite) => target.query<{ f: string | null }>(`select to_regprocedure('private.landing_text_limits()')::text as f`)
      expect((await shape(rolled)).rows[0]!.r).toBe('chrome|invalid_value')
      expect((await limitsFn(rolled)).rows[0]!.f).not.toBeNull()
      expect(await defs(rolled)).not.toEqual(await defs(before))
      await rolled.exec(readFileSync(R2_ROLLBACK_SQL, 'utf8'))
      expect(await defs(rolled)).toEqual(await defs(before))
      expect((await shape(rolled)).rows[0]!.r).toBeNull()
      expect((await limitsFn(rolled)).rows[0]!.f).toBeNull()
      const grants = await rolled.query<{ a: boolean; n: boolean; s: boolean }>(
        `select has_function_privilege('anon', 'public.get_published_site_content(text,text)', 'execute') as a, has_function_privilege('anon', 'private.validate_site_content(jsonb)', 'execute') as n, has_function_privilege('authenticated', 'private.check_site_content_shape(jsonb)', 'execute') as s`,
      )
      expect(grants.rows[0]).toEqual({ a: true, n: false, s: false })
      await rolled.exec(readFileSync(join(MIGRATIONS, R2_MIGRATION), 'utf8'))
      expect((await shape(rolled)).rows[0]!.r).toBe('chrome|invalid_value')
      expect((await limitsFn(rolled)).rows[0]!.f).not.toBeNull()
      expect(await defs(rolled)).not.toEqual(await defs(before))
      const grants2 = await rolled.query<{ a: boolean; n: boolean }>(
        `select has_function_privilege('anon', 'public.get_published_site_content(text,text)', 'execute') as a, has_function_privilege('anon', 'private.validate_site_content(jsonb)', 'execute') as n`,
      )
      expect(grants2.rows[0]).toEqual({ a: true, n: false })
    } finally {
      await before.close()
      await rolled.close()
    }
  }, 120_000)
})
