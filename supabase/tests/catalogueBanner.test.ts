// @vitest-environment node
// Changeable catalogue banner (ADR-0065): a company's own banner (three columns of businesses, written by whoever writes the
// logo, readable by visitors only as banner_url of an active company), the platform's default banner in the site content
// (chrome.catalogBanner: publish gate and public read), the 40 MB business-logos bucket, and the rollback. PGlite only; nothing
// touches a live project.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MIGRATIONS, freshDb, ids, makeHelpers, type Helpers } from './harness'
import { emptySiteContent, normalizeSiteContent, validateSiteContent, type SiteContent } from '../../src/domain/siteContent'

const MIGRATION = readdirSync(MIGRATIONS).find((n) => n.endsWith('_catalogue_banner.sql'))!
const ROLLBACK_SQL = join(__dirname, '..', 'rollback', '20261111_catalogue_banner_rollback.sql')

const id = ids(18)
const ADMIN = id(31)
const OWNER = id(32)
const OTHER_OWNER = id(33)
const STRANGER = id(34)
const BIZ = id(40)
const OTHER_BIZ = id(41)
const INACTIVE = id(42)
const ANON = ''

const URL_A = `https://project.supabase.co/storage/v1/object/public/business-logos/${BIZ}/0a1b2c3d-1111-4222-8333-444455556666.webp`
const URL_ORIGINAL = `https://project.supabase.co/storage/v1/object/public/business-logos/${BIZ}/0a1b2c3d-9999-4222-8333-444455556666.jpg`
const CROP = { x: -120.5, y: 0, width: 1200, height: 600 }

let db: PGlite
let h: Helpers

