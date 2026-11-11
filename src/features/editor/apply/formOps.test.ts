import { describe, expect, it } from 'vitest'
import { type ApplyFormConfig, DEFAULT_APPLY_FORM, MAX_APPLY_STEPS, MAX_CUSTOM_QUESTIONS, APPLY_BUILTIN_KEYS, removedFieldsOf, resolveApplyForm, rulesFromConfig, validateApplyForm } from '@/domain/siteContent'
import {
  addOption,
  addQuestion,
  addStep,
  canDeleteStep,
  isOriginalForm,
  deleteField,
  deleteQuestion,
  deleteStep,
  duplicateQuestion,
  layoutOf,
  materialize,
  moveField,
  moveFieldTo,
  moveFieldToStep,
  moveOption,
  moveStep,
  positionOf,
  removeOption,
  resetText,
  restoreField,
  restoreOriginal,
  setHidden,
  setOptionHidden,
  setRequired,
  setStepText,
  setText,
  startFromBlank,
  updateQuestion,
} from './formOps'

const base = (): ApplyFormConfig => JSON.parse(JSON.stringify(DEFAULT_APPLY_FORM)) as ApplyFormConfig
const keysOf = (c: ApplyFormConfig, stepId: string) => layoutOf(c).find((s) => s.id === stepId)!.fields.map((f) => f.key)

