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
 * After the first load, background refetches keep the previous data visible.
 */
export function useServiceQuery<T>(fn: () => Promise<Result<T>>, deps: readonly unknown[]): QueryResult<T> {
  const [state, setState] = useState<QueryState<T>>({ status: 'loading' })
  const [refreshing, setRefreshing] = useState(false)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const requestId = useRef(0)

  const execute = useCallback((background: boolean) => {
    const id = ++requestId.current
    if (background) setRefreshing(true)
    else setState((s) => ({ status: 'loading', data: s.data }))
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
    execute(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => service.subscribe(() => execute(true)), [execute])

  const refetch = useCallback(() => execute(false), [execute])
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
