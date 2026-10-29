import { useMemo } from 'react'
import type { Currency } from '@/domain/types'
import { useI18n } from '@/i18n/LanguageProvider'
import { formatCompact, formatDate, formatDateTime, formatMoney, formatNumber, formatPercent, formatRelative, formatTime } from './format'
import { usePreferences } from './preferences'

/**
 * The formatters bound to the current language and the signed-in person's date settings (Settings → Preferences).
 * Dashboard code uses this instead of calling `formatDate(iso, 'en', prefs)`, so nothing silently stays English.
 */
export function useFormat() {
  const { lang } = useI18n()
  const prefs = usePreferences()
  return useMemo(
    () => ({
      lang,
      date: (iso: string) => formatDate(iso, lang, prefs),
      dateTime: (iso: string) => formatDateTime(iso, lang, prefs),
      /** Time of day only; falls back to the date and time when there are no date settings (signed out). */
      time: (iso: string) => (prefs ? formatTime(iso, prefs) : formatDateTime(iso, lang)),
      relative: (iso: string, now?: Date) => formatRelative(iso, now, prefs, lang),
      number: (n: number) => formatNumber(n, lang),
      compact: (n: number) => formatCompact(n, lang),
      percent: (ratio: number) => formatPercent(ratio, lang),
      money: (minor: number, currency: Currency) => formatMoney(minor, currency, lang),
    }),
    [lang, prefs],
  )
}
