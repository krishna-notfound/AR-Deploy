// The signed-in person's profile (name and photo), shared by the sidebar user block and Profile settings, so a saved
// name or photo shows in the sidebar at once. One small store for the whole app, keyed by the signed-in user.
import { useCallback, useEffect, useSyncExternalStore } from 'react'
import { useAccount } from '@/auth/AccountProvider'
import { type Profile, account } from '@/services'

interface Snapshot {
  key: string | null
  profile: Profile | null
  /** Why the last load failed (user-safe text), or null. */
  error: string | null
  loading: boolean
}

let snap: Snapshot = { key: null, profile: null, error: null, loading: false }
const listeners = new Set<() => void>()
let latest = 0

function publish(next: Snapshot): void {
  snap = next
  for (const l of listeners) l()
}
function subscribe(l: () => void): () => void {
  listeners.add(l)
  return () => listeners.delete(l)
}
const read = () => snap

/** The person whose profile is loading now: several mounts at once (sidebar, drawer, Profile) share one request. */
let pending: string | null = null

async function load(key: string, force = false): Promise<void> {
  if (!force && pending === key) return
  pending = key
  const ticket = ++latest
  // Keep showing what we have for this person while it refreshes.
  publish({ key, profile: snap.key === key ? snap.profile : null, error: null, loading: true })
  const r = await account.getProfile()
  if (pending === key) pending = null
  if (ticket !== latest || snap.key !== key) return
  publish(r.ok ? { key, profile: r.data, error: null, loading: false } : { key, profile: null, error: r.error.message, loading: false })
}

export interface MyProfile {
  /** null while loading, after an error, or when signed out. */
  profile: Profile | null
  loading: boolean
  error: string | null
  reload: () => void
  /** Shows a new profile everywhere at once (after a save, or optimistically before it). */
  setProfile: (p: Profile) => void
}

/** Loads the profile on mount (and when the signed-in person changes); every caller sees the same copy. */
export function useMyProfile(): MyProfile {
  const { user } = useAccount()
  const key = user?.id ?? null
  const s = useSyncExternalStore(subscribe, read, read)
  useEffect(() => {
    if (key) void load(key)
  }, [key])
  const reload = useCallback(() => {
    if (key) void load(key, true)
  }, [key])
  const setProfile = useCallback(
    (p: Profile) => {
      if (!key) return
      latest++ // a save wins over a load still in flight
      publish({ key, profile: p, error: null, loading: false })
    },
    [key],
  )
  const mine = s.key === key
  return { profile: mine ? s.profile : null, loading: !mine || s.loading, error: mine ? s.error : null, reload, setProfile }
}
