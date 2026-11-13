// @vitest-environment node
// The sign-in panel and the catalogue heading in the site content (ADR-0067): chrome.signIn (shared texts, each page's picture)
// and chrome.catalogHeading in the publish gate and the public read, the site-content bucket holding at least the 25 MB the
// Website Editor allows for a picture, and the rollback. PGlite only; nothing touches a live project.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MIGRATIONS, freshDb, ids, makeHelpers, type Helpers } from './harness'
import { SIGN_IN_PAGES, SIGN_IN_TEXT_LIMITS, SITE_ASSET_MAX_BYTES, emptySiteContent, validateSiteContent, type SiteContent } from '../../src/domain/siteContent'

const MIGRATION = readdirSync(MIGRATIONS).find((n) => n.endsWith('_website_editor_signin_panel_heading.sql'))!
const ROLLBACK_SQL = join(__dirname, '..', 'rollback', '20261113_website_editor_signin_panel_heading_rollback.sql')

const id = ids(18)
const ADMIN = id(51)
const ANON = ''

const SHOWN = 'landing/0a1b2c3d-1111-4222-8333-444455556666.webp'
const ORIGINAL = 'landing/0a1b2c3d-9999-4222-8333-444455556666.jpg'
const CROP = { x: -10, y: 0, width: 800, height: 1000 }
const PIC = { path: SHOWN, originalPath: ORIGINAL, crop: CROP }

let db: PGlite
let h: Helpers

