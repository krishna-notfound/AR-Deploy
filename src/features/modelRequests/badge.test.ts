import { describe, expect, it } from 'vitest'
import { MODEL_REQUEST_BADGE_LABEL, modelRequestBadge } from './badge'

describe('modelRequestBadge', () => {
  it('in_progress beats requested; rejected shows only when photos-only and nothing is open; delivered and cancelled show nothing', () => {
    expect(modelRequestBadge({ open: 'in_progress' }, true)).toBe('in_progress')
    expect(modelRequestBadge({ open: 'requested', latestClosed: 'rejected' }, true)).toBe('requested')
    expect(modelRequestBadge({ latestClosed: 'rejected' }, true)).toBe('rejected')
    expect(modelRequestBadge({ latestClosed: 'rejected' }, false)).toBeNull()
    expect(modelRequestBadge({ latestClosed: 'delivered' }, true)).toBeNull()
    expect(modelRequestBadge({ latestClosed: 'cancelled' }, true)).toBeNull()
    expect(modelRequestBadge(undefined, true)).toBeNull()
  })

  it('has the three labels', () => {
    expect(MODEL_REQUEST_BADGE_LABEL).toEqual({ requested: '3D requested', in_progress: '3D in progress', rejected: '3D declined' })
  })
})