beforeAll(async () => {
  db = await freshDb()
  h = makeHelpers(db)
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values
      ('${ADMIN}', 'banner-admin@test', now()), ('${OWNER}', 'banner-owner@test', now()), ('${OTHER_OWNER}', 'banner-other@test', now()), ('${STRANGER}', 'banner-stranger@test', now());
    insert into public.platform_members (user_id, email, role, status) values ('${ADMIN}', 'banner-admin@test', 'admin', 'active');
    insert into public.businesses (id, name, slug, status) values
      ('${BIZ}', 'Casa', 'casa', 'active'), ('${OTHER_BIZ}', 'Outro', 'outro', 'active'), ('${INACTIVE}', 'Parada', 'parada', 'inactive');
    insert into public.business_members (business_id, user_id) values ('${BIZ}', '${OWNER}'), ('${OTHER_BIZ}', '${OTHER_OWNER}');
  `)
}, 120_000)
afterAll(async () => {
  await db?.close()
})

const SET = `update public.businesses set banner_url = $2, banner_original_url = $3, banner_crop = $4::jsonb where id = $1`
const set = (uid: string, biz: string, url: string | null, original: string | null = null, crop: unknown = null) =>
  h.as(uid, (tx) => tx.query(SET, [biz, url, original, crop === null ? null : JSON.stringify(crop)]))
const row = async (biz: string) => (await db.query<{ banner_url: string | null; banner_original_url: string | null; banner_crop: unknown }>(`select banner_url, banner_original_url, banner_crop from public.businesses where id = '${biz}'`)).rows[0]!
const clear = () => db.exec(`update public.businesses set banner_url = null, banner_original_url = null, banner_crop = null`)

describe('the migration', () => {
  it('sorts after the latest earlier migration', () => {
    expect(MIGRATION).toMatch(/^\d{14}_catalogue_banner\.sql$/)
    expect(MIGRATION > '20261111141703_site_content_image_crop.sql').toBe(true)
  })

  it('adds three nullable columns; every company starts without a banner', async () => {
    const r = await db.query<{ column_name: string; is_nullable: string }>(
      `select column_name, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'businesses' and column_name like 'banner%' order by column_name`,
    )
    expect(r.rows).toEqual([
      { column_name: 'banner_crop', is_nullable: 'YES' },
      { column_name: 'banner_original_url', is_nullable: 'YES' },
      { column_name: 'banner_url', is_nullable: 'YES' },
    ])
    expect((await db.query(`select 1 from public.businesses where banner_url is not null or banner_original_url is not null or banner_crop is not null`)).rows).toHaveLength(0)
  })

  it('raises the business-logos bucket to the limit of site-content, with the same public flag and picture types', async () => {
    const r = await db.query<{ id: string; file_size_limit: string; public: boolean; allowed_mime_types: string[] }>(
      `select id, file_size_limit::text, public, allowed_mime_types from storage.buckets where id in ('business-logos', 'site-content') order by id`,
    )
    const logos = r.rows.find((x) => x.id === 'business-logos')!
    const site = r.rows.find((x) => x.id === 'site-content')!
    // 40 MB (ADR-0065); the storage hardening (ADR-0071) keeps it.
    expect(Number(logos.file_size_limit)).toBe(41943040)
    expect(Number(site.file_size_limit)).toBe(41943040)
    expect(logos.public).toBe(true)
    expect(logos.allowed_mime_types).toEqual(['image/png', 'image/jpeg', 'image/webp'])
  })
})

describe('who writes the banner: exactly whoever writes the logo', () => {
  it("a member writes their company's banner, original and crop; the platform admin writes any company's", async () => {
    await set(OWNER, BIZ, URL_A, URL_ORIGINAL, CROP)
    expect(await row(BIZ)).toEqual({ banner_url: URL_A, banner_original_url: URL_ORIGINAL, banner_crop: CROP })
    await set(ADMIN, OTHER_BIZ, URL_A, URL_ORIGINAL, CROP)
    expect((await row(OTHER_BIZ)).banner_url).toBe(URL_A)
    await clear()
  })

  it("a signed-in person who is not a member of the company changes nothing (same as the logo)", async () => {
    for (const uid of [STRANGER, OTHER_OWNER]) {
      expect(await h.affected(uid, SET, [BIZ, URL_A, null, null]), `banner as ${uid}`).toBe(0)
      expect(await h.affected(uid, `update public.businesses set logo_url = 'https://x.test/l.png' where id = $1`, [BIZ]), `logo as ${uid}`).toBe(0)
    }
    expect((await row(BIZ)).banner_url).toBeNull()
  })

  it('a visitor cannot write it', async () => {
    await expect(h.probe(ANON, SET, [BIZ, URL_A, null, null], null, 'anon')).rejects.toThrow(/permission denied/)
  })

  it('the owner can write the banner but still no admin-only column (the guard allow-list took exactly three columns)', async () => {
    await expect(h.as(OWNER, (tx) => tx.query(`update public.businesses set accent_color = '#123456', banner_url = $2 where id = $1`, [BIZ, URL_A]))).rejects.toThrow(/business_field_admin_only/)
    await expect(h.as(OWNER, (tx) => tx.query(`update public.businesses set status = 'inactive' where id = $1`, [BIZ]))).rejects.toThrow(/Only platform admins/)
    await expect(h.as(OWNER, (tx) => tx.query(`update public.businesses set share_enabled = false where id = $1`, [BIZ]))).rejects.toThrow(/business_field_admin_only/)
    expect((await row(BIZ)).banner_url).toBeNull()
  })

  it("the owner can remove the banner (all three go together) and the logo is still theirs", async () => {
    await set(OWNER, BIZ, URL_A, URL_ORIGINAL, CROP)
    await set(OWNER, BIZ, null)
    expect(await row(BIZ)).toEqual({ banner_url: null, banner_original_url: null, banner_crop: null })
    await h.as(OWNER, (tx) => tx.query(`update public.businesses set logo_url = 'https://x.test/l.png' where id = $1`, [BIZ]))
    await h.as(OWNER, (tx) => tx.query(`update public.businesses set logo_url = null where id = $1`, [BIZ]))
  })

  it('keeps the widened admin check of the guard (platform_can) and lists the owner columns once', async () => {
    const def = (await db.query<{ d: string }>(`select pg_get_functiondef('public.guard_business_admin_fields()'::regprocedure) as d`)).rows[0]!.d
    expect(def).toContain("platform_can('businesses.edit')")
    expect(def).toContain("'updated_at', 'banner_url', 'banner_original_url', 'banner_crop']")
    expect(def.match(/banner_url/g)).toHaveLength(1)
  })
})

describe('what the database accepts', () => {
  it.each([
    ['an http address', 'http://project.supabase.co/b.webp'],
    ['a data: URL', 'data:image/png;base64,AAAA'],
    ['a path', '/images/banner.webp'],
    ['an address over 2048 characters', `https://project.supabase.co/${'a'.repeat(2048)}.webp`],
  ])('refuses %s as the banner and as its original', async (_name, bad) => {
    await expect(set(ADMIN, BIZ, bad)).rejects.toThrow(/businesses_banner_url_https/)
    await expect(set(ADMIN, BIZ, URL_A, bad)).rejects.toThrow(/businesses_banner_original_url_https/)
  })

  it('an original or a crop without a banner is refused', async () => {
    await expect(set(ADMIN, BIZ, null, URL_ORIGINAL)).rejects.toThrow(/businesses_banner_parts/)
    await expect(set(ADMIN, BIZ, null, null, CROP)).rejects.toThrow(/businesses_banner_parts/)
  })

  it('a banner on its own (a picture of an older kind, or one that was never cropped) is fine', async () => {
    await set(OWNER, BIZ, URL_A)
    expect(await row(BIZ)).toEqual({ banner_url: URL_A, banner_original_url: null, banner_crop: null })
    await clear()
  })

  it.each([
    ['zero width', { x: 0, y: 0, width: 0, height: 5 }],
    ['negative height', { x: 0, y: 0, width: 5, height: -1 }],
    ['a missing key', { x: 0, y: 0, width: 5 }],
    ['an extra key', { x: 0, y: 0, width: 5, height: 5, extra: 1 }],
    ['a text number', { x: '0', y: 0, width: 5, height: 5 }],
    ['an array', [0, 0, 5, 5]],
    ['a plain number', 5],
  ])('refuses a crop with %s', async (_name, crop) => {
    await expect(set(OWNER, BIZ, URL_A, URL_ORIGINAL, crop)).rejects.toThrow(/businesses_banner_crop_shape/)
    expect((await row(BIZ)).banner_crop).toBeNull()
  })

  it('accepts a crop that reaches past the picture (a "whole picture" save)', async () => {
    await set(OWNER, BIZ, URL_A, URL_ORIGINAL, { x: -300, y: -50, width: 2000, height: 1000 })
    expect((await row(BIZ)).banner_crop).toEqual({ x: -300, y: -50, width: 2000, height: 1000 })
    await clear()
  })
})

