import { describe, expect, it } from 'vitest'
import { type ApplyFormConfig, DEFAULT_APPLY_FORM, resolveApplyForm, validateApplyForm } from '@/domain/siteContent'
import {
  addOption,
  addQuestion,
  addStep,
  deleteQuestion,
  deleteStep,
  layoutOf,
  materialize,
  moveField,
  moveFieldToStep,
  moveOption,
  moveStep,
  positionOf,
  removeOption,
  resetText,
  setHidden,
  setOptionHidden,
  setRequired,
  setStepText,
  setText,
  updateQuestion,
} from './formOps'

const base = (): ApplyFormConfig => JSON.parse(JSON.stringify(DEFAULT_APPLY_FORM)) as ApplyFormConfig
const keysOf = (c: ApplyFormConfig, stepId: string) => layoutOf(c).find((s) => s.id === stepId)!.fields.map((f) => f.key)

describe('materialize', () => {
  it('writes every field out in display order without changing what the form looks like', () => {
    const c = materialize(base())
    expect(c.fields).toHaveLength(15)
    expect(layoutOf(c).map((s) => s.fields.map((f) => [f.key, f.hidden, f.required]))).toEqual(layoutOf(base()).map((s) => s.fields.map((f) => [f.key, f.hidden, f.required])))
    expect(validateApplyForm(c)).toEqual({})
  })
})

describe('moveField', () => {
  it('moves a field up and down inside its step, and stops at the edges', () => {
    const c = base()
    expect(keysOf(c, 'business')).toEqual(['businessName', 'website', 'category', 'description'])
    const down = moveField(c, 'businessName', 1)
    expect(keysOf(down, 'business')).toEqual(['website', 'businessName', 'category', 'description'])
    expect(keysOf(moveField(down, 'businessName', -1), 'business')).toEqual(['businessName', 'website', 'category', 'description'])
    expect(moveField(c, 'businessName', -1)).toBe(c)
    expect(moveField(c, 'description', 1)).toBe(c)
    expect(moveField(c, 'nope', 1)).toBe(c)
  })

  it('does not change the input', () => {
    const c = base()
    const before = JSON.stringify(c)
    moveField(c, 'website', 1)
    expect(JSON.stringify(c)).toBe(before)
  })

  it('reports where a moved field ended up', () => {
    expect(positionOf(moveField(base(), 'businessName', 1), 'businessName')).toEqual({ step: 1, position: 2 })
    expect(positionOf(base(), 'notes')).toEqual({ step: 4, position: 4 })
    expect(positionOf(base(), 'ghost')).toBeNull()
  })
})

describe('moveFieldToStep', () => {
  it('puts the field last on the other step and takes it off the old one', () => {
    const c = moveFieldToStep(base(), 'applicantPhone', 'location')
    expect(keysOf(c, 'location')).toEqual(['country', 'city', 'applicantPhone'])
    expect(keysOf(c, 'contact')).not.toContain('applicantPhone')
    expect(validateApplyForm(c)).toEqual({})
  })

  it('refuses Review, an unknown step and the same step', () => {
    const c = base()
    expect(moveFieldToStep(c, 'notes', 'review')).toBe(c)
    expect(moveFieldToStep(c, 'notes', 'nowhere')).toBe(c)
    expect(moveFieldToStep(c, 'notes', 'catalogue')).toBe(c)
  })

  it('can empty a step; the resolver then skips it', () => {
    let c = base()
    c = moveFieldToStep(c, 'country', 'business')
    c = moveFieldToStep(c, 'city', 'business')
    expect(keysOf(c, 'location')).toEqual([])
    expect(resolveApplyForm(c).map((s) => s.id)).toEqual(['business', 'contact', 'catalogue', 'review'])
  })
})

