import { describe, expect, it } from 'vitest'
import { en, pt } from '@/i18n/dictionaries/full'
import { adminNav, businessNav } from './nav'

describe('dashboard navigation labels', () => {
  const items = [...adminNav, ...businessNav]

  it('are dictionary keys, never literal labels', () => {
    for (const item of items) {
      expect('label' in item, item.to).toBe(false)
      // `editor.nav` belongs to the Editor's own area file (ADR-0043); every other label is a `nav.*` key.
      expect(item.labelKey, item.to).toMatch(/^(nav\.|editor\.nav$)/)
    }
  })

  it('exist in English and Portuguese', () => {
    for (const item of items) {
      expect(item.labelKey in en, item.labelKey).toBe(true)
      expect(item.labelKey in pt, item.labelKey).toBe(true)
    }
  })
})
