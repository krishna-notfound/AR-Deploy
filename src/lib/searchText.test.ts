import { describe, expect, it } from 'vitest'
import { matchesSearch, searchKey } from './searchText'

describe('searchKey', () => {
  it('ignores case and accents', () => {
    expect(searchKey('Web Móveis')).toBe('web moveis')
    expect(searchKey('SOFÁ ÇÃO')).toBe('sofa cao')
  })
})

describe('matchesSearch', () => {
  it('finds "Moveis" in "Web Móveis" and "móveis" in "MOVEIS" (QA #7)', () => {
    expect(matchesSearch('Web Móveis', 'Moveis')).toBe(true)
    expect(matchesSearch('MOVEIS', 'móveis')).toBe(true)
  })
  it('matches any of several fields and never matches a different word', () => {
    expect(matchesSearch(['Atelier', 'web-moveis'], 'moveis')).toBe(true)
    expect(matchesSearch('Web Móveis', 'cadeira')).toBe(false)
  })
  it('an empty term matches everything', () => {
    expect(matchesSearch('Web Móveis', '  ')).toBe(true)
  })
  it('ignores empty or missing fields', () => {
    expect(matchesSearch([undefined, null, ''], 'a')).toBe(false)
  })
})
