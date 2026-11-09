// The managed category and currency lists (ADR-0055): pure rules.
import { describe, expect, it } from 'vitest'
import {
  BUILTIN_CATEGORY_ITEMS,
  BUILTIN_CURRENCY_ITEMS,
  categoryLabelOf,
  categoryLabelProblems,
  humanizeSlug,
  isCategorySlug,
  isCurrencyCode,
  matchCategory,
  offeredCategories,
  offeredCurrencies,
  slugFromLabel,
  sortCategories,
  uniqueSlug,
} from './lists'
import { BUILTIN_CATEGORIES, type CategoryItem } from './types'

const rugs: CategoryItem = { slug: 'rugs', labelEn: 'Rugs', labelPt: 'Tapetes', sort: 80, active: true }

describe('the seed', () => {
  it('has the seven built-in categories and Other last, with both languages', () => {
    expect(BUILTIN_CATEGORY_ITEMS.map((c) => c.slug)).toEqual([...BUILTIN_CATEGORIES, 'other'])
    expect(BUILTIN_CATEGORY_ITEMS.every((c) => c.labelEn && c.labelPt && c.active)).toBe(true)
    expect(sortCategories(BUILTIN_CATEGORY_ITEMS).at(-1)!.slug).toBe('other')
  })
  it('has EUR, BRL and USD on', () => {
    expect(BUILTIN_CURRENCY_ITEMS.map((c) => [c.code, c.enabled])).toEqual([['EUR', true], ['BRL', true], ['USD', true]])
  })
})

describe('slugs', () => {
  it('makes a slug from an English label: ascii, lower case, hyphens, at most 40 characters', () => {
    expect(slugFromLabel('Garden Furniture')).toBe('garden-furniture')
    expect(slugFromLabel('  Café & Bar!  ')).toBe('cafe-bar')
    expect(slugFromLabel('Ñandú')).toBe('nandu')
    expect(slugFromLabel('日本')).toBe('')
    expect(slugFromLabel('a'.repeat(60))).toHaveLength(40)
    expect(isCategorySlug(slugFromLabel('Garden Furniture'))).toBe(true)
  })
  it('keeps slugs unique and within the length', () => {
    expect(uniqueSlug('rugs', ['sofa'])).toBe('rugs')
    expect(uniqueSlug('rugs', ['rugs'])).toBe('rugs-2')
    expect(uniqueSlug('rugs', new Set(['rugs', 'rugs-2']))).toBe('rugs-3')
    expect(uniqueSlug('', [])).toBe('category')
    const long = 'x'.repeat(40)
    expect(uniqueSlug(long, [long])).toHaveLength(40)
    expect(uniqueSlug(long, [long])).toMatch(/-2$/)
  })
  it('checks the shapes the database checks', () => {
    expect(isCategorySlug('rugs-2')).toBe(true)
    expect(isCategorySlug('Rugs')).toBe(false)
    expect(isCategorySlug('')).toBe(false)
    expect(isCategorySlug('a'.repeat(41))).toBe(false)
    expect(isCurrencyCode('GBP')).toBe(true)
    expect(isCurrencyCode('gbp')).toBe(false)
    expect(isCurrencyCode('GB')).toBe(false)
  })
})

describe('labels', () => {
  it('shows the label in the language, Portuguese falling back to English, undefined for an unknown slug', () => {
    const items = [...BUILTIN_CATEGORY_ITEMS, rugs, { ...rugs, slug: 'lamps', labelEn: 'Lamps', labelPt: '  ' }]
    expect(categoryLabelOf(items, 'sofa', 'en')).toBe('Sofa')
    expect(categoryLabelOf(items, 'sofa', 'pt')).toBe('Sofá')
    expect(categoryLabelOf(items, 'lamps', 'pt')).toBe('Lamps')
    expect(categoryLabelOf(items, 'nope', 'en')).toBeUndefined()
  })
  it('makes an unlisted slug readable', () => {
    expect(humanizeSlug('garden-lamp')).toBe('Garden lamp')
  })
  it('requires both names, at most 60 characters', () => {
    expect(categoryLabelProblems('Rugs', 'Tapetes')).toEqual({})
    expect(categoryLabelProblems(' ', 'Tapetes')).toEqual({ labelEn: 'labelEnRequired' })
    expect(categoryLabelProblems('Rugs', '')).toEqual({ labelPt: 'labelPtRequired' })
    expect(categoryLabelProblems('x'.repeat(61), 'y'.repeat(61))).toEqual({ labelEn: 'labelTooLong', labelPt: 'labelTooLong' })
  })
})

describe('matchCategory (CSV import and links)', () => {
  const items = [...BUILTIN_CATEGORY_ITEMS, rugs]
  it('matches a slug, a name in either language, a plural and the old spellings, ignoring case and accents', () => {
    expect(matchCategory(items, 'sofa')).toBe('sofa')
    expect(matchCategory(items, ' Sofa ')).toBe('sofa')
    expect(matchCategory(items, 'Sofas')).toBe('sofa')
    expect(matchCategory(items, 'Sofá')).toBe('sofa')
    expect(matchCategory(items, 'sofas')).toBe('sofa')
    expect(matchCategory(items, 'iluminacao')).toBe('lighting')
    expect(matchCategory(items, 'Lights')).toBe('lighting')
    expect(matchCategory(items, 'Tapetes')).toBe('rugs')
    expect(matchCategory(items, 'rugs')).toBe('rugs')
    expect(matchCategory(items, 'Outro')).toBe('other')
  })
  it('matches nothing for an unknown or empty value', () => {
    expect(matchCategory(items, 'spaceship')).toBeUndefined()
    expect(matchCategory(items, '')).toBeUndefined()
    expect(matchCategory(BUILTIN_CATEGORY_ITEMS.filter((c) => c.slug !== 'bed'), 'beds')).toBeUndefined()
  })
})

describe('what pickers offer', () => {
  it('offers the visible categories in order, plus the one a product already has even when hidden', () => {
    const items = [{ ...rugs, active: false }, ...BUILTIN_CATEGORY_ITEMS]
    expect(offeredCategories(items).map((c) => c.slug)).not.toContain('rugs')
    expect(offeredCategories(items, 'rugs').map((c) => c.slug)).toContain('rugs')
    expect(offeredCategories(items).at(-1)!.slug).toBe('other')
  })
  it('offers the enabled currencies in order, plus the one a row already has even when switched off', () => {
    const cur = [...BUILTIN_CURRENCY_ITEMS, { code: 'GBP', enabled: false, sort: 100 }]
    expect(offeredCurrencies(cur)).toEqual(['EUR', 'BRL', 'USD'])
    expect(offeredCurrencies(cur, 'GBP')).toEqual(['EUR', 'BRL', 'USD', 'GBP'])
    expect(offeredCurrencies(cur, 'JPY')).toEqual(['EUR', 'BRL', 'USD', 'JPY'])
  })
})
