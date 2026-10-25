import { describe, expect, it } from 'vitest'
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, PERMISSION_GROUPS } from './permissions'

describe('permission catalogue (ADR-0029)', () => {
  it('has the 15 keys, each once, in three groups', () => {
    const keys = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key))
    expect(keys).toHaveLength(15)
    expect(new Set(keys).size).toBe(15)
    expect([...keys].sort()).toEqual([...ALL_PERMISSIONS].sort())
    expect(PERMISSION_GROUPS.map((g) => g.title)).toEqual(['Businesses & applications', 'Products & catalogues', 'Insight & records'])
  })

  it('defaults: Admin has all 15, Team has view access plus product editing', () => {
    expect([...DEFAULT_ROLE_PERMISSIONS.admin].sort()).toEqual([...ALL_PERMISSIONS].sort())
    expect([...DEFAULT_ROLE_PERMISSIONS.team].sort()).toEqual(['analytics.view', 'applications.view', 'businesses.view', 'products.edit', 'products.view'])
  })

  it('warns on the two delete permissions only', () => {
    const warned = PERMISSION_GROUPS.flatMap((g) => g.items).filter((i) => i.warning).map((i) => i.key)
    expect(warned.sort()).toEqual(['businesses.delete', 'products.delete'])
  })
})