beforeAll(async () => {
  db = await freshDb()
  h = makeHelpers(db)
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values ('${ADMIN}', 'panel-admin@test', now());
    insert into public.platform_members (user_id, email, role, status) values ('${ADMIN}', 'panel-admin@test', 'admin', 'active');
  `)
}, 120_000)
afterAll(async () => {
  await db?.close()
})

const doc = (chrome: unknown): SiteContent => ({ ...emptySiteContent(), chrome } as unknown as SiteContent)
async function gate(content: unknown): Promise<string | null> {
  const { rows } = await db.query<{ r: string | null }>('select private.validate_site_content($1::jsonb) as r', [JSON.stringify(content)])
  return rows[0]!.r
}
async function forceDraft(content: unknown): Promise<string> {
  const { rows } = await db.query<{ b: string }>(`update public.site_content set draft = $1::jsonb, draft_updated_at = clock_timestamp() returning to_jsonb(draft_updated_at) #>> '{}' as b`, [JSON.stringify(content)])
  return rows[0]!.b
}
const publish = async (b: string) => (await h.call(ADMIN, 'select public.admin_publish_site_content($1::timestamptz) as r', [b])) as unknown as { version: number }
const chrome = async () => ((await h.call(ANON, `select public.get_published_site_content('chrome', null) as r`, [], null, 'anon')) as unknown as { content: Record<string, any> | null }).content
const reset = () =>
  db.exec(`update public.site_content set draft = '{}', draft_updated_at = clock_timestamp(), published = null, published_version = 0, published_at = null, published_by = null;
           delete from public.site_content_versions; delete from public.audit_events where event_type like 'site_content_%';`)

describe('the migration', () => {
  it('sorts after the latest earlier migration', () => {
    expect(MIGRATION).toMatch(/^\d{14}_website_editor_signin_panel_heading\.sql$/)
    expect(MIGRATION > '20261111160021_password_change_codes.sql').toBe(true)
  })

  it('the site-content bucket takes the 25 MB pictures the Website Editor allows (and keeps its 40 MB for .usdz files)', async () => {
    const r = await db.query<{ l: string; public: boolean }>(`select file_size_limit::text as l, public from storage.buckets where id = 'site-content'`)
    expect(Number(r.rows[0]!.l)).toBeGreaterThanOrEqual(SITE_ASSET_MAX_BYTES.image)
    expect(Number(r.rows[0]!.l)).toBe(SITE_ASSET_MAX_BYTES.usdz)
    expect(r.rows[0]!.public).toBe(true)
  })

  it('raises a site-content bucket that is under 25 MB, and leaves a larger one alone', async () => {
    const scratch = await freshDb((n) => n < MIGRATION)
    try {
      await scratch.exec(`update storage.buckets set file_size_limit = 5242880 where id = 'site-content'`)
      await scratch.exec(readFileSync(join(MIGRATIONS, MIGRATION), 'utf8'))
      expect((await scratch.query<{ l: string }>(`select file_size_limit::text as l from storage.buckets where id = 'site-content'`)).rows[0]!.l).toBe('41943040')
      await scratch.exec(`update storage.buckets set file_size_limit = 52428800 where id = 'site-content'`)
      await scratch.exec(readFileSync(join(MIGRATIONS, MIGRATION), 'utf8'))
      expect((await scratch.query<{ l: string }>(`select file_size_limit::text as l from storage.buckets where id = 'site-content'`)).rows[0]!.l).toBe('52428800')
    } finally {
      await scratch.close()
    }
  })
})

describe('chrome.signIn and chrome.catalogHeading: the publish gate', () => {
  it('accepts every text at its limit, a picture per page (plain or cropped), a heading, and a document without them', async () => {
    const texts = Object.fromEntries(Object.entries(SIGN_IN_TEXT_LIMITS).map(([k, max]) => [k, { en: 'a'.repeat(max), pt: 'é'.repeat(max) }]))
    const pictures = Object.fromEntries(SIGN_IN_PAGES.map((p, i) => [p, i % 2 ? { path: SHOWN } : PIC]))
    expect(await gate(doc({ signIn: { texts, pictures }, catalogHeading: { en: 'a'.repeat(80), pt: '' } }))).toBeNull()
    expect(await gate(doc({ signIn: {}, catalogHeading: {} }))).toBeNull()
    expect(await gate(emptySiteContent())).toBeNull()
    expect(await gate(doc({ favicon: { path: 'landing/abc.png' }, catalogBanner: { path: SHOWN }, signIn: { pictures: { login: PIC } } }))).toBeNull()
  })

  it.each([
    ['signIn not an object', { signIn: 'x' }, 'chrome.signIn|invalid_value'],
    ['an unknown part of signIn', { signIn: { slogan: {} } }, 'chrome.signIn.slogan|unknown_key'],
    ['texts not an object', { signIn: { texts: [] } }, 'chrome.signIn.texts|invalid_value'],
    ['an unknown text', { signIn: { texts: { slogan: { en: 'x' } } } }, 'chrome.signIn.texts.slogan|unknown_key'],
    ['a text that is not a pair', { signIn: { texts: { body: 'x' } } }, 'chrome.signIn.texts.body|invalid_value'],
    ['a text in an unknown language', { signIn: { texts: { body: { fr: 'x' } } } }, 'chrome.signIn.texts.body.fr|unknown_key'],
    ['a text that is not a string', { signIn: { texts: { tag2: { en: 5 } } } }, 'chrome.signIn.texts.tag2.en|invalid_value'],
    ['a title over 120 characters', { signIn: { texts: { title: { pt: 'a'.repeat(121) } } } }, 'chrome.signIn.texts.title.pt|too_long'],
    ['a tag over 40 characters', { signIn: { texts: { tag1: { en: 'a'.repeat(41) } } } }, 'chrome.signIn.texts.tag1.en|too_long'],
    ['pictures not an object', { signIn: { pictures: 'x' } }, 'chrome.signIn.pictures|invalid_value'],
    ['a picture of an unknown page', { signIn: { pictures: { home: PIC } } }, 'chrome.signIn.pictures.home|unknown_key'],
    ['a model file as a picture', { signIn: { pictures: { login: { path: 'landing/a.glb' } } } }, 'chrome.signIn.pictures.login|invalid_value'],
    ['a picture outside landing/', { signIn: { pictures: { demo: { path: 'x.png' } } } }, 'chrome.signIn.pictures.demo|invalid_value'],
    ['a picture as text', { signIn: { pictures: { apply: SHOWN } } }, 'chrome.signIn.pictures.apply|invalid_value'],
    ['a bad original', { signIn: { pictures: { join: { path: SHOWN, originalPath: 'landing/a.glb' } } } }, 'chrome.signIn.pictures.join.originalPath|invalid_value'],
    ['a bad crop', { signIn: { pictures: { resetPassword: { path: SHOWN, crop: { x: 0, y: 0, width: 5 } } } } }, 'chrome.signIn.pictures.resetPassword.crop|invalid_value'],
    ['a heading not an object', { catalogHeading: 'x' }, 'chrome.catalogHeading|invalid_value'],
    ['a heading in an unknown language', { catalogHeading: { fr: 'x' } }, 'chrome.catalogHeading.fr|unknown_key'],
    ['a heading that is not a string', { catalogHeading: { pt: 1 } }, 'chrome.catalogHeading.pt|invalid_value'],
    ['a heading over 80 characters', { catalogHeading: { en: 'a'.repeat(81) } }, 'chrome.catalogHeading.en|too_long'],
  ])('refuses %s, and the TypeScript validator agrees', async (_name, chromeValue, expected) => {
    expect(await gate(doc(chromeValue))).toBe(expected)
    const [path, key] = expected.split('|') as [string, string]
    expect(validateSiteContent(doc(chromeValue))[path]).toBe(key)
  })

  it('leaves the earlier chrome checks as they were', async () => {
    expect(await gate(doc({ favicon: { path: 'landing/abc.jpg' } }))).toBe('chrome.favicon|invalid_value')
    expect(await gate(doc({ catalogBanner: { path: 'landing/a.glb' } }))).toBe('chrome.catalogBanner|invalid_value')
  })
})

describe('chrome.signIn and chrome.catalogHeading: the public read', () => {
  it('returns the published ones whole, and nothing of a draft', async () => {
    await reset()
    const read0 = (await chrome()) ?? {}
    expect(read0).not.toHaveProperty('signIn')
    expect(read0).not.toHaveProperty('catalogHeading')
    const signIn = { texts: { title: { en: 'Made to last', pt: 'Feito para durar' } }, pictures: { login: PIC, apply: { path: SHOWN } } }
    const catalogHeading = { en: 'Our pieces', pt: 'As nossas peças' }
    expect((await publish(await forceDraft(doc({ signIn, catalogHeading, favicon: { path: 'landing/abc.png' } })))).version).toBeGreaterThan(0)
    const read = (await chrome())!
    expect(read.signIn).toEqual(signIn)
    expect(read.catalogHeading).toEqual(catalogHeading)
    expect(read.favicon).toEqual({ path: 'landing/abc.png' })

    await forceDraft(doc({ catalogHeading: { en: 'Draft only' } }))
    expect((await chrome())!.catalogHeading).toEqual(catalogHeading)

    expect((await publish(await forceDraft(doc({ catalogBanner: { path: SHOWN } })))).version).toBeGreaterThan(1)
    const after = (await chrome())!
    expect(after).not.toHaveProperty('signIn')
    expect(after).not.toHaveProperty('catalogHeading')
    expect(after.catalogBanner).toEqual({ path: SHOWN })
    await reset()
  })
})

describe('rollback', () => {
  it('apply → rollback → re-apply: the two functions equal their earlier bodies and come back', async () => {
    const before = await freshDb((n) => n < MIGRATION)
    const rolled = await freshDb()
    try {
      const FNS = ['private.validate_site_content(jsonb)', 'public.get_published_site_content(text,text)']
      const defs = async (target: PGlite) => {
        const out: string[] = []
        for (const sig of FNS) out.push((await target.query<{ d: string }>(`select pg_get_functiondef($1::regprocedure) as d`, [sig])).rows[0]!.d.replace(/\r\n/g, '\n'))
        return out
      }
      const gateOf = async (target: PGlite, content: unknown) => (await target.query<{ r: string | null }>('select private.validate_site_content($1::jsonb) as r', [JSON.stringify(content)])).rows[0]!.r
      const bad = doc({ catalogHeading: 'x' })

      expect(await gateOf(rolled, bad)).toBe('chrome.catalogHeading|invalid_value')
      expect(await defs(rolled)).not.toEqual(await defs(before))
      await rolled.exec(readFileSync(ROLLBACK_SQL, 'utf8'))
      expect(await defs(rolled)).toEqual(await defs(before))
      expect(await gateOf(rolled, bad)).toBeNull()
      expect(await gateOf(rolled, doc({ catalogBanner: { path: 'landing/a.glb' } }))).toBe('chrome.catalogBanner|invalid_value')
      const grants = await rolled.query<{ a: boolean; x: boolean }>(
        `select has_function_privilege('anon', 'public.get_published_site_content(text,text)', 'execute') as a, has_function_privilege('anon', 'private.validate_site_content(jsonb)', 'execute') as x`,
      )
      expect(grants.rows[0]).toEqual({ a: true, x: false })

      await rolled.exec(readFileSync(join(MIGRATIONS, MIGRATION), 'utf8'))
      expect(await gateOf(rolled, bad)).toBe('chrome.catalogHeading|invalid_value')
      expect(await defs(rolled)).not.toEqual(await defs(before))
    } finally {
      await before.close()
      await rolled.close()
    }
  }, 240_000)
})
