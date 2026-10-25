// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { PERMISSIONS, ROLE_SUMMARY, hashSecret, newInviteSecret } from './team'

describe('team helpers (ADR-0030)', () => {
  it('makes 32-byte base64url secrets that differ', () => {
    const a = newInviteSecret()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(newInviteSecret()).not.toBe(a)
  })

  it('hashes with SHA-256 hex', async () => {
    expect(await hashSecret('a')).toBe('ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb')
  })

  it('lists the 15 permission keys and a summary per role', () => {
    expect(PERMISSIONS).toHaveLength(15)
    expect(ROLE_SUMMARY.admin).toHaveLength(4)
    expect(ROLE_SUMMARY.team).toHaveLength(3)
  })
})
