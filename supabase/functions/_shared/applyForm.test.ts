import { describe, expect, it } from 'vitest'
import { en } from '../../../src/i18n/dictionaries/en'
import { pt } from '../../../src/i18n/dictionaries/pt'
import { MODEL_READINESS, PHOTO_READINESS, PRODUCT_COUNT_RANGES } from './application'
import {
  APPLY_BUILTIN_KEYS,
  APPLY_CATEGORY_KEYS,
  APPLY_EDITABLE_KEYS,
  APPLY_TEXT_TOKENS,
  BUILTIN_FIELDS,
  DEFAULT_APPLY_FORM,
  LOCKED_FIELDS,
  resolveApplyForm,
  rulesFromConfig,
  validateApplyForm,
  type ApplyFormConfig,
} from './applyForm'

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const form = (): ApplyFormConfig => clone(DEFAULT_APPLY_FORM)
const tokens = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).sort()

describe('built-in form model', () => {
  it('has the 15 built-in fields and the 3 locked ones', () => {
    expect(APPLY_BUILTIN_KEYS).toHaveLength(15)
    expect([...LOCKED_FIELDS]).toEqual(['businessName', 'applicantName', 'applicantEmail'])
    for (const k of LOCKED_FIELDS) expect(BUILTIN_FIELDS[k].locked).toBe(true)
  })

  it('option values equal the constants in application.ts', () => {
    expect(BUILTIN_FIELDS.productCount.options).toEqual([...PRODUCT_COUNT_RANGES])
    expect(BUILTIN_FIELDS.photoReadiness.options).toEqual([...PHOTO_READINESS])
    expect(BUILTIN_FIELDS.modelReadiness.options).toEqual([...MODEL_READINESS])
    expect(BUILTIN_FIELDS.category.options).toEqual([...APPLY_CATEGORY_KEYS])
    // Every option has a dictionary label.
    for (const [prefix, list] of [['cat', APPLY_CATEGORY_KEYS], ['count', PRODUCT_COUNT_RANGES], ['photos', PHOTO_READINESS], ['models', MODEL_READINESS]] as const)
      for (const o of list) expect(en).toHaveProperty([`apply.${prefix}.${o}`])
  })

  it('APPLY_EDITABLE_KEYS is every apply.* dictionary key except apply.step.* and apply.done.demo, with the same tokens in EN and PT', () => {
    const all = Object.keys(en).filter((k) => k.startsWith('apply.'))
    const expected = all.filter((k) => !k.startsWith('apply.step.') && k !== 'apply.done.demo')
    expect([...APPLY_EDITABLE_KEYS].sort()).toEqual(expected.sort())
    for (const k of APPLY_EDITABLE_KEYS) {
      const want = tokens((en as Record<string, string>)[k]!)
      expect(tokens((pt as Record<string, string>)[k]!), k).toEqual(want)
      expect([...(APPLY_TEXT_TOKENS[k] ?? [])].sort(), k).toEqual(want)
    }
  })
})

describe('resolveApplyForm', () => {
  const stepsOf = (c: ApplyFormConfig | null) => resolveApplyForm(c).map((s) => [s.id, s.fields.map((f) => f.key)] as const)
  const today = [
    ['business', ['businessName', 'website', 'category', 'description']],
    ['location', ['country', 'city']],
    ['contact', ['applicantName', 'applicantRole', 'applicantEmail', 'applicantPhone', 'language']],
    ['catalogue', ['productCount', 'photoReadiness', 'modelReadiness', 'notes']],
    ['review', []],
  ]

  it('null equals today: 5 steps, 15 fields on their current steps; the default config resolves the same', () => {
    expect(stepsOf(null)).toEqual(today)
    expect(stepsOf(form())).toEqual(today)
  })

  it("today's required flags", () => {
    const req = Object.fromEntries(resolveApplyForm(null).flatMap((s) => s.fields.map((f) => [f.key, f.required])))
    for (const k of ['businessName', 'description', 'category', 'country', 'city', 'applicantName', 'applicantEmail', 'productCount', 'photoReadiness', 'modelReadiness'])
      expect(req[k], k).toBe(true)
    for (const k of ['website', 'applicantRole', 'applicantPhone', 'notes']) expect(req[k], k).toBe(false)
  })

  it('a built-in key missing from fields gets its default placement', () => {
    const c = form()
    c.fields = c.fields.filter((f) => f.key !== 'city')
    expect(stepsOf(c)).toEqual(today)
  })

  it('moves, hides and drops steps with no visible field (Review stays)', () => {
    const c = form()
    c.fields = c.fields.map((f) => (f.key === 'city' || f.key === 'country' ? { ...f, hidden: true } : f))
    const ids = resolveApplyForm(c).map((s) => s.id)
    expect(ids).toEqual(['business', 'contact', 'catalogue', 'review'])
    const all = resolveApplyForm(c, { includeHidden: true })
    expect(all.map((s) => s.id)).toContain('location')
    expect(all.find((s) => s.id === 'location')!.fields.every((f) => f.hidden)).toBe(true)
  })

  it('places questions where the placement says, with the placement required flag', () => {
    const c = form()
    c.customQuestions = [{ id: 'q1', type: 'short_text', label: { en: 'Instagram handle' } }]
    c.fields = [{ key: 'custom:q1', stepId: 'location', required: true }, ...c.fields.filter((f) => f.key !== 'country'), { key: 'country', stepId: 'location' }]
    const loc = resolveApplyForm(c).find((s) => s.id === 'location')!
    expect(loc.fields.map((f) => f.key)).toEqual(['custom:q1', 'city', 'country'])
    expect(loc.fields[0]).toMatchObject({ required: true, question: { id: 'q1' } })
  })

  it('locked fields stay visible and required whatever the document says', () => {
    const c = form()
    c.fields = c.fields.map((f) => (f.key === 'applicantEmail' ? { ...f, hidden: true, required: false } : f))
    const f = resolveApplyForm(c).flatMap((s) => s.fields).find((x) => x.key === 'applicantEmail')!
    expect(f).toMatchObject({ hidden: false, required: true, locked: true })
  })
})

