// @vitest-environment node
// Content Editor database (ADR-0043; spec section 5): the 17th permission, the site_content tables and their RPCs, the
// SQL gate private.validate_apply_form, the loosened business_applications columns, and the rollback script. Runs on the
// shared PGlite harness; nothing here touches a live project.
import { randomBytes } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { MIGRATIONS, S4_ROLLBACK_SQL, UP_TO_S4, freshDb, ids, makeHelpers, type Helpers } from './harness'
import { DEFAULT_APPLY_FORM, validateApplyForm, type ApplyFormConfig } from '../functions/_shared/applyForm'
import { RESERVED_PAGE_SLUGS, emptySiteContent, type SiteContent } from '../../src/domain/siteContent'

const SC_MIGRATION = readdirSync(MIGRATIONS).find((n) => n.endsWith('_site_content.sql'))!
const SC_ROLLBACK_SQL = join(__dirname, '..', 'rollback', '20261029_site_content_rollback.sql')
const BEFORE_SC = (n: string) => n < SC_MIGRATION

const id = ids(1)
const OWNER = id(1)
const ADMIN = id(2)
const TEAM = id(3)
const ANON = ''
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T

let db: PGlite
let h: Helpers

beforeAll(async () => {
  db = await freshDb()
  h = makeHelpers(db)
  await db.exec(`
    insert into auth.users (id, email, email_confirmed_at) values
      ('${OWNER}', 'sc-owner@test', now()), ('${ADMIN}', 'sc-admin@test', now()), ('${TEAM}', 'sc-team@test', now());
    insert into public.platform_admins (user_id) values ('${OWNER}');
    insert into public.platform_members (user_id, email, role, status) values
      ('${ADMIN}', 'sc-admin@test', 'admin', 'active'), ('${TEAM}', 'sc-team@test', 'team', 'active');
  `)
}, 60_000)
afterAll(async () => {
  await db?.close()
})

const page = (over: Record<string, unknown> = {}) => ({ id: crypto.randomUUID(), slug: 'about', title: { en: 'About' }, body: { en: 'Hello' }, showInFooter: true, order: 0, ...over })
const doc = (mutate: (c: SiteContent) => void = () => {}): SiteContent => {
  const c = emptySiteContent()
  mutate(c)
  return c
}

/** The draft's current base (opaque string with microseconds). */
async function base(uid = ADMIN): Promise<string> {
  return ((await h.call(uid, 'select public.admin_get_site_content() as r')) as unknown as { draftUpdatedAt: string }).draftUpdatedAt
}
async function save(content: unknown, uid = ADMIN, b?: string): Promise<string> {
  return (await h.call(uid, 'select to_jsonb(public.admin_save_site_content_draft($1::jsonb, $2::timestamptz)) as r', [JSON.stringify(content), b ?? (await base(uid))])) as unknown as string
}
async function publish(uid = ADMIN, b?: string) {
  return (await h.call(uid, 'select public.admin_publish_site_content($1::timestamptz) as r', [b ?? (await base(uid))])) as unknown as { version: number; publishedAt: string }
}
const publicPart = async (part: string, slug: string | null = null) =>
  (await h.call(ANON, 'select public.get_published_site_content($1, $2) as r', [part, slug], null, 'anon')) as unknown as { version: number; content: unknown }
/** Sets the draft directly (as the database owner), bypassing the save function, and returns its base. */
async function forceDraft(content: unknown): Promise<string> {
  const { rows } = await db.query<{ b: string }>(`update public.site_content set draft = $1::jsonb, draft_updated_at = clock_timestamp() returning to_jsonb(draft_updated_at) #>> '{}' as b`, [JSON.stringify(content)])
  return rows[0]!.b
}
async function resetContent() {
  await db.exec(`update public.site_content set draft = '{}', draft_updated_at = clock_timestamp(), published = null, published_version = 0, published_at = null, published_by = null;
                 delete from public.site_content_versions; delete from public.audit_events where event_type like 'site_content_%';`)
}

