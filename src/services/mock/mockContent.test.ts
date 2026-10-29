import { beforeEach, describe, expect, it } from 'vitest'
import { emptySiteContent, type SiteContent } from '@/domain/siteContent'
import type { Result } from '../catalogService'
import { mockContentService as svc } from './mockContent'
import { mockCatalogService } from './mockCatalogService'
import { store } from './store'

const ACCOUNT_KEY = 'arfurn:account'
const asStaff = (platformRole: 'owner' | 'admin' | 'team') => localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'super_admin', platformRole }))
const asOwner = (businessId: string) => localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ role: 'business_admin', businessId }))

function data<T>(r: Result<T>): T {
  if (!r.ok) throw new Error(`${r.error.code}: ${r.error.message}`)
  return r.data
}
const err = <T>(r: Result<T>) => (r.ok ? null : r.error)
const doc = (mutate: (c: SiteContent) => void = () => {}): SiteContent => {
  const c = emptySiteContent()
  mutate(c)
  return c
}
const page = (slug: string, over: Record<string, unknown> = {}) => ({ id: crypto.randomUUID(), slug, title: { en: slug.toUpperCase() }, body: { en: `Body of ${slug}` }, showInFooter: true, order: 0, ...over })

beforeEach(async () => {
  localStorage.clear()
  asStaff('admin')
  await mockCatalogService.resetDemoData()
})

