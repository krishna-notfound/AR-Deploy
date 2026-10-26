import { describe, expect, it } from 'vitest'
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, PERMISSION_GROUPS } from './permissions'

describe('permission catalogue (ADR-0029)', () => {
  it('has the 16 keys, each once, in three groups', () => {
    const keys = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key))
    expect(keys).toHaveLength(16)
    expect(new Set(keys).size).toBe(16)
    expect([...keys].sort()).toEqual([...ALL_PERMISSIONS].sort())
    expect(PERMISSION_GROUPS.map((g) => g.title)).toEqual(['Businesses & applications', 'Products & catalogues', 'Insight & records'])
  })

  it('defaults: Admin has all 16, Team has view access plus product editing', () => {
    expect([...DEFAULT_ROLE_PERMISSIONS.admin].sort()).toEqual([...ALL_PERMISSIONS].sort())
    expect([...DEFAULT_ROLE_PERMISSIONS.team].sort()).toEqual(['analytics.view', 'applications.view', 'businesses.view', 'products.edit', 'products.view'])
  })

  it('warns on the two delete permissions only', () => {
    const warned = PERMISSION_GROUPS.flatMap((g) => g.items).filter((i) => i.warning).map((i) => i.key)
    expect(warned.sort()).toEqual(['businesses.delete', 'products.delete'])
  })

  it('R-S4-1: "Handle 3D model requests" sits in Products & catalogues, right after Delete products, with the §9.1 hint', () => {
    const items = PERMISSION_GROUPS.find((g) => g.title === 'Products & catalogues')!.items
    expect(items.map((i) => i.key)).toEqual(['products.view', 'products.edit', 'products.publish', 'products.delete', 'models.manage'])
    expect(items[4]).toEqual({
      key: 'models.manage',
      label: 'Handle 3D model requests',
      description: 'See request photos, upload models, and deliver or decline requests. Also changes whether a business may upload its own 3D files.',
    })
    expect(DEFAULT_ROLE_PERMISSIONS.team).not.toContain('models.manage')
  })
})