describe('materialize', () => {
  it('writes every field out in display order without changing what the form looks like', () => {
    const c = materialize(base())
    expect(c.fields).toHaveLength(16)
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

describe('moveFieldTo (drag and drop: any section, any place)', () => {
  it('moves a field to a position in the same section', () => {
    const c = moveFieldTo(base(), 'businessName', 'business', 2)
    expect(keysOf(c, 'business')).toEqual(['website', 'category', 'businessName', 'description'])
    expect(keysOf(moveFieldTo(base(), 'description', 'business', 0), 'business')).toEqual(['description', 'businessName', 'website', 'category'])
  })

  it('moves a field into another section at an index, counted among the fields already there', () => {
    const c = moveFieldTo(base(), 'applicantPhone', 'location', 1)
    expect(keysOf(c, 'location')).toEqual(['country', 'applicantPhone', 'city'])
    expect(keysOf(c, 'contact')).not.toContain('applicantPhone')
    expect(keysOf(moveFieldTo(base(), 'applicantPhone', 'location', 0), 'location')).toEqual(['applicantPhone', 'country', 'city'])
    expect(keysOf(moveFieldTo(base(), 'applicantPhone', 'location', 99), 'location')).toEqual(['country', 'city', 'applicantPhone'])
    expect(validateApplyForm(c)).toEqual({})
  })

  it('can fill an empty section', () => {
    const added = addStep(base(), 'Extra')
    const c = moveFieldTo(added.config, 'notes', added.id!, 0)
    expect(keysOf(c, added.id!)).toEqual(['notes'])
    expect(keysOf(c, 'catalogue')).not.toContain('notes')
  })

  it('returns the same config when nothing changes, and refuses Review, an unknown section or an unknown field', () => {
    const c = base()
    expect(moveFieldTo(c, 'businessName', 'business', 0)).toBe(c)
    expect(moveFieldTo(c, 'website', 'business', 1)).toBe(c)
    expect(moveFieldTo(c, 'notes', 'review', 0)).toBe(c)
    expect(moveFieldTo(c, 'notes', 'nowhere', 0)).toBe(c)
    expect(moveFieldTo(c, 'ghost', 'business', 0)).toBe(c)
  })

  it('moves an own question like any field and leaves the input alone', () => {
    const r = addQuestion(base(), 'business', 'short_text', 'Q')
    const before = JSON.stringify(r.config)
    const c = moveFieldTo(r.config, `custom:${r.id}`, 'contact', 0)
    expect(keysOf(c, 'contact')[0]).toBe(`custom:${r.id}`)
    expect(JSON.stringify(r.config)).toBe(before)
    expect(validateApplyForm(c)).toEqual({})
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
    expect(setHidden(c, 'applicantEmail', true)).toBe(c)
    expect(setRequired(c, 'applicantEmail', false)).toBe(c)
    // The names are ordinary questions now (ADR-0057): they can be hidden and made optional.
    for (const k of ['businessName', 'applicantName']) {
      expect(layoutOf(setHidden(c, k, true)).flatMap((s) => s.fields).find((f) => f.key === k)!.hidden).toBe(true)
      expect(layoutOf(setRequired(c, k, false)).flatMap((s) => s.fields).find((f) => f.key === k)!.required).toBe(false)
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
  it('adds steps before Review up to twelve and then stops', () => {
    let c = base()
    for (let i = 0; i < MAX_APPLY_STEPS - 5; i++) {
      const r = addStep(c, `Extra ${i}`)
      expect(r.id).toBeTruthy()
      c = r.config
    }
    expect(c.steps).toHaveLength(12)
    expect(c.steps.at(-1)!.builtin).toBe('review')
    const full = addStep(c, 'One too many')
    expect(full.id).toBeNull()
    expect(full.config).toBe(c)
    expect(validateApplyForm(c)).toEqual({})
  })

  it('adds a step right after a given section (Review stays last)', () => {
    const r = addStep(base(), 'Mine', 'location')
    expect(r.config.steps.map((s) => s.id)).toEqual(['business', 'location', r.id, 'contact', 'catalogue', 'review'])
    const afterReview = addStep(base(), 'Mine', 'review')
    expect(afterReview.config.steps.map((s) => s.id).at(-1)).toBe('review')
    expect(afterReview.config.steps).toHaveLength(6)
    const unknown = addStep(base(), 'Mine', 'nowhere')
    expect(unknown.config.steps.at(-2)!.id).toBe(unknown.id)
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
    expect(validateApplyForm(c)).toEqual({})
  })
})

describe('questions', () => {
  it('adds a question on step 2 as its last field, and stops at thirty', () => {
    let c = base()
    let firstId = ''
    for (let i = 0; i < MAX_CUSTOM_QUESTIONS; i++) {
      const r = addQuestion(c, 'location', 'short_text', `Question ${i}`)
      expect(r.id).toBeTruthy()
      firstId ||= r.id!
      c = r.config
    }
    expect(keysOf(c, 'location').slice(0, 3)).toEqual(['country', 'city', `custom:${firstId}`])
    expect(c.customQuestions).toHaveLength(30)
    const full = addQuestion(c, 'location', 'yes_no', 'Thirty-first')
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

  it('adds a question right below another field, on that field\'s section', () => {
    const r = addQuestion(base(), 'location', 'short_text', 'Q', 'website')
    expect(keysOf(r.config, 'business')).toEqual(['businessName', 'website', `custom:${r.id}`, 'category', 'description'])
    expect(keysOf(r.config, 'location')).not.toContain(`custom:${r.id}`)
    // An unknown anchor falls back to the end of the named section.
    const fallback = addQuestion(base(), 'location', 'short_text', 'Q', 'ghost')
    expect(keysOf(fallback.config, 'location').at(-1)).toBe(`custom:${fallback.id}`)
  })

  it('duplicates a question right below itself: new id, "(copy)" label, options with new ids, same required flag', () => {
    let c = addQuestion(base(), 'business', 'single_choice', 'Pick one').config
    const id = c.customQuestions[0]!.id
    c = updateQuestion(c, id, { label: { en: 'Pick one', pt: 'Escolha uma' }, help: { en: 'Any', pt: 'Qualquer' }, options: [{ id: 'a', label: { en: 'Wood', pt: 'Madeira' } }, { id: 'b', label: { en: 'Metal' } }] })
    c = setRequired(c, `custom:${id}`, true)
    const r = duplicateQuestion(c, id, { en: ' (copy)', pt: ' (cópia)' })
    expect(r.id).toBeTruthy()
    expect(r.id).not.toBe(id)
    const copy = r.config.customQuestions.find((q) => q.id === r.id)!
    expect(copy.label).toEqual({ en: 'Pick one (copy)', pt: 'Escolha uma (cópia)' })
    expect(copy.help).toEqual({ en: 'Any', pt: 'Qualquer' })
    expect(copy.options!.map((o) => o.label)).toEqual([{ en: 'Wood', pt: 'Madeira' }, { en: 'Metal' }])
    expect(copy.options!.map((o) => o.id)).not.toContain('a')
    expect(new Set(copy.options!.map((o) => o.id)).size).toBe(2)
    const keys = keysOf(r.config, 'business')
    expect(keys.indexOf(`custom:${r.id}`)).toBe(keys.indexOf(`custom:${id}`) + 1)
    expect(layoutOf(r.config)[0]!.fields.find((f) => f.key === `custom:${r.id}`)!.required).toBe(true)
    // The original is untouched.
    expect(r.config.customQuestions.find((q) => q.id === id)!.label).toEqual({ en: 'Pick one', pt: 'Escolha uma' })
    expect(validateApplyForm(r.config)).toEqual({})
  })

  it('a duplicate keeps the label within 200 characters and skips an empty Portuguese label', () => {
    const r = addQuestion(base(), 'business', 'short_text', 'x'.repeat(200))
    const d = duplicateQuestion(r.config, r.id!, { en: ' (copy)', pt: ' (cópia)' })
    const copy = d.config.customQuestions.find((q) => q.id === d.id)!
    expect(copy.label.en).toHaveLength(200)
    expect(copy.label.en.endsWith(' (copy)')).toBe(true)
    expect(copy.label.pt).toBeUndefined()
    expect(validateApplyForm(d.config)).toEqual({})
  })

  it('stops duplicating at thirty own questions and for an unknown question', () => {
    let c = base()
    for (let i = 0; i < 30; i++) c = addQuestion(c, 'business', 'short_text', `Q${i}`).config
    const full = duplicateQuestion(c, c.customQuestions[0]!.id, { en: ' (copy)', pt: ' (cópia)' })
    expect(full.id).toBeNull()
    expect(full.config).toBe(c)
    expect(duplicateQuestion(base(), 'ghost', { en: ' (copy)', pt: ' (cópia)' }).id).toBeNull()
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

describe('delete a standard question (ADR-0057)', () => {
  const STANDARD = APPLY_BUILTIN_KEYS.filter((k) => k !== 'applicantEmail')

  it('every standard question except the email can be deleted: it leaves the form, is listed as removed and the document stays valid', () => {
    for (const k of STANDARD) {
      const c = deleteField(base(), k)
      expect(c, k).not.toBe(base())
      expect(removedFieldsOf(c)).toEqual([k])
      expect(layoutOf(c).flatMap((s) => s.fields.map((f) => f.key)), k).not.toContain(k)
      expect(resolveApplyForm(c).flatMap((s) => s.fields.map((f) => f.key))).toHaveLength(15)
      expect(c.fields.some((f) => f.key === k)).toBe(false)
      expect(validateApplyForm(c), k).toEqual({})
      // The server treats it as hidden and optional: stored as null.
      expect(rulesFromConfig(c, 1)!.fields[k]).toEqual({ hidden: true, required: false })
    }
  })

  it('the applicant email cannot be deleted; an unknown key and a question id change nothing', () => {
    const c = base()
    expect(deleteField(c, 'applicantEmail')).toBe(c)
    expect(deleteField(c, 'nope')).toBe(c)
    const q = addQuestion(c, 'business', 'short_text', 'Q')
    expect(deleteField(q.config, `custom:${q.id}`)).toBe(q.config)
  })

  it('deleting twice is a no-op, and the input is not changed', () => {
    const once = deleteField(base(), 'website')
    expect(deleteField(once, 'website')).toBe(once)
    const c = base()
    const before = JSON.stringify(c)
    deleteField(c, 'city')
    expect(JSON.stringify(c)).toBe(before)
  })

  it('deleting a choice question also forgets its hidden options, so a restored one starts complete', () => {
    let c = setOptionHidden(base(), 'productCount', '1-10', true)
    c = deleteField(c, 'productCount')
    expect(c.hiddenOptions.productCount).toBeUndefined()
    expect(validateApplyForm(c)).toEqual({})
    expect(restoreField(c, 'productCount').hiddenOptions.productCount).toBeUndefined()
  })

  it('a deleted question keeps its edited wording (texts stay)', () => {
    let c = setText(base(), 'apply.f.website', 'en', 'Your site')
    c = deleteField(c, 'website')
    expect(c.texts['apply.f.website']).toEqual({ en: 'Your site' })
    expect(restoreField(c, 'website').texts['apply.f.website']).toEqual({ en: 'Your site' })
  })

  it('all of them can go at once: only the email is left and the form is still valid', () => {
    let c = base()
    for (const k of STANDARD) c = deleteField(c, k)
    expect(removedFieldsOf(c)).toEqual(STANDARD)
    expect(resolveApplyForm(c).flatMap((s) => s.fields.map((f) => f.key))).toEqual(['applicantEmail'])
    expect(validateApplyForm(c)).toEqual({})
  })

  it('restoring puts the question back at the end of the section asked for, with its default flags, or on its default section', () => {
    const gone = deleteField(deleteField(base(), 'website'), 'applicantPhone')
    const onDefault = restoreField(gone, 'website')
    expect(keysOf(onDefault, 'business')).toEqual(['businessName', 'category', 'description', 'website'])
    expect(removedFieldsOf(onDefault)).toEqual(['applicantPhone'])
    const elsewhere = restoreField(gone, 'applicantPhone', 'location')
    expect(keysOf(elsewhere, 'location')).toEqual(['country', 'city', 'applicantPhone'])
    const f = layoutOf(restoreField(deleteField(base(), 'category'), 'category')).flatMap((s) => s.fields).find((x) => x.key === 'category')!
    expect(f).toMatchObject({ required: true, hidden: false })
    expect(validateApplyForm(onDefault)).toEqual({})
    expect(validateApplyForm(elsewhere)).toEqual({})
  })

  it('restoring after a section was deleted goes to the first section; Review and unknown sections are refused; a field that is not removed changes nothing', () => {
    const c = deleteStep(deleteField(base(), 'country'), 'location')
    const back = restoreField(c, 'country')
    expect(layoutOf(back).flatMap((s) => s.fields).find((f) => f.key === 'country')).toBeTruthy()
    expect(back.steps.some((s) => s.builtin === 'review')).toBe(true)
    expect(validateApplyForm(back)).toEqual({})
    const d = deleteField(base(), 'country')
    expect(restoreField(d, 'country', 'review')).toBe(d)
    expect(restoreField(base(), 'country')).toEqual(base())
    const intact = base()
    expect(restoreField(intact, 'country')).toBe(intact)
  })
})

describe('delete any section (ADR-0057)', () => {
  it('a built-in section can go: its questions move to the section above; the first one moves them to the next', () => {
    const c = deleteStep(base(), 'location')
    expect(c.steps.map((s) => s.id)).toEqual(['business', 'contact', 'catalogue', 'review'])
    expect(keysOf(c, 'business')).toEqual(['businessName', 'website', 'category', 'description', 'country', 'city'])
    expect(validateApplyForm(c)).toEqual({})
    const first = deleteStep(base(), 'business')
    expect(first.steps.map((s) => s.id)).toEqual(['location', 'contact', 'catalogue', 'review'])
    expect(keysOf(first, 'location')).toEqual(['businessName', 'website', 'category', 'description', 'country', 'city'])
    expect(validateApplyForm(first)).toEqual({})
  })

  it('nothing is lost or duplicated when a section goes', () => {
    const first = deleteStep(base(), 'business')
    const all = layoutOf(first).flatMap((s) => s.fields.map((f) => f.key))
    expect(new Set(all).size).toBe(all.length)
    expect(all).toHaveLength(16)
  })

  it('Review cannot be deleted; an unknown section changes nothing', () => {
    const c = base()
    expect(deleteStep(c, 'review')).toBe(c)
    expect(deleteStep(c, 'nowhere')).toBe(c)
  })

  it('the last section before Review cannot be deleted (the email needs one) and canDeleteStep says so', () => {
    let c = base()
    for (const id of ['business', 'location', 'contact']) c = deleteStep(c, id)
    expect(c.steps.map((s) => s.id)).toEqual(['catalogue', 'review'])
    expect(canDeleteStep(c, 'catalogue')).toBe(false)
    expect(deleteStep(c, 'catalogue')).toBe(c)
    expect(canDeleteStep(c, 'review')).toBe(false)
    expect(canDeleteStep(base(), 'business')).toBe(true)
    expect(canDeleteStep(base(), 'nowhere')).toBe(false)
    expect(layoutOf(c).flatMap((s) => s.fields.map((f) => f.key))).toHaveLength(16)
    expect(validateApplyForm(c)).toEqual({})
  })

  it('deleting a section moves its hidden questions and own questions too', () => {
    let c = setHidden(base(), 'notes', true)
    const q = addQuestion(c, 'catalogue', 'yes_no', 'Ship abroad?')
    c = deleteStep(q.config, 'catalogue')
    const f = layoutOf(c).flatMap((s) => s.fields)
    expect(f.find((x) => x.key === 'notes')!.hidden).toBe(true)
    expect(keysOf(c, 'contact')).toContain(`custom:${q.id}`)
    expect(validateApplyForm(c)).toEqual({})
  })
})

describe('start from blank (ADR-0057)', () => {
  it('leaves one section with the email, Review, no own questions, every other standard question removed; texts stay', () => {
    let c = setText(base(), 'apply.title', 'en', 'Join us')
    c = setText(c, 'apply.f.consent', 'pt', 'Aceito')
    c = addQuestion(c, 'business', 'short_text', 'Mine').config
    c = setOptionHidden(c, 'productCount', '1-10', true)
    const blank = startFromBlank(c)
    expect(blank.steps).toHaveLength(2)
    expect(blank.steps.at(-1)!.builtin).toBe('review')
    expect(layoutOf(blank).map((s) => s.fields.map((f) => f.key))).toEqual([['applicantEmail'], []])
    expect(blank.customQuestions).toEqual([])
    expect(blank.hiddenOptions).toEqual({})
    expect(removedFieldsOf(blank)).toEqual(APPLY_BUILTIN_KEYS.filter((k) => k !== 'applicantEmail'))
    expect(blank.texts).toEqual(c.texts)
    expect(layoutOf(blank)[0]!.fields[0]).toMatchObject({ key: 'applicantEmail', required: true, hidden: false })
    expect(validateApplyForm(blank)).toEqual({})
    // Idempotent in effect.
    expect(layoutOf(startFromBlank(blank)).map((s) => s.fields.map((f) => f.key))).toEqual([['applicantEmail'], []])
  })

  it('keeps the section that held the email (and its wording); a form whose email section was customised keeps that title', () => {
    let c = setStepText(base(), 'contact', 'title', 'en', 'About you')
    const blank = startFromBlank(c)
    expect(blank.steps[0]).toMatchObject({ id: 'contact', title: { en: 'About you' } })
    c = deleteStep(base(), 'contact')
    const fromNoContact = startFromBlank(c)
    expect(fromNoContact.steps).toHaveLength(2)
    expect(validateApplyForm(fromNoContact)).toEqual({})
    expect(layoutOf(fromNoContact)[0]!.fields.map((f) => f.key)).toEqual(['applicantEmail'])
  })

  it('works from a form that already has removed questions and does not change the input', () => {
    const c = deleteField(base(), 'city')
    const before = JSON.stringify(c)
    const blank = startFromBlank(c)
    expect(JSON.stringify(c)).toBe(before)
    expect(removedFieldsOf(blank)).toHaveLength(15)
  })

  it('own questions can be added to a blank form and the form stays valid', () => {
    const blank = startFromBlank(base())
    const r = addQuestion(blank, blank.steps[0]!.id, 'long_text', 'Tell us more')
    expect(r.id).toBeTruthy()
    expect(layoutOf(r.config)[0]!.fields.map((f) => f.key)).toEqual(['applicantEmail', `custom:${r.id}`])
    expect(validateApplyForm(r.config)).toEqual({})
  })
})

describe('restore the original form (ADR-0057)', () => {
  it('puts back the sections, questions and options of the original; the texts stay', () => {
    let c = setText(base(), 'apply.title', 'en', 'Join us')
    c = startFromBlank(c)
    c = addQuestion(c, c.steps[0]!.id, 'yes_no', 'Mine').config
    const back = restoreOriginal(c)
    expect(back.steps).toEqual(DEFAULT_APPLY_FORM.steps)
    expect(back.fields).toEqual(DEFAULT_APPLY_FORM.fields)
    expect(back.customQuestions).toEqual([])
    expect(back.hiddenOptions).toEqual({})
    expect(removedFieldsOf(back)).toEqual([])
    expect(back.texts).toEqual({ 'apply.title': { en: 'Join us' } })
    expect(validateApplyForm(back)).toEqual({})
  })

  it('undoes hidden options and hidden questions too, and does not change the input', () => {
    const c = setHidden(setOptionHidden(base(), 'category', 'other', true), 'website', true)
    const before = JSON.stringify(c)
    const back = restoreOriginal(c)
    expect(JSON.stringify(c)).toBe(before)
    expect(layoutOf(back).flatMap((s) => s.fields).every((f) => !f.hidden)).toBe(true)
    expect(back.hiddenOptions).toEqual({})
  })
})

describe('isOriginalForm', () => {
  it('is true for the original (also written out), false after any structural change, and true again after restoring', () => {
    expect(isOriginalForm(base())).toBe(true)
    expect(isOriginalForm(materialize(base()))).toBe(true)
    expect(isOriginalForm(setText(base(), 'apply.title', 'en', 'Join us'))).toBe(true) // texts do not count
    for (const changed of [deleteField(base(), 'city'), deleteStep(base(), 'location'), setHidden(base(), 'website', true), setRequired(base(), 'website', true), addQuestion(base(), 'business', 'yes_no', 'Q').config, setOptionHidden(base(), 'category', 'other', true), addStep(base(), 'X').config, startFromBlank(base())]) {
      expect(isOriginalForm(changed)).toBe(false)
      expect(isOriginalForm(restoreOriginal(changed))).toBe(true)
    }
  })
})
