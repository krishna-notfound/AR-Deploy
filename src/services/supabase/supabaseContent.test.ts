import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it, vi } from 'vitest'
import { emptySiteContent } from '@/domain/siteContent'
import { createSupabaseContent, mapContentError } from './supabaseContent'

type Answer = { data?: unknown; error?: unknown }

/** supabase-js stand-in: `rpc` records its calls and answers from `answers[fn]`. */
function fake(answers: Record<string, Answer> = {}) {
  const calls: [string, unknown][] = []
  const rpc = vi.fn(async (fn: string, args?: unknown) => {
    calls.push([fn, args])
    return { data: null, error: null, ...(answers[fn] ?? {}) }
  })
  return { sb: { rpc } as unknown as SupabaseClient, calls, rpc }
}
const pgError = (code: string, message: string, details: string | null = null) => ({ code, message, details })
const draft = emptySiteContent()

describe('supabase content service: one rpc per method', () => {
  it('public reads call get_published_site_content with the part, and treat null content as nothing published', async () => {
    const f = fake({ get_published_site_content: { data: { version: 0, content: null } } })
    const svc = createSupabaseContent(f.sb)
    expect(await svc.getPublishedChrome()).toEqual({ ok: true, data: { version: 0, footerPages: [], social: {} } })
    expect(await svc.getPublishedPage('terms')).toEqual({ ok: true, data: null })
    expect(await svc.getPublishedPage('privacy')).toEqual({ ok: true, data: null })
    expect(await svc.getPublishedPage('about')).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })
    expect(await svc.getPublishedApplyForm()).toEqual({ ok: true, data: null })
    expect(f.calls).toEqual([
      ['get_published_site_content', { p_part: 'chrome' }],
      ['get_published_site_content', { p_part: 'page', p_slug: 'terms' }],
      ['get_published_site_content', { p_part: 'page', p_slug: 'privacy' }],
      ['get_published_site_content', { p_part: 'page', p_slug: 'about' }],
      ['get_published_site_content', { p_part: 'apply' }],
    ])
  })

  it('maps the published answers', async () => {
    const chrome = { version: 3, content: { footerPages: [{ slug: 'about', title: { en: 'About', pt: 'Sobre' } }, { bad: 1 }], social: { instagram: 'https://instagram.com/x', myspace: 'x' } } }
    const svc = createSupabaseContent(fake({ get_published_site_content: { data: chrome } }).sb)
    expect(await svc.getPublishedChrome()).toEqual({
      ok: true,
      data: { version: 3, footerPages: [{ slug: 'about', title: { en: 'About', pt: 'Sobre' } }], social: { instagram: 'https://instagram.com/x' } },
    })

    const builtin = createSupabaseContent(fake({ get_published_site_content: { data: { version: 2, content: { kind: 'builtin', body: { pt: 'Termos' } } } } }).sb)
    expect(await builtin.getPublishedPage('terms')).toEqual({ ok: true, data: { kind: 'builtin', body: { pt: 'Termos' } } })
    const emptyBody = createSupabaseContent(fake({ get_published_site_content: { data: { version: 2, content: { kind: 'builtin', body: {} } } } }).sb)
    expect(await emptyBody.getPublishedPage('privacy')).toEqual({ ok: true, data: null })

    const custom = createSupabaseContent(fake({ get_published_site_content: { data: { version: 2, content: { kind: 'custom', title: { en: 'About' }, body: { en: 'Hi', pt: 'Olá' } } } } }).sb)
    expect(await custom.getPublishedPage('about')).toEqual({ ok: true, data: { kind: 'custom', title: { en: 'About' }, body: { en: 'Hi', pt: 'Olá' } } })

    const apply = createSupabaseContent(
      fake({ get_published_site_content: { data: { version: 4, content: { texts: { 'apply.done.title': { en: 'Thanks' } }, steps: [{ id: 'review', builtin: 'review' }] } } } }).sb,
    )
    expect(await apply.getPublishedApplyForm()).toMatchObject({
      ok: true,
      data: { version: 4, config: { texts: { 'apply.done.title': { en: 'Thanks' } }, steps: [{ id: 'review', builtin: 'review' }], fields: [], customQuestions: [] } },
    })
  })

  it('editor calls: argument names, base passed through untouched, results mapped', async () => {
    const base = '2026-10-29T07:46:48.123456+00:00'
    const f = fake({
      admin_get_site_content: { data: { draft: { schema: 1, junk: 1 }, draftUpdatedAt: base, published: null, version: 0, publishedAt: null, publishedByName: null } },
      admin_save_site_content_draft: { data: '2026-10-29T07:50:00.000001+00:00' },
      admin_publish_site_content: { data: { version: 1, publishedAt: '2026-10-29T07:51:00+00:00' } },
      admin_list_site_content_versions: { data: [{ version: 2, published_at: 'b', published_by_name: 'Ana' }, { version: 1, published_at: 'a', published_by_name: 'Rui' }] },
      admin_restore_site_content_version: { data: '2026-10-29T07:52:00+00:00' },
    })
    const svc = createSupabaseContent(f.sb)
    const got = await svc.getContentDraft()
    expect(got).toMatchObject({ ok: true, data: { draftUpdatedAt: base, version: 0, published: null, publishedAt: null, publishedByName: null } })
    expect(got.ok && got.data.draft).toEqual(emptySiteContent())
    expect(await svc.saveContentDraft(draft, base)).toEqual({ ok: true, data: { draftUpdatedAt: '2026-10-29T07:50:00.000001+00:00' } })
    expect(await svc.publishContent(base)).toEqual({ ok: true, data: { version: 1, publishedAt: '2026-10-29T07:51:00+00:00' } })
    expect(await svc.listContentVersions()).toEqual({
      ok: true,
      data: [{ version: 2, publishedAt: 'b', publishedByName: 'Ana' }, { version: 1, publishedAt: 'a', publishedByName: 'Rui' }],
    })
    expect(await svc.restoreContentVersion(1, base)).toEqual({ ok: true, data: { draftUpdatedAt: '2026-10-29T07:52:00+00:00' } })
    expect(f.calls).toEqual([
      ['admin_get_site_content', undefined],
      ['admin_save_site_content_draft', { p_content: draft, p_base: base }],
      ['admin_publish_site_content', { p_base: base }],
      ['admin_list_site_content_versions', undefined],
      ['admin_restore_site_content_version', { p_version: 1, p_base: base }],
    ])
  })

  it('a thrown network error is an UNKNOWN failure, not a crash, and never demo data', async () => {
    const sb = {
      rpc: vi.fn(async () => {
        throw new Error('offline')
      }),
    } as unknown as SupabaseClient
    expect(await createSupabaseContent(sb).getPublishedChrome()).toMatchObject({ ok: false, error: { code: 'UNKNOWN' } })
  })

  it('an answer of the wrong shape is an UNKNOWN failure', async () => {
    const svc = createSupabaseContent(fake({ admin_get_site_content: { data: 'nope' }, admin_save_site_content_draft: { data: 5 } }).sb)
    expect(await svc.getContentDraft()).toMatchObject({ ok: false, error: { code: 'UNKNOWN' } })
    expect(await svc.saveContentDraft(draft, 'x')).toMatchObject({ ok: false, error: { code: 'UNKNOWN' } })
  })

  it('a database error is mapped, whichever method hit it', async () => {
    const svc = createSupabaseContent(fake({ admin_publish_site_content: { error: pgError('P0001', 'draft_conflict') }, get_published_site_content: { error: pgError('PGRST202', 'no function') } }).sb)
    expect(await svc.publishContent('x')).toMatchObject({ ok: false, error: { code: 'CONFLICT', reason: 'draft_conflict' } })
    expect(await svc.getPublishedChrome()).toMatchObject({ ok: false, error: { code: 'UNKNOWN', reason: 'not_enabled' } })
  })
})

