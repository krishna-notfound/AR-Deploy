import { describe, expect, it } from 'vitest'
import type { ProductInput } from './catalogService'
import { validateProductDraft } from './validation'

function draft(cta: ProductInput['cta']): ProductInput {
  return {
    businessId: 'biz_casa',
    slug: 'test-chair',
    name: { en: 'Test Chair' },
    shortDescription: { en: '' },
    description: { en: '' },
    category: 'chair',
    price: 10000,
    currency: 'EUR',
    images: [],
    models: {},
    dimensions: { width: 50, height: 80, depth: 50, unit: 'cm' },
    material: { en: 'Oak' },
    variants: [],
    cta,
  }
}

describe('product CTA label (R-W4-13)', () => {
  it("a CTA url with an empty English label gives fieldErrors['cta.label']", () => {
    expect(validateProductDraft(draft({ label: { en: '' }, url: 'https://wa.me/351' }), [])['cta.label']).toBe('Add a button label, or remove the link.')
  })
  it('a whitespace-only label counts as empty', () => {
    expect(validateProductDraft(draft({ label: { en: '   ' }, url: 'https://wa.me/351' }), [])['cta.label']).toBe('Add a button label, or remove the link.')
  })
  it('a label with no url is valid', () => {
    expect(validateProductDraft(draft({ label: { en: '' } }), [])['cta.label']).toBeUndefined()
    expect(validateProductDraft(draft({ label: { en: 'Contact' }, url: 'https://wa.me/351' }), [])['cta.label']).toBeUndefined()
  })
})
