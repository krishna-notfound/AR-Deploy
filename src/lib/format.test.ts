import { describe, expect, it } from 'vitest'
import { type DatePrefs, formatDate, formatDateTime, formatRelative } from './format'

const LISBON: DatePrefs = { timezone: 'Europe/Lisbon', dateFormat: 'd MMM yyyy', clock: '24h' }
const at = (p: Partial<DatePrefs>): DatePrefs => ({ ...LISBON, ...p })

// The formatting before preferences existed, kept here verbatim: calls without prefs must match it byte for byte.
const legacyDate = (iso: string, locale: string) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))
const legacyDateTime = (iso: string, locale: string) =>
  new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

describe('preference-aware dates', () => {
  // 25 Oct 2026 is the last Sunday of October: Lisbon is back on UTC+0 from 01:00 UTC, so 13:05Z is 13:05 there.
  // A summer instant (UTC+1) gives the 14:05 / 2:05 pm case.
  it('formats 2026-10-25T13:05Z as 25 Oct 2026 / 25/10/2026 / 2026-10-25, and the time in Europe/Lisbon in 24h or 12h', () => {
    const iso = '2026-10-25T13:05:00Z'
    expect(formatDate(iso, 'en', at({ dateFormat: 'd MMM yyyy' }))).toBe('25 Oct 2026')
    expect(formatDate(iso, 'en', at({ dateFormat: 'dd/MM/yyyy' }))).toBe('25/10/2026')
    expect(formatDate(iso, 'en', at({ dateFormat: 'yyyy-MM-dd' }))).toBe('2026-10-25')
    expect(formatDateTime(iso, 'en', at({ clock: '24h' }))).toBe('25 Oct 2026, 13:05')
    expect(formatDateTime(iso, 'en', at({ clock: '12h' }))).toBe('25 Oct 2026, 1:05 pm')

    const summer = '2026-07-25T13:05:00Z'
    expect(formatDateTime(summer, 'en', at({ clock: '24h' }))).toBe('25 Jul 2026, 14:05')
    expect(formatDateTime(summer, 'en', at({ clock: '12h', dateFormat: 'dd/MM/yyyy' }))).toBe('25/07/2026, 2:05 pm')
  })

  it('uses the time zone for the calendar day, and midnight and noon in the 12-hour clock', () => {
    const iso = '2026-10-25T13:05:00Z'
    expect(formatDateTime(iso, 'en', at({ timezone: 'Pacific/Auckland', dateFormat: 'yyyy-MM-dd' }))).toBe('2026-10-26, 02:05')
    expect(formatDateTime(iso, 'en', at({ timezone: 'America/Los_Angeles', clock: '12h' }))).toBe('25 Oct 2026, 6:05 am')
    expect(formatDateTime('2026-07-24T23:00:00Z', 'en', at({ clock: '12h' }))).toBe('25 Jul 2026, 12:00 am')
    expect(formatDateTime('2026-07-24T23:00:00Z', 'en', at({ clock: '24h' }))).toBe('25 Jul 2026, 00:00')
    expect(formatDateTime('2026-01-10T12:30:00Z', 'en', at({ clock: '12h' }))).toBe('10 Jan 2026, 12:30 pm')
  })

  it('falls back to Europe/Lisbon for a zone this browser does not know', () => {
    expect(formatDateTime('2026-07-25T13:05:00Z', 'en', at({ timezone: 'Not/AZone' }))).toBe('25 Jul 2026, 14:05')
  })

  it('formatRelative keeps relative wording and formats older dates with the preference', () => {
    const now = new Date('2026-10-25T13:05:00Z')
    expect(formatRelative('2026-10-25T12:05:00Z', now, LISBON)).toBe(formatRelative('2026-10-25T12:05:00Z', now))
    expect(formatRelative('2026-08-01T10:00:00Z', now, at({ dateFormat: 'yyyy-MM-dd' }))).toBe('2026-08-01')
  })

  it('defaults are unchanged: no prefs gives exactly the earlier output', () => {
    for (const iso of ['2026-10-25T13:05:00Z', '2026-01-01T00:30:00Z', '2026-07-24T23:00:00Z']) {
      expect(formatDate(iso)).toBe(legacyDate(iso, 'en-US'))
      expect(formatDate(iso, 'pt')).toBe(legacyDate(iso, 'pt-PT'))
      expect(formatDateTime(iso)).toBe(legacyDateTime(iso, 'en-US'))
      expect(formatDateTime(iso, 'pt')).toBe(legacyDateTime(iso, 'pt-PT'))
      expect(formatDate(iso, 'en', undefined)).toBe(legacyDate(iso, 'en-US'))
    }
    expect(formatRelative('2026-08-01T10:00:00Z', new Date('2026-10-25T13:05:00Z'))).toBe(legacyDate('2026-08-01T10:00:00Z', 'en-US'))
  })
})
