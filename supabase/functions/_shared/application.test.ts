// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { MODEL_READINESS, PHOTO_READINESS, PRODUCT_COUNT_RANGES, validateApplication } from './application'
import { type ApplyFormConfig, DEFAULT_APPLY_FORM, type CustomQuestion, rulesFromConfig } from './applyForm'

const VALID = {
  businessName: 'Atelier Norte',
  website: 'atelier.example',
  description: 'Handmade oak furniture for small apartments.',
  category: 'furniture',
  country: 'Portugal',
  city: 'Porto',
  applicantName: 'Ana Silva',
  applicantRole: 'Founder',
  applicantEmail: 'Ana@Studio.test',
  applicantPhone: '',
  language: 'pt',
  productCount: '11-50',
  photoReadiness: 'some',
  modelReadiness: 'need_help',
  notes: '',
  consent: true,
  acceptedTerms: true,
  submissionKey: '6f1c1b1e-3c55-4a1c-9d47-0a3c1e2b9f10',
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T

/** Rules for the default form with one change applied to a copy of its config. */
function rulesOf(change: (c: ApplyFormConfig) => void, version = 3) {
  const c = clone(DEFAULT_APPLY_FORM)
  change(c)
  return rulesFromConfig(c, version)!
}
const place = (c: ApplyFormConfig, key: string, patch: { hidden?: boolean; required?: boolean }) => {
  const p = c.fields.find((f) => f.key === key)!
  Object.assign(p, patch)
}
const Q = (over: Partial<CustomQuestion> & Pick<CustomQuestion, 'id' | 'type'>): CustomQuestion => ({ label: { en: `Question ${over.id}`, pt: `Pergunta ${over.id}` }, ...over })
const withQuestions = (qs: CustomQuestion[], requiredIds: string[] = []) => (c: ApplyFormConfig) => {
  c.customQuestions = qs
  for (const q of qs) c.fields.push({ key: `custom:${q.id}`, stepId: 'catalogue', required: requiredIds.includes(q.id) })
}
const CHOICES = [
  { id: 'o1', label: { en: 'Wood', pt: 'Madeira' } },
  { id: 'o2', label: { en: 'Metal' } },
  { id: 'o3', label: { en: 'Glass', pt: 'Vidro' } },
]

describe('validateApplication without rules (today)', () => {
  it('accepts the sample, normalises it and stores no custom answers', () => {
    const v = validateApplication(VALID)
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.value).toMatchObject({ businessName: 'Atelier Norte', website: 'https://atelier.example', applicantEmail: 'ana@studio.test', applicantPhone: null, notes: null, custom: [], formVersion: 0 })
  })

  it('requires the ten required fields, the consent and the Terms', () => {
    const v = validateApplication({ language: 'en', submissionKey: VALID.submissionKey })
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(Object.keys(v.errors).sort()).toEqual(
      ['applicantEmail', 'applicantName', 'acceptedTerms', 'businessName', 'category', 'city', 'consent', 'country', 'description', 'modelReadiness', 'photoReadiness', 'productCount'].sort(),
    )
    expect(v.stale).toBeUndefined()
  })

  it('keeps the length and format checks', () => {
    const v = validateApplication({ ...VALID, description: 'short', applicantEmail: 'nope', website: 'x', productCount: 'many' })
    expect(v).toEqual({ ok: false, errors: { description: 'too_short', applicantEmail: 'invalid_email', website: 'invalid_url', productCount: 'invalid_choice' } })
  })

  it('the choice constants match the form model', () => {
    expect(PRODUCT_COUNT_RANGES).toContain('200+')
    expect(PHOTO_READINESS).toHaveLength(3)
    expect(MODEL_READINESS).toHaveLength(4)
  })
})

