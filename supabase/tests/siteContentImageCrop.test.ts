// @vitest-environment node
// Image crop on upload (ADR-0063), migration B: the optional originalPath and crop on every uploaded site picture (hero, collection
// card, showcase, own sections, QR section, About) and the new landing.about.third picture, in the publish gate; the public read
// returns them; the TypeScript validator agrees with the SQL gate; nothing in the database deletes site-content files; the rollback
// puts the three earlier bodies back. PGlite only; nothing touches a live project.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MIGRATIONS, freshDb, ids, makeHelpers, type Helpers } from './harness'
import { emptySiteContent, normalizeSiteContent, validateSiteContent, type SiteContent } from '../../src/domain/siteContent'

const MIGRATION = readdirSync(MIGRATIONS).find((n) => n.endsWith('_site_content_image_crop.sql'))!
const ROLLBACK_SQL = join(__dirname, '..', 'rollback', '20261111_site_content_image_crop_rollback.sql')

const id = ids(1)
const ADMIN = id(71)
const ANON = ''

let db: PGlite
let h: Helpers

beforeAll(async () => {
  db = await freshDb()
  h = makeHelpers(db)
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values ('${ADMIN}', 'crop-admin@test', now());
    insert into public.platform_members (user_id, email, role, status) values ('${ADMIN}', 'crop-admin@test', 'admin', 'active');
  `)
}, 60_000)
afterAll(async () => {
  await db?.close()
})

const SHOWN = 'landing/0a1b2c3d-1111-4222-8333-444455556666.webp'
const ORIGINAL = 'landing/0a1b2c3d-9999-4222-8333-444455556666.jpg'
const CROP = { x: -120.5, y: 0, width: 1200, height: 1500 }
const ALT = { en: 'A sofa', pt: 'Um sofá' }
const IMG = { path: SHOWN, alt: ALT }
/** A picture the crop dialog made. */
const CROPPED = { path: SHOWN, originalPath: ORIGINAL, crop: CROP, alt: ALT }

const doc = (patch: (c: Record<string, any>) => void): SiteContent => {
  const c = emptySiteContent() as unknown as Record<string, any>
  patch(c)
  return c as SiteContent
}
async function forceDraft(content: unknown): Promise<string> {
  const { rows } = await db.query<{ b: string }>(`update public.site_content set draft = $1::jsonb, draft_updated_at = clock_timestamp() returning to_jsonb(draft_updated_at) #>> '{}' as b`, [JSON.stringify(content)])
  return rows[0]!.b
}
const publish = async (b: string) => (await h.call(ADMIN, 'select public.admin_publish_site_content($1::timestamptz) as r', [b])) as unknown as { version: number }
/** The first error the SQL gate gives a document, or null when it publishes. */
async function gate(content: unknown): Promise<string | null> {
  const { rows } = await db.query<{ r: string | null }>('select private.validate_site_content($1::jsonb) as r', [JSON.stringify(content)])
  return rows[0]!.r
}
const chrome = async () => ((await h.call(ANON, `select public.get_published_site_content('chrome', null) as r`, [], null, 'anon')) as unknown as { content: Record<string, any> | null }).content
const reset = () =>
  db.exec(`update public.site_content set draft = '{}', draft_updated_at = clock_timestamp(), published = null, published_version = 0, published_at = null, published_by = null;
           delete from public.site_content_versions; delete from public.audit_events where event_type like 'site_content_%';`)

/** Every place an uploaded picture lives, as a function from the picture to a document. */
const PLACES: [string, string, (pic: unknown) => SiteContent][] = [
  ['hero', 'landing.hero.image', (p) => doc((c) => (c.landing.hero = { image: p }))],
  ['collection card', 'landing.collections.0.image', (p) => doc((c) => (c.landing.collections = [{ id: 'c1', slug: 'sofas', title: { en: 'Sofas' }, image: p, link: { kind: 'collection' }, products: [] }]))],
  ['showcase', 'landing.showcase.image', (p) => doc((c) => (c.landing.showcase = { title: { en: 'Piece' }, image: p }))],
  ['picture + text section', 'landing.sections.0.image', (p) => doc((c) => (c.landing.sections = [{ kind: 'imageText', id: 'story', title: { en: 'T' }, image: p, imageSide: 'left' }]))],
  ['banner section', 'landing.sections.0.image', (p) => doc((c) => (c.landing.sections = [{ kind: 'banner', id: 'wide', image: p }]))],
  ['QR section', 'landing.qr.image', (p) => doc((c) => (c.landing.qr = { image: p, imageSide: 'left' }))],
  ['About main', 'landing.about.image', (p) => doc((c) => (c.landing.about = { image: p }))],
  ['About detail', 'landing.about.detail', (p) => doc((c) => (c.landing.about = { detail: p }))],
  ['About third', 'landing.about.third', (p) => doc((c) => (c.landing.about = { third: p }))],
]

describe('the migration', () => {
  it('sorts after the product photo migration and the latest site-content migrations', () => {
    expect(MIGRATION).toMatch(/^\d{14}_site_content_image_crop\.sql$/)
    expect(MIGRATION > '20261111122043_product_image_crop.sql').toBe(true)
    expect(MIGRATION > '20261111095614_apply_form_delete_anything.sql').toBe(true)
  })

  it('the new helper is not callable by the API roles; the replaced ones keep their grants', async () => {
    for (const sig of ['private.check_image_extras(jsonb,text)', 'private.check_site_image(jsonb,text,boolean)', 'private.check_landing_layout(jsonb)', 'private.validate_site_content(jsonb)']) {
      const { rows } = await db.query<{ a: boolean; n: boolean }>(`select has_function_privilege('anon', $1, 'execute') as a, has_function_privilege('authenticated', $1, 'execute') as n`, [sig])
      expect(rows[0], sig).toEqual({ a: false, n: false })
    }
    const pub = await db.query<{ a: boolean }>(`select has_function_privilege('anon', 'public.get_published_site_content(text,text)', 'execute') as a`)
    expect(pub.rows[0]!.a).toBe(true)
  })

  it('does not touch the draft shape check (it stays the one of 20261111095614_apply_form_delete_anything.sql)', async () => {
    const def = (await db.query<{ d: string }>(`select pg_get_functiondef('private.check_site_content_shape(jsonb)'::regprocedure) as d`)).rows[0]!.d
    expect(def).toContain("> 12 then") // the apply-form caps of apply_form_delete_anything
    expect(readFileSync(join(MIGRATIONS, MIGRATION), 'utf8')).not.toMatch(/function private\.check_site_content_shape/)
  })
})

describe('publish gate: pictures without the new keys behave as before', () => {
  it.each(PLACES)('%s: a plain picture {path, alt} passes', async (_name, _where, put) => {
    expect(await gate(put(IMG))).toBeNull()
  })
  it('a built-in collection picture (a key) and a document with no landing keys still pass', async () => {
    expect(await gate(doc((c) => (c.landing.collections = [{ id: 'c1', slug: 'sofas', title: { en: 'Sofas' }, image: 'sofa-travertine', link: { kind: 'collection' }, products: [] }])))).toBeNull()
    expect(await gate(emptySiteContent())).toBeNull()
  })
})

describe('publish gate: originalPath and crop', () => {
  it.each(PLACES)('%s: a picture with originalPath and crop passes', async (_name, _where, put) => {
    expect(await gate(put(CROPPED))).toBeNull()
  })

  it.each(PLACES)('%s: a bad originalPath is refused at the picture', async (_name, where, put) => {
    for (const bad of ['landing/a.glb', 'landing/sub/a.png', '../landing/a.png', 'a.png', 'landing/UPPER.png', '', 5, true, { path: ORIGINAL }, [ORIGINAL]])
      expect(await gate(put({ ...CROPPED, originalPath: bad })), JSON.stringify(bad)).toBe(`${where}.originalPath|invalid_value`)
  })

  it.each(PLACES)('%s: a bad crop is refused at the picture', async (_name, where, put) => {
    const bads: unknown[] = [
      'x',
      5,
      [1, 2, 3, 4],
      {},
      { x: 0, y: 0, width: 10 },
      { x: '0', y: 0, width: 10, height: 10 },
      { x: 0, y: 0, width: 0, height: 10 },
      { x: 0, y: 0, width: 10, height: -1 },
      { x: 0, y: null, width: 10, height: 10 },
      { x: 0, y: 0, width: 10, height: 10, extra: 1 },
    ]
    for (const bad of bads) expect(await gate(put({ ...CROPPED, crop: bad })), JSON.stringify(bad)).toBe(`${where}.crop|invalid_value`)
  })

  it('a crop that reaches past the picture (a whole-picture save) and negative or fractional numbers are fine', async () => {
    for (const crop of [{ x: -50.25, y: -10, width: 1000.5, height: 1250.75 }, { x: 0, y: 0, width: 0.5, height: 0.5 }])
      expect(await gate(doc((c) => (c.landing.hero = { image: { ...CROPPED, crop } })))).toBeNull()
  })

  it('JSON null for either key counts as absent', async () => {
    expect(await gate(doc((c) => (c.landing.hero = { image: { path: SHOWN, originalPath: null, crop: null } })))).toBeNull()
  })

  it('the original may be a png or a jpg (the bucket allows them); the shown copy of the 3D model files is unaffected', async () => {
    for (const ext of ['png', 'jpg', 'jpeg', 'webp']) expect(await gate(doc((c) => (c.landing.hero = { image: { ...CROPPED, originalPath: `landing/0a1b2c3d-9999-4222-8333-444455556666.${ext}` } })))).toBeNull()
    expect(await gate(doc((c) => (c.landing.hero = { image: IMG, model: { glb: { path: 'landing/0a1b2c3d-1111-4222-8333-444455556666.glb' } } })))).toBeNull()
  })

  it('the favicon is not a cropped picture: it still needs a .png and ignores nothing new', async () => {
    expect(await gate(doc((c) => (c.chrome = { favicon: { path: 'landing/abc.png' } })))).toBeNull()
    expect(await gate(doc((c) => (c.chrome = { favicon: { path: 'landing/abc.jpg' } })))).toBe('chrome.favicon|invalid_value')
  })
})

describe('the About third picture', () => {
  it('publishes with and without it, and the public read returns it whole', async () => {
    await reset()
    const without = doc((c) => (c.landing.about = { image: IMG }))
    expect((await publish(await forceDraft(without))).version).toBeGreaterThan(0)
    expect((await chrome())!.landingAbout).toEqual({ image: IMG })

    const withThird = doc((c) => (c.landing.about = { image: IMG, detail: IMG, third: CROPPED }))
    expect((await publish(await forceDraft(withThird))).version).toBeGreaterThan(1)
    expect((await chrome())!.landingAbout).toEqual({ image: IMG, detail: IMG, third: CROPPED })

    // A third picture alone is an About section too.
    expect((await publish(await forceDraft(doc((c) => (c.landing.about = { third: IMG }))))).version).toBeGreaterThan(2)
    expect((await chrome())!.landingAbout).toEqual({ third: IMG })
    await reset()
  })

  it('refuses a third picture that is not an uploaded image, or whose description is too long', async () => {
    expect(await gate(doc((c) => (c.landing.about = { third: { path: 'landing/a.glb', alt: { en: '' } } })))).toBe('landing.about.third|invalid_value')
    expect(await gate(doc((c) => (c.landing.about = { third: { path: 'x.png', alt: { en: '' } } })))).toBe('landing.about.third|invalid_value')
    expect(await gate(doc((c) => (c.landing.about = { third: 'landing/a.png' })))).toBe('landing.about.third|invalid_value')
    expect(await gate(doc((c) => (c.landing.about = { third: { path: SHOWN, alt: { pt: 'z'.repeat(121) } } })))).toBe('landing.about.third.alt.pt|too_long')
    expect(await gate(doc((c) => (c.landing.about = { third: { path: '', alt: { en: '' } } })))).toBe('landing.about.third|required')
  })

  it('the draft shape check still accepts it (landing.about only has to be an object)', async () => {
    const { rows } = await db.query<{ r: string | null }>('select private.check_site_content_shape($1::jsonb) as r', [JSON.stringify(doc((c) => (c.landing.about = { third: CROPPED })))])
    expect(rows[0]!.r).toBeNull()
  })
})

describe('originals are not swept', () => {
  it('no function in the database removes site-content files, so an originalPath cannot be swept away', async () => {
    const { rows } = await db.query<{ proname: string }>(
      `with f as materialized (
         select p.proname, case when p.prokind = 'f' then pg_get_functiondef(p.oid) end as d
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public', 'private'))
       select proname from f where d ~* 'site-content' and d ~* '(delete\\s+from\\s+storage|storage\\.objects|storage\\.delete)'`,
    )
    expect(rows.map((r) => r.proname)).toEqual([])
  })

  it('the media sweep of the product bucket never looks at the site-content bucket', async () => {
    const def = (await db.query<{ d: string }>(`select pg_get_functiondef('private.unreferenced_media_paths(text[])'::regprocedure) as d`)).rows[0]!.d
    expect(def).not.toContain('site_content')
    expect(def).not.toContain('site-content')
  })
})

describe('the TypeScript validator agrees with the SQL gate', () => {
  const cases: [string, SiteContent][] = []
  for (const [name, , put] of PLACES) {
    cases.push([`${name}: cropped ok`, put(CROPPED)])
    cases.push([`${name}: bad original`, put({ ...CROPPED, originalPath: 'landing/a.glb' })])
    cases.push([`${name}: original not a string`, put({ ...CROPPED, originalPath: 5 })])
    cases.push([`${name}: crop zero width`, put({ ...CROPPED, crop: { ...CROP, width: 0 } })])
    cases.push([`${name}: crop missing height`, put({ ...CROPPED, crop: { x: 0, y: 0, width: 5 } })])
    cases.push([`${name}: crop with an extra key`, put({ ...CROPPED, crop: { ...CROP, extra: 1 } })])
    cases.push([`${name}: crop not an object`, put({ ...CROPPED, crop: [1, 2, 3, 4] })])
  }
  cases.push(['about third bad type', doc((c) => (c.landing.about = { third: { path: 'landing/a.glb', alt: { en: '' } } }))])
  cases.push(['about third long alt', doc((c) => (c.landing.about = { third: { path: SHOWN, alt: { en: 'x'.repeat(121) } } }))])

  it.each(cases)('%s', async (_name, content) => {
    const sql = await gate(content)
    const ts = validateSiteContent(content)
    if (sql === null) {
      expect(ts).toEqual({})
    } else {
      const [path, key] = sql.split('|') as [string, string]
      expect(ts[path], `${sql} against ${JSON.stringify(ts)}`).toBe(key)
    }
  })

  it('normalizing a stored document keeps originalPath, crop and the third picture, and drops malformed crops', () => {
    const stored = JSON.parse(JSON.stringify(doc((c) => ((c.landing.about = { image: CROPPED, third: CROPPED }), (c.landing.hero = { image: CROPPED }))))) as Record<string, any>
    const kept = normalizeSiteContent(stored)
    expect(kept.landing.about).toEqual({ image: CROPPED, third: CROPPED })
    expect(kept.landing.hero?.image).toEqual({ path: SHOWN, originalPath: ORIGINAL, crop: CROP })
    const broken = normalizeSiteContent({ ...stored, landing: { hero: { image: { path: SHOWN, originalPath: 5, crop: { x: 'a' } } } } })
    expect(broken.landing.hero?.image).toEqual({ path: SHOWN })
  })
})

describe('rollback', () => {
  it('apply → rollback → re-apply: the three functions equal their earlier bodies, the helper is dropped and returned, grants kept', async () => {
    const before = await freshDb((n) => n < MIGRATION)
    const rolled = await freshDb()
    try {
      const FNS = ['private.check_site_image(jsonb,text,boolean)', 'private.check_landing_layout(jsonb)', 'private.validate_site_content(jsonb)', 'private.check_site_content_shape(jsonb)']
      const defs = async (target: PGlite) => {
        const out: string[] = []
        for (const sig of FNS) out.push((await target.query<{ d: string }>(`select pg_get_functiondef($1::regprocedure) as d`, [sig])).rows[0]!.d.replace(/\r\n/g, '\n'))
        return out
      }
      const helper = async (target: PGlite) => (await target.query<{ f: string | null }>(`select to_regprocedure('private.check_image_extras(jsonb,text)')::text as f`)).rows[0]!.f
      const badCrop = JSON.stringify(doc((c) => (c.landing.hero = { image: { ...CROPPED, crop: { x: 0, y: 0, width: 0, height: 1 } } })))
      const third = JSON.stringify(doc((c) => (c.landing.about = { third: { path: 'landing/a.glb', alt: { en: '' } } })))
      const gateOf = async (target: PGlite, content: string) => (await target.query<{ r: string | null }>('select private.validate_site_content($1::jsonb) as r', [content])).rows[0]!.r

      expect(await helper(rolled)).not.toBeNull()
      expect(await gateOf(rolled, badCrop)).toBe('landing.hero.image.crop|invalid_value')
      expect(await gateOf(rolled, third)).toBe('landing.about.third|invalid_value')
      expect(await defs(rolled)).not.toEqual(await defs(before))

      await rolled.exec(readFileSync(ROLLBACK_SQL, 'utf8'))
      expect(await defs(rolled)).toEqual(await defs(before))
      expect(await helper(rolled)).toBeNull()
      // Back to the earlier rules: a crop and a third picture are not looked at.
      expect(await gateOf(rolled, badCrop)).toBeNull()
      expect(await gateOf(rolled, third)).toBeNull()
      // ... and the earlier checks are intact.
      expect(await gateOf(rolled, JSON.stringify(doc((c) => (c.landing.about = { detail: { path: 'landing/a.glb', alt: { en: '' } } }))))).toBe('landing.about.detail|invalid_value')
      const grants = await rolled.query<{ a: boolean; n: boolean; l: boolean }>(
        `select has_function_privilege('anon', 'private.validate_site_content(jsonb)', 'execute') as a, has_function_privilege('authenticated', 'private.check_site_image(jsonb,text,boolean)', 'execute') as n, has_function_privilege('authenticated', 'private.check_landing_layout(jsonb)', 'execute') as l`,
      )
      expect(grants.rows[0]).toEqual({ a: false, n: false, l: false })

      await rolled.exec(readFileSync(join(MIGRATIONS, MIGRATION), 'utf8'))
      expect(await helper(rolled)).not.toBeNull()
      expect(await gateOf(rolled, badCrop)).toBe('landing.hero.image.crop|invalid_value')
      expect(await gateOf(rolled, third)).toBe('landing.about.third|invalid_value')
      const grants2 = await rolled.query<{ e: boolean; l: boolean }>(
        `select has_function_privilege('anon', 'private.check_image_extras(jsonb,text)', 'execute') as e, has_function_privilege('authenticated', 'private.check_image_extras(jsonb,text)', 'execute') as l`,
      )
      expect(grants2.rows[0]).toEqual({ e: false, l: false })
    } finally {
      await before.close()
      await rolled.close()
    }
  }, 180_000)
})
