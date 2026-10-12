import type { Currency, Dimensions, Lang, LengthUnit } from '@/domain/types'

const CURRENCY_LOCALE: Record<Lang, string> = { en: 'en-US', pt: 'pt-PT' }

/** Formats a price stored in minor units. */
export function formatMoney(minor: number, currency: Currency, lang: Lang = 'en'): string {
  return new Intl.NumberFormat(CURRENCY_LOCALE[lang], { style: 'currency', currency }).format(minor / 100)
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
  return new Intl.NumberFormat(CURRENCY_LOCALE[lang]).format(n)
}

export function formatCompact(n: number): string {
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
}

export function formatPercent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`
}

export function formatDate(iso: string, lang: Lang = 'en'): string {
  return new Intl.DateTimeFormat(CURRENCY_LOCALE[lang], { day: 'numeric', month: 'short', year: 'numeric' }).format(
    new Date(iso),
  )
}

export function formatRelative(iso: string, now: Date = new Date()): string {
  const diffSec = Math.round((new Date(iso).getTime() - now.getTime()) / 1000)
  const abs = Math.abs(diffSec)
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  if (abs < 60) return rtf.format(diffSec, 'second')
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), 'minute')
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), 'hour')
  if (abs < 86400 * 30) return rtf.format(Math.round(diffSec / 86400), 'day')
  return formatDate(iso)
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
