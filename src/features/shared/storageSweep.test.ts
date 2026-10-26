import { describe, expect, it } from 'vitest'
import { deletedToast } from './storageSweep'

describe('deletedToast (R-W3-4)', () => {
  it('is plain when every file was removed', () => {
    expect(deletedToast('Business', { removedFiles: 3, failedFiles: 0 })).toBe('Business deleted')
  })
  it('counts the files that could not be removed', () => {
    expect(deletedToast('Business', { removedFiles: 0, failedFiles: 2 })).toBe('Business deleted, but 2 files could not be removed from storage.')
  })
  it('uses the singular for one file and works for products', () => {
    expect(deletedToast('Product', { removedFiles: 0, failedFiles: 1 })).toBe('Product deleted, but 1 file could not be removed from storage.')
  })
})