describe('what a visitor sees', () => {
  it("anon reads banner_url of an active company, and nothing of an inactive one's row", async () => {
    await set(ADMIN, BIZ, URL_A, URL_ORIGINAL, CROP)
    await set(ADMIN, INACTIVE, URL_A, URL_ORIGINAL, CROP)
    const active = await h.probe(ANON, `select slug, banner_url from public.businesses where slug in ('casa', 'parada') order by slug`, [], null, 'anon')
    expect(active.rows).toEqual([{ slug: 'casa', banner_url: URL_A }])
    await clear()
  })

  it('anon cannot read the original or the crop, directly or through select *', async () => {
    await expect(h.probe(ANON, `select banner_original_url from public.businesses`, [], null, 'anon')).rejects.toThrow(/permission denied/)
    await expect(h.probe(ANON, `select banner_crop from public.businesses`, [], null, 'anon')).rejects.toThrow(/permission denied/)
    await expect(h.probe(ANON, `select * from public.businesses`, [], null, 'anon')).rejects.toThrow(/permission denied/)
  })

  it('anon still reads every column the public pages ask for', async () => {
    const r = await h.probe(ANON, `select id, name, slug, logo_url, banner_url, contact_email, contact_phone, contact_website, contact_address, status, accent_color, default_currency, allow_own_models, is_house, share_enabled, created_at, updated_at from public.businesses where slug = 'casa'`, [], null, 'anon')
    expect(r.rows).toHaveLength(1)
  })

  it('a signed-in member reads all three of their own company', async () => {
    await set(OWNER, BIZ, URL_A, URL_ORIGINAL, CROP)
    const r = await h.probe(OWNER, `select banner_url, banner_original_url, banner_crop from public.businesses where id = $1`, [BIZ])
    expect(r.rows).toEqual([{ banner_url: URL_A, banner_original_url: URL_ORIGINAL, banner_crop: CROP }])
    await clear()
  })
})

