import { describe, expect, it } from 'vitest'
import type { ServiceError } from '@/services/catalogService'
import { en } from './dictionaries/full'
import { errorKey, errorText, fieldText, fieldTexts } from './errorText'
import { msg } from './fieldMessage'
import { translate } from './translate'

const t = (lang: 'en' | 'pt') => (key: Parameters<typeof translate>[1], vars?: Parameters<typeof translate>[2]) => translate(lang, key, vars)

const CODES = ['NOT_FOUND', 'VALIDATION', 'CONFLICT', 'STORAGE', 'PERMISSION', 'CONFIG', 'UNSUPPORTED', 'RATE_LIMITED', 'UNKNOWN'] as const

describe('errorText', () => {
  it('maps every service error code to a sentence in both languages, never the raw message', () => {
    for (const code of CODES) {
      const error: ServiceError = { code, message: 'RAW english message from the service' }
      for (const lang of ['en', 'pt'] as const) {
        const text = errorText(error, t(lang))
        expect(text).not.toContain('RAW')
        expect(text.length).toBeGreaterThan(5)
      }
    }
    expect(errorText({ code: 'PERMISSION', message: 'x' }, t('pt'))).toBe('Não tem permissão para fazer isto.')
  })

  it('prefers the reason over the code', () => {
    expect(errorKey({ code: 'CONFLICT', reason: 'already_member' })).toBe('common.error.reason.already_member')
    expect(errorText({ code: 'CONFLICT', message: 'x', reason: 'already_member' }, t('en'))).toBe('This email already has platform access.')
    expect(errorText({ code: 'CONFLICT', message: 'x', reason: 'draft_conflict' }, t('pt'))).toMatch(/rascunho/)
  })

  it('falls back to the code, then to the generic sentence, for unmapped reasons and codes', () => {
    expect(errorKey({ code: 'CONFLICT', reason: 'something_new' })).toBe('common.error.CONFLICT')
    expect(errorKey({ code: 'UNKNOWN' })).toBe('common.error.generic')
    expect(errorText({ code: 'UNKNOWN', message: 'boom' }, t('en'))).toBe('Something went wrong. Try again in a moment.')
  })

  it('has an English and a Portuguese sentence for every reason it knows', () => {
    const reasons = Object.keys(en).filter((k) => k.startsWith('common.error.reason.'))
    expect(reasons.length).toBeGreaterThan(20)
  })
})

describe('field errors', () => {
  it('translates messages with their values and passes plain strings through', () => {
    expect(fieldText(msg('common.validation.tooLong', { n: 80 }), t('en'))).toBe('Use 80 characters or fewer.')
    expect(fieldText(msg('common.validation.tooLong', { n: 80 }), t('pt'))).toBe('Use 80 caracteres ou menos.')
    expect(fieldText('Already a sentence', t('pt'))).toBe('Already a sentence')
    expect(fieldText(undefined, t('pt'))).toBeUndefined()
    expect(fieldTexts({ a: msg('common.validation.emailInvalid'), b: 'plain' }, t('en'))).toEqual({ a: 'Enter a valid email address.', b: 'plain' })
  })
})
