import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { createSupabaseCatalogService, isStorageForbidden } from './supabaseCatalogService'

/** supabase-js whose storage upload fails with `error`. */
function stub(error: { statusCode?: string | number; message: string }) {
  return {
    storage: { from: () => ({ upload: async () => ({ data: null, error }) }) },
  } as unknown as SupabaseClient
}

const upload = (error: { statusCode?: string | number; message: string }) =>
  createSupabaseCatalogService(stub(error)).uploadAsset({ kind: 'image', file: new File(['x'], 'a.png', { type: 'image/png' }), businessId: 'b1' })

describe('S2 Task 2: an upload refused by storage RLS reads as "no permission" (R-W3-6)', () => {
  it("an upload refused with statusCode 403 / 'new row violates row-level security policy' maps to teamFail('forbidden')", async () => {
    for (const error of [{ statusCode: '403', message: 'Unauthorized' }, { statusCode: 403, message: 'Unauthorized' }, { message: 'new row violates row-level security policy' }]) {
      const r = await upload(error)
      expect(r.ok).toBe(false)
      if (!r.ok) expect(r.error).toMatchObject({ code: 'PERMISSION', reason: 'forbidden' })
    }
  })

  it('another storage error stays STORAGE', async () => {
    const r = await upload({ statusCode: '413', message: 'Payload too large' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatchObject({ code: 'STORAGE', message: 'Upload failed: Payload too large' })
  })

  it('isStorageForbidden: 403 or a row-level security message', () => {
    expect(isStorageForbidden({ statusCode: '403' })).toBe(true)
    expect(isStorageForbidden({ message: 'new row violates row-level security policy for table "objects"' })).toBe(true)
    expect(isStorageForbidden({ statusCode: '400', message: 'Bad request' })).toBe(false)
    expect(isStorageForbidden({})).toBe(false)
  })
})