// ---------------------------------------------------------------------------------------------------------------------
// The platform's default banner in the site content
// ---------------------------------------------------------------------------------------------------------------------
const SHOWN = 'landing/0a1b2c3d-1111-4222-8333-444455556666.webp'
const ORIGINAL = 'landing/0a1b2c3d-9999-4222-8333-444455556666.jpg'
const SITE_CROP = { x: -120.5, y: 0, width: 1200, height: 600 }
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
async function gate(content: unknown): Promise<string | null> {
  const { rows } = await db.query<{ r: string | null }>('select private.validate_site_content($1::jsonb) as r', [JSON.stringify(content)])
  return rows[0]!.r
}
const chrome = async () => ((await h.call(ANON, `select public.get_published_site_content('chrome', null) as r`, [], null, 'anon')) as unknown as { content: Record<string, any> | null }).content
const reset = () =>
  db.exec(`update public.site_content set draft = '{}', draft_updated_at = clock_timestamp(), published = null, published_version = 0, published_at = null, published_by = null;
           delete from public.site_content_versions; delete from public.audit_events where event_type like 'site_content_%';`)

describe('chrome.catalogBanner: the publish gate', () => {
  const banner = (value: unknown) => doc((c) => (c.chrome = { catalogBanner: value }))

  it('accepts a plain picture, a cropped one with its original, and a document without it', async () => {
    expect(await gate(banner({ path: SHOWN }))).toBeNull()
    expect(await gate(banner({ path: SHOWN, originalPath: ORIGINAL, crop: SITE_CROP }))).toBeNull()
    expect(await gate(emptySiteContent())).toBeNull()
    expect(await gate(doc((c) => (c.chrome = { favicon: { path: 'landing/abc.png' }, catalogBanner: { path: SHOWN } })))).toBeNull()
  })

  it.each([
    ['a model file', { path: 'landing/a.glb' }],
    ['a path outside landing/', { path: 'x.png' }],
    ['an upper-case name', { path: 'landing/UPPER.png' }],
    ['a sub-folder', { path: 'landing/sub/a.png' }],
    ['a text instead of an object', 'landing/a.png'],
    ['an array', [SHOWN]],
    ['no path', {}],
  ])('refuses %s', async (_name, value) => {
    expect(await gate(banner(value))).toBe('chrome.catalogBanner|invalid_value')
  })

  it('refuses a bad originalPath and a bad crop at the banner', async () => {
    expect(await gate(banner({ path: SHOWN, originalPath: 'landing/a.glb' }))).toBe('chrome.catalogBanner.originalPath|invalid_value')
    expect(await gate(banner({ path: SHOWN, originalPath: 5 }))).toBe('chrome.catalogBanner.originalPath|invalid_value')
    expect(await gate(banner({ path: SHOWN, crop: { ...SITE_CROP, width: 0 } }))).toBe('chrome.catalogBanner.crop|invalid_value')
    expect(await gate(banner({ path: SHOWN, crop: { x: 0, y: 0, width: 5 } }))).toBe('chrome.catalogBanner.crop|invalid_value')
    expect(await gate(banner({ path: SHOWN, crop: { ...SITE_CROP, extra: 1 } }))).toBe('chrome.catalogBanner.crop|invalid_value')
  })

  it('leaves the favicon check as it was', async () => {
    expect(await gate(doc((c) => (c.chrome = { favicon: { path: 'landing/abc.jpg' } })))).toBe('chrome.favicon|invalid_value')
  })

  it('the draft shape check is untouched: chrome only has to be an object', async () => {
    const { rows } = await db.query<{ r: string | null }>('select private.check_site_content_shape($1::jsonb) as r', [JSON.stringify(banner({ path: SHOWN }))])
    expect(rows[0]!.r).toBeNull()
  })
})

