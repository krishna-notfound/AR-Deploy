// Demo implementation of the Content Editor service (ADR-0043): the same rules as the database functions over the demo
// store (draft, published copy, history), so demo mode works with no env vars and "Reset demo data" clears it. A test
// harness labelled Demo in the UI: nothing here is a real website. It starts with nothing published (version 0) and an
// empty draft, so every public page shows its built-in text until the Editor publishes.
//
// The editor calls need the demo viewer to be a platform user holding content.manage (as the database checks it): the
// Owner and Admin by default, Team only if the Owner granted it. Public reads need no one.
import { type SiteContent, emptySiteContent, normalizeSiteContent, validateContentShape, validateSiteContent } from '@/domain/siteContent'
import { type Result, fail, ok } from '../catalogService'
import type { ContentDraftState, ContentService, ContentVersionSummary, PublishedApplyForm, PublishedChrome, PublishedPage } from '../contentService'
import { applyFormOf, chromeOf, pageOf } from '../contentView'
import type { DemoContent } from './db'
import { mockActor } from './mockModelRequestShared'
import { demoPlatformRole } from './mockTeam'
import { store } from './store'

const LATENCY_MS = import.meta.env.MODE === 'test' ? 0 : 120
/** The base of a draft nobody has saved yet. */
const INITIAL_BASE = '1970-01-01T00:00:00.000Z'
const HISTORY_LIMIT = 100

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const delay = () => (LATENCY_MS ? new Promise<void>((resolve) => setTimeout(resolve, LATENCY_MS)) : Promise.resolve())
async function run<T>(fn: () => Result<T>): Promise<Result<T>> {
  await delay()
  return fn()
}

const fresh = (): DemoContent => ({ draft: emptySiteContent(), draftUpdatedAt: INITIAL_BASE, published: null, version: 0, publishedAt: null, publishedByName: null, versions: [] })
/** The stored slice (not created: reads never write). */
const peek = (): DemoContent => store.get().content ?? fresh()
const slice = (db: { content?: DemoContent }): DemoContent => (db.content ??= fresh())

/** A strictly newer timestamp than `prev`, so two saves in the same millisecond still change the base. */
const nextBase = (prev: string): string => new Date(Math.max(Date.now(), Date.parse(prev) + 1)).toISOString()

const forbidden = <T>(): Result<T> => ({ ok: false, error: { code: 'PERMISSION', message: 'You do not have permission to edit website content.', reason: 'forbidden' } })
const conflict = <T>(): Result<T> => ({ ok: false, error: { code: 'CONFLICT', message: 'The draft changed since you opened it. Reload to see the latest.', reason: 'draft_conflict' } })

/** Who is acting: a platform user with content.manage. */
function canEdit(): boolean {
  const a = mockActor()
  return a.kind === 'staff' && a.can('content.manage')
}
const actorName = (): string => {
  const role = demoPlatformRole()
  return role === 'owner' ? 'Sample Owner' : role === 'team' ? 'Sample Team' : 'Sample Admin'
}

/** The published copy as a clean document, or null when nothing is published. */
const published = (): SiteContent | null => {
  const c = peek().published
  return c ? normalizeSiteContent(clone(c)) : null
}

export const mockContentService: ContentService = {
  getPublishedChrome: () => run<PublishedChrome>(() => ok(chromeOf(published(), peek().version))),

  getPublishedPage: (slug) => run<PublishedPage | null>(() => pageOf(published(), slug)),

  getPublishedApplyForm: () => run<PublishedApplyForm | null>(() => ok(applyFormOf(published(), peek().version))),

  getContentDraft: () =>
    run<ContentDraftState>(() => {
      if (!canEdit()) return forbidden()
      const c = peek()
      return ok({
        draft: normalizeSiteContent(clone(c.draft)),
        draftUpdatedAt: c.draftUpdatedAt,
        published: c.published ? normalizeSiteContent(clone(c.published)) : null,
        version: c.version,
        publishedAt: c.publishedAt,
        publishedByName: c.publishedByName,
      })
    }),

  saveContentDraft: (content, baseUpdatedAt) =>
    run<{ draftUpdatedAt: string }>(() => {
      if (!canEdit()) return forbidden()
      // A draft may be incomplete (autosave), so only the shape is checked; publishing checks the rest.
      const shape = validateContentShape(content)
      if (Object.keys(shape).length) return fail('VALIDATION', 'The content is not a valid document.', shape)
      if (peek().draftUpdatedAt !== baseUpdatedAt) return conflict()
      let next = ''
      store.update((db) => {
        const c = slice(db)
        next = nextBase(c.draftUpdatedAt)
        c.draft = clone(content)
        c.draftUpdatedAt = next
      })
      return ok({ draftUpdatedAt: next })
    }),

  publishContent: (baseUpdatedAt) =>
    run<{ version: number; publishedAt: string }>(() => {
      if (!canEdit()) return forbidden()
      const current = peek()
      if (current.draftUpdatedAt !== baseUpdatedAt) return conflict()
      const draft: SiteContent = normalizeSiteContent(clone(current.draft))
      const problems = validateSiteContent(draft)
      if (Object.keys(problems).length) return fail('VALIDATION', 'The content has problems that must be fixed before publishing.', problems)
      const publishedAt = new Date().toISOString()
      const version = current.version + 1
      store.update((db) => {
        const c = slice(db)
        c.published = clone(draft)
        c.version = version
        c.publishedAt = publishedAt
        c.publishedByName = actorName()
        c.versions.push({ version, content: clone(draft), publishedAt, publishedByName: actorName() })
      })
      return ok({ version, publishedAt })
    }),

  listContentVersions: () =>
    run<ContentVersionSummary[]>(() => {
      if (!canEdit()) return forbidden()
      const list = [...peek().versions].reverse().slice(0, HISTORY_LIMIT)
      return ok(list.map((v) => ({ version: v.version, publishedAt: v.publishedAt, publishedByName: v.publishedByName })))
    }),

  restoreContentVersion: (version, baseUpdatedAt) =>
    run<{ draftUpdatedAt: string }>(() => {
      if (!canEdit()) return forbidden()
      const current = peek()
      if (current.draftUpdatedAt !== baseUpdatedAt) return conflict()
      const found = current.versions.find((v) => v.version === version)
      if (!found) return fail('NOT_FOUND', 'That version no longer exists.')
      let next = ''
      store.update((db) => {
        const c = slice(db)
        next = nextBase(c.draftUpdatedAt)
        c.draft = clone(found.content)
        c.draftUpdatedAt = next
      })
      return ok({ draftUpdatedAt: next })
    }),
}