describe('content.manage', () => {
  it('is in the Owner list and the Admin set; Team does not have it', async () => {
    const access = async (uid: string) => (await h.call(uid, 'select public.my_platform_access() as r')) as unknown as { role: string; permissions: string[] }
    const owner = await access(OWNER)
    expect(owner.permissions).toHaveLength(17)
    expect(owner.permissions).toContain('content.manage')
    expect((await access(ADMIN)).permissions).toContain('content.manage')
    expect((await access(ADMIN)).permissions).toHaveLength(17)
    expect((await access(TEAM)).permissions).not.toContain('content.manage')
  })

  it('the migration backfilled the Admin set with one system audit row; Team is unchanged', async () => {
    const { rows } = await db.query(`select metadata from public.audit_events where event_type = 'access_permissions_changed' and metadata ->> 'reason' = 'content_editor_backfill'`)
    expect(rows).toEqual([{ metadata: { role: 'admin', added: ['content.manage'], removed: [], reason: 'content_editor_backfill' } }])
    expect((await db.query(`select 1 from public.platform_role_permissions where role = 'team' and permission = 'content.manage'`)).rows).toHaveLength(0)
  })

  it('the Owner can give it to Team through admin_set_role_permissions, and it has no prerequisites', async () => {
    const saved = (await db.query<{ p: string }>(`select permission as p from public.platform_role_permissions where role = 'team'`)).rows.map((r) => r.p)
    try {
      const r = (await h.call(OWNER, `select public.admin_set_role_permissions('team', array['content.manage']) as r`)) as unknown as { ok?: boolean; error?: string; added: string[] }
      expect(r).toEqual({ ok: true, added: [] })
      expect(await h.flag(TEAM, `public.platform_can('content.manage')`)).toBe(true)
    } finally {
      await db.query(`delete from public.platform_role_permissions where role = 'team'`)
      for (const p of saved) await db.query(`insert into public.platform_role_permissions (role, permission) values ('team', $1)`, [p])
    }
    expect(await h.flag(TEAM, `public.platform_can('content.manage')`)).toBe(false)
  })

  it('the check constraint refuses an unknown permission key', async () => {
    await expect(db.query(`insert into public.platform_role_permissions (role, permission) values ('team', 'content.publish')`)).rejects.toMatchObject({ code: '23514' })
  })
})

describe('tables and public reads', () => {
  it('anon and authenticated cannot select, insert, update or delete either table', async () => {
    for (const t of ['site_content', 'site_content_versions']) {
      for (const [uid, role, aal] of [[ANON, 'anon', null], [ADMIN, 'authenticated', 'aal1'], [OWNER, 'authenticated', 'aal1']] as const) {
        await expect(h.probe(uid, `select * from public.${t}`, [], aal, role)).rejects.toMatchObject({ code: '42501' })
        await expect(h.probe(uid, `delete from public.${t}`, [], aal, role)).rejects.toMatchObject({ code: '42501' })
      }
    }
    await expect(h.probe(ADMIN, `update public.site_content set draft = '{}'`, [], 'aal1')).rejects.toMatchObject({ code: '42501' })
    // service_role keeps select (the Edge Function reads `published`).
    expect(await h.count('', `select count(*)::int as n from public.site_content`, [], null, 'service_role')).toBe(1)
    await expect(h.probe('', `delete from public.site_content`, [], null, 'service_role')).rejects.toMatchObject({ code: '42501' })
  })

  it('there is exactly one site_content row, and a second cannot be inserted', async () => {
    expect((await db.query(`select 1 from public.site_content`)).rows).toHaveLength(1)
    await expect(db.query(`insert into public.site_content (id) values (false)`)).rejects.toMatchObject({ code: '23514' })
    await expect(db.query(`insert into public.site_content (id) values (true)`)).rejects.toMatchObject({ code: '23505' })
  })

  it('before the first publish every public part is version 0 with null content', async () => {
    await resetContent()
    for (const [part, slug] of [['chrome', null], ['page', 'terms'], ['page', 'privacy'], ['page', 'about'], ['apply', null]] as const) {
      expect(await publicPart(part, slug)).toEqual({ version: 0, content: null })
    }
  })

  it('an unknown part is refused', async () => {
    await expect(h.probe(ANON, `select public.get_published_site_content('draft')`, [], null, 'anon')).rejects.toMatchObject({ message: 'invalid_part' })
  })

  it('anon gets published parts only: chrome, built-in and custom pages, the application form', async () => {
    await resetContent()
    const c = doc((x) => {
      x.builtinPages = { terms: { en: 'New terms', pt: 'Novos termos' } }
      x.customPages = [page({ slug: 'b-page', title: { en: 'Beta' }, order: 2 }), page({ slug: 'a-page', title: { en: 'Alpha', pt: 'Alfa' }, order: 1 }), page({ slug: 'hidden-page', showInFooter: false })]
      x.social = { instagram: 'https://instagram.com/sanctus' }
      x.applyForm.texts = { 'apply.done.title': { en: 'Thanks' } }
    })
    await save(c)
    await publish()
    expect(await publicPart('chrome')).toEqual({
      version: 1,
      content: { footerPages: [{ slug: 'a-page', title: { en: 'Alpha', pt: 'Alfa' } }, { slug: 'b-page', title: { en: 'Beta' } }], social: { instagram: 'https://instagram.com/sanctus' } },
    })
    expect(await publicPart('page', 'terms')).toEqual({ version: 1, content: { kind: 'builtin', body: { en: 'New terms', pt: 'Novos termos' } } })
    expect(await publicPart('page', 'privacy')).toEqual({ version: 1, content: { kind: 'builtin', body: {} } })
    expect(await publicPart('page', 'a-page')).toEqual({ version: 1, content: { kind: 'custom', title: { en: 'Alpha', pt: 'Alfa' }, body: { en: 'Hello' } } })
    expect(await publicPart('page', 'hidden-page')).toMatchObject({ content: { kind: 'custom' } }) // reachable by address, just not linked
    expect(await publicPart('page', 'nope')).toEqual({ version: 1, content: null })
    expect((await publicPart('apply')).content).toMatchObject({ texts: { 'apply.done.title': { en: 'Thanks' } } })
  })

  it('draft never appears in a public answer', async () => {
    const marker = 'DRAFT-ONLY-MARKER'
    const c = doc((x) => {
      x.builtinPages = { terms: { en: marker } }
      x.customPages = [page({ slug: 'secret-page', title: { en: marker } })]
      x.social = { facebook: `https://facebook.com/${marker}` }
      x.applyForm.texts = { 'apply.done.title': { en: marker } }
    })
    await save(c) // saved, not published
    const answers = [await publicPart('chrome'), await publicPart('page', 'terms'), await publicPart('page', 'secret-page'), await publicPart('page', 'privacy'), await publicPart('apply')]
    expect(JSON.stringify(answers)).not.toContain(marker)
    expect(JSON.stringify(answers)).not.toContain('secret-page')
    // And the editor sees the draft and the published copy apart.
    const got = (await h.call(ADMIN, 'select public.admin_get_site_content() as r')) as unknown as { draft: SiteContent; published: SiteContent }
    expect(JSON.stringify(got.draft)).toContain(marker)
    expect(JSON.stringify(got.published)).not.toContain(marker)
  })
})

