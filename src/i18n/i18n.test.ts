import { describe, expect, it } from 'vitest'
import { en, pt } from './dictionaries/full'
import { pickLocalized, translate } from './translate'

describe('i18n', () => {
  it('translates and interpolates', () => {
    expect(translate('en', 'ar.button')).toBe('View in my home')
    expect(translate('pt', 'ar.button')).toBe('Ver na minha casa')
    expect(translate('pt', 'nav.backToCatalog', { name: 'Casa' })).toBe('Voltar a Casa')
  })

  it('falls back to English for missing Portuguese keys', () => {
    const missing = (Object.keys(en) as (keyof typeof en)[]).find((k) => !(k in pt))
    // Every key is currently translated; simulate a missing one through pickLocalized instead.
    if (missing) expect(translate('pt', missing)).toBe(en[missing])
    expect(pickLocalized({ en: 'Sideboard' }, 'pt')).toEqual({ text: 'Sideboard', lang: 'en', isFallback: true })
    expect(pickLocalized({ en: 'Sofa', pt: 'Sofá' }, 'pt')).toEqual({ text: 'Sofá', lang: 'pt', isFallback: false })
    expect(pickLocalized({ en: 'Sofa', pt: '  ' }, 'pt').isFallback).toBe(true)
  })

  it('has Portuguese for every public UI string', () => {
    const missing = Object.keys(en).filter((k) => !(k in pt))
    expect(missing).toEqual([])
  })
})

const tokens = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort()

describe('dictionary consistency', () => {
  it('has no empty values in either language', () => {
    const empty = [...Object.entries(en), ...Object.entries(pt)].filter(([, v]) => typeof v !== 'string' || v.trim() === '').map(([k]) => k)
    expect(empty).toEqual([])
  })

  it('uses the same {tokens} in English and Portuguese for every key', () => {
    const mismatched = (Object.keys(en) as (keyof typeof en)[])
      .filter((k) => k in pt)
      .filter((k) => tokens(en[k]).join() !== tokens(pt[k] as string).join())
    expect(mismatched).toEqual([])
  })

  it('every .one plural key has its .other, in both languages', () => {
    const bases = Object.keys(en)
      .filter((k) => k.endsWith('.one'))
      .map((k) => k.slice(0, -4))
    for (const b of bases) {
      expect(`${b}.other` in en, b).toBe(true)
      expect(`${b}.one` in pt, b).toBe(true)
      expect(`${b}.other` in pt, b).toBe(true)
    }
  })

  it('seeds the common words in both languages', () => {
    for (const k of ['save', 'cancel', 'delete', 'edit', 'close', 'retry', 'loading', 'saving', 'saved', 'back', 'continue', 'search', 'yes', 'no', 'notProvided', 'required', 'optional', 'actions', 'status', 'name', 'email', 'created', 'updated', 'error.generic']) {
      expect(`common.${k}` in en, k).toBe(true)
      expect(`common.${k}` in pt, k).toBe(true)
    }
  })
})
