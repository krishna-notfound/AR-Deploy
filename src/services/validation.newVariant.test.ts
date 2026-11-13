// ADR-0068: a variant added from the 3D model request form follows the editor's variant rules.
import { describe, expect, it } from 'vitest'
import { MAX_VARIANTS, cleanNewVariant, validateNewVariant } from './validation'

describe('new variant rules (ADR-0068)', () => {
  it('trims the names and drops an empty Portuguese name and an empty swatch', () => {
    expect(cleanNewVariant({ name: { en: '  Walnut ', pt: '  ' }, colorHex: '' })).toEqual({ name: { en: 'Walnut' } })
    expect(cleanNewVariant({ name: { en: 'Walnut', pt: ' Nogueira ' }, colorHex: '#5A3E2B' })).toEqual({ name: { en: 'Walnut', pt: 'Nogueira' }, colorHex: '#5A3E2B' })
  })

  it('needs an English name, any text: a colour, a finish, a size', () => {
    expect(validateNewVariant({ name: { en: '   ' } }, 0)).toEqual({ variantName: { key: 'common.validation.product.variantNameRequired' } })
    for (const en of ['Walnut', 'Matt lacquer', '200 cm']) expect(validateNewVariant({ name: { en } }, 0)).toEqual({})
  })

  it('a swatch, when given, is a hex colour', () => {
    expect(validateNewVariant({ name: { en: 'Walnut' }, colorHex: 'brown' }, 0)).toEqual({ variantColor: { key: 'common.validation.colourInvalid' } })
    expect(validateNewVariant({ name: { en: 'Walnut' }, colorHex: '#5a3e2b' }, 0)).toEqual({})
  })

  it('keeps the product within the variant cap (same as save_product)', () => {
    expect(validateNewVariant({ name: { en: 'Walnut' } }, MAX_VARIANTS - 1)).toEqual({})
    expect(validateNewVariant({ name: { en: 'Walnut' } }, MAX_VARIANTS)).toEqual({ variants: { key: 'common.validation.product.variantsMax', vars: { n: MAX_VARIANTS } } })
  })

  it('a name used by another variant is allowed, as in the editor', () => {
    expect(validateNewVariant({ name: { en: 'Oak' } }, 3)).toEqual({})
  })
})
