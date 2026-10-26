import { describe, expect, it } from 'vitest'
import type { BusinessInput } from './catalogService'
import { BUSINESS_LIMITS, validateBusiness } from './validation'

const base = (): BusinessInput => ({
  name: 'Oak & Co',
  slug: 'oak-co',
  description: '',
  contact: {},
  status: 'draft',
  branding: { accentColor: '#7A5C45' },
  defaultCurrency: 'EUR',
})

/** A valid email address of exactly `n` characters. */
const email = (n: number) => `${'a'.repeat(n - '@ex.com'.length)}@ex.com`

describe('S2 Task 2: validateBusiness field limits (R-W3-7)', () => {
  it("a 501-character address gives fieldErrors['contact.address'] = 'Use 500 characters or fewer.'", () => {
    expect(validateBusiness({ ...base(), contact: { address: 'a'.repeat(501) } }, [])['contact.address']).toBe('Use 500 characters or fewer.')
  })

  it('one character over each limit gives the field error', () => {
    expect(validateBusiness({ ...base(), slug: 'a'.repeat(64) }, []).slug).toBe('Use 63 characters or fewer.')
    expect(validateBusiness({ ...base(), contact: { email: email(321) } }, [])['contact.email']).toBe('Use 320 characters or fewer.')
    expect(validateBusiness({ ...base(), contact: { phone: '1'.repeat(51) } }, [])['contact.phone']).toBe('Use 50 characters or fewer.')
    expect(validateBusiness({ ...base(), description: 'd'.repeat(1001) }, []).description).toBe('Use 1000 characters or fewer.')
  })

  it('exactly at each limit is valid', () => {
    const atLimit: BusinessInput = {
      ...base(),
      name: 'n'.repeat(BUSINESS_LIMITS.name),
      slug: 'a'.repeat(BUSINESS_LIMITS.slug),
      description: 'd'.repeat(BUSINESS_LIMITS.description),
      contact: { email: email(BUSINESS_LIMITS.email), phone: '1'.repeat(BUSINESS_LIMITS.phone), address: 'a'.repeat(BUSINESS_LIMITS.address) },
    }
    expect(validateBusiness(atLimit, [])).toEqual({})
  })

  it('lengths are measured after trimming', () => {
    expect(validateBusiness({ ...base(), description: ` ${'d'.repeat(1000)} ` }, [])).toEqual({})
  })

  it('the name keeps its message', () => {
    expect(validateBusiness({ ...base(), name: 'n'.repeat(81) }, []).name).toBe('Use 80 characters or fewer.')
  })
})