describe('chrome.catalogBanner: the public read', () => {
  it('returns the published banner whole, and nothing of a draft', async () => {
    await reset()
    expect((await chrome()) ?? {}).not.toHaveProperty('catalogBanner')
    const withBanner = doc((c) => (c.chrome = { catalogBanner: { path: SHOWN, originalPath: ORIGINAL, crop: SITE_CROP } }))
    expect((await publish(await forceDraft(withBanner))).version).toBeGreaterThan(0)
    expect((await chrome())!.catalogBanner).toEqual({ path: SHOWN, originalPath: ORIGINAL, crop: SITE_CROP })
    // A draft that changes the banner is not public until it is published.
    await forceDraft(doc((c) => (c.chrome = { catalogBanner: { path: 'landing/other-draft.webp' } })))
    expect((await chrome())!.catalogBanner).toEqual({ path: SHOWN, originalPath: ORIGINAL, crop: SITE_CROP })
    // Removing it and publishing again takes it away; the favicon is unaffected.
    expect((await publish(await forceDraft(doc((c) => (c.chrome = { favicon: { path: 'landing/abc.png' } }))))).version).toBeGreaterThan(1)
    const after = (await chrome())!
    expect(after).not.toHaveProperty('catalogBanner')
    expect(after.favicon).toEqual({ path: 'landing/abc.png' })
    await reset()
  })

  it('the rest of the chrome part is unchanged (cards, hero, favicon still returned)', async () => {
    await reset()
    const content = doc((c) => {
      c.landing.hero = { image: { path: SHOWN } }
      c.chrome = { favicon: { path: 'landing/abc.png' }, catalogBanner: { path: SHOWN } }
    })
    await publish(await forceDraft(content))
    const read = (await chrome())!
    expect(read.landingHero).toEqual({ image: { path: SHOWN } })
    expect(read.favicon).toEqual({ path: 'landing/abc.png' })
    expect(read.catalogBanner).toEqual({ path: SHOWN })
    expect(read.landingCollections).toEqual([])
    await reset()
  })
})

describe('the TypeScript validator agrees with the SQL gate', () => {
  const cases: [string, SiteContent][] = [
    ['plain', doc((c) => (c.chrome = { catalogBanner: { path: SHOWN } }))],
    ['cropped', doc((c) => (c.chrome = { catalogBanner: { path: SHOWN, originalPath: ORIGINAL, crop: SITE_CROP } }))],
    ['model file', doc((c) => (c.chrome = { catalogBanner: { path: 'landing/a.glb' } }))],
    ['bad original', doc((c) => (c.chrome = { catalogBanner: { path: SHOWN, originalPath: 'landing/a.glb' } }))],
    ['original not a string', doc((c) => (c.chrome = { catalogBanner: { path: SHOWN, originalPath: 5 } }))],
    ['crop zero width', doc((c) => (c.chrome = { catalogBanner: { path: SHOWN, crop: { ...SITE_CROP, width: 0 } } }))],
    ['crop missing height', doc((c) => (c.chrome = { catalogBanner: { path: SHOWN, crop: { x: 0, y: 0, width: 5 } } }))],
    ['crop extra key', doc((c) => (c.chrome = { catalogBanner: { path: SHOWN, crop: { ...SITE_CROP, extra: 1 } } }))],
    ['not an object', doc((c) => (c.chrome = { catalogBanner: 'landing/a.png' }))],
  ]
  it.each(cases)('%s', async (_name, content) => {
    const sql = await gate(content)
    const ts = validateSiteContent(content)
    if (sql === null) expect(ts).toEqual({})
    else {
      const [path, key] = sql.split('|') as [string, string]
      expect(ts[path], `${sql} against ${JSON.stringify(ts)}`).toBe(key)
    }
  })

  it('normalizing a stored document keeps the banner with its original and crop', () => {
    const kept = normalizeSiteContent(JSON.parse(JSON.stringify(doc((c) => (c.chrome = { catalogBanner: { path: SHOWN, originalPath: ORIGINAL, crop: SITE_CROP } }))))) as SiteContent
    expect(kept.chrome?.catalogBanner).toEqual({ path: SHOWN, originalPath: ORIGINAL, crop: SITE_CROP })
  })
})

