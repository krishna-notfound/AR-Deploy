// @vitest-environment node
// Homepage sections, QR section and About pictures (ADR-0061): landing.sections, landing.qr and landing.about in the draft shape check,
// the publish gate and the public read ('chrome' returns landingSections, landingQr and landingAbout), the text whitelist against the
// TypeScript one, the TypeScript validator against the SQL gate, and the rollback script. Runs on the shared PGlite harness; nothing here
// touches a live project.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MIGRATIONS, freshDb, ids, makeHelpers, type Helpers } from './harness'
import { LANDING_EDITABLE_KEYS, LANDING_LEGACY_TEXT_LIMITS, LANDING_TEXT_LIMITS, emptySiteContent, validateSiteContent, type SiteContent } from '../../src/domain/siteContent'

const MIGRATION = readdirSync(MIGRATIONS).find((n) => n.endsWith('_landing_sections.sql'))!
const ROLLBACK_SQL = join(__dirname, '..', 'rollback', '20261111_landing_sections_rollback.sql')

const id = ids(1)
const ADMIN = id(61)
const ANON = ''

let db: PGlite
let h: Helpers

beforeAll(async () => {
  db = await freshDb()
  h = makeHelpers(db)
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values ('${ADMIN}', 'sections-admin@test', now());
    insert into public.platform_members (user_id, email, role, status) values ('${ADMIN}', 'sections-admin@test', 'admin', 'active');
  `)
}, 60_000)
afterAll(async () => {
  await db?.close()
})

const IMG = { path: 'landing/0a1b2c3d-1111-4222-8333-444455556666.webp', alt: { en: 'A sofa', pt: 'Um sofá' } }
const doc = (patch: (c: Record<string, any>) => void): SiteContent => {
  const c = emptySiteContent() as unknown as Record<string, any>
  patch(c)
  return c as SiteContent
}
const sections = (list: unknown[]) => doc((c) => (c.landing.sections = list))
const text = (idv: string, over: Record<string, unknown> = {}) => ({ kind: 'text', id: idv, title: { en: 'Hello' }, ...over })
const BUILTIN_IDS = ['qr', 'how', 'experience', 'collections', 'about', 'partners']
const builtins = () => BUILTIN_IDS.map((i) => ({ kind: 'builtin', id: i }))

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
/** The first error the SQL gate gives a document, or null when it publishes. */
async function gate(content: unknown): Promise<string | null> {
  const { rows } = await db.query<{ r: string | null }>('select private.validate_site_content($1::jsonb) as r', [JSON.stringify(content)])
  return rows[0]!.r
}
const chrome = async () => ((await h.call(ANON, `select public.get_published_site_content('chrome', null) as r`, [], null, 'anon')) as unknown as { content: Record<string, unknown> | null }).content
const reset = () =>
  db.exec(`update public.site_content set draft = '{}', draft_updated_at = clock_timestamp(), published = null, published_version = 0, published_at = null, published_by = null;
           delete from public.site_content_versions; delete from public.audit_events where event_type like 'site_content_%';`)

describe('the whitelist', () => {
  it('private.landing_text_limits() has exactly the keys and limits of LANDING_TEXT_LIMITS, with the QR keys and the legacy hero body', async () => {
    const { rows } = await db.query<{ l: Record<string, number> }>('select private.landing_text_limits() as l')
    expect(rows[0]!.l).toEqual({ ...LANDING_TEXT_LIMITS })
    expect(Object.keys(rows[0]!.l).sort()).toEqual([...LANDING_EDITABLE_KEYS, ...Object.keys(LANDING_LEGACY_TEXT_LIMITS)].sort())
    expect(rows[0]!.l).toMatchObject({ 'landing.qr.eyebrow': 60, 'landing.qr.title': 200, 'landing.qr.body': 600, 'landing.hero.body': 600 })
  })

  it('the new helpers are not callable by the API roles', async () => {
    for (const sig of ['private.check_lang_text(jsonb,text,integer,boolean)', 'private.check_site_image(jsonb,text,boolean)', 'private.check_section_button(jsonb,text)', 'private.check_landing_layout(jsonb)']) {
      const { rows } = await db.query<{ a: boolean; n: boolean }>(`select has_function_privilege('anon', $1, 'execute') as a, has_function_privilege('authenticated', $1, 'execute') as n`, [sig])
      expect(rows[0], sig).toEqual({ a: false, n: false })
    }
  })

  it('keeps the grants of the replaced functions: the public read for the API roles, the gate for none', async () => {
    const { rows } = await db.query<{ a: boolean; n: boolean; s: boolean }>(
      `select has_function_privilege('anon', 'public.get_published_site_content(text,text)', 'execute') as a, has_function_privilege('anon', 'private.validate_site_content(jsonb)', 'execute') as n, has_function_privilege('authenticated', 'private.check_site_content_shape(jsonb)', 'execute') as s`,
    )
    expect(rows[0]).toEqual({ a: true, n: false, s: false })
  })
})

describe('draft save (shape check)', () => {
  it('refuses sections that are not an array or are over 16, and qr and about that are not objects; valid ones save', async () => {
    await reset()
    const save = async (c: SiteContent) => h.probe(ADMIN, 'select public.admin_save_site_content_draft($1::jsonb, $2::timestamptz)', [JSON.stringify(c), await baseOf()])
    for (const bad of ['nope', 5, { a: 1 }, null, true])
      await expect(save(doc((c) => (c.landing.sections = bad)))).rejects.toMatchObject({ message: 'invalid_content', detail: 'landing.sections|invalid_value' })
    await expect(save(sections(Array.from({ length: 17 }, (_, i) => text(`s-${i}`))))).rejects.toMatchObject({ message: 'invalid_content', detail: 'landing.sections|too_many' })
    for (const bad of ['nope', 5, [1], null, true]) {
      await expect(save(doc((c) => (c.landing.qr = bad)))).rejects.toMatchObject({ message: 'invalid_content', detail: 'landing.qr|invalid_value' })
      await expect(save(doc((c) => (c.landing.about = bad)))).rejects.toMatchObject({ message: 'invalid_content', detail: 'landing.about|invalid_value' })
    }
    // A draft may be incomplete: an empty title or picture saves (publishing is what refuses it).
    await h.call(ADMIN, 'select to_jsonb(public.admin_save_site_content_draft($1::jsonb, $2::timestamptz)) as r', [JSON.stringify(doc((c) => ((c.landing.sections = [{ kind: 'text', id: 'a', title: { en: '' } }]), (c.landing.qr = {}), (c.landing.about = {})))), await baseOf()])
    await reset()
  })
})

describe('publish gate: sections', () => {
  it('publishes the six built-ins in any order with hidden flags, plus an own section of each design; nothing saved still publishes', async () => {
    await reset()
    expect((await publish(await forceDraft(emptySiteContent()))).version).toBeGreaterThan(0)
    const list = [
      { kind: 'builtin', id: 'about', hidden: true },
      ...builtins().filter((s) => s.id !== 'about'),
      text('intro', { anchor: 'welcome', eyebrow: { en: 'E' }, subtitle: { en: 'S' }, body: { en: 'B' }, button: { label: { en: 'Go', pt: 'Ir' }, href: 'https://example.com/x' } }),
      { kind: 'imageText', id: 'story', title: { en: 'T' }, image: IMG, imageSide: 'right', button: { label: { en: 'Go' }, href: '/apply' } },
      { kind: 'banner', id: 'wide', image: IMG },
    ]
    expect((await publish(await forceDraft(sections(list)))).version).toBeGreaterThan(1)
    expect(await chrome()).toMatchObject({ landingSections: list })
    await reset()
  })

  it('refuses unknown or repeated built-ins, bad ids, bad anchors and the wrong count, with the path and the key', async () => {
    await reset()
    await refuses(sections([{ kind: 'builtin', id: 'nope' }]), 'landing.sections.0.id|invalid_value')
    await refuses(sections([{ kind: 'builtin', id: 'qr' }, { kind: 'builtin', id: 'qr' }]), 'landing.sections.1.id|duplicate_id')
    await refuses(sections([{ kind: 'mystery', id: 'x' }]), 'landing.sections.0.kind|invalid_value')
    await refuses(sections(['x']), 'landing.sections.0|invalid_value')
    await refuses(sections([{ kind: 'builtin', id: 'qr', hidden: 'yes' }]), 'landing.sections.0.hidden|invalid_value')
    await refuses(sections([text('')]), 'landing.sections.0.id|required')
    await refuses(sections([text('Not A Slug')]), 'landing.sections.0.id|invalid_slug')
    await refuses(sections([text('a'.repeat(61))]), 'landing.sections.0.id|too_long')
    await refuses(sections([text('how')]), 'landing.sections.0.id|slug_reserved')
    await refuses(sections([text('same'), text('same')]), 'landing.sections.1.id|duplicate_id')
    await refuses(sections([text('a', { anchor: 'Bad Anchor' })]), 'landing.sections.0.anchor|invalid_slug')
    await refuses(sections([text('a', { anchor: 'sobre' })]), 'landing.sections.0.anchor|slug_reserved')
    await refuses(sections([text('a', { anchor: 'x' }), text('b', { anchor: 'x' })]), 'landing.sections.1.anchor|slug_duplicate')
    await refuses(sections([...builtins(), ...Array.from({ length: 11 }, (_, i) => text(`own-${i}`))]), 'landing.sections|too_many')
    expect((await publish(await forceDraft(sections([...builtins(), ...Array.from({ length: 10 }, (_, i) => text(`own-${i}`))])))).version).toBeGreaterThan(0)
    await reset()
  })

  it('holds every text to its limit: the limit passes, one more is refused; the title needs English except in a banner', async () => {
    await reset()
    const limits: [string, number, string][] = [['eyebrow', 60, 'text'], ['title', 200, 'text'], ['subtitle', 200, 'text'], ['body', 1200, 'text']]
    for (const [field, max, kind] of limits) {
      for (const lang of ['en', 'pt']) {
        await refuses(sections([{ ...text('a'), kind, [field]: { en: 'T', [lang]: 'x'.repeat(max + 1) } }]), `landing.sections.0.${field}.${lang}|too_long`)
      }
      expect((await publish(await forceDraft(sections([{ ...text('a'), [field]: { en: 'x'.repeat(max), pt: 'y'.repeat(max) } }])))).version).toBeGreaterThan(0)
    }
    await refuses(sections([text('a', { title: { en: '  ' } })]), 'landing.sections.0.title.en|required')
    await refuses(sections([text('a', { title: { pt: 'Olá' } })]), 'landing.sections.0.title.en|required')
    await refuses(sections([{ kind: 'imageText', id: 'a', title: { en: '' }, image: IMG, imageSide: 'left' }]), 'landing.sections.0.title.en|required')
    await refuses(sections([text('a', { body: 'text' })]), 'landing.sections.0.body|invalid_value')
    await refuses(sections([text('a', { body: { en: 7 } })]), 'landing.sections.0.body.en|invalid_value')
    expect((await publish(await forceDraft(sections([{ kind: 'banner', id: 'a', image: IMG }])))).version).toBeGreaterThan(0)
    await reset()
  })

  it('checks the picture of a picture design (an uploaded image, alt up to 120) and the side of picture and text', async () => {
    await reset()
    const banner = (image: unknown) => sections([{ kind: 'banner', id: 'a', image }])
    await refuses(sections([{ kind: 'banner', id: 'a' }]), 'landing.sections.0.image|required')
    await refuses(banner({ path: '', alt: { en: '' } }), 'landing.sections.0.image|required')
    for (const bad of ['landing/a.glb', 'https://x.test/a.png', 'a.png', 'landing/A.png', 7]) await refuses(banner({ path: bad }), 'landing.sections.0.image|invalid_value')
    await refuses(banner('landing/a.png'), 'landing.sections.0.image|invalid_value')
    await refuses(banner({ path: IMG.path, alt: { en: 'x'.repeat(121) } }), 'landing.sections.0.image.alt.en|too_long')
    await refuses(banner({ path: IMG.path, alt: { en: '', pt: 'y'.repeat(121) } }), 'landing.sections.0.image.alt.pt|too_long')
    await refuses(sections([{ kind: 'imageText', id: 'a', title: { en: 'T' }, image: IMG, imageSide: 'up' }]), 'landing.sections.0.imageSide|invalid_value')
    expect((await publish(await forceDraft(banner({ path: IMG.path, alt: { en: 'x'.repeat(120) } })))).version).toBeGreaterThan(0)
    await reset()
  })

  it('checks the button: a label (40), a site path or an https address (300), no spaces', async () => {
    await reset()
    const withButton = (button: unknown) => sections([text('a', { button })])
    await refuses(withButton({ label: { en: 'x'.repeat(41) }, href: '/' }), 'landing.sections.0.button.label.en|too_long')
    await refuses(withButton({ label: { en: '' }, href: '/' }), 'landing.sections.0.button.label.en|required')
    await refuses(withButton({ href: '/' }), 'landing.sections.0.button.label.en|required')
    await refuses(withButton({ label: { en: 'Go' } }), 'landing.sections.0.button.href|required')
    await refuses(withButton({ label: { en: 'Go' }, href: '' }), 'landing.sections.0.button.href|required')
    await refuses(withButton({ label: { en: 'Go' }, href: 5 }), 'landing.sections.0.button.href|invalid_value')
    await refuses(withButton({ label: { en: 'Go' }, href: `/${'a'.repeat(300)}` }), 'landing.sections.0.button.href|too_long')
    for (const bad of ['apply', '//evil.test', 'http://x.test', 'javascript:alert(1)', 'mailto:a@b.c', 'data:text/html,x', '/a b', 'https://', 'https://a b', ' /a'])
      await refuses(withButton({ label: { en: 'Go' }, href: bad }), 'landing.sections.0.button.href|invalid_link')
    await refuses(withButton('go'), 'landing.sections.0.button|invalid_value')
    for (const good of ['/', '/apply', '/#sobre', '/catalog/x?y=1', 'https://example.com', 'https://example.com/a?b=c#d', `/${'a'.repeat(299)}`])
      expect((await publish(await forceDraft(withButton({ label: { en: 'Go' }, href: good })))).version).toBeGreaterThan(0)
    await reset()
  })
})

describe('publish gate: qr and about', () => {
  it('qr: a side of left, right or none and an optional uploaded picture; about: optional uploaded pictures; both are returned by the public read', async () => {
    await reset()
    const withBoth = doc((c) => ((c.landing.qr = { image: IMG, imageSide: 'right' }), (c.landing.about = { image: IMG, detail: { path: 'landing/aaaa-bbbb.png', alt: { en: '' } } })))
    expect((await publish(await forceDraft(withBoth))).version).toBeGreaterThan(0)
    expect(await chrome()).toMatchObject({ landingQr: { image: IMG, imageSide: 'right' }, landingAbout: { image: IMG, detail: { path: 'landing/aaaa-bbbb.png' } } })
    await refuses(doc((c) => (c.landing.qr = { imageSide: 'top' })), 'landing.qr.imageSide|invalid_value')
    await refuses(doc((c) => (c.landing.qr = { imageSide: 5 })), 'landing.qr.imageSide|invalid_value')
    await refuses(doc((c) => (c.landing.qr = { image: { path: 'landing/a.glb' }, imageSide: 'left' })), 'landing.qr.image|invalid_value')
    await refuses(doc((c) => (c.landing.qr = { image: { path: IMG.path, alt: { en: 'x'.repeat(121) } }, imageSide: 'left' })), 'landing.qr.image.alt.en|too_long')
    await refuses(doc((c) => (c.landing.about = { image: { path: 'x.png' } })), 'landing.about.image|invalid_value')
    await refuses(doc((c) => (c.landing.about = { detail: { path: IMG.path, alt: { pt: 'z'.repeat(121) } } })), 'landing.about.detail.alt.pt|too_long')
    await refuses(doc((c) => (c.landing.about = { detail: 'landing/a.png' })), 'landing.about.detail|invalid_value')
    expect((await publish(await forceDraft(doc((c) => (c.landing.qr = { imageSide: 'none' }))))).version).toBeGreaterThan(0)
    await reset()
  })

  it('the QR texts are editable keys with their limits', async () => {
    await reset()
    for (const [key, max] of [['landing.qr.eyebrow', 60], ['landing.qr.title', 200], ['landing.qr.body', 600]] as const) {
      await refuses(doc((c) => (c.landing.texts = { [key]: { en: 'x'.repeat(max + 1) } })), `landing.texts.${key}.en|too_long`)
      expect((await publish(await forceDraft(doc((c) => (c.landing.texts = { [key]: { en: 'x'.repeat(max), pt: 'y'.repeat(max) } }))))).version).toBeGreaterThan(0)
    }
    await reset()
  })

  it('an older document with landing.hero.body still publishes and is returned', async () => {
    await reset()
    expect((await publish(await forceDraft(doc((c) => (c.landing.texts = { 'landing.hero.body': { en: 'Old hero text' } }))))).version).toBeGreaterThan(0)
    expect(await chrome()).toMatchObject({ landingTexts: { 'landing.hero.body': { en: 'Old hero text' } } })
    await reset()
  })
})

describe('the checks of earlier migrations still apply', () => {
  it('keeps the collection card rules, including the managed-category slug rule, and the texts and favicon rules', async () => {
    const card = (link: unknown) => doc((c) => (c.landing.collections = [{ id: 'c1', slug: 'sofas', title: { en: 'Sofas' }, image: 'sofa-travertine', link, products: [] }]))
    expect(await gate(card({ kind: 'catalog', businessSlug: 'acme', category: 'lounge-chairs' }))).toBeNull() // a managed category is any slug
    expect(await gate(card({ kind: 'catalog', businessSlug: 'acme', category: 'Bad Slug' }))).toBe('landing.collections.0.link.category|invalid_value')
    expect(await gate(doc((c) => (c.landing.texts = { 'landing.nope': { en: 'x' } })))).toBe('landing.texts.landing.nope|unknown_key')
    expect(await gate(doc((c) => (c.chrome = { favicon: { path: 'landing/abc.jpg' } })))).toBe('chrome.favicon|invalid_value')
    expect(await gate(doc((c) => (c.customPages = [{ slug: 'admin', title: { en: 'x' }, body: { en: 'x' } }])))).toBe('customPages.0.slug|slug_reserved')
  })

  it('the public read drops sections of a wrong type and never returns the draft', async () => {
    await reset()
    expect((await publish(await forceDraft(emptySiteContent())))).toBeTruthy()
    await forceDraft(doc((c) => ((c.landing.sections = [text('draft-only')]), (c.landing.qr = { imageSide: 'left' }))))
    const live = await chrome()
    expect(live).not.toHaveProperty('landingSections')
    expect(live).not.toHaveProperty('landingQr')
    expect(live).not.toHaveProperty('landingAbout')
    await db.exec(`update public.site_content set published = jsonb_set(published, '{landing}', '{"sections":"bad","qr":[1],"about":5}'::jsonb)`)
    const bad = await chrome()
    expect(bad).not.toHaveProperty('landingSections')
    expect(bad).not.toHaveProperty('landingQr')
    expect(bad).not.toHaveProperty('landingAbout')
    await reset()
  })
})

describe('the TypeScript validator agrees with the SQL gate', () => {
  const cases: [string, SiteContent][] = [
    ['valid mix', sections([...builtins(), text('a', { anchor: 'x', button: { label: { en: 'Go' }, href: '/apply' } }), { kind: 'imageText', id: 'b', title: { en: 'T' }, image: IMG, imageSide: 'left' }, { kind: 'banner', id: 'c', image: IMG }])],
    ['unknown built-in', sections([{ kind: 'builtin', id: 'nope' }])],
    ['duplicate built-in', sections([{ kind: 'builtin', id: 'how' }, { kind: 'builtin', id: 'how' }])],
    ['reserved id', sections([text('about')])],
    ['bad slug id', sections([text('Bad_Id')])],
    ['duplicate id', sections([text('a'), text('a')])],
    ['reserved anchor', sections([text('a', { anchor: 'experiencia' })])],
    ['duplicate anchor', sections([text('a', { anchor: 'x' }), text('b', { anchor: 'x' })])],
    ['long eyebrow', sections([text('a', { eyebrow: { en: 'x'.repeat(61) } })])],
    ['long body', sections([text('a', { body: { pt: 'x'.repeat(1201) } })])],
    ['no title', sections([text('a', { title: { en: '' } })])],
    ['banner without title', sections([{ kind: 'banner', id: 'a', image: IMG }])],
    ['banner without picture', sections([{ kind: 'banner', id: 'a', image: { path: '', alt: { en: '' } } }])],
    ['bad picture type', sections([{ kind: 'banner', id: 'a', image: { path: 'landing/a.glb', alt: { en: '' } } }])],
    ['long alt', sections([{ kind: 'banner', id: 'a', image: { path: IMG.path, alt: { en: 'x'.repeat(121) } } }])],
    ['bad side', sections([{ kind: 'imageText', id: 'a', title: { en: 'T' }, image: IMG, imageSide: 'top' }])],
    ['javascript link', sections([text('a', { button: { label: { en: 'Go' }, href: 'javascript:alert(1)' } })])],
    ['protocol-relative link', sections([text('a', { button: { label: { en: 'Go' }, href: '//evil.test' } })])],
    ['link with space', sections([text('a', { button: { label: { en: 'Go' }, href: '/a b' } })])],
    ['long label', sections([text('a', { button: { label: { en: 'x'.repeat(41) }, href: '/' } })])],
    ['no label', sections([text('a', { button: { label: { en: '' }, href: '/' } })])],
    ['too many own', sections([...builtins(), ...Array.from({ length: 11 }, (_, i) => text(`o-${i}`))])],
    ['qr ok', doc((c) => (c.landing.qr = { image: IMG, imageSide: 'left' }))],
    ['qr bad side', doc((c) => (c.landing.qr = { imageSide: 'top' }))],
    ['qr bad picture', doc((c) => (c.landing.qr = { image: { path: 'x.png', alt: { en: '' } }, imageSide: 'left' }))],
    ['about ok', doc((c) => (c.landing.about = { image: IMG, detail: IMG }))],
    ['about bad picture', doc((c) => (c.landing.about = { detail: { path: 'landing/a.mp4', alt: { en: '' } } }))],
    ['about long alt', doc((c) => (c.landing.about = { image: { path: IMG.path, alt: { pt: 'x'.repeat(121) } } }))],
  ]
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
  it('both accept and refuse the same documents (the TypeScript side finds an error exactly when the SQL gate does)', async () => {
    for (const [name, content] of cases) expect((await gate(content)) === null, name).toBe(Object.keys(validateSiteContent(content)).length === 0)
  })
})

describe('rollback', () => {
  it('apply → rollback → re-apply: the three functions are back to their round2 bodies, grants kept, the helpers dropped and returned', async () => {
    const before = await freshDb((n) => n < MIGRATION)
    const rolled = await freshDb()
    try {
      const defs = async (target: PGlite) => {
        const out: string[] = []
        for (const sig of ['private.landing_text_limits()', 'private.check_site_content_shape(jsonb)', 'private.validate_site_content(jsonb)', 'public.get_published_site_content(text,text)'])
          out.push((await target.query<{ d: string }>(`select pg_get_functiondef($1::regprocedure) as d`, [sig])).rows[0]!.d.replace(/\r\n/g, '\n'))
        return out
      }
      const shape = (target: PGlite) => target.query<{ r: string | null }>(`select private.check_site_content_shape('{"schema":1,"landing":{"sections":"x"}}'::jsonb) as r`)
      const helper = (target: PGlite) => target.query<{ f: string | null }>(`select to_regprocedure('private.check_landing_layout(jsonb)')::text as f`)
      expect((await shape(rolled)).rows[0]!.r).toBe('landing.sections|invalid_value')
      expect((await helper(rolled)).rows[0]!.f).not.toBeNull()
      expect(await defs(rolled)).not.toEqual(await defs(before))

      await rolled.exec(readFileSync(ROLLBACK_SQL, 'utf8'))
      expect(await defs(rolled)).toEqual(await defs(before))
      expect((await shape(rolled)).rows[0]!.r).toBeNull()
      expect((await helper(rolled)).rows[0]!.f).toBeNull()
      for (const sig of ['private.check_lang_text(jsonb,text,integer,boolean)', 'private.check_site_image(jsonb,text,boolean)', 'private.check_section_button(jsonb,text)'])
        expect((await rolled.query<{ f: string | null }>(`select to_regprocedure($1)::text as f`, [sig])).rows[0]!.f, sig).toBeNull()
      const grants = await rolled.query<{ a: boolean; n: boolean; s: boolean }>(
        `select has_function_privilege('anon', 'public.get_published_site_content(text,text)', 'execute') as a, has_function_privilege('anon', 'private.validate_site_content(jsonb)', 'execute') as n, has_function_privilege('authenticated', 'private.check_site_content_shape(jsonb)', 'execute') as s`,
      )
      expect(grants.rows[0]).toEqual({ a: true, n: false, s: false })
      // After the rollback an old document still validates (the earlier checks are intact) and a landing.sections value is ignored.
      const ok = await rolled.query<{ r: string | null }>(`select private.validate_site_content('{"schema":1,"landing":{"sections":"x","collections":[]}}'::jsonb) as r`)
      expect(ok.rows[0]!.r).toBeNull()

      await rolled.exec(readFileSync(join(MIGRATIONS, MIGRATION), 'utf8'))
      expect((await shape(rolled)).rows[0]!.r).toBe('landing.sections|invalid_value')
      expect((await helper(rolled)).rows[0]!.f).not.toBeNull()
      expect(await defs(rolled)).not.toEqual(await defs(before))
      const grants2 = await rolled.query<{ a: boolean; n: boolean; l: boolean }>(
        `select has_function_privilege('anon', 'public.get_published_site_content(text,text)', 'execute') as a, has_function_privilege('anon', 'private.validate_site_content(jsonb)', 'execute') as n, has_function_privilege('authenticated', 'private.check_landing_layout(jsonb)', 'execute') as l`,
      )
      expect(grants2.rows[0]).toEqual({ a: true, n: false, l: false })
    } finally {
      await before.close()
      await rolled.close()
    }
  }, 120_000)
})
