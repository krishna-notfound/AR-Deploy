import { describe, expect, it } from 'vitest'
import { en } from '@/i18n/dictionaries/en'
import { pt } from '@/i18n/dictionaries/pt'
import { adminNav, businessNav } from './nav'

describe('dashboard navigation labels', () => {
  const items = [...adminNav, ...businessNav]

  it('are dictionary keys, never literal labels', () => {
    for (const item of items) {
      expect('label' in item, item.to).toBe(false)
      expect(item.labelKey, item.to).toMatch(/^nav\./)
    }
  })

  it('exist in English and Portuguese', () => {
    for (const item of items) {
      expect(item.labelKey in en, item.labelKey).toBe(true)
      expect(item.labelKey in pt, item.labelKey).toBe(true)
    }
  })
})
