import { afterEach, describe, expect, it, vi } from 'vitest'
import { scrollBehavior } from './motion'

const mockReduced = (matches: boolean) => vi.stubGlobal('matchMedia', (q: string) => ({ matches: matches && q.includes('reduce'), media: q }))

describe('scrollBehavior', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('scrolls instantly when the visitor prefers reduced motion', () => {
    mockReduced(true)
    expect(scrollBehavior()).toBe('auto')
  })
  it('scrolls smoothly otherwise', () => {
    mockReduced(false)
    expect(scrollBehavior()).toBe('smooth')
  })
})
