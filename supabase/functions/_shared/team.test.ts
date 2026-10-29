// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { PERMISSIONS, PERMISSION_LABELS, hashSecret, newInviteSecret } from './team'

const UI_PERMISSIONS: string = '../../../src/features/team/permissions'

describe('team helpers (ADR-0030)', () => {
  it('makes 32-byte base64url secrets that differ', () => {
    const a = newInviteSecret()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(newInviteSecret()).not.toBe(a)
  })

  it('hashes with SHA-256 hex', async () => {
    expect(await hashSecret('a')).toBe('ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb')
  })

  it('lists the 17 permission keys', () => {
    expect(PERMISSIONS).toHaveLength(17)
  })

  // R-W6-5: the invitation email lists the role's permissions with the same labels as the dashboards.
  it('mirrors the permission labels of src/features/team/permissions.ts', async () => {
    // A computed specifier: the Edge Function type check (no @/ alias) must not follow it into the app code.
    const { PERMISSION_LABEL } = (await import(/* @vite-ignore */ UI_PERMISSIONS)) as { PERMISSION_LABEL: Record<string, string> }
    expect(PERMISSION_LABELS).toEqual(PERMISSION_LABEL)
    expect(Object.keys(PERMISSION_LABELS).sort()).toEqual([...PERMISSIONS].sort())
  })
})