describe('Editor functions: gates', () => {
  const calls: [string, string, unknown[]][] = [
    ['admin_get_site_content', 'select public.admin_get_site_content() as r', []],
    ['admin_save_site_content_draft', `select public.admin_save_site_content_draft('{"schema":1}'::jsonb, now()) as r`, []],
    ['admin_publish_site_content', 'select public.admin_publish_site_content(now()) as r', []],
    ['admin_list_site_content_versions', 'select count(*) as r from public.admin_list_site_content_versions()', []],
    ['admin_restore_site_content_version', 'select public.admin_restore_site_content_version(1, now()) as r', []],
  ]

  it.each(calls)('%s: Team is forbidden, anon has no access, Admin at aal1 with the staff policy on gets aal2_required', async (_n, sql, params) => {
    await expect(h.probe(TEAM, sql, params)).rejects.toMatchObject({ message: 'forbidden', code: '42501' })
    await expect(h.probe(ANON, sql, params, null, 'anon')).rejects.toMatchObject({ code: '42501' })
    await h.withPolicy(true, false, async () => {
      await expect(h.probe(ADMIN, sql, params, 'aal1')).rejects.toMatchObject({ message: 'aal2_required', code: '42501' })
      await expect(h.probe(TEAM, sql, params, 'aal1')).rejects.toMatchObject({ message: 'aal2_required', code: '42501' })
    })
  })

  it('a member without content.manage is refused even at aal2; the Owner and Admin pass', async () => {
    await expect(h.probe(TEAM, 'select public.admin_get_site_content()', [], 'aal2')).rejects.toMatchObject({ message: 'forbidden' })
    expect((await h.probe(OWNER, 'select public.admin_get_site_content() as r', [], 'aal2')).rows).toHaveLength(1)
    await h.withPolicy(true, false, async () => {
      expect((await h.probe(ADMIN, 'select public.admin_get_site_content() as r', [], 'aal2')).rows).toHaveLength(1)
    })
  })
})