describe('error mapping (spec 7)', () => {
  it('aal2_required and forbidden (42501) are PERMISSION with that reason', () => {
    expect(mapContentError(pgError('42501', 'aal2_required'))).toMatchObject({ ok: false, error: { code: 'PERMISSION', reason: 'aal2_required' } })
    expect(mapContentError(pgError('42501', 'forbidden'))).toMatchObject({ ok: false, error: { code: 'PERMISSION', reason: 'forbidden' } })
    expect(mapContentError(pgError('42501', 'permission denied for table site_content'))).toMatchObject({ error: { code: 'PERMISSION', reason: 'forbidden' } })
  })

  it('draft_conflict is CONFLICT with reason draft_conflict', () => {
    expect(mapContentError(pgError('P0001', 'draft_conflict'))).toMatchObject({ ok: false, error: { code: 'CONFLICT', reason: 'draft_conflict' } })
  })

  it('invalid_content is VALIDATION with the field error from the detail', () => {
    expect(mapContentError(pgError('22023', 'invalid_content', 'customPages.0.slug|slug_reserved'))).toMatchObject({
      ok: false,
      error: { code: 'VALIDATION', fieldErrors: { 'customPages.0.slug': 'slug_reserved' } },
    })
    expect(mapContentError(pgError('22023', 'invalid_content', null))).toMatchObject({ error: { code: 'VALIDATION' } })
  })

  it('version_not_found is NOT_FOUND; a missing function is UNKNOWN not_enabled; the rest is UNKNOWN', () => {
    expect(mapContentError(pgError('P0001', 'version_not_found'))).toMatchObject({ error: { code: 'NOT_FOUND' } })
    for (const code of ['PGRST202', '42883', '42P01']) expect(mapContentError(pgError(code, 'x'))).toMatchObject({ error: { code: 'UNKNOWN', reason: 'not_enabled' } })
    expect(mapContentError(pgError('XX000', 'boom'))).toMatchObject({ error: { code: 'UNKNOWN' } })
  })
})
