import type { Currency, DateFormatPref, Dimensions, Lang, LengthUnit } from '@/domain/types'
import { localeOf } from '@/i18n/locale'

// Every formatter takes the language with a default of 'en': a caller that forgets it silently stays English. Dashboard
// code gets all of them already bound to the current language and the person's date settings from useFormat().

/** Formats a price stored in minor units. */
export function formatMoney(minor: number, currency: Currency, lang: Lang = 'en'): string {
  return new Intl.NumberFormat(localeOf(lang), { style: 'currency', currency }).format(minor / 100)
}

/** "1234.5" → 123450. Returns null for invalid input. */
export function parseMoneyInput(value: string): number | null {
  const normalized = value.trim().replace(/\s/g, '').replace(',', '.')
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null
  return Math.round(parseFloat(normalized) * 100)
}

export function minorToInput(minor: number): string {
  return (minor / 100).toFixed(2)
}

export function formatNumber(n: number, lang: Lang = 'en'): string {
  return new Intl.NumberFormat(localeOf(lang)).format(n)
}

export function formatCompact(n: number, lang: Lang = 'en'): string {
  return new Intl.NumberFormat(localeOf(lang), { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

export function formatPercent(ratio: number, lang: Lang = 'en'): string {
  return `${new Intl.NumberFormat(localeOf(lang), { minimumFractionDigits: 1, maximumFractionDigits: 1, useGrouping: false }).format(ratio * 100)}%`
}

/** A signed-in person's date settings (Settings → Preferences). Dashboards pass `usePreferences()`. */
export interface DatePrefs {
  timezone: string
  dateFormat: DateFormatPref
  clock: '24h' | '12h'
}

const FALLBACK_ZONE = 'Europe/Lisbon'
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const zoneFormatters = new Map<string, Intl.DateTimeFormat>()

/** Numeric year, month, day, hour (0-23) and minute of an instant in `zone`. An unknown zone falls back to Lisbon. */
function partsIn(iso: string, zone: string) {
  let f = zoneFormatters.get(zone)
  if (!f) {
    const opts: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }
    try {
      f = new Intl.DateTimeFormat('en-US', { ...opts, timeZone: zone })
    } catch {
      f = new Intl.DateTimeFormat('en-US', { ...opts, timeZone: FALLBACK_ZONE })
    }
    zoneFormatters.set(zone, f)
  }
  const n: Record<string, number> = {}
  for (const p of f.formatToParts(new Date(iso))) if (p.type !== 'literal') n[p.type] = Number(p.value)
  return { y: n.year ?? 0, m: n.month ?? 1, d: n.day ?? 1, h: (n.hour ?? 0) % 24, min: n.minute ?? 0 }
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Short month name: the fixed English list for 'en' (so output is stable), the language's own abbreviation otherwise. */
function shortMonth(m: number, lang: Lang): string {
  if (lang === 'en') return MONTHS[m - 1] ?? ''
  return new Intl.DateTimeFormat(localeOf(lang), { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, m - 1, 15)))
}

function prefDate({ y, m, d }: { y: number; m: number; d: number }, format: DateFormatPref, lang: Lang): string {
  if (format === 'dd/MM/yyyy') return `${pad(d)}/${pad(m)}/${y}`
  if (format === 'yyyy-MM-dd') return `${y}-${pad(m)}-${pad(d)}`
  return `${d} ${shortMonth(m, lang)} ${y}`
}

function prefTime({ h, min }: { h: number; min: number }, clock: DatePrefs['clock']): string {
  if (clock === '24h') return `${pad(h)}:${pad(min)}`
  return `${h % 12 || 12}:${pad(min)} ${h < 12 ? 'am' : 'pm'}`
}

/** Without `prefs` (public pages, signed-out views): the original locale format, unchanged. */
export function formatDate(iso: string, lang: Lang = 'en', prefs?: DatePrefs): string {
  if (prefs) return prefDate(partsIn(iso, prefs.timezone), prefs.dateFormat, lang)
  return new Intl.DateTimeFormat(localeOf(lang), { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(iso),
  )
}

/** Date and time, e.g. "20 Oct 2026, 14:05" (admin history views). With `prefs`: the person's zone, format and clock. */
export function formatDateTime(iso: string, lang: Lang = 'en', prefs?: DatePrefs): string {
  if (prefs) {
    const p = partsIn(iso, prefs.timezone)
    return `${prefDate(p, prefs.dateFormat, lang)}, ${prefTime(p, prefs.clock)}`
  }
  return new Intl.DateTimeFormat(localeOf(lang), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

/** Only the time of day, in the person's zone and clock: "14:05" or "2:05 pm". */
export function formatTime(iso: string, prefs: DatePrefs): string {
  return prefTime(partsIn(iso, prefs.timezone), prefs.clock)
}

/** "3 hours ago"; older than 30 days, the date (in the person's format with `prefs`). */
export function formatRelative(iso: string, now: Date = new Date(), prefs?: DatePrefs, lang: Lang = 'en'): string {
  const diffSec = Math.round((new Date(iso).getTime() - now.getTime()) / 1000)
  const abs = Math.abs(diffSec)
  const rtf = new Intl.RelativeTimeFormat(localeOf(lang), { numeric: 'auto' })
  if (abs < 60) return rtf.format(diffSec, 'second')
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour')
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), 'day')
  return formatDate(iso, lang, prefs)
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const CM_PER_IN = 2.54

export function convertLength(value: number, from: LengthUnit, to: LengthUnit): number {
  if (from === to) return value
  return from === 'cm' ? value / CM_PER_IN : value * CM_PER_IN
}

export function toMeters(value: number, unit: LengthUnit): number {
  return unit === 'cm' ? value / 100 : (value * CM_PER_IN) / 100
}

export function formatDimensions(d: Dimensions, displayUnit: LengthUnit = d.unit): string {
  const f = (v: number) => {
    const c = convertLength(v, d.unit, displayUnit)
    return Number.isInteger(c) ? String(c) : c.toFixed(1)
  }
  return `W ${f(d.width)} × H ${f(d.height)} × D ${f(d.depth)} ${displayUnit}`
}

/** UTC instants bounding a calendar day (YYYY-MM-DD) in the viewer's time zone, for date-range filters. */
export function localDayBounds(day: string): { start: string; end: string } {
  const start = new Date(`${day}T00:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 1)
  return { start: start.toISOString(), end: end.toISOString() }
}