describe('required and hidden', () => {
  it('flips required for an ordinary field and keeps the rest', () => {
    const c = setRequired(base(), 'website', true)
    expect(layoutOf(c)[0]!.fields.find((f) => f.key === 'website')!.required).toBe(true)
    expect(layoutOf(setRequired(c, 'description', false))[0]!.fields.find((f) => f.key === 'description')!.required).toBe(false)
  })

  it('locked fields cannot be hidden or made optional; language has no required switch; questions cannot be hidden', () => {
    const c = base()
    for (const k of ['businessName', 'applicantName', 'applicantEmail']) {
      expect(setHidden(c, k, true)).toBe(c)
      expect(setRequired(c, k, false)).toBe(c)
    }
    expect(setRequired(c, 'language', false)).toBe(c)
    const withQ = addQuestion(c, 'business', 'short_text', 'Q').config
    const qKey = withQ.fields.find((f) => f.key.startsWith('custom:'))!.key
    expect(setHidden(withQ, qKey, true)).toBe(withQ)
  })

  it('hides and shows a field in its place', () => {
    const hidden = setHidden(base(), 'website', true)
    expect(layoutOf(hidden)[0]!.fields.find((f) => f.key === 'website')!.hidden).toBe(true)
    expect(resolveApplyForm(hidden)[0]!.fields.map((f) => f.key)).not.toContain('website')
    expect(layoutOf(setHidden(hidden, 'website', false))[0]!.fields.map((f) => f.key)).toContain('website')
    expect(validateApplyForm(hidden)).toEqual({})
  })
})

describe('options of a built-in choice field', () => {
  it('hides and shows options but never the last visible one', () => {
    let c = base()
    for (const v of ['1-10', '11-50', '51-200']) c = setOptionHidden(c, 'productCount', v, true)
    expect(c.hiddenOptions.productCount).toEqual(['1-10', '11-50', '51-200'])
    const refused = setOptionHidden(c, 'productCount', '200+', true)
    expect(refused).toBe(c)
    expect(validateApplyForm(c)).toEqual({})
    const shown = setOptionHidden(c, 'productCount', '1-10', false)
    expect(shown.hiddenOptions.productCount).toEqual(['11-50', '51-200'])
    expect(setOptionHidden(setOptionHidden(shown, 'productCount', '11-50', false), 'productCount', '51-200', false).hiddenOptions).toEqual({})
  })

  it('ignores a value that is not an option', () => {
    const c = base()
    expect(setOptionHidden(c, 'photoReadiness', 'bogus', true)).toBe(c)
  })
})

describe('steps', () => {
  it('adds steps before Review up to eight and then stops', () => {
    let c = base()
    for (let i = 0; i < 3; i++) {
      const r = addStep(c, `Extra ${i}`)
      expect(r.id).toBeTruthy()
      c = r.config
    }
    expect(c.steps).toHaveLength(8)
    expect(c.steps.at(-1)!.builtin).toBe('review')
    const full = addStep(c, 'One too many')
    expect(full.id).toBeNull()
    expect(full.config).toBe(c)
    expect(validateApplyForm(c)).toEqual({})
  })

  it('moves a step but never Review and never past it', () => {
    const c = base()
    const up = moveStep(c, 'contact', -1)
    expect(up.steps.map((s) => s.id)).toEqual(['business', 'contact', 'location', 'catalogue', 'review'])
    expect(moveStep(c, 'catalogue', 1)).toBe(c)
    expect(moveStep(c, 'review', -1)).toBe(c)
    expect(moveStep(c, 'business', -1)).toBe(c)
  })

  it('edits a step title and hint per language; empty goes back to the original (built-in) or keeps English (new)', () => {
    let c = setStepText(base(), 'business', 'title', 'en', 'About you')
    c = setStepText(c, 'business', 'title', 'pt', 'Sobre si')
    expect(c.steps[0]!.title).toEqual({ en: 'About you', pt: 'Sobre si' })
    c = setStepText(setStepText(c, 'business', 'title', 'en', ''), 'business', 'title', 'pt', '')
    expect(c.steps[0]!.title).toBeUndefined()
    const added = addStep(base(), 'Mine')
    const emptied = setStepText(added.config, added.id!, 'title', 'en', '')
    expect(emptied.steps.find((s) => s.id === added.id)!.title).toEqual({ en: '' })
    expect(validateApplyForm(emptied)).toMatchObject({ 'steps.4.title.en': 'required' })
  })

  it('deletes only a step the client added; its fields go to the step before', () => {
    const base0 = addStep(base(), 'Extra')
    let c = moveFieldToStep(base0.config, 'notes', base0.id!)
    expect(keysOf(c, base0.id!)).toEqual(['notes'])
    c = deleteStep(c, base0.id!)
    expect(c.steps.map((s) => s.id)).not.toContain(base0.id)
    expect(keysOf(c, 'catalogue')).toContain('notes')
    expect(deleteStep(base(), 'business')).toEqual(base())
    expect(validateApplyForm(c)).toEqual({})
  })
})

