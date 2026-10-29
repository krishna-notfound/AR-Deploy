import { describe, expect, it, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseCatalogService } from './supabaseCatalogService'

// submit-application refusals added with the form builder (ADR-0043) keep their reason, so the page can reload the
// form (form_changed) or offer a retry (config_unavailable) instead of showing an unrelated message.
const refusing = (error: string, status: number) => {
  const invoke = vi.fn().mockResolvedValue({ data: null, error: { message: 'non-2xx', context: new Response(JSON.stringify({ error }), { status }) } })
  return { functions: { invoke } } as unknown as SupabaseClient
}

const input = { businessName: 'Atelier', applicantName: 'Ana', applicantEmail: 'ana@example.com' } as never

describe('submitApplication refusals from the form builder', () => {
  it('form_changed is a CONFLICT with reason form_changed', async () => {
    const r = await createSupabaseCatalogService(refusing('form_changed', 409)).submitApplication(input)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.code).toBe('CONFLICT')
      expect(r.error.reason).toBe('form_changed')
    }
  })

  it('config_unavailable keeps its reason', async () => {
    const r = await createSupabaseCatalogService(refusing('config_unavailable', 503)).submitApplication(input)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.reason).toBe('config_unavailable')
  })
})
