// Hooks for website content (ADR-0043). Public pages use the published reads; the Editor's preview wraps the tree in a
// SiteContentSourceContext.Provider with value 'draft' (the SiteContentProvider of the Editor does this), and the same
// hooks then read the saved draft instead, so a preview renders the real components with the draft.
//
//   usePublishedChrome()      footer pages and social links          { chrome, loading, error, reload }
//   usePublishedPage(slug)    Terms, Privacy or a custom page        { page, loading, error, notFound, reload }
//   usePublishedApplyForm()   the application form config            { config, version, loading, error, reload }
//   useContentDraft()         the Editor's draft state               QueryResult<ContentDraftState>
//
// A `null` result means nothing is published for it: show the built-in text (the state before the first publish). An
// `error` is a failed read, which is not the same thing: show the built-in text and a retry line (spec 9). In draft mode
// reading needs content.manage, like the Editor itself.
import { createContext, useContext } from 'react'
import type { ApplyFormConfig } from '@/domain/siteContent'
import { type Result, ok } from './catalogService'
import type { ServiceError } from './catalogService'
import { content } from './index'
import type { ContentDraftState, PublishedChrome, PublishedPage } from './contentService'
import { applyFormOf, chromeOf, pageOf } from './contentView'
import { type QueryResult, useServiceQuery } from './hooks'

export type ContentSource = 'published' | 'draft'

/** Which copy of the content the hooks read. The default is the published copy; the Editor's preview sets 'draft'. */
export const SiteContentSourceContext = createContext<ContentSource>('published')

type Reads<T> = { data: T | null; loading: boolean; error: ServiceError | null; reload: () => void }

function reads<T>(q: QueryResult<T>): Reads<T> {
  return { data: q.status === 'success' ? q.data : null, loading: q.status === 'loading', error: q.status === 'error' ? q.error : null, reload: q.refetch }
}

/** The draft state turned into a public read (the preview). */
async function fromDraft<T>(map: (state: ContentDraftState) => Result<T>): Promise<Result<T>> {
  const r = await content.getContentDraft()
  return r.ok ? map(r.data) : r
}

export function usePublishedChrome(): { chrome: PublishedChrome | null; loading: boolean; error: ServiceError | null; reload: () => void } {
  const source = useContext(SiteContentSourceContext)
  const q = reads(useServiceQuery(() => (source === 'draft' ? fromDraft((s) => ok(chromeOf(s.draft, s.version))) : content.getPublishedChrome()), [source]))
  return { chrome: q.data, loading: q.loading, error: q.error, reload: q.reload }
}

export function usePublishedPage(slug: string): { page: PublishedPage | null; loading: boolean; error: ServiceError | null; notFound: boolean; reload: () => void } {
  const source = useContext(SiteContentSourceContext)
  const raw = useServiceQuery(() => (source === 'draft' ? fromDraft((s) => pageOf(s.draft, slug)) : content.getPublishedPage(slug)), [source, slug])
  // An unknown custom slug is an answer ("no such page"), not a failed read.
  const notFound = raw.status === 'error' && raw.error.code === 'NOT_FOUND'
  const q = reads(raw)
  return { page: q.data, loading: q.loading, error: notFound ? null : q.error, notFound, reload: q.reload }
}

export function usePublishedApplyForm(): { config: ApplyFormConfig | null; version: number; loading: boolean; error: ServiceError | null; reload: () => void } {
  const source = useContext(SiteContentSourceContext)
  const q = reads(useServiceQuery(() => (source === 'draft' ? fromDraft((s) => ok(applyFormOf(s.draft, s.version))) : content.getPublishedApplyForm()), [source]))
  return { config: q.data?.config ?? null, version: q.data?.version ?? 0, loading: q.loading, error: q.error, reload: q.reload }
}

/** The Editor's state: draft, base for the next save, published copy and version. */
export function useContentDraft(): QueryResult<ContentDraftState> {
  return useServiceQuery(() => content.getContentDraft(), [])
}
