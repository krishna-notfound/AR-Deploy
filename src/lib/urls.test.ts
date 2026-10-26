import { describe, expect, it } from 'vitest'
import { needsPreview, settingsPath } from './urls'

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
