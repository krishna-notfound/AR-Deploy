// Shared pieces of the demo 3D model request service (S4): who is acting, the session-only media, and the
// dependencies mockCatalogService passes in. The demo account picker is not authentication; these checks mirror the
// database so the demo behaves like the real thing (R-S4-19).
import type { AuditEvent, ID, ModelAsset, ModelFormat, Permission } from '@/domain/types'
import type { Result } from '../catalogService'
import type { Db } from './db'
import { demoPlatformRole } from './mockTeam'
import { createDemoTeam } from './teamSeed'
import { store } from './store'

/** mockCatalogService's existing module-private `run` and `audit`, passed in the way createMockTeam(run) gets `run`. */
export interface MockModelRequestDeps {
  run: <T>(fn: () => Result<T>) => Promise<Result<T>>
  audit: (db: Db, e: Omit<AuditEvent, 'id' | 'createdAt' | 'metadata'> & { metadata?: Record<string, unknown> }) => AuditEvent
}

export type MockActor = { kind: 'staff'; can: (p: Permission) => boolean } | { kind: 'owner'; businessId: ID } | { kind: 'none' }

/** The demo audit actor id of a platform user (mockCatalogService's DEMO_ADMIN): audit() then stamps the role label. */
export const DEMO_STAFF_ACTOR_ID = 'demo-super-admin'

const ACCOUNT_KEY = 'arfurn:account'

/** The demo person acting: a platform user with their role's permissions (the Owner has all), a business owner, or no one. */
export function mockActor(): MockActor {
  const role = demoPlatformRole()
  if (role) {
    const perms: readonly Permission[] = role === 'owner' ? [] : (store.get().team ?? createDemoTeam()).rolePermissions[role]
    return { kind: 'staff', can: (p) => role === 'owner' || perms.includes(p) }
  }
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY)
    const s = raw ? (JSON.parse(raw) as { role?: unknown; businessId?: unknown }) : null
    if (s?.role === 'business_admin' && typeof s.businessId === 'string') return { kind: 'owner', businessId: s.businessId }
  } catch {
    // no readable demo account: no one
  }
  return { kind: 'none' }
}

/** Whether the actor reads this business's requests (the "Members and model staff read requests" policy). */
export function actorReads(actor: MockActor, businessId: ID): boolean {
  if (actor.kind === 'staff') return actor.can('models.manage')
  return actor.kind === 'owner' && actor.businessId === businessId
}

/**
 * Session-only demo media (ADR-0007: localStorage can't hold ten originals): object URLs of the photos picked for a
 * request, and the files staged for one. Gone on reload; cleared by resetDemoData.
 */
export const sessionRequestMedia: { photos: Map<ID, string[]>; staged: Map<ID, Partial<Record<ModelFormat, ModelAsset>>> } = {
  photos: new Map(),
  staged: new Map(),
}

export function clearSessionRequestMedia(): void {
  for (const urls of sessionRequestMedia.photos.values()) for (const u of urls) revoke(u)
  for (const files of sessionRequestMedia.staged.values()) for (const f of Object.values(files)) if (f) revoke(f.url)
  sessionRequestMedia.photos.clear()
  sessionRequestMedia.staged.clear()
}

function revoke(url: string): void {
  try {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url)
  } catch {
    // best effort
  }
}