describe('draft, publish, history, restore', () => {
  it('save writes the draft and returns a new base; a stale base is a draft_conflict', async () => {
    await resetContent()
    const b0 = await base()
    const b1 = await save(doc((c) => void (c.social = { instagram: 'https://instagram.com/a' })), ADMIN, b0)
    expect(b1).not.toBe(b0)
    await expect(h.probe(ADMIN, 'select public.admin_save_site_content_draft($1::jsonb, $2::timestamptz)', [JSON.stringify(doc()), b0])).rejects.toMatchObject({ message: 'draft_conflict' })
    await expect(h.probe(ADMIN, 'select public.admin_save_site_content_draft($1::jsonb, null)', [JSON.stringify(doc())])).rejects.toMatchObject({ message: 'draft_conflict' })
    expect(((await h.call(ADMIN, 'select public.admin_get_site_content() as r')) as unknown as { draft: SiteContent }).draft.social).toEqual({ instagram: 'https://instagram.com/a' })
    const stale = await base()
    await save(doc(), OWNER) // someone else saves first
    await expect(h.probe(ADMIN, 'select public.admin_publish_site_content($1::timestamptz)', [stale])).rejects.toMatchObject({ message: 'draft_conflict' })
    await expect(h.probe(ADMIN, 'select public.admin_restore_site_content_version(1, $1::timestamptz)', [stale])).rejects.toMatchObject({ message: 'draft_conflict' })
  })

  it('save refuses what is not a document: not an object, schema other than 1, over 512 KB, over the array caps', async () => {
    const attempt = async (content: unknown, detail: string) => {
      await expect(h.probe(ADMIN, 'select public.admin_save_site_content_draft($1::jsonb, $2::timestamptz)', [JSON.stringify(content), await base()])).rejects.toMatchObject({ message: 'invalid_content', code: '22023', detail })
    }
    await attempt([1], 'document|invalid_value')
    await attempt({ schema: 2 }, 'schema|invalid_value')
    await attempt({ schema: 1, customPages: 'x' }, 'customPages|invalid_value')
    await attempt(doc((c) => void (c.builtinPages = { terms: { en: 'x'.repeat(524_288) } })), 'document|too_long')
    await attempt(doc((c) => void (c.customPages = Array.from({ length: 21 }, (_, i) => page({ slug: `p-${i}` })) as never)), 'customPages|too_many')
    await attempt(doc((c) => void c.applyForm.customQuestions.push(...(Array.from({ length: 11 }, (_, i) => ({ id: `q${i}`, type: 'short_text', label: { en: 'q' } })) as never))), 'applyForm.customQuestions|too_many')
    await attempt(doc((c) => void c.applyForm.steps.push(...(Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, title: { en: 's' } })) as never))), 'applyForm.steps|too_many')
  })

  it('a document just under 512 KB is saved', async () => {
    await save(doc((c) => void (c.builtinPages = { terms: { en: 'x'.repeat(500_000) } })))
    await save(doc())
  })

  it('publish: version 1, history row, audit row, name taken; publishing again makes version 2', async () => {
    await resetContent()
    await save(doc((c) => void (c.builtinPages = { terms: { en: 'v1' } })))
    const r1 = await publish()
    expect(r1.version).toBe(1)
    await save(doc((c) => void (c.builtinPages = { terms: { en: 'v2' } })))
    const r2 = await publish(OWNER)
    expect(r2.version).toBe(2)
    const versions = (await h.call(ADMIN, `select jsonb_agg(to_jsonb(v) order by v.version desc) as r from public.admin_list_site_content_versions() v`)) as unknown as { version: number; published_by_name: string }[]
    expect(versions.map((v) => v.version)).toEqual([2, 1])
    expect(versions.every((v) => typeof v.published_by_name === 'string' && v.published_by_name.length > 0)).toBe(true)
    const audit = (await db.query(`select actor_id, metadata from public.audit_events where event_type = 'site_content_published' order by created_at`)).rows
    expect(audit).toMatchObject([{ actor_id: ADMIN, metadata: { version: 1 } }, { actor_id: OWNER, metadata: { version: 2 } }])
    const got = (await h.call(ADMIN, 'select public.admin_get_site_content() as r')) as unknown as { version: number; published: SiteContent; publishedByName: string }
    expect(got.version).toBe(2)
    expect(got.published.builtinPages.terms?.en).toBe('v2')
    expect(got.publishedByName).toBeTruthy()
    expect((await publicPart('page', 'terms')).content).toEqual({ kind: 'builtin', body: { en: 'v2' } })
  })

  it('publish is atomic: a failing validation leaves published, the version and the history unchanged', async () => {
    const before = (await db.query(`select published, published_version from public.site_content`)).rows[0]
    const historyBefore = (await db.query(`select count(*)::int as n from public.site_content_versions`)).rows[0]
    const auditBefore = (await db.query(`select count(*)::int as n from public.audit_events where event_type = 'site_content_published'`)).rows[0]
    const b = await forceDraft(doc((c) => void (c.customPages = [page({ slug: 'terms' })])))
    await expect(h.probe(ADMIN, 'select public.admin_publish_site_content($1::timestamptz)', [b])).rejects.toMatchObject({ message: 'invalid_content', code: '22023', detail: 'customPages.0.slug|slug_reserved' })
    await expect(h.call(ADMIN, 'select public.admin_publish_site_content($1::timestamptz) as r', [b])).rejects.toMatchObject({ message: 'invalid_content' })
    expect((await db.query(`select published, published_version from public.site_content`)).rows[0]).toEqual(before)
    expect((await db.query(`select count(*)::int as n from public.site_content_versions`)).rows[0]).toEqual(historyBefore)
    expect((await db.query(`select count(*)::int as n from public.audit_events where event_type = 'site_content_published'`)).rows[0]).toEqual(auditBefore)
  })

  it('restore copies a version into the draft, does not touch published, and writes an audit row', async () => {
    const publishedBefore = (await db.query(`select published, published_version from public.site_content`)).rows[0]
    const newBase = await h.call(ADMIN, `select to_jsonb(public.admin_restore_site_content_version(1, $1::timestamptz)) as r`, [await base()])
    expect(typeof newBase).toBe('string')
    const got = (await h.call(ADMIN, 'select public.admin_get_site_content() as r')) as unknown as { draft: SiteContent; draftUpdatedAt: string }
    expect(got.draft.builtinPages.terms?.en).toBe('v1')
    expect(got.draftUpdatedAt).toBe(newBase)
    expect((await db.query(`select published, published_version from public.site_content`)).rows[0]).toEqual(publishedBefore)
    expect((await db.query(`select metadata from public.audit_events where event_type = 'site_content_draft_restored'`)).rows).toMatchObject([{ metadata: { version: 1 } }])
    await expect(h.probe(ADMIN, 'select public.admin_restore_site_content_version(99, $1::timestamptz)', [await base()])).rejects.toMatchObject({ message: 'version_not_found' })
  })

  it('history is newest first and capped at 100', async () => {
    await resetContent()
    await db.exec(`insert into public.site_content_versions (version, content, published_by_name)
                   select g, '{"schema":1}', 'Someone' from generate_series(1, 120) g`)
    const list = (await h.call(ADMIN, `select jsonb_agg(v.version order by v.version desc) as r from public.admin_list_site_content_versions() v`)) as unknown as number[]
    expect(list).toHaveLength(100)
    expect(list[0]).toBe(120)
    expect(list[99]).toBe(21)
    await resetContent()
  })
})

