import { describe, expect, it } from 'vitest'
import { applyReview, availableActions, normalizeBusinessName } from './applicationRules'

describe('applicationRules (R-W2-2, R-W2-9)', () => {
  it('availableActions(approved, {businessId:null}) includes reopen; with a business it does not', () => {
    expect(availableActions('approved', { businessId: null })).toEqual(['reopen'])
    expect(availableActions('approved', { businessId: undefined })).toEqual(['reopen'])
    expect(availableActions('approved', { businessId: 'biz-1' })).toEqual([])
    for (const status of ['submitted', 'under_review', 'rejected'] as const) expect(availableActions(status, { businessId: null })).not.toContain('reopen')
    expect(availableActions('submitted', { businessId: null })).toEqual(['start_review', 'approve', 'reject'])
  })

  it('applyReview: reopen moves approved with no business to under_review, otherwise reopen_not_allowed', () => {
    expect(applyReview('approved', 'reopen', undefined, { businessId: null })).toEqual({ ok: true, status: 'under_review', noop: false })
    expect(applyReview('approved', 'reopen', undefined, { businessId: 'biz-1' })).toEqual({ ok: false, reason: 'reopen_not_allowed' })
    for (const status of ['submitted', 'under_review', 'rejected'] as const)
      expect(applyReview(status, 'reopen', undefined, { businessId: null })).toEqual({ ok: false, reason: 'reopen_not_allowed' })
    // The other transitions are unchanged.
    expect(applyReview('approved', 'reject', 'Late', { businessId: 'biz-1' })).toEqual({ ok: false, reason: 'invalid_transition' })
    expect(applyReview('under_review', 'approve', undefined, { businessId: null })).toEqual({ ok: true, status: 'approved', noop: false })
  })

  it('normalizeBusinessName matches the SQL cases', () => {
    for (const s of ['Casa, Lda.', 'casa lda', 'Cása', '  CÁSA  SA ', 'Casa Unipessoal']) expect(normalizeBusinessName(s)).toBe('casa')
    expect(normalizeBusinessName('Lda')).toBe('')
    expect(normalizeBusinessName('Mesa')).toBe('mesa')
    expect(normalizeBusinessName('Móveis Unipessoal, Lda')).toBe('moveisunipessoal')
    expect(normalizeBusinessName('Açúcar & Pão Inc.')).toBe('acucarpao')
  })
})