describe('mock content service', () => {
  it('starts with nothing published (version 0) and an empty draft; every public read is empty', async () => {
    const s = data(await svc.getContentDraft())
    expect(s).toMatchObject({ version: 0, published: null, publishedAt: null, publishedByName: null })
    expect(s.draft).toEqual(emptySiteContent())
    expect(data(await svc.getPublishedChrome())).toEqual({ version: 0, footerPages: [], social: {} })
    expect(data(await svc.getPublishedPage('terms'))).toBeNull()
    expect(data(await svc.getPublishedPage('privacy'))).toBeNull()
    expect(err(await svc.getPublishedPage('about'))?.code).toBe('NOT_FOUND')
    expect(data(await svc.getPublishedApplyForm())).toBeNull()
    expect(data(await svc.listContentVersions())).toEqual([])
  })

  it('save → conflict on a stale base → publish → version 1 and history → restore loads into the draft and leaves published → reset clears', async () => {
    const s0 = data(await svc.getContentDraft())
    const v1doc = doc((c) => void (c.builtinPages = { terms: { en: 'Terms v1' } }))
    const saved = data(await svc.saveContentDraft(v1doc, s0.draftUpdatedAt))
    expect(saved.draftUpdatedAt).not.toBe(s0.draftUpdatedAt)

    // A stale base (someone else saved first) is a conflict, and nothing is overwritten.
    const stale = await svc.saveContentDraft(doc(), s0.draftUpdatedAt)
    expect(err(stale)).toMatchObject({ code: 'CONFLICT', reason: 'draft_conflict' })
    expect(data(await svc.getContentDraft()).draft.builtinPages).toEqual({ terms: { en: 'Terms v1' } })
    expect(err(await svc.publishContent(s0.draftUpdatedAt))).toMatchObject({ code: 'CONFLICT', reason: 'draft_conflict' })

    // Not published yet: the public still sees nothing.
    expect(data(await svc.getPublishedPage('terms'))).toBeNull()

    const pub = data(await svc.publishContent(saved.draftUpdatedAt))
    expect(pub.version).toBe(1)
    const after = data(await svc.getContentDraft())
    expect(after).toMatchObject({ version: 1, publishedByName: expect.any(String) })
    expect(after.published?.builtinPages.terms?.en).toBe('Terms v1')
    expect(data(await svc.getPublishedPage('terms'))).toEqual({ kind: 'builtin', body: { en: 'Terms v1' } })
    expect(data(await svc.listContentVersions()).map((v) => v.version)).toEqual([1])

    // Edit and publish version 2, then restore version 1 into the draft.
    const v2 = data(await svc.saveContentDraft(doc((c) => void (c.builtinPages = { terms: { en: 'Terms v2' } })), after.draftUpdatedAt))
    data(await svc.publishContent(v2.draftUpdatedAt))
    expect(data(await svc.listContentVersions()).map((v) => v.version)).toEqual([2, 1])
    const cur = data(await svc.getContentDraft())
    const restored = data(await svc.restoreContentVersion(1, cur.draftUpdatedAt))
    const state = data(await svc.getContentDraft())
    expect(state.draftUpdatedAt).toBe(restored.draftUpdatedAt)
    expect(state.draft.builtinPages.terms?.en).toBe('Terms v1')
    expect(state.published?.builtinPages.terms?.en).toBe('Terms v2')
    expect(state.version).toBe(2)
    expect(data(await svc.getPublishedPage('terms'))).toEqual({ kind: 'builtin', body: { en: 'Terms v2' } })
    expect(err(await svc.restoreContentVersion(99, state.draftUpdatedAt))?.code).toBe('NOT_FOUND')

    // "Reset demo data" clears the content slice too.
    data(await mockCatalogService.resetDemoData())
    const fresh = data(await svc.getContentDraft())
    expect(fresh).toMatchObject({ version: 0, published: null })
    expect(fresh.draft).toEqual(emptySiteContent())
    expect(data(await svc.listContentVersions())).toEqual([])
  })

  it('publish refuses an invalid draft with field errors by document path, and changes nothing', async () => {
    const s = data(await svc.getContentDraft())
    const bad = doc((c) => void (c.customPages = [page('terms'), page('ok'), page('ok')]))
    const saved = data(await svc.saveContentDraft(bad, s.draftUpdatedAt)) // a draft may be incomplete
    const r = await svc.publishContent(saved.draftUpdatedAt)
    expect(err(r)).toMatchObject({ code: 'VALIDATION', fieldErrors: { 'customPages.0.slug': 'slug_reserved', 'customPages.2.slug': 'slug_duplicate' } })
    expect(data(await svc.getContentDraft())).toMatchObject({ version: 0, published: null })
    expect(data(await svc.listContentVersions())).toEqual([])
  })

  it('save refuses a document that is not a document (wrong schema, over 512 KB, too many pages)', async () => {
    const s = data(await svc.getContentDraft())
    expect(err(await svc.saveContentDraft({ ...doc(), schema: 2 as never }, s.draftUpdatedAt))).toMatchObject({ code: 'VALIDATION', fieldErrors: { schema: 'invalid_value' } })
    const big = doc((c) => void (c.builtinPages = { terms: { en: 'x'.repeat(524_288) } }))
    expect(err(await svc.saveContentDraft(big, s.draftUpdatedAt))).toMatchObject({ code: 'VALIDATION', fieldErrors: { document: 'too_long' } })
    const many = doc((c) => void (c.customPages = Array.from({ length: 21 }, (_, i) => page(`p-${i}`))))
    expect(err(await svc.saveContentDraft(many, s.draftUpdatedAt))).toMatchObject({ code: 'VALIDATION', fieldErrors: { customPages: 'too_many' } })
  })

  it('public reads: chrome lists footer pages in order with social links; custom pages by slug; the apply form; never the draft', async () => {
    const s = data(await svc.getContentDraft())
    const c = doc((x) => {
      x.customPages = [page('b-page', { order: 2 }), page('a-page', { order: 1, title: { en: 'Alpha', pt: 'Alfa' } }), page('quiet', { showInFooter: false })]
      x.social = { instagram: 'https://instagram.com/sanctus' }
      x.applyForm.texts = { 'apply.done.title': { en: 'Thanks' } }
    })
    const saved = data(await svc.saveContentDraft(c, s.draftUpdatedAt))
    expect(data(await svc.getPublishedChrome())).toEqual({ version: 0, footerPages: [], social: {} })
    data(await svc.publishContent(saved.draftUpdatedAt))
    // A later unpublished edit must not leak.
    const d = data(await svc.getContentDraft())
    data(await svc.saveContentDraft(doc((x) => void (x.customPages = [page('secret')])), d.draftUpdatedAt))

    expect(data(await svc.getPublishedChrome())).toEqual({
      version: 1,
      footerPages: [{ slug: 'a-page', title: { en: 'Alpha', pt: 'Alfa' } }, { slug: 'b-page', title: { en: 'B-PAGE' } }],
      social: { instagram: 'https://instagram.com/sanctus' },
    })
    expect(data(await svc.getPublishedPage('a-page'))).toEqual({ kind: 'custom', title: { en: 'Alpha', pt: 'Alfa' }, body: { en: 'Body of a-page' } })
    expect(data(await svc.getPublishedPage('quiet'))).toMatchObject({ kind: 'custom' })
    expect(err(await svc.getPublishedPage('secret'))?.code).toBe('NOT_FOUND')
    expect(data(await svc.getPublishedPage('terms'))).toBeNull() // published, but no override: use the built-in text
    const apply = data(await svc.getPublishedApplyForm())!
    expect(apply.version).toBe(1)
    expect(apply.config.texts['apply.done.title']).toEqual({ en: 'Thanks' })
  })

  it('the editor calls need content.manage: Team, a business owner and nobody are refused; Admin and Owner pass; public reads need no one', async () => {
    const refused = async () => {
      const s = await svc.getContentDraft()
      expect(err(s)).toMatchObject({ code: 'PERMISSION', reason: 'forbidden' })
      expect(err(await svc.saveContentDraft(doc(), new Date().toISOString()))?.code).toBe('PERMISSION')
      expect(err(await svc.publishContent(new Date().toISOString()))?.code).toBe('PERMISSION')
      expect(err(await svc.listContentVersions())?.code).toBe('PERMISSION')
      expect(err(await svc.restoreContentVersion(1, new Date().toISOString()))?.code).toBe('PERMISSION')
      expect((await svc.getPublishedChrome()).ok).toBe(true)
    }
    asStaff('team')
    await refused()
    asOwner('biz_oak')
    await refused()
    localStorage.clear()
    await refused()
    asStaff('admin')
    expect((await svc.getContentDraft()).ok).toBe(true)
    asStaff('owner')
    expect((await svc.getContentDraft()).ok).toBe(true)
    // Team with the permission granted by the Owner passes.
    store.update((db) => void (db.team!.rolePermissions.team = [...db.team!.rolePermissions.team, 'content.manage']))
    asStaff('team')
    expect((await svc.getContentDraft()).ok).toBe(true)
  })

  it('what the service hands out is a copy: changing it does not change the stored draft', async () => {
    const s = data(await svc.getContentDraft())
    s.draft.social.instagram = 'https://instagram.com/mutated'
    expect(data(await svc.getContentDraft()).draft.social).toEqual({})
    const input = doc((c) => void (c.social = { facebook: 'https://facebook.com/x' }))
    const saved = data(await svc.saveContentDraft(input, s.draftUpdatedAt))
    input.social.facebook = 'https://facebook.com/changed'
    expect(data(await svc.getContentDraft()).draft.social).toEqual({ facebook: 'https://facebook.com/x' })
    expect(saved.draftUpdatedAt).toBeTruthy()
  })
})
