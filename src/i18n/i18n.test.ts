import { describe, expect, it } from 'vitest'
import { en } from './dictionaries/en'
import { pt } from './dictionaries/pt'
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