describe('rulesFromConfig', () => {
  it('null gives null', () => expect(rulesFromConfig(null)).toBeNull())

  it('carries hidden, required, hidden options, questions in form order and the version', () => {
    const c = form()
    c.customQuestions = [
      { id: 'q1', type: 'yes_no', label: { en: 'Do you ship?' } },
      { id: 'q2', type: 'short_text', label: { en: 'Handle' } },
    ]
    c.fields = [...c.fields.map((f) => (f.key === 'applicantPhone' ? { ...f, hidden: true } : f)), { key: 'custom:q2', stepId: 'catalogue', required: true }, { key: 'custom:q1', stepId: 'business' }]
    c.hiddenOptions = { category: ['other'] }
    const r = rulesFromConfig(c, 4)!
    expect(r.version).toBe(4)
    expect(r.fields.applicantPhone).toEqual({ hidden: true, required: false })
    expect(r.fields.website).toEqual({ hidden: false, required: false })
    expect(r.fields.businessName).toEqual({ hidden: false, required: true })
    expect(r.hiddenOptions).toEqual({ category: ['other'] })
    expect(r.questions.map((q) => [q.id, q.required])).toEqual([['q1', false], ['q2', true]])
    expect(Object.keys(r.fields)).toHaveLength(15)
  })
})