describe('publish validation (slugs, social, size)', () => {
  const refuses = async (content: unknown, detail: string) => {
    const b = await forceDraft(content)
    await expect(h.probe(ADMIN, 'select public.admin_publish_site_content($1::timestamptz)', [b])).rejects.toMatchObject({ message: 'invalid_content', detail })
  }

  it('each reserved slug is refused (the SQL list equals RESERVED_PAGE_SLUGS)', async () => {
    expect(RESERVED_PAGE_SLUGS).toHaveLength(12)
    for (const slug of RESERVED_PAGE_SLUGS) await refuses(doc((c) => void (c.customPages = [page({ slug })] as never)), 'customPages.0.slug|slug_reserved')
  })

  it('a duplicate, bad, too long or empty slug is refused', async () => {
    await refuses(doc((c) => void (c.customPages = [page(), page()] as never)), 'customPages.1.slug|slug_duplicate')
    await refuses(doc((c) => void (c.customPages = [page({ slug: 'Bad Slug' })] as never)), 'customPages.0.slug|invalid_slug')
    await refuses(doc((c) => void (c.customPages = [page({ slug: '-lead' })] as never)), 'customPages.0.slug|invalid_slug')
    await refuses(doc((c) => void (c.customPages = [page({ slug: 'a'.repeat(61) })] as never)), 'customPages.0.slug|too_long')
    await refuses(doc((c) => void (c.customPages = [page({ slug: '' })] as never)), 'customPages.0.slug|required')
  })

  it('20 pages publish; a social value that does not start with https:// is refused', async () => {
    await refuses(doc((c) => void (c.social = { instagram: 'http://instagram.com/x' })), 'social.instagram|invalid_url')
    await refuses(doc((c) => void (c.social = { instagram: 'instagram.com/x' })), 'social.instagram|invalid_url')
    const b = await forceDraft(doc((c) => void (c.customPages = Array.from({ length: 20 }, (_, i) => page({ slug: `page-${i}` })) as never)))
    expect((await publish(ADMIN, b)).version).toBeGreaterThan(0)
    await resetContent()
  })

  it('a form problem is reported with the applyForm. prefix', async () => {
    await refuses(doc((c) => void (c.applyForm.fields[0]!.hidden = true)), 'applyForm.fields.0.hidden|locked')
  })
})

