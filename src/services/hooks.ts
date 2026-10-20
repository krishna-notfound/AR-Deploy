import { useCallback, useEffect, useRef, useState } from 'react'
import type { Result, ServiceError } from './catalogService'
import { service } from './index'

export type QueryState<T> =
  | { status: 'loading'; data?: T; error?: undefined }
  | { status: 'success'; data: T; error?: undefined }
  | { status: 'error'; data?: T; error: ServiceError }

export type QueryResult<T> = QueryState<T> & { refetch: () => void; refreshing: boolean }

/**
 * Runs a service call and re-runs it whenever deps change or the data store changes.
 * A deps change is a new query: it starts empty, so an earlier result (e.g. a placeholder `[]` while a parent
 * record loads) can never be shown as the answer to the new one. `refetch` and background refreshes of the
 * same query keep the previous data visible while they run.
 */
export function useServiceQuery<T>(fn: () => Promise<Result<T>>, deps: readonly unknown[]): QueryResult<T> {
  const [state, setState] = useState<QueryState<T>>({ status: 'loading' })
  const [refreshing, setRefreshing] = useState(false)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const requestId = useRef(0)

  const execute = useCallback((mode: 'new' | 'refetch' | 'background') => {
    const id = ++requestId.current
    if (mode === 'background') setRefreshing(true)
    else setState((s) => ({ status: 'loading', data: mode === 'new' ? undefined : s.data }))
    fnRef
      .current()
      .then((res) => {
        if (id !== requestId.current) return
        setState((prev) => (res.ok ? { status: 'success', data: res.data } : { status: 'error', error: res.error, data: prev.data }))
      })
      .finally(() => {
        if (id === requestId.current) setRefreshing(false)
      })
  }, [])

  useEffect(() => {
    execute('new')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => service.subscribe(() => execute('background')), [execute])

  const refetch = useCallback(() => execute('refetch'), [execute])
  return { ...state, refetch, refreshing }
}

export function useServiceMutation<A extends unknown[], T>(fn: (...args: A) => Promise<Result<T>>) {
  const [pending, setPending] = useState(false)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const mutate = useCallback(async (...args: A): Promise<Result<T>> => {
    setPending(true)
    try {
      return await fnRef.current(...args)
    } finally {
      setPending(false)
    }
  }, [])
  return { mutate, pending }
}

/**
 * Re-runs `refetch` when the visitor comes back to the tab (focus / visibilitychange) and the data was
 * loaded more than `maxAgeMs` ago. Used for pages holding signed media URLs that expire
 * (MEDIA_URL_TTL_SECONDS): a page left open overnight gets fresh URLs before AR re-downloads the model.
 * `data` identifies the current load; its age restarts whenever it changes.
 */
export function useRefreshWhenStale(refetch: () => void, maxAgeMs: number, data: unknown): void {
  const loadedAt = useRef(0) // set on mount and on every new load by the effect below
  useEffect(() => {
    loadedAt.current = Date.now()
  }, [data])
  useEffect(() => {
    const check = () => {
      if (document.visibilityState !== 'hidden' && Date.now() - loadedAt.current > maxAgeMs) {
        loadedAt.current = Date.now()
        refetch()
      }
    }
    window.addEventListener('focus', check)
    document.addEventListener('visibilitychange', check)
    return () => {
      window.removeEventListener('focus', check)
      document.removeEventListener('visibilitychange', check)
    }
  }, [refetch, maxAgeMs])
}