describe('validateApplyForm', () => {
  const bad = (mutate: (c: ApplyFormConfig) => void) => {
    const c = form()
    mutate(c)
    return validateApplyForm(c)
  }
  const q = (id: string, extra: Partial<ApplyFormConfig['customQuestions'][number]> = {}): ApplyFormConfig['customQuestions'][number] => ({ id, type: 'short_text', label: { en: `Q ${id}` }, ...extra })
  const place = (c: ApplyFormConfig, ...ids: string[]) => c.fields.push(...ids.map((id) => ({ key: `custom:${id}` as const, stepId: 'catalogue' })))

  it('accepts the default form', () => expect(validateApplyForm(form())).toEqual({}))

  it('refuses a hidden or optional locked field', () => {
    expect(Object.keys(bad((c) => void (c.fields.find((f) => f.key === 'businessName')!.hidden = true)))).toContain('fields.0.hidden')
    expect(Object.values(bad((c) => void (c.fields.find((f) => f.key === 'applicantEmail')!.required = false)))).toContain('locked')
  })

  it('Review must be last and unique; 1 to 8 steps', () => {
    expect(bad((c) => void c.steps.reverse())).toHaveProperty('steps')
    expect(bad((c) => void c.steps.pop())).toHaveProperty('steps')
    expect(bad((c) => void c.steps.splice(1, 0, { id: 'dup', builtin: 'review' }))).toHaveProperty('steps')
    expect(
      bad((c) => {
        for (let i = 0; i < 4; i++) c.steps.splice(1, 0, { id: `s${i}`, title: { en: `S${i}` } })
      }),
    ).toHaveProperty('steps') // 9 steps
    expect(
      bad((c) => {
        for (let i = 0; i < 3; i++) c.steps.splice(1, 0, { id: `s${i}`, title: { en: `S${i}` } })
      }),
    ).toEqual({}) // 8 steps
  })

  it('refuses a field on Review or on an unknown step, an unknown key, a repeated key', () => {
    expect(bad((c) => void (c.fields[0]!.stepId = 'review'))).toHaveProperty(['fields.0.stepId'], 'review_misplaced')
    expect(bad((c) => void (c.fields[0]!.stepId = 'nope'))).toHaveProperty(['fields.0.stepId'], 'step_unknown')
    expect(bad((c) => void c.fields.push({ key: 'custom:ghost', stepId: 'business' }))).toHaveProperty(['fields.15.key'], 'unknown_key')
    expect(bad((c) => void c.fields.push({ key: 'city', stepId: 'business' }))).toHaveProperty(['fields.15.key'], 'duplicate_key')
  })

  it('questions: at most 10, one placement each, option counts by type', () => {
    expect(
      bad((c) => {
        c.customQuestions = Array.from({ length: 10 }, (_, i) => q(`q${i}`))
        place(c, ...c.customQuestions.map((x) => x.id))
      }),
    ).toEqual({})
    expect(
      bad((c) => {
        c.customQuestions = Array.from({ length: 11 }, (_, i) => q(`q${i}`))
        place(c, ...c.customQuestions.map((x) => x.id))
      }),
    ).toHaveProperty('customQuestions')
    expect(bad((c) => void (c.customQuestions = [q('a')]))).toHaveProperty(['customQuestions.0'], 'missing_placement')
    expect(bad((c) => { c.customQuestions = [q('a', { type: 'single_choice', options: [{ id: 'x', label: { en: 'X' } }] })]; place(c, 'a') })).toHaveProperty(['customQuestions.0.options'], 'options_count')
    expect(bad((c) => { c.customQuestions = [q('a', { options: [{ id: 'x', label: { en: 'X' } }, { id: 'y', label: { en: 'Y' } }] })]; place(c, 'a') })).toHaveProperty(['customQuestions.0.options'], 'options_not_allowed')
    expect(bad((c) => { c.customQuestions = [q('a', { type: 'multi_choice', options: [{ id: 'x', label: { en: 'X' } }, { id: 'y', label: { en: 'Y' } }] })]; place(c, 'a') })).toEqual({})
  })

  it('a choice field cannot have every option hidden', () => {
    expect(bad((c) => void (c.hiddenOptions = { photoReadiness: ['all', 'some'] }))).toEqual({})
    expect(bad((c) => void (c.hiddenOptions = { photoReadiness: ['all', 'some', 'none'] }))).toHaveProperty(['hiddenOptions.photoReadiness'], 'last_option')
    expect(bad((c) => void (c.hiddenOptions = { photoReadiness: ['bogus'] }))).toHaveProperty(['hiddenOptions.photoReadiness'])
    expect(bad((c) => void (c.hiddenOptions = { website: ['x'] } as never))).toHaveProperty(['hiddenOptions.website'])
  })

  it('texts: only editable keys, 600 characters, only the original tokens, {ref} kept', () => {
    expect(bad((c) => void (c.texts = { 'apply.done.title': { en: 'Thanks!', pt: 'Obrigado!' } }))).toEqual({})
    expect(bad((c) => void (c.texts = { 'apply.done.title': { en: 'x'.repeat(601) } }))).toHaveProperty(['texts.apply.done.title.en'], 'too_long')
    expect(bad((c) => void (c.texts = { 'apply.done.title': { en: 'Hi {name}' } }))).toHaveProperty(['texts.apply.done.title.en'], 'unknown_token')
    expect(bad((c) => void (c.texts = { 'apply.done.reference': { en: 'Ref' } }))).toHaveProperty(['texts.apply.done.reference.en'], 'missing_token')
    expect(bad((c) => void (c.texts = { 'apply.done.reference': { pt: 'Ref: {ref}' } }))).toEqual({})
    expect(bad((c) => void (c.texts = { 'apply.step.business': { en: 'x' } }))).toHaveProperty(['texts.apply.step.business'], 'unknown_key')
    expect(bad((c) => void (c.texts = { 'apply.done.demo': { en: 'x' } }))).toHaveProperty(['texts.apply.done.demo'], 'unknown_key')
    expect(bad((c) => void (c.texts = { 'other.key': { en: 'x' } }))).toHaveProperty(['texts.other.key'], 'unknown_key')
  })

  it('a new step needs an English title', () => {
    expect(bad((c) => void c.steps.splice(1, 0, { id: 'n1' }))).toHaveProperty(['steps.1.title.en'], 'required')
  })
})