describe('private.validate_apply_form', () => {
  const sql = async (form: unknown) => (await db.query<{ r: string | null }>(`select private.validate_apply_form($1::jsonb) as r`, [JSON.stringify(form)])).rows[0]!.r
  const form = (mutate: (f: ApplyFormConfig) => void = () => {}): ApplyFormConfig => {
    const f = clone(DEFAULT_APPLY_FORM)
    mutate(f)
    return f
  }
  const q = (idv: string, extra: Record<string, unknown> = {}) => ({ id: idv, type: 'short_text', label: { en: `Q ${idv}` }, ...extra })
  const opts = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `o${i}`, label: { en: `O${i}` } }))
  const place = (f: ApplyFormConfig, ...qids: string[]) => void f.fields.push(...qids.map((x) => ({ key: `custom:${x}` as const, stepId: 'catalogue' })))

  it('accepts the default form, and a form with questions, hidden fields and hidden options', async () => {
    expect(await sql(form())).toBeNull()
    expect(
      await sql(form((f) => {
        f.customQuestions = [q('a', { type: 'multi_choice', options: opts(10) }), q('b', { type: 'yes_no' })] as never
        place(f, 'a', 'b')
        f.fields = f.fields.map((x) => (x.key === 'applicantPhone' ? { ...x, hidden: true } : x))
        f.hiddenOptions = { category: ['other'], photoReadiness: ['all', 'some'] }
        f.texts = { 'apply.done.title': { en: 'Thanks', pt: 'Obrigado' } }
        f.steps.splice(1, 0, { id: 'extra', title: { en: 'Extra' } })
      })),
    ).toBeNull()
  })

  const bad: [string, (f: ApplyFormConfig) => void, string][] = [
    ['no steps', (f) => void (f.steps = []), 'steps|required'],
    ['9 steps', (f) => void f.steps.splice(1, 0, ...(Array.from({ length: 4 }, (_, i) => ({ id: `s${i}`, title: { en: 's' } })) as never)), 'steps|too_many'],
    ['duplicate step ids', (f) => void f.steps.splice(1, 0, { id: 'business', title: { en: 'x' } }), 'steps.1.id|duplicate_id'],
    ['Review not last', (f) => void f.steps.reverse(), 'steps|review_position'],
    ['two Review steps', (f) => void f.steps.splice(1, 0, { id: 'r2', builtin: 'review' }), 'steps|review_position'],
    ['no Review step', (f) => void f.steps.pop(), 'steps|review_position'],
    ['a new step without an English title', (f) => void f.steps.splice(1, 0, { id: 'n1' }), 'steps.1.title.en|required'],
    ['11 questions', (f) => { f.customQuestions = Array.from({ length: 11 }, (_, i) => q(`q${i}`)) as never; place(f, ...f.customQuestions.map((x) => x.id)) }, 'customQuestions|too_many'],
    ['duplicate question ids', (f) => { f.customQuestions = [q('a'), q('a')] as never; place(f, 'a') }, 'customQuestions.1.id|duplicate_id'],
    ['unknown question type', (f) => { f.customQuestions = [q('a', { type: 'file_upload' })] as never; place(f, 'a') }, 'customQuestions.0.type|invalid_value'],
    ['single choice with 1 option', (f) => { f.customQuestions = [q('a', { type: 'single_choice', options: opts(1) })] as never; place(f, 'a') }, 'customQuestions.0.options|options_count'],
    ['multi choice with 11 options', (f) => { f.customQuestions = [q('a', { type: 'multi_choice', options: opts(11) })] as never; place(f, 'a') }, 'customQuestions.0.options|options_count'],
    ['options on a text question', (f) => { f.customQuestions = [q('a', { options: opts(2) })] as never; place(f, 'a') }, 'customQuestions.0.options|options_not_allowed'],
    ['a question without a placement', (f) => void (f.customQuestions = [q('a')] as never), 'customQuestions.0|missing_placement'],
    ['an unknown field key', (f) => void f.fields.push({ key: 'custom:ghost', stepId: 'business' }), 'fields.15.key|unknown_key'],
    ['a repeated field key', (f) => void f.fields.push({ key: 'city', stepId: 'business' }), 'fields.15.key|duplicate_key'],
    ['a field on an unknown step', (f) => void (f.fields[0]!.stepId = 'nope'), 'fields.0.stepId|step_unknown'],
    ['a field on Review', (f) => void (f.fields[0]!.stepId = 'review'), 'fields.0.stepId|review_misplaced'],
    ['a hidden locked field', (f) => void (f.fields.find((x) => x.key === 'applicantEmail')!.hidden = true), 'fields.8.hidden|locked'],
    ['an optional locked field', (f) => void (f.fields.find((x) => x.key === 'applicantName')!.required = false), 'fields.6.required|locked'],
    ['every option of a choice field hidden', (f) => void (f.hiddenOptions = { modelReadiness: ['glb_usdz', 'some', 'none', 'need_help'] }), 'hiddenOptions.modelReadiness|last_option'],
    ['a hidden option value outside the set', (f) => void (f.hiddenOptions = { productCount: ['1-10', 'lots'] }), 'hiddenOptions.productCount|invalid_value'],
    ['hidden options on a field without options', (f) => void (f.hiddenOptions = { website: ['x'] } as never), 'hiddenOptions.website|invalid_value'],
    ['a text key outside apply.*', (f) => void (f.texts = { 'other.key': { en: 'x' } }), 'texts.other.key|unknown_key'],
    ['a text over 600 characters', (f) => void (f.texts = { 'apply.done.title': { pt: 'x'.repeat(601) } }), 'texts.apply.done.title.pt|too_long'],
  ]
  it.each(bad)('refuses %s', async (_name, mutate, expected) => {
    expect(await sql(form(mutate))).toBe(expected)
  })

  it('agrees with validateApplyForm on six shared fixtures', async () => {
    const fixtures: ApplyFormConfig[] = [
      form(),
      form((f) => {
        f.customQuestions = [q('a', { type: 'single_choice', options: opts(3) })] as never
        place(f, 'a')
      }),
      form((f) => void (f.fields[0]!.hidden = true)),
      form((f) => void f.steps.reverse()),
      form((f) => void f.steps.splice(1, 0, ...(Array.from({ length: 4 }, (_, i) => ({ id: `s${i}`, title: { en: 's' } })) as never))),
      form((f) => void (f.hiddenOptions = { photoReadiness: ['all', 'some', 'none'] })),
    ]
    const verdicts = await Promise.all(fixtures.map(async (f) => [(await sql(f)) === null, Object.keys(validateApplyForm(f)).length === 0] as const))
    expect(verdicts).toEqual([[true, true], [true, true], [false, false], [false, false], [false, false], [false, false]])
    // And every refusing case above is refused by the TypeScript twin too.
    for (const [name, mutate] of bad) expect(Object.keys(validateApplyForm(form(mutate))).length, name).toBeGreaterThan(0)
  })

  it('is not executable by the API roles', async () => {
    await expect(h.probe(ADMIN, `select private.validate_apply_form('{}'::jsonb)`)).rejects.toMatchObject({ code: '42501' })
  })
})

