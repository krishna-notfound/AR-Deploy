import { describe, expect, it } from 'vitest'
import { ALL_PERMISSIONS, PERMISSION_PREREQUISITES, withPrerequisites } from './permissions'

describe('permission prerequisites (R-W3-3)', () => {
  it('withPrerequisites({products.publish}) = {products.view, products.edit, products.publish}', () => {
    expect(withPrerequisites(['products.publish'])).toEqual(['products.view', 'products.edit', 'products.publish'])
  })

  it('businesses.delete pulls businesses.edit, businesses.view, products.delete, products.edit, products.view', () => {
    expect(withPrerequisites(['businesses.delete'])).toEqual([
      'businesses.view', 'businesses.edit', 'businesses.delete', 'products.view', 'products.edit', 'products.delete',
    ])
  })

  it('keeps the order of ALL_PERMISSIONS, drops duplicates, and leaves a set without prerequisites alone', () => {
    expect(withPrerequisites(['records.view', 'analytics.view', 'records.view'])).toEqual(['analytics.view', 'records.view'])
    expect(withPrerequisites([])).toEqual([])
    expect(withPrerequisites(ALL_PERMISSIONS)).toEqual(ALL_PERMISSIONS)
  })

  it('has the §4 map: an entry for each of the 17 keys, every prerequisite a known key', () => {
    expect(Object.keys(PERMISSION_PREREQUISITES).sort()).toEqual([...ALL_PERMISSIONS].sort())
    expect(PERMISSION_PREREQUISITES['businesses.status']).toEqual(['businesses.edit'])
    expect(PERMISSION_PREREQUISITES['owners.manage']).toEqual(['businesses.view'])
    expect(PERMISSION_PREREQUISITES['applications.approve']).toEqual(['applications.view'])
    expect(PERMISSION_PREREQUISITES['applications.reject']).toEqual(['applications.view'])
    // R-S4-1: handling 3D requests shows product and business names.
    expect(PERMISSION_PREREQUISITES['models.manage']).toEqual(['businesses.view', 'products.view'])
    // Content Editor (ADR-0043): no prerequisites, it needs no other permission to be usable.
    expect(PERMISSION_PREREQUISITES['content.manage']).toEqual([])
    expect(ALL_PERMISSIONS).toHaveLength(17)
    expect(ALL_PERMISSIONS[16]).toBe('content.manage')
    expect(ALL_PERMISSIONS.indexOf('models.manage')).toBe(ALL_PERMISSIONS.indexOf('products.delete') + 1)
    for (const reqs of Object.values(PERMISSION_PREREQUISITES)) for (const r of reqs) expect(ALL_PERMISSIONS).toContain(r)
  })
})