describe('validateApplication with rules', () => {
  it('the default form behaves like no rules', () => {
    const rules = rulesFromConfig(DEFAULT_APPLY_FORM, 0)
    expect(validateApplication(VALID, rules!)).toEqual(validateApplication(VALID))
    expect(validateApplication({ ...VALID, city: '', description: 'short' }, rules!)).toEqual(validateApplication({ ...VALID, city: '', description: 'short' }))
  })

  it('a hidden field is ignored and stored as null, even when the visitor sent a value', () => {
    const rules = rulesOf((c) => {
      place(c, 'country', { hidden: true })
      place(c, 'city', { hidden: true })
      place(c, 'category', { hidden: true })
      place(c, 'description', { hidden: true })
      place(c, 'productCount', { hidden: true })
    })
    const v = validateApplication({ ...VALID, country: '', city: 'x'.repeat(500), category: 'bogus-value', description: '', productCount: 'nope' }, rules)
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.value).toMatchObject({ country: null, city: null, category: null, description: null, productCount: null, formVersion: 3 })
  })

  it('a hidden language takes the page language when valid, else English', () => {
    const rules = rulesOf((c) => place(c, 'language', { hidden: true }))
    const ok = (language: unknown) => {
      const v = validateApplication({ ...VALID, language }, rules)
      return v.ok ? v.value.language : null
    }
    expect(ok('pt')).toBe('pt')
    expect(ok('fr')).toBe('en')
    expect(ok(undefined)).toBe('en')
  })

  it('locked fields stay required and visible whatever the rules say', () => {
    const rules = rulesOf((c) => c.fields.forEach((f) => ['businessName', 'applicantName', 'applicantEmail'].includes(f.key) && Object.assign(f, { hidden: true, required: false })))
    // rulesFromConfig already ignores a hostile config; build hostile rules directly too.
    const hostile = { ...rules, fields: { ...rules.fields, businessName: { hidden: true, required: false }, applicantName: { hidden: true, required: false }, applicantEmail: { hidden: true, required: false } } }
    for (const r of [rules, hostile]) {
      const v = validateApplication({ ...VALID, businessName: '', applicantName: '', applicantEmail: '' }, r)
      expect(v).toMatchObject({ ok: false, errors: { businessName: 'required', applicantName: 'required', applicantEmail: 'required' } })
    }
  })

  it('consent and Terms stay required with any rules', () => {
    const v = validateApplication({ ...VALID, consent: false, acceptedTerms: false }, rulesOf(() => {}))
    expect(v).toMatchObject({ ok: false, errors: { consent: 'consent_required', acceptedTerms: 'terms_required' } })
  })

  it('an optional field left empty is null; filled, today\'s checks still apply', () => {
    const rules = rulesOf((c) => {
      place(c, 'country', { required: false })
      place(c, 'description', { required: false })
      place(c, 'productCount', { required: false })
    })
    const empty = validateApplication({ ...VALID, country: '', description: '', productCount: '' }, rules)
    expect(empty.ok && empty.value).toMatchObject({ country: null, description: null, productCount: null })
    const bad = validateApplication({ ...VALID, country: 'P', description: 'too short', productCount: 'many' }, rules)
    expect(bad).toMatchObject({ ok: false, errors: { country: 'too_short', description: 'too_short', productCount: 'invalid_choice' } })
  })

  it('flipping an optional field to required enforces it', () => {
    const rules = rulesOf((c) => {
      place(c, 'website', { required: true })
      place(c, 'notes', { required: true })
      place(c, 'applicantPhone', { required: true })
      place(c, 'applicantRole', { required: true })
    })
    const v = validateApplication({ ...VALID, website: '', notes: '', applicantPhone: '', applicantRole: '' }, rules)
    expect(v).toMatchObject({ ok: false, errors: { website: 'required', notes: 'required', applicantPhone: 'required', applicantRole: 'required' } })
  })

  describe('hidden options', () => {
    it('a hidden built-in option is stale', () => {
      const rules = rulesOf((c) => {
        c.hiddenOptions = { productCount: ['200+'], category: ['jewellery'] }
      })
      expect(validateApplication({ ...VALID, productCount: '200+' }, rules)).toMatchObject({ ok: false, stale: true })
      expect(validateApplication({ ...VALID, category: 'jewellery' }, rules)).toMatchObject({ ok: false, stale: true })
      expect(validateApplication({ ...VALID, productCount: '1-10' }, rules).ok).toBe(true)
    })

    it('hiding "other" makes a free-text category stale', () => {
      const rules = rulesOf((c) => {
        c.hiddenOptions = { category: ['other'] }
      })
      expect(validateApplication({ ...VALID, category: 'Taxidermy' }, rules)).toMatchObject({ ok: false, stale: true })
      expect(validateApplication({ ...VALID, category: 'decor' }, rules).ok).toBe(true)
      const open = rulesOf(() => {})
      expect(validateApplication({ ...VALID, category: 'Taxidermy' }, open).ok).toBe(true)
    })

    it('a hidden field never goes stale on a hidden option', () => {
      const rules = rulesOf((c) => {
        place(c, 'productCount', { hidden: true })
        c.hiddenOptions = { productCount: ['200+'] }
      })
      expect(validateApplication({ ...VALID, productCount: '200+' }, rules).ok).toBe(true)
    })
  })

  describe('custom questions', () => {
    const questions = [
      Q({ id: 'qs', type: 'short_text' }),
      Q({ id: 'ql', type: 'long_text' }),
      Q({ id: 'qy', type: 'yes_no' }),
      Q({ id: 'q1', type: 'single_choice', options: CHOICES }),
      Q({ id: 'qm', type: 'multi_choice', options: CHOICES }),
    ]
    const all = rulesOf(withQuestions(questions, ['qs', 'ql', 'qy', 'q1', 'qm']))
    const optional = rulesOf(withQuestions(questions))
    const answers = { qs: '  A  short   answer ', ql: 'Line one\nLine two', qy: false, q1: 'o2', qm: ['o3', 'o1'] }

    it('stores snapshots in form order with labels and option labels', () => {
      const v = validateApplication({ ...VALID, custom: answers }, all)
      expect(v.ok).toBe(true)
      if (!v.ok) return
      expect(v.value.custom).toEqual([
        { id: 'qs', type: 'short_text', label: { en: 'Question qs', pt: 'Pergunta qs' }, value: 'A short answer' },
        { id: 'ql', type: 'long_text', label: { en: 'Question ql', pt: 'Pergunta ql' }, value: 'Line one\nLine two' },
        { id: 'qy', type: 'yes_no', label: { en: 'Question qy', pt: 'Pergunta qy' }, value: false },
        { id: 'q1', type: 'single_choice', label: { en: 'Question q1', pt: 'Pergunta q1' }, value: 'o2', valueLabels: [{ en: 'Metal' }] },
        { id: 'qm', type: 'multi_choice', label: { en: 'Question qm', pt: 'Pergunta qm' }, value: ['o3', 'o1'], valueLabels: [{ en: 'Glass', pt: 'Vidro' }, { en: 'Wood', pt: 'Madeira' }] },
      ])
      expect(v.value.formVersion).toBe(3)
    })

    it('leaves out unanswered optional questions', () => {
      const v = validateApplication({ ...VALID, custom: { qs: '', qm: [], q1: '' } }, optional)
      expect(v.ok && v.value.custom).toEqual([])
      expect(validateApplication(VALID, optional).ok).toBe(true)
    })

    it('required questions must be answered (false counts for yes/no)', () => {
      const v = validateApplication({ ...VALID, custom: { qs: ' ', ql: '', q1: '', qm: [] } }, all)
      expect(v).toMatchObject({ ok: false, errors: { 'custom.qs': 'required', 'custom.ql': 'required', 'custom.qy': 'required', 'custom.q1': 'required', 'custom.qm': 'required' } })
      expect(validateApplication({ ...VALID, custom: answers }, all).ok).toBe(true)
    })

    it('limits the text lengths: 200 short, 1000 long', () => {
      expect(validateApplication({ ...VALID, custom: { ...answers, qs: 'a'.repeat(201) } }, all)).toMatchObject({ ok: false, errors: { 'custom.qs': 'too_long' } })
      expect(validateApplication({ ...VALID, custom: { ...answers, qs: 'a'.repeat(200), ql: 'b'.repeat(1000) } }, all).ok).toBe(true)
      expect(validateApplication({ ...VALID, custom: { ...answers, ql: 'b'.repeat(1001) } }, all)).toMatchObject({ ok: false, errors: { 'custom.ql': 'too_long' } })
    })

    it('refuses the wrong shape of an answer', () => {
      const v = validateApplication({ ...VALID, custom: { ...answers, qy: 'yes', q1: ['o1'], qm: 'o1', qs: 5 } }, all)
      expect(v).toMatchObject({ ok: false, errors: { 'custom.qy': 'invalid_choice', 'custom.q1': 'invalid_choice', 'custom.qm': 'invalid_choice', 'custom.qs': 'required' } })
      expect(validateApplication({ ...VALID, custom: { ...answers, qm: ['o1', 'o1'] } }, all)).toMatchObject({ ok: false, errors: { 'custom.qm': 'invalid_choice' } })
    })

    it('an unknown question id or option id is stale', () => {
      expect(validateApplication({ ...VALID, custom: { ...answers, ghost: 'x' } }, all)).toMatchObject({ ok: false, stale: true })
      expect(validateApplication({ ...VALID, custom: { ...answers, q1: 'removed' } }, all)).toMatchObject({ ok: false, stale: true })
      expect(validateApplication({ ...VALID, custom: { ...answers, qm: ['o1', 'removed'] } }, all)).toMatchObject({ ok: false, stale: true })
    })

    it('answers sent while nothing is published are stale', () => {
      expect(validateApplication({ ...VALID, custom: { qs: 'x' } })).toMatchObject({ ok: false, stale: true })
      expect(validateApplication({ ...VALID, custom: {} }).ok).toBe(true)
    })

    it('refuses a custom block over 40,000 bytes', () => {
      const opts = Array.from({ length: 10 }, (_, i) => ({ id: `o${i}`, label: { en: '€'.repeat(80), pt: '€'.repeat(80) } }))
      const big = Array.from({ length: 10 }, (_, i) => Q({ id: `b${i}`, type: 'multi_choice', options: opts, label: { en: '€'.repeat(200), pt: '€'.repeat(200) } }))
      const rules = rulesOf(withQuestions(big))
      const custom = Object.fromEntries(big.map((q) => [q.id, opts.map((o) => o.id)]))
      expect(validateApplication({ ...VALID, custom }, rules)).toMatchObject({ ok: false, errors: { custom: 'too_long' } })
    })
  })
})