describe('questions', () => {
  it('adds a question on step 2 as its last field, and stops at ten', () => {
    let c = base()
    let firstId = ''
    for (let i = 0; i < 10; i++) {
      const r = addQuestion(c, 'location', 'short_text', `Question ${i}`)
      expect(r.id).toBeTruthy()
      firstId ||= r.id!
      c = r.config
    }
    expect(keysOf(c, 'location').slice(0, 3)).toEqual(['country', 'city', `custom:${firstId}`])
    expect(c.customQuestions).toHaveLength(10)
    const full = addQuestion(c, 'location', 'yes_no', 'Eleventh')
    expect(full.id).toBeNull()
    expect(full.config).toBe(c)
    expect(validateApplyForm(c)).toEqual({})
  })

  it('refuses a question on Review or an unknown step', () => {
    const c = base()
    expect(addQuestion(c, 'review', 'short_text', 'Q').id).toBeNull()
    expect(addQuestion(c, 'nowhere', 'short_text', 'Q').id).toBeNull()
  })

  it('a choice question starts with two options; other types have none; changing the type adjusts them', () => {
    const r = addQuestion(base(), 'business', 'multi_choice', 'Materials')
    const q = r.config.customQuestions[0]!
    expect(q.options).toHaveLength(2)
    expect(validateApplyForm(r.config)).toMatchObject({ 'customQuestions.0.options.0.label.en': 'required' })
    const text = updateQuestion(r.config, r.id!, { type: 'short_text' })
    expect(text.customQuestions[0]!.options).toBeUndefined()
    const back = updateQuestion(text, r.id!, { type: 'single_choice' })
    expect(back.customQuestions[0]!.options).toHaveLength(2)
  })

  it('options: add up to ten, remove down to two, reorder', () => {
    let { config: c, id } = addQuestion(base(), 'business', 'single_choice', 'Pick')
    const ids = () => c.customQuestions[0]!.options!.map((o) => o.id)
    for (let i = 0; i < 8; i++) c = addOption(c, id!)
    expect(ids()).toHaveLength(10)
    expect(addOption(c, id!)).toBe(c)
    const [first, second] = ids()
    c = moveOption(c, id!, first!, 1)
    expect(ids().slice(0, 2)).toEqual([second, first])
    expect(moveOption(c, id!, second!, -1)).toBe(c)
    while (ids().length > 2) c = removeOption(c, id!, ids()[0]!)
    expect(removeOption(c, id!, ids()[0]!)).toBe(c)
  })

  it('deletes a question and its placement', () => {
    const r = addQuestion(base(), 'business', 'yes_no', 'Ship abroad?')
    const c = deleteQuestion(r.config, r.id!)
    expect(c.customQuestions).toEqual([])
    expect(c.fields.some((f) => f.key.startsWith('custom:'))).toBe(false)
    expect(deleteQuestion(c, 'ghost')).toBe(c)
  })

  it('edits the label and help per language', () => {
    const r = addQuestion(base(), 'business', 'short_text', 'Where from?')
    let c = updateQuestion(r.config, r.id!, { label: { en: 'Where are you from?', pt: 'De onde é?' }, help: { en: 'Country' } })
    expect(c.customQuestions[0]).toMatchObject({ label: { en: 'Where are you from?', pt: 'De onde é?' }, help: { en: 'Country' } })
    c = updateQuestion(c, r.id!, { help: { en: '' } })
    expect(c.customQuestions[0]!.help).toBeUndefined()
  })
})

describe('wording', () => {
  it('sets and clears the wording of a text per language and resets it', () => {
    let c = setText(base(), 'apply.title', 'en', 'Join us')
    c = setText(c, 'apply.title', 'pt', 'Junte-se a nós')
    expect(c.texts['apply.title']).toEqual({ en: 'Join us', pt: 'Junte-se a nós' })
    c = setText(c, 'apply.title', 'en', '')
    expect(c.texts['apply.title']).toEqual({ pt: 'Junte-se a nós' })
    expect(resetText(c, 'apply.title').texts).toEqual({})
    expect(resetText(c, 'apply.next')).toBe(c)
    expect(setText(setText(base(), 'apply.title', 'en', 'x'), 'apply.title', 'en', '').texts).toEqual({})
  })

  it('an unknown token in a wording is refused by the validator', () => {
    const c = setText(base(), 'apply.stepOf', 'en', 'Step {n} of {total} {oops}')
    expect(validateApplyForm(c)).toMatchObject({ 'texts.apply.stepOf.en': 'unknown_token' })
    expect(validateApplyForm(setText(base(), 'apply.done.reference', 'en', 'Your number'))).toMatchObject({ 'texts.apply.done.reference.en': 'missing_token' })
  })
})
