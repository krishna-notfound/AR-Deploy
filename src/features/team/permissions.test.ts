import { describe, expect, it } from 'vitest'
import { ALL_PERMISSIONS, DEFAULT_ROLE_PERMISSIONS, PERMISSION_GROUPS } from './permissions'

describe('permission catalogue (ADR-0029)', () => {
  it('has the 17 keys, each once, in four groups', () => {
    const keys = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.key))
    expect(keys).toHaveLength(17)
    expect(new Set(keys).size).toBe(17)
    expect([...keys].sort()).toEqual([...ALL_PERMISSIONS].sort())
    expect(PERMISSION_GROUPS.map((g) => g.title)).toEqual(['Businesses & applications', 'Products & catalogues', 'Insight & records', 'Website content'])
  })

  it('defaults: Admin has all 17, Team has view access plus product editing', () => {
    expect([...DEFAULT_ROLE_PERMISSIONS.admin].sort()).toEqual([...ALL_PERMISSIONS].sort())
    expect([...DEFAULT_ROLE_PERMISSIONS.team].sort()).toEqual(['analytics.view', 'applications.view', 'businesses.view', 'products.edit', 'products.view'])
  })

  it('Content Editor: "Edit website content" is the one item of its own group; Team does not get it', () => {
    const group = PERMISSION_GROUPS.find((g) => g.title === 'Website content')!
    expect(group.items).toEqual([
      {
        key: 'content.manage',
        label: 'Edit website content',
        description: 'Edit pages, the application form and social links, and publish them.',
      },
    ])
    expect(DEFAULT_ROLE_PERMISSIONS.admin).toContain('content.manage')
    expect(DEFAULT_ROLE_PERMISSIONS.team).not.toContain('content.manage')
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
