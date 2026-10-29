import type { Lang } from '@/domain/types'
import { isDashboardDictionaryLoaded, registerDashboardDictionary } from './translate'

// The dashboard text (admin, business, settings, team, products, editor, ...) is about 400 KB of source in both languages, so it
// is not in the first-load bundle that every public page downloads (ADR-0045). A dashboard route loads it before it renders.
// English always loads with the dashboard (it is the fallback for any missing Portuguese key); Portuguese loads on top of it,
// only when the language is Portuguese.

const loading: Partial<Record<Lang, Promise<void>>> = {}

function load(lang: Lang): Promise<void> {
  if (isDashboardDictionaryLoaded(lang)) return Promise.resolve()
  const running = loading[lang]
  if (running) return running
  const p = (lang === 'pt' ? import('./dictionaries/pt.dashboard').then((m) => m.ptDashboard) : import('./dictionaries/en.dashboard').then((m) => m.enDashboard))
    .then((dict) => registerDashboardDictionary(lang, dict))
    .finally(() => {
      delete loading[lang] // done, or failed (offline): the next call tries again
    })
  loading[lang] = p
  return p
}

/** Whether the dashboard text of this language (and the English fallback) is ready: render dashboards only when true. */
export function dashboardReady(lang: Lang): boolean {
  return isDashboardDictionaryLoaded('en') && (lang === 'en' || isDashboardDictionaryLoaded(lang))
}

/** Loads the dashboard text for a language: English, plus Portuguese when asked for it. Safe to call again. */
export function loadDashboardDictionaries(lang: Lang): Promise<void> {
  if (dashboardReady(lang)) return Promise.resolve()
  return lang === 'pt' ? Promise.all([load('en'), load('pt')]).then(() => undefined) : load('en')
}

/** Starts the load without waiting for it (e.g. on the sign-in page, ahead of the dashboard). A failure here is not reported. */
export function preloadDashboardDictionaries(lang: Lang): void {
  loadDashboardDictionaries(lang).catch(() => {})
}

/** Whether a dashboard is open (its text is loaded), so a language switch has to wait for the new language's text. */
export function dashboardInUse(): boolean {
  return isDashboardDictionaryLoaded('en')
}
