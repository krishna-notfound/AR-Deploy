// The signed-in person's profile (name and photo), shared by the sidebar user block, the settings hub header and
// Profile settings, so a saved name or photo shows everywhere at once. One small store for the whole app, keyed by
// the signed-in user.
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useAccount } from '@/auth/AccountProvider'
import { type Profile, type ServiceError, account } from '@/services'

interface Snapshot {
  key: string | null
  /** The last profile loaded or saved for this person; kept when a later refetch fails. */
  profile: Profile | null
  /** Why the last load failed, or null (the UI shows errorText of it). */
  error: ServiceError | null
  loading: boolean
  /** When `profile` was last loaded or saved (Date.now()). */
  at: number
}

/** A profile loaded or saved this recently is not fetched again when another component mounts. */
const FRESH_MS = 60_000
const EMPTY: Snapshot = { key: null, profile: null, error: null, loading: false, at: 0 }

let snap: Snapshot = EMPTY
const listeners = new Set<() => void>()
let latest = 0
/** The person whose profile is loading now: several mounts at once (sidebar, drawer, Profile) share one request. */
let pending: string | null = null

function publish(next: Snapshot): void {
  snap = next
  for (const l of listeners) l()
}
function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}
const read = () => snap

/** Back to empty (tests). */
export function resetMyProfileStore(): void {
  snap = EMPTY
  pending = null
  latest++
}

async function load(key: string, force = false): Promise<void> {
  if (!force && pending === key) return
  pending = key
  const ticket = ++latest
  const mine = snap.key === key
  // Keep showing what we have for this person while it refreshes.
  publish({ ...(mine ? snap : EMPTY), key, loading: true })
  const r = await account.getProfile()
  if (pending === key) pending = null
  if (ticket !== latest || snap.key !== key) return
  publish(r.ok ? { key, profile: r.data, error: null, loading: false, at: Date.now() } : { ...snap, error: r.error, loading: false })
}

export interface MyProfile {
  /** The last good profile; null until the first load succeeds, or when signed out. */
  profile: Profile | null
  loading: boolean
  /** Why the last load failed, even when an older profile is still shown. */
  error: ServiceError | null
  reload: () => void
  /** Shows a new profile everywhere at once (after a save, or optimistically before it). */
  setProfile: (p: Profile) => void
}

/** Loads the profile on mount unless it is fresh (and when the signed-in person changes); every caller sees the same copy. */
export function useMyProfile(): MyProfile {
  const { user } = useAccount()
  const key = user?.id ?? null
  const s = useSyncExternalStore(subscribe, read, read)
  useEffect(() => {
    if (!key) return
    const fresh = snap.key === key && snap.profile && !snap.error && Date.now() - snap.at < FRESH_MS
    if (!fresh) void load(key)
  }, [key])
  const reload = useCallback(() => {
    if (key) void load(key, true)
  }, [key])
  const setProfile = useCallback(
    (p: Profile) => {
      if (!key) return
      latest++ // a save wins over a load still in flight
      pending = null
      publish({ key, profile: p, error: null, loading: false, at: Date.now() })
    },
    [key],
  )
  const mine = s.key === key
  return { profile: mine ? s.profile : null, loading: !mine || s.loading, error: mine ? s.error : null, reload, setProfile }
}
