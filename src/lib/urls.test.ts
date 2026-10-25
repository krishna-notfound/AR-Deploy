import { describe, expect, it } from 'vitest'
import { settingsPath } from './urls'

describe('settingsPath', () => {
  it("settingsPath('business') is /dashboard/settings/account; settingsPath('admin','security') is /admin/settings/security", () => {
    expect(settingsPath('business')).toBe('/dashboard/settings/account')
    expect(settingsPath('admin', 'security')).toBe('/admin/settings/security')
    expect(settingsPath('admin')).toBe('/admin/settings/account')
    expect(settingsPath('business', 'security-policy')).toBe('/dashboard/settings/security-policy')
  })
})