describe('rollback', () => {
  it('apply → rollback → re-apply: functions equal their earlier bodies, the columns, grants and bucket limit go and return', async () => {
    const before = await freshDb((n) => n < MIGRATION)
    const rolled = await freshDb()
    try {
      const FNS = ['public.guard_business_admin_fields()', 'private.validate_site_content(jsonb)', 'public.get_published_site_content(text,text)']
      const defs = async (target: PGlite) => {
        const out: string[] = []
        for (const sig of FNS) out.push((await target.query<{ d: string }>(`select pg_get_functiondef($1::regprocedure) as d`, [sig])).rows[0]!.d.replace(/\r\n/g, '\n'))
        return out
      }
      const columns = async (target: PGlite) => (await target.query<{ n: number }>(`select count(*)::int as n from information_schema.columns where table_schema = 'public' and table_name = 'businesses' and column_name like 'banner%'`)).rows[0]!.n
      const limit = async (target: PGlite) => (await target.query<{ l: string }>(`select file_size_limit::text as l from storage.buckets where id = 'business-logos'`)).rows[0]!.l
      const gateOf = async (target: PGlite, content: unknown) => (await target.query<{ r: string | null }>('select private.validate_site_content($1::jsonb) as r', [JSON.stringify(content)])).rows[0]!.r
      const bad = doc((c) => (c.chrome = { catalogBanner: { path: 'landing/a.glb' } }))

      expect(await columns(rolled)).toBe(3)
      expect(await limit(rolled)).toBe('41943040') // 40 MB from this migration; the storage hardening (ADR-0071) keeps it
      expect(await gateOf(rolled, bad)).toBe('chrome.catalogBanner|invalid_value')
      expect(await defs(rolled)).not.toEqual(await defs(before))

      // Data in the columns is lost by the rollback, by design (the file says so); the rest of the row stays.
      await rolled.exec(`insert into public.businesses (id, name, slug, status, banner_url) values ('${BIZ}', 'Casa', 'casa', 'active', '${URL_A}')`)
      await rolled.exec(readFileSync(ROLLBACK_SQL, 'utf8'))
      expect(await defs(rolled)).toEqual(await defs(before))
      expect(await columns(rolled)).toBe(0)
      expect(await limit(rolled)).toBe('2097152')
      expect((await rolled.query(`select name from public.businesses where id = '${BIZ}'`)).rows).toEqual([{ name: 'Casa' }])
      expect(await gateOf(rolled, bad)).toBeNull() // the banner is not looked at again
      expect(await gateOf(rolled, doc((c) => (c.chrome = { favicon: { path: 'landing/abc.jpg' } })))).toBe('chrome.favicon|invalid_value')
      const grants = await rolled.query<{ c: number }>(
        `select count(*)::int as c from information_schema.column_privileges where table_schema = 'public' and table_name = 'businesses' and column_name like 'banner%'`,
      )
      expect(grants.rows[0]!.c).toBe(0)

      await rolled.exec(readFileSync(join(MIGRATIONS, MIGRATION), 'utf8'))
      expect(await columns(rolled)).toBe(3)
      expect(await limit(rolled)).toBe('41943040')
      expect(await gateOf(rolled, bad)).toBe('chrome.catalogBanner|invalid_value')
      expect(await defs(rolled)).not.toEqual(await defs(before))
      const gr = await rolled.query<{ a: boolean; u: boolean }>(
        `select has_column_privilege('anon', 'public.businesses', 'banner_url', 'select') as a, has_column_privilege('authenticated', 'public.businesses', 'banner_url', 'update') as u`,
      )
      expect(gr.rows[0]).toEqual({ a: true, u: true })
      const denied = await rolled.query<{ a: boolean }>(`select has_column_privilege('anon', 'public.businesses', 'banner_original_url', 'select') as a`)
      expect(denied.rows[0]!.a).toBe(false)
    } finally {
      await before.close()
      await rolled.close()
    }
  }, 180_000)
})
