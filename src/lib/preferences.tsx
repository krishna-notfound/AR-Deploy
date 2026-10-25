// The signed-in person's profile settings that change how the dashboards look (spec 8: Preferences). Loaded once per
// signed-in user; Settings → Preferences and Notifications read and save through it, so a saved date format shows on
// every page at once. Signed out, still loading or failed to load: no preferences, and dates keep the default format.
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useOptionalAccount } from '@/auth/AccountProvider'
import { type Profile, type ProfilePatch, type Result, account } from '@/services'
import type { DatePrefs } from './format'

export type ProfileState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; profile: Profile }

interface PreferencesCtx {
  state: ProfileState
  prefs: DatePrefs | undefined
  reload: () => void
  /** Saves to the profile; on success every page sees the new values. */
  save: (patch: ProfilePatch) => Promise<Result<Profile>>
}

const Ctx = createContext<PreferencesCtx | null>(null)
const LOADING: ProfileState = { status: 'loading' }

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const userId = useOptionalAccount()?.user?.id ?? null
  const [attempt, setAttempt] = useState(0)
  // One load per signed-in user (and per retry); a result for an older key is never shown.
  const key = userId ? `${userId}#${attempt}` : null
  const [loaded, setLoaded] = useState<{ key: string; state: ProfileState } | null>(null)

  useEffect(() => {
    if (!key) return
    let live = true
    void account.getProfile().then((r) => {
      if (live) setLoaded({ key, state: r.ok ? { status: 'ready', profile: r.data } : { status: 'error', message: r.error.message } })
    })
    return () => {
      live = false
    }
  }, [key])

  const state: ProfileState = key && loaded?.key === key ? loaded.state : LOADING
  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  const save = useCallback(
    async (patch: ProfilePatch) => {
      const r = await account.updateProfile(patch)
      if (r.ok && key) setLoaded((cur) => (cur?.key === key ? { key, state: { status: 'ready', profile: r.data } } : cur))
      return r
    },
    [key],
  )

  const profile = state.status === 'ready' ? state.profile : null
  const timezone = profile?.timezone
  const dateFormat = profile?.dateFormat
  const clock = profile?.clock
  const prefs = useMemo<DatePrefs | undefined>(
    () => (timezone && dateFormat && clock ? { timezone, dateFormat, clock } : undefined),
    [timezone, dateFormat, clock],
  )

  const value = useMemo(() => ({ state, prefs, reload, save }), [state, prefs, reload, save])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/**
 * The person's date settings, for `formatDate(iso, 'en', prefs)` and friends. Undefined outside the provider, while
 * loading and after a failed load: the format functions then keep their default output.
 */
export function usePreferences(): DatePrefs | undefined {
  return useContext(Ctx)?.prefs
}

/** The profile behind the preferences (Settings sections), with reload and save. */
export function useProfileSettings(): PreferencesCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useProfileSettings must be used inside <PreferencesProvider>')
  return ctx
}

/** This device's time zone as the browser reports it, or null when it cannot tell. */
export function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null
  } catch {
    return null
  }
}

/** Every IANA time zone this browser knows, sorted, always including the `extra` zones (the saved one, this device's). */
export function timeZoneList(extra: (string | null | undefined)[] = []): string[] {
  let zones: string[] = []
  try {
    zones = Intl.supportedValuesOf('timeZone')
  } catch {
    zones = []
  }
  const all = new Set(zones)
  for (const z of extra) if (z) all.add(z)
  return [...all].sort((a, b) => a.localeCompare(b))
}
