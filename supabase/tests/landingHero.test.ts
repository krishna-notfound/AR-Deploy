// @vitest-environment node
// Landing hero (ADR-0049): landing.hero in the draft shape check, the publish gate and the public read ('chrome' returns landingHero),
// and the rollback script. Runs on the shared PGlite harness; nothing here touches a live project.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MIGRATIONS, freshDb, ids, makeHelpers, type Helpers } from './harness'
import { emptySiteContent, type SiteContent } from '../../src/domain/siteContent'

const LH_MIGRATION = readdirSync(MIGRATIONS).find((n) => n.endsWith('_landing_hero.sql'))!
const LH_ROLLBACK_SQL = join(__dirname, '..', 'rollback', '20261103_landing_hero_rollback.sql')

const id = ids(1)
const ADMIN = id(31)
const ANON = ''

let db: PGlite
let h: Helpers

beforeAll(async () => {
  db = await freshDb()
  h = makeHelpers(db)
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values ('${ADMIN}', 'lh-admin@test', now());
    insert into public.platform_members (user_id, email, role, status) values ('${ADMIN}', 'lh-admin@test', 'admin', 'active');
  `)
}, 60_000)
afterAll(async () => {
  await db?.close()
})

const hero = (over: Record<string, unknown> = {}) => ({
  image: { path: 'landing/0a1b2c3d-1111-4222-8333-444455556666.jpg' },
  model: { glb: { path: 'landing/0a1b2c3d-1111-4222-8333-444455556667.glb' } },
  alt: { en: 'A sculpted travertine sofa', pt: 'Um sofa em travertino' },
  ...over,
})
const withHero = (value: unknown): SiteContent => {
  const c = emptySiteContent()
  ;(c.landing as Record<string, unknown>).hero = value
  return c
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

describe('landing.hero draft save (shape check)', () => {
  it('refuses a hero that is not an object, with landing.hero|invalid_value; an object saves', async () => {
    await reset()
    for (const bad of ['nope', 5, [1], null, true]) {
      await expect(
        h.probe(ADMIN, 'select public.admin_save_site_content_draft($1::jsonb, $2::timestamptz)', [JSON.stringify(withHero(bad)), await baseOf()]),
      ).rejects.toMatchObject({ message: 'invalid_content', code: '22023', detail: 'landing.hero|invalid_value' })
    }
    await h.call(ADMIN, 'select to_jsonb(public.admin_save_site_content_draft($1::jsonb, $2::timestamptz)) as r', [JSON.stringify(withHero(hero())), await baseOf()])
    await reset()
  })
})

describe('landing.hero publish gate and public read', () => {
  it('publishes a valid hero (all parts, and a hero with none of them) and the chrome part returns it as landingHero', async () => {
    await reset()
    expect(await publish(await forceDraft(emptySiteContent()))).toBeTruthy()
    expect(await chrome()).not.toHaveProperty('landingHero')
    expect((await publish(await forceDraft(withHero(hero())))).version).toBeGreaterThan(0)
    expect(await chrome()).toMatchObject({ landingHero: hero() })
    expect((await publish(await forceDraft(withHero({})))).version).toBeGreaterThan(0)
    expect(await chrome()).toMatchObject({ landingHero: {} })
    await reset()
  })

  it('never returns the draft hero, only the published one', async () => {
    await reset()
    expect(await publish(await forceDraft(withHero(hero())))).toBeTruthy()
    await forceDraft(withHero(hero({ alt: { en: 'draft only' } })))
    expect(await chrome()).toMatchObject({ landingHero: hero() })
    await reset()
  })

  it('refuses a .png as the model glb, a .glb as the image, and a malformed reference, with the right key', async () => {
    await reset()
    await refuses(withHero(hero({ model: { glb: { path: 'landing/abc.png' } } })), 'landing.hero.model.glb|invalid_value')
    await refuses(withHero(hero({ model: {} })), 'landing.hero.model.glb|invalid_value')
    await refuses(withHero(hero({ model: 'x' })), 'landing.hero.model|invalid_value')
    await refuses(withHero(hero({ image: { path: 'landing/abc.glb' } })), 'landing.hero.image|invalid_value')
    await refuses(withHero(hero({ image: { path: 'https://evil.test/a.jpg' } })), 'landing.hero.image|invalid_value')
    await refuses(withHero(hero({ image: 'landing/abc.jpg' })), 'landing.hero.image|invalid_value')
    await reset()
  })

  it('holds alt.en and alt.pt to 120 characters; 120 passes, 121 and non-text are refused', async () => {
    await reset()
    await refuses(withHero(hero({ alt: { en: 'x'.repeat(121) } })), 'landing.hero.alt.en|too_long')
    await refuses(withHero(hero({ alt: { pt: 'x'.repeat(121) } })), 'landing.hero.alt.pt|too_long')
    await refuses(withHero(hero({ alt: { en: 7 } })), 'landing.hero.alt.en|invalid_value')
    await refuses(withHero(hero({ alt: 'text' })), 'landing.hero.alt|invalid_value')
    expect((await publish(await forceDraft(withHero(hero({ alt: { en: 'x'.repeat(120), pt: 'y'.repeat(120) } }))))).version).toBeGreaterThan(0)
    await reset()
  })

  it('refuses a hero that is not an object at publish too (a draft forced past the save check)', async () => {
    await reset()
    await refuses(withHero('nope'), 'landing.hero|invalid_value')
    await reset()
  })
})

describe('rollback', () => {
  it('apply → rollback → re-apply: the three functions are back to their earlier bodies, grants kept, the hero works again', async () => {
    const before = await freshDb((n) => n < LH_MIGRATION)
    const rolled = await freshDb()
    try {
      const defs = async (target: PGlite) => {
        const out: string[] = []
        for (const sig of ['private.check_site_content_shape(jsonb)', 'private.validate_site_content(jsonb)', 'public.get_published_site_content(text,text)'])
          out.push((await target.query<{ d: string }>(`select pg_get_functiondef($1::regprocedure) as d`, [sig])).rows[0]!.d.replace(/\r\n/g, '\n'))
        return out
      }
      const shape = (target: PGlite) => target.query<{ r: string | null }>(`select private.check_site_content_shape('{"schema":1,"landing":{"hero":"x"}}'::jsonb) as r`)
      expect((await shape(rolled)).rows[0]!.r).toBe('landing.hero|invalid_value')
      expect(await defs(rolled)).not.toEqual(await defs(before))
      await rolled.exec(readFileSync(LH_ROLLBACK_SQL, 'utf8'))
      expect(await defs(rolled)).toEqual(await defs(before))
      expect((await shape(rolled)).rows[0]!.r).toBeNull()
      const grants = await rolled.query<{ a: boolean; n: boolean; s: boolean }>(
        `select has_function_privilege('anon', 'public.get_published_site_content(text,text)', 'execute') as a, has_function_privilege('anon', 'private.validate_site_content(jsonb)', 'execute') as n, has_function_privilege('authenticated', 'private.check_site_content_shape(jsonb)', 'execute') as s`,
      )
      expect(grants.rows[0]).toEqual({ a: true, n: false, s: false })
      await rolled.exec(readFileSync(join(MIGRATIONS, LH_MIGRATION), 'utf8'))
      expect((await shape(rolled)).rows[0]!.r).toBe('landing.hero|invalid_value')
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
