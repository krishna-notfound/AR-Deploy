import { describe, expect, it } from 'vitest'
import { catalogLocalPath, needsPreview, settingsPath } from './urls'

describe('needsPreview', () => {
  it('needsPreview is false only for a published product in an active business', () => {
    expect(needsPreview({ status: 'published' }, { status: 'active' })).toBe(false)
    expect(needsPreview({ status: 'draft' }, { status: 'active' })).toBe(true)
    expect(needsPreview({ status: 'published' }, { status: 'draft' })).toBe(true)
    expect(needsPreview({ status: 'published' }, { status: 'inactive' })).toBe(true)
    expect(needsPreview({ status: 'draft' }, { status: 'draft' })).toBe(true)
  })
})

describe('settingsPath', () => {
  it("settingsPath('business') is /dashboard/settings/account; settingsPath('admin','security') is /admin/settings/security", () => {
    expect(settingsPath('business')).toBe('/dashboard/settings/account')
    expect(settingsPath('admin', 'security')).toBe('/admin/settings/security')
    expect(settingsPath('admin')).toBe('/admin/settings/account')
    expect(settingsPath('business', 'security-policy')).toBe('/dashboard/settings/security-policy')
  })
})

describe('catalogLocalPath', () => {
  it("catalogLocalPath({slug:'casa'}, {category:'sofas'}) is '/catalog/casa?category=sofas'", () => {
    expect(catalogLocalPath({ slug: 'casa' }, { category: 'sofas' })).toBe('/catalog/casa?category=sofas')
  })
  it("with preview too: '/catalog/casa?category=sofas&preview=1'", () => {
    expect(catalogLocalPath({ slug: 'casa' }, { category: 'sofas', preview: true })).toBe('/catalog/casa?category=sofas&preview=1')
  })
  it("with no options: '/catalog/casa'", () => {
    expect(catalogLocalPath({ slug: 'casa' })).toBe('/catalog/casa')
    expect(catalogLocalPath({ slug: 'casa' }, { preview: true })).toBe('/catalog/casa?preview=1')
  })
})
