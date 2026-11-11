// Dashboard colour theme (ADR-0060). Light / Dark / System, remembered per device in localStorage (no database).
// Only the signed-in dashboards (/admin, /dashboard) may be dark; every other route is always light.
// `public/theme-init.js` repeats the storage key and the path rule to set the theme before first paint: keep them in step.
import { useSyncExternalStore } from 'react'

export type ThemeChoice = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_KEY = 'arfurn:theme'
export const THEME_CHOICES: readonly ThemeChoice[] = ['light', 'dark', 'system']
const DARK_QUERY = '(prefers-color-scheme: dark)'

/** The browser UI colour behind the page (mobile address bar), per theme. Matches `--color-canvas` in index.css. */
export const THEME_COLOR: Record<ResolvedTheme, string> = { light: '#F3F0E9', dark: '#141311' }

export function isThemeChoice(v: unknown): v is ThemeChoice {
  return v === 'light' || v === 'dark' || v === 'system'
}

/** Only the signed-in dashboards follow the saved theme; the public site, sign-in and invitation pages stay light. */
export function isThemedPath(pathname: string): boolean {
  return pathname === '/admin' || pathname === '/dashboard' || pathname.startsWith('/admin/') || pathname.startsWith('/dashboard/')
}

export function readStoredChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY)
    return isThemeChoice(v) ? v : 'light'
  } catch {
    return 'light' // storage blocked or unavailable (private mode)
  }
}

function writeStoredChoice(choice: ThemeChoice) {
  try {
    localStorage.setItem(THEME_KEY, choice)
  } catch {
    // The choice then lasts until the page closes.
  }
}

function mediaQuery(): MediaQueryList | null {
  try {
    return typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(DARK_QUERY) : null
  } catch {
    return null
  }
}

export function systemPrefersDark(): boolean {
  return mediaQuery()?.matches ?? false
}

export function resolveTheme(choice: ThemeChoice, systemDark: boolean): ResolvedTheme {
  return choice === 'dark' || (choice === 'system' && systemDark) ? 'dark' : 'light'
}

// ---- A tiny external store, so any component can read or change the choice without a provider. ----
let current: ThemeChoice = readStoredChoice()
const listeners = new Set<() => void>()

function emit() {
  for (const l of listeners) l()
}

export function getThemeChoice(): ThemeChoice {
  return current
}

export function setThemeChoice(choice: ThemeChoice) {
  if (!isThemeChoice(choice)) return
  writeStoredChoice(choice)
  if (choice === current) return
  current = choice
  emit()
}

/** Re-reads the saved choice (another tab changed it, or a test reset storage). */
export function reloadThemeChoice() {
  const next = readStoredChoice()
  if (next === current) return
  current = next
  emit()
}

function subscribeChoice(listener: () => void) {
  listeners.add(listener)
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === THEME_KEY) reloadThemeChoice()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function useThemeChoice(): [ThemeChoice, (choice: ThemeChoice) => void] {
  const choice = useSyncExternalStore(subscribeChoice, getThemeChoice, () => 'light' as ThemeChoice)
  return [choice, setThemeChoice]
}

function subscribeSystem(listener: () => void) {
  const mq = mediaQuery()
  if (!mq) return () => {}
  mq.addEventListener('change', listener)
  return () => mq.removeEventListener('change', listener)
}

/** Whether the device asks for dark colours right now (follows the device while it is open). */
export function useSystemPrefersDark(): boolean {
  return useSyncExternalStore(subscribeSystem, systemPrefersDark, () => false)
}

/** Sets `data-theme` and the browser colour on <html>. A non-dashboard route removes the attribute: it is light. */
export function applyTheme(theme: ResolvedTheme | null, root: HTMLElement = document.documentElement) {
  if (theme) root.setAttribute('data-theme', theme)
  else root.removeAttribute('data-theme')
  try {
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme ?? 'light'])
  } catch {
    // Not in a browser document.
  }
}
