import { renderHook } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { LANG_KEY, LanguageProvider } from '@/i18n/LanguageProvider'
import { localeOf } from '@/i18n/locale'
import { formatCompact, formatDate, formatDateTime, formatMoney, formatNumber, formatPercent, formatRelative } from './format'
import { useFormat } from './useFormat'

const wrap = ({ children }: { children: ReactNode }) => <LanguageProvider>{children}</LanguageProvider>

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
})

describe('useFormat', () => {
  it('formats dates in pt-PT when the language is Portuguese', () => {
    localStorage.setItem(LANG_KEY, 'pt')
    const { result } = renderHook(() => useFormat(), { wrapper: wrap })
    const iso = '2026-10-25T13:05:00Z'
    expect(result.current.date(iso)).toBe(new Intl.DateTimeFormat('pt-PT', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso)))
    expect(result.current.date(iso)).not.toMatch(/Oct/)
    expect(result.current.dateTime(iso)).toBe(formatDateTime(iso, 'pt'))
    expect(result.current.number(1234567.5)).toBe(formatNumber(1234567.5, 'pt'))
    expect(result.current.money(129900, 'EUR')).toBe(formatMoney(129900, 'EUR', 'pt'))
    expect(result.current.money(129900, 'EUR')).toMatch(/129/)
    expect(result.current.money(129900, 'EUR')).toMatch(/€/)
  })

  it('formats in English by default', () => {
    const { result } = renderHook(() => useFormat(), { wrapper: wrap })
    const iso = '2026-10-25T13:05:00Z'
    expect(result.current.date(iso)).toBe(formatDate(iso, 'en'))
    expect(result.current.date(iso)).toMatch(/Oct/)
    expect(result.current.number(1234.5)).toBe('1,234.5')
  })

  it('relative times follow the language', () => {
    localStorage.setItem(LANG_KEY, 'pt')
    const { result } = renderHook(() => useFormat(), { wrapper: wrap })
    const now = new Date('2026-10-25T13:05:00Z')
    expect(result.current.relative('2026-10-25T10:05:00Z', now)).toBe(formatRelative('2026-10-25T10:05:00Z', now, undefined, 'pt'))
    expect(result.current.relative('2026-10-25T10:05:00Z', now)).not.toMatch(/ago/)
  })

  it('works without a provider (English)', () => {
    const { result } = renderHook(() => useFormat())
    expect(result.current.number(1000)).toBe('1,000')
  })
})

describe('formatters take the language', () => {
  it('map Portuguese to pt-PT in one place', () => {
    expect(localeOf('pt')).toBe('pt-PT')
    expect(formatCompact(12_345, 'pt')).toBe(new Intl.NumberFormat('pt-PT', { notation: 'compact', maximumFractionDigits: 1 }).format(12_345))
    expect(formatPercent(0.125)).toBe('12.5%')
    expect(formatPercent(0.125, 'pt')).toBe('12,5%')
  })

  it('date preferences show month names in the language', () => {
    const prefs = { timezone: 'Europe/Lisbon', dateFormat: 'd MMM yyyy', clock: '24h' } as const
    expect(formatDate('2026-10-25T13:05:00Z', 'en', prefs)).toBe('25 Oct 2026')
    expect(formatDate('2026-10-25T13:05:00Z', 'pt', prefs)).toMatch(/^25 out\.? 2026$/)
  })
})