describe('business_applications', () => {
  it('country, city and category may be null; their length checks still hold for a value', async () => {
    await db.query(
      `insert into public.business_applications (business_name, applicant_name, applicant_email, submission_key) values ('Acme', 'Ana', 'ana@acme.test', gen_random_uuid())`,
    )
    await expect(
      db.query(`insert into public.business_applications (business_name, applicant_name, applicant_email, country, submission_key) values ('Acme', 'Ana', 'ana@acme.test', 'X', gen_random_uuid())`),
    ).rejects.toMatchObject({ code: '23514' })
    // Unchanged: the locked columns and language stay required.
    await expect(db.query(`insert into public.business_applications (applicant_name, applicant_email, submission_key) values ('Ana', 'ana@acme.test', gen_random_uuid())`)).rejects.toMatchObject({ code: '23502' })
    const { rows } = await db.query<{ column_name: string; is_nullable: string }>(
      `select column_name, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'business_applications' and column_name in ('country','city','category','language','business_name','applicant_name','applicant_email')`,
    )
    expect(Object.fromEntries(rows.map((r) => [r.column_name, r.is_nullable]))).toEqual({
      country: 'YES', city: 'YES', category: 'YES', language: 'NO', business_name: 'NO', applicant_name: 'NO', applicant_email: 'NO',
    })
  })

  it('the worst-case answers (10 questions, 10 chosen options each, both languages, about 27 KB) are accepted; 66 KB is refused', async () => {
    const label = (n: number) => ({ en: 'e'.repeat(n), pt: 'p'.repeat(n) })
    const custom = Array.from({ length: 10 }, (_, i) => ({
      id: `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
      type: 'multi_choice',
      label: label(200),
      value: Array.from({ length: 10 }, (_, j) => `00000000-0000-0000-1111-${String(i * 10 + j).padStart(12, '0')}`),
      valueLabels: Array.from({ length: 10 }, () => label(80)),
    }))
    const answers = { description: 'd'.repeat(1000), notes: 'n'.repeat(1000), custom, formVersion: 3 }
    const size = JSON.stringify(answers).length
    expect(size).toBeGreaterThan(20_000)
    expect(size).toBeLessThan(40_000)
    await db.query(`insert into public.business_applications (business_name, applicant_name, applicant_email, submission_key, answers) values ('Big', 'Ana', 'big@acme.test', gen_random_uuid(), $1::jsonb)`, [JSON.stringify(answers)])
    await expect(
      db.query(`insert into public.business_applications (business_name, applicant_name, applicant_email, submission_key, answers) values ('Huge', 'Ana', 'huge@acme.test', gen_random_uuid(), $1::jsonb)`, [JSON.stringify({ description: 'x'.repeat(66_000) })]),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('admin_review_application approves an application with no description, country, city or category', async () => {
    const APP = id(40)
    await db.query(
      `insert into public.business_applications (id, business_name, applicant_name, applicant_email, submission_key, status, answers)
       values ($1, 'No Details Co', 'Ana', 'nodetails@acme.test', gen_random_uuid(), 'submitted', '{"formVersion":1}')`,
      [APP],
    )
    const r = (await h.call(OWNER, 'select to_jsonb(public.admin_review_application($1, $2)) as r', [APP, 'approve'])) as unknown as { status: string; business_id: string }
    expect(r.status).toBe('approved')
    expect((await db.query(`select name, description from public.businesses where id = $1`, [r.business_id])).rows).toEqual([{ name: 'No Details Co', description: '' }])
  })
})

describe('rollback', () => {
  const defs = async (target: PGlite) => {
    const fn = async (sig: string) => (await target.query<{ d: string }>(`select pg_get_functiondef($1::regprocedure) as d`, [sig])).rows[0]!.d.replace(/\r\n/g, '\n')
    return {
      access: await fn('public.my_platform_access()'),
      roles: await fn('public.admin_set_role_permissions(public.platform_role, text[])'),
      check: (await target.query(`select pg_get_constraintdef(oid) as d from pg_constraint where conrelid = 'public.platform_role_permissions'::regclass and contype = 'c' order by 1`)).rows,
      answers: (await target.query(`select pg_get_constraintdef(oid) as d from pg_constraint where conrelid = 'public.business_applications'::regclass and conname = 'business_applications_answers_check'`)).rows,
      nullable: (await target.query(`select column_name, is_nullable from information_schema.columns where table_schema = 'public' and table_name = 'business_applications' order by 1`)).rows,
    }
  }
  const GONE = [
    'public.site_content', 'public.site_content_versions',
    'public.get_published_site_content(text,text)', 'public.admin_get_site_content()', 'public.admin_save_site_content_draft(jsonb,timestamptz)',
    'public.admin_publish_site_content(timestamptz)', 'public.admin_list_site_content_versions()', 'public.admin_restore_site_content_version(integer,timestamptz)',
    'private.require_content_manage()', 'private.validate_apply_form(jsonb)', 'private.validate_site_content(jsonb)', 'private.check_site_content_shape(jsonb)', 'private.content_actor_name(uuid)',
  ]

  it('apply → rollback → re-apply: every added object is gone, S4 definitions are restored, content.manage leaves the role sets with an audit row, null columns are filled', async () => {
    const before = await freshDb(BEFORE_SC)
    const rolled = await freshDb()
    try {
      const pre = await defs(before)
      await rolled.exec(`insert into public.business_applications (business_name, applicant_name, applicant_email, submission_key) values ('Acme', 'Ana', 'ana@acme.test', gen_random_uuid())`)
      await rolled.exec(readFileSync(SC_ROLLBACK_SQL, 'utf8'))
      for (const name of GONE) {
        const fn = name.includes('(')
        const { rows } = await rolled.query<{ o: string | null }>(`select ${fn ? 'to_regprocedure' : 'to_regclass'}($1)::text as o`, [name])
        expect({ name, o: rows[0]!.o }).toEqual({ name, o: null })
      }
      expect(await defs(rolled)).toEqual(pre)
      expect((await rolled.query(`select 1 from public.platform_role_permissions where role = 'admin'`)).rows).toHaveLength(16)
      expect((await rolled.query(`select metadata from public.audit_events where metadata ->> 'reason' = 'content_editor_rollback'`)).rows)
        .toEqual([{ metadata: { role: 'admin', added: [], removed: ['content.manage'], reason: 'content_editor_rollback' } }])
      expect((await rolled.query(`select country, city, category from public.business_applications`)).rows).toEqual([{ country: 'Not given', city: 'Not given', category: 'Not given' }])
      await rolled.exec(readFileSync(join(MIGRATIONS, SC_MIGRATION), 'utf8'))
      expect((await rolled.query(`select to_regclass('public.site_content')::text as o`)).rows[0]).toEqual({ o: 'site_content' })
    } finally {
      await before.close()
      await rolled.close()
    }
  }, 120_000)

  it('stops with application_answers_too_large and changes nothing when an application has more than 16 KB of answers', async () => {
    const rolled = await freshDb()
    try {
      await rolled.query(`insert into public.business_applications (business_name, applicant_name, applicant_email, submission_key, answers) values ('Big', 'Ana', 'big@acme.test', gen_random_uuid(), $1::jsonb)`, [JSON.stringify({ description: randomBytes(24_000).toString('base64') })])
      await expect(rolled.exec(readFileSync(SC_ROLLBACK_SQL, 'utf8'))).rejects.toMatchObject({ message: 'application_answers_too_large' })
      await rolled.exec('rollback') // the script's own transaction is left open and aborted, as in psql
      expect((await rolled.query(`select to_regclass('public.site_content')::text as o`)).rows[0]).toEqual({ o: 'site_content' })
    } finally {
      await rolled.close()
    }
  }, 120_000)

  it('chains with the S4 rollback: this one first, then S4', async () => {
    const rolled = await freshDb()
    try {
      await rolled.exec(readFileSync(SC_ROLLBACK_SQL, 'utf8'))
      expect(UP_TO_S4(SC_MIGRATION)).toBe(false)
      await rolled.exec(readFileSync(S4_ROLLBACK_SQL, 'utf8'))
    } finally {
      await rolled.close()
    }
  }, 120_000)
})
