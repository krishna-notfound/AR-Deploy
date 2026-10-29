import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { emptySiteContent } from '@/domain/siteContent'
import { SiteContentSourceContext, useContentDraft, usePublishedApplyForm, usePublishedChrome, usePublishedPage } from './contentHooks'
import { content, unavailableContent } from './index'
import { mockCatalogService } from './mock/mockCatalogService'
import { mockContentService } from './mock/mockContent'

const draftSource = ({ children }: { children: ReactNode }) => <SiteContentSourceContext.Provider value="draft">{children}</SiteContentSourceContext.Provider>

const page = (slug: string, over: Record<string, unknown> = {}) => ({ id: crypto.randomUUID(), slug, title: { en: slug }, body: { en: `Body ${slug}` }, showInFooter: true, order: 0, ...over })

/** Saves a document as the draft, and optionally publishes it. */
async function put(doc: ReturnType<typeof emptySiteContent>, publish: boolean) {
  const s = await content.getContentDraft()
  if (!s.ok) throw new Error(s.error.message)
  const saved = await content.saveContentDraft(doc, s.data.draftUpdatedAt)
  if (!saved.ok) throw new Error(saved.error.message)
  if (publish) {
    const p = await content.publishContent(saved.data.draftUpdatedAt)
    if (!p.ok) throw new Error(p.error.message)
  }
}

beforeEach(async () => {
  localStorage.clear()
  localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin', platformRole: 'admin' }))
  await mockCatalogService.resetDemoData()
})

describe('content service wiring', () => {
  it('demo mode uses the in-memory harness', () => {
    expect(content).toBe(mockContentService)
  })

  it('a half-configured build fails every call with the problem, and is not a thenable', async () => {
    const u = unavailableContent('VITE_SUPABASE_URL is missing.')
    expect((u as unknown as { then?: unknown }).then).toBeUndefined()
    expect(await u.getPublishedChrome()).toEqual({ ok: false, error: { code: 'CONFIG', message: 'VITE_SUPABASE_URL is missing.' } })
    expect(await Promise.resolve(u)).toBe(u)
  })
})

describe('published hooks', () => {
  it('before the first publish: empty chrome, null built-in pages and null form (the built-in text applies), an unknown custom slug is notFound', async () => {
    const chrome = renderHook(() => usePublishedChrome())
    const terms = renderHook(() => usePublishedPage('terms'))
    const about = renderHook(() => usePublishedPage('about'))
    const apply = renderHook(() => usePublishedApplyForm())
    expect(chrome.result.current.loading).toBe(true)
    await waitFor(() => expect(chrome.result.current.loading).toBe(false))
    expect(chrome.result.current).toMatchObject({ chrome: { version: 0, footerPages: [], social: {} }, error: null })
    await waitFor(() => expect(terms.result.current.loading).toBe(false))
    expect(terms.result.current).toMatchObject({ page: null, error: null, notFound: false })
    await waitFor(() => expect(about.result.current.loading).toBe(false))
    expect(about.result.current).toMatchObject({ page: null, error: null, notFound: true })
    await waitFor(() => expect(apply.result.current.loading).toBe(false))
    expect(apply.result.current).toMatchObject({ config: null, version: 0, error: null })
  })

  it('after a publish they return the published content, not a later unpublished draft', async () => {
    const doc = emptySiteContent()
    doc.builtinPages = { terms: { en: 'New terms' } }
    doc.customPages = [page('about')]
    doc.social = { instagram: 'https://instagram.com/x' }
    doc.applyForm.texts = { 'apply.done.title': { en: 'Thanks' } }
    await put(doc, true)
    const later = structuredClone(doc)
    later.customPages = [page('draft-only')]
    await put(later, false)

    const chrome = renderHook(() => usePublishedChrome())
    await waitFor(() => expect(chrome.result.current.chrome?.version).toBe(1))
    expect(chrome.result.current.chrome?.footerPages.map((p) => p.slug)).toEqual(['about'])
    expect(chrome.result.current.chrome?.social).toEqual({ instagram: 'https://instagram.com/x' })

    const terms = renderHook(() => usePublishedPage('terms'))
    await waitFor(() => expect(terms.result.current.page).toEqual({ kind: 'builtin', body: { en: 'New terms' } }))
    const draftOnly = renderHook(() => usePublishedPage('draft-only'))
    await waitFor(() => expect(draftOnly.result.current.notFound).toBe(true))

    const apply = renderHook(() => usePublishedApplyForm())
    await waitFor(() => expect(apply.result.current.version).toBe(1))
    expect(apply.result.current.config?.texts['apply.done.title']).toEqual({ en: 'Thanks' })
  })

  it('public reads need no sign-in', async () => {
    localStorage.clear() // nobody signed in
    const ok = renderHook(() => usePublishedChrome())
    await waitFor(() => expect(ok.result.current.loading).toBe(false))
    expect(ok.result.current.error).toBeNull()
  })

  it('source "draft" reads the saved draft (the Editor preview), including a page nobody published', async () => {
    const doc = emptySiteContent()
    doc.customPages = [page('preview-me')]
    doc.builtinPages = { privacy: { pt: 'Privacidade' } }
    doc.social = { facebook: 'https://facebook.com/x' }
    await put(doc, false)

    const chrome = renderHook(() => usePublishedChrome(), { wrapper: draftSource })
    await waitFor(() => expect(chrome.result.current.chrome?.footerPages.map((p) => p.slug)).toEqual(['preview-me']))
    expect(chrome.result.current.chrome?.social).toEqual({ facebook: 'https://facebook.com/x' })
    const privacy = renderHook(() => usePublishedPage('privacy'), { wrapper: draftSource })
    await waitFor(() => expect(privacy.result.current.page).toEqual({ kind: 'builtin', body: { pt: 'Privacidade' } }))
    const custom = renderHook(() => usePublishedPage('preview-me'), { wrapper: draftSource })
    await waitFor(() => expect(custom.result.current.page).toMatchObject({ kind: 'custom', title: { en: 'preview-me' } }))
    const apply = renderHook(() => usePublishedApplyForm(), { wrapper: draftSource })
    await waitFor(() => expect(apply.result.current.config).not.toBeNull())
    // The public copy is still empty.
    const live = renderHook(() => usePublishedChrome())
    await waitFor(() => expect(live.result.current.loading).toBe(false))
    expect(live.result.current.chrome?.footerPages).toEqual([])
  })

  it('draft source without content.manage is an error, not demo data', async () => {
    localStorage.setItem('arfurn:account', JSON.stringify({ role: 'super_admin', platformRole: 'team' }))
    const chrome = renderHook(() => usePublishedChrome(), { wrapper: draftSource })
    await waitFor(() => expect(chrome.result.current.loading).toBe(false))
    expect(chrome.result.current.chrome).toBeNull()
    expect(chrome.result.current.error?.code).toBe('PERMISSION')
  })

  it('useContentDraft returns the Editor state', async () => {
    const draft = renderHook(() => useContentDraft())
    await waitFor(() => expect(draft.result.current.status).toBe('success'))
    expect(draft.result.current.data).toMatchObject({ version: 0, published: null })
  })
})
