// The Editor's working copy of the website content (spec 8 "Draft"): loaded once, edited locally by every section, autosaved
// two seconds after the last change with the last known base, and published or restored through the same base.
// `useContentDraft()` is not used here on purpose: it refetches on any store change and would overwrite the local text.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { type ContentErrors, type SiteContent, emptySiteContent, summarizeChanges, validateSiteContent } from '@/domain/siteContent'
import type { ISODate } from '@/domain/types'
import { content } from '@/services'
import type { Result, ServiceError } from '@/services/catalogService'
import type { ContentDraftState } from '@/services/contentService'
import { useServiceMutation } from '@/services/hooks'

export const AUTOSAVE_MS = 2000

export type SaveState = 'saved' | 'pending' | 'saving' | 'failed' | 'conflict'
export type LoadState = { status: 'loading' } | { status: 'ready' } | { status: 'error'; error: ServiceError }

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const sameDoc = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function useDraftEditor(options: { autosaveMs?: number } = {}) {
  const autosaveMs = options.autosaveMs ?? AUTOSAVE_MS
  const [load, setLoad] = useState<LoadState>({ status: 'loading' })
  const [draft, setDraftState] = useState<SiteContent>(emptySiteContent)
  const [meta, setMeta] = useState<{ published: SiteContent | null; version: number; publishedAt: ISODate | null; publishedByName: string | null }>({
    published: null,
    version: 0,
    publishedAt: null,
    publishedByName: null,
  })
  const [save, setSave] = useState<{ state: SaveState; savedAt?: string; error?: ServiceError }>({ state: 'saved' })

  const draftRef = useRef(draft)
  /** The opaque base for the next save, publish or restore. */
  const baseRef = useRef<ISODate>('')
  const rev = useRef(0)
  const savedRev = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const inflight = useRef<Promise<boolean> | null>(null)
  const conflict = useRef(false)

  const loadCall = useServiceMutation(() => content.getContentDraft())
  const saveCall = useServiceMutation((doc: SiteContent, base: ISODate) => content.saveContentDraft(doc, base))
  const publishCall = useServiceMutation((base: ISODate) => content.publishContent(base))
  const restoreCall = useServiceMutation((version: number, base: ISODate) => content.restoreContentVersion(version, base))

  const apply = useCallback((s: ContentDraftState) => {
    clearTimeout(timer.current)
    draftRef.current = s.draft
    baseRef.current = s.draftUpdatedAt
    rev.current = savedRev.current = 0
    conflict.current = false
    setDraftState(s.draft)
    setMeta({ published: s.published, version: s.version, publishedAt: s.publishedAt, publishedByName: s.publishedByName })
    setSave({ state: 'saved' })
  }, [])

  /** (Re)loads everything from the server and replaces the local state: the first load, and "Reload" after a conflict. */
  const reload = useCallback(async (): Promise<Result<ContentDraftState>> => {
    setLoad((l) => (l.status === 'ready' ? l : { status: 'loading' }))
    const r = await loadCall.mutate()
    if (r.ok) {
      apply(r.data)
      setLoad({ status: 'ready' })
    } else setLoad({ status: 'error', error: r.error })
    return r
  }, [apply, loadCall])

  useEffect(() => {
    void reload()
    return () => clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** Saves until nothing is pending. False when the save failed or the draft is in conflict. */
  const flush = useCallback(async (): Promise<boolean> => {
    clearTimeout(timer.current)
    for (;;) {
      if (conflict.current) return false
      if (inflight.current) {
        if (!(await inflight.current)) return false
        continue
      }
      if (rev.current === savedRev.current) return true
      const sentRev = rev.current
      const doc = draftRef.current
      setSave((s) => ({ state: 'saving', savedAt: s.savedAt }))
      const p = (async () => {
        try {
          const r = await saveCall.mutate(doc, baseRef.current)
          if (r.ok) {
            baseRef.current = r.data.draftUpdatedAt
            savedRev.current = sentRev
            setSave(rev.current === sentRev ? { state: 'saved', savedAt: new Date().toISOString() } : { state: 'pending', savedAt: new Date().toISOString() })
            return true
          }
          if (r.error.code === 'CONFLICT') {
            conflict.current = true
            setSave((s) => ({ state: 'conflict', savedAt: s.savedAt, error: r.error }))
          } else setSave((s) => ({ state: 'failed', savedAt: s.savedAt, error: r.error }))
          return false
        } finally {
          inflight.current = null
        }
      })()
      inflight.current = p
      if (!(await p)) return false
    }
  }, [saveCall])

  const setDraft = useCallback(
    (update: (d: SiteContent) => SiteContent) => {
      const next = update(draftRef.current)
      if (next === draftRef.current) return
      draftRef.current = next
      rev.current++
      setDraftState(next)
      if (!conflict.current) setSave((s) => ({ state: 'pending', savedAt: s.savedAt }))
      clearTimeout(timer.current)
      if (!conflict.current) timer.current = setTimeout(() => void flush(), autosaveMs)
    },
    [autosaveMs, flush],
  )

  /** Saves, publishes the saved draft, and refreshes the published copy and version. */
  const publish = useCallback(async () => {
    if (!(await flush())) return { ok: false, error: { code: 'UNKNOWN', message: 'The draft could not be saved.', reason: conflict.current ? 'draft_conflict' : undefined } } as Result<{ version: number; publishedAt: ISODate }>
    const r = await publishCall.mutate(baseRef.current)
    if (r.ok) {
      // Keep the local text; only the published side changes (and who published it).
      const s = await content.getContentDraft()
      setMeta(
        s.ok
          ? { published: s.data.published, version: s.data.version, publishedAt: s.data.publishedAt, publishedByName: s.data.publishedByName }
          : { published: clone(draftRef.current), version: r.data.version, publishedAt: r.data.publishedAt, publishedByName: null },
      )
    } else if (r.error.code === 'CONFLICT') {
      conflict.current = true
      setSave((x) => ({ state: 'conflict', savedAt: x.savedAt, error: r.error }))
    }
    return r
  }, [flush, publishCall])

  /** Copies a published version into the draft (not live) and loads it here. */
  const restore = useCallback(
    async (version: number) => {
      clearTimeout(timer.current)
      if (inflight.current) await inflight.current
      const r = await restoreCall.mutate(version, baseRef.current)
      if (r.ok) await reload()
      else if (r.error.code === 'CONFLICT') {
        conflict.current = true
        setSave((x) => ({ state: 'conflict', savedAt: x.savedAt, error: r.error }))
      }
      return r
    },
    [reload, restoreCall],
  )

  const errors: ContentErrors = useMemo(() => validateSiteContent(draft), [draft])
  const changes = useMemo(() => summarizeChanges(meta.published, draft), [meta.published, draft])
  const hasChanges = useMemo(() => !sameDoc(meta.published ?? emptySiteContent(), draft), [meta.published, draft])

  return {
    load,
    draft,
    setDraft,
    ...meta,
    save,
    /** Something typed is not on the server yet (pending, saving, failed or in conflict). */
    dirty: save.state !== 'saved',
    errors,
    changes,
    hasChanges,
    flush,
    reload,
    publish,
    restore,
    /** The base to pass back unchanged (opaque). */
    base: () => baseRef.current,
  }
}

export type DraftEditor = ReturnType<typeof useDraftEditor>
