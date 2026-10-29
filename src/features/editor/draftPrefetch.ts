// An early, short-lived start of the Editor's first draft request (the admin_get_site_content round trip), so it runs
// while the Editor's code is still downloading instead of after it. One in-flight promise, kept for at most 30 seconds,
// handed to the first load only. Nothing here caches a result: a failed request is dropped, and any save, publish,
// restore or unmount clears the entry, so a stale draft is never served.
import { content } from '@/services'
import type { Result } from '@/services/catalogService'
import type { ContentDraftState } from '@/services/contentService'

export const PREFETCH_TTL_MS = 30_000

type DraftResult = Result<ContentDraftState>
let entry: { promise: Promise<DraftResult>; at: number } | null = null

const fresh = (e: typeof entry): e is NonNullable<typeof entry> => !!e && Date.now() - e.at <= PREFETCH_TTL_MS

/** Starts the draft request unless a fresh one is already in flight. Safe to call repeatedly. */
export function prefetchContentDraft(): void {
  if (fresh(entry)) return
  const mine = { promise: content.getContentDraft(), at: Date.now() }
  entry = mine
  const drop = () => {
    if (entry === mine) entry = null
  }
  // An error is never kept; the consumer then makes a normal request. Also handles a rejection here.
  mine.promise.then((r) => (r.ok ? undefined : drop()), drop)
}

/** The in-flight (or finished) prefetch if it is still fresh; removes it so it is used once. */
export function takePrefetchedDraft(): Promise<DraftResult> | null {
  const e = entry
  entry = null
  return fresh(e) ? e.promise : null
}

export function clearPrefetchedDraft(): void {
  entry = null
}

/** The Editor's first load: the prefetched request when there is one, else (or if it failed) a normal fetch. */
export async function loadFirstDraft(): Promise<DraftResult> {
  const pending = takePrefetchedDraft()
  if (pending) {
    try {
      const r = await pending
      if (r.ok) return r
    } catch {
      // fall through to a normal fetch
    }
  }
  return content.getContentDraft()
}
