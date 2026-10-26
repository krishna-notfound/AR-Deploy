import { afterEach, describe, expect, it, vi } from 'vitest'
import { AR_PROXY_SOURCE } from '@/lib/urls'
import { arLaunchUrl } from './variantMedia'

describe('arLaunchUrl', () => {
  const base = { format: 'glb' as const, url: 'https://x.supabase.co/storage/v1/object/sign/product-media/a.glb?token=t', fileName: 'a.glb', status: 'valid' as const }
  it('prefers the public copy', () => {
    expect(arLaunchUrl({ ...base, publicUrl: 'https://x.supabase.co/storage/v1/object/public/ar-models/b/p/base/glb-a.glb' })).toBe(
      'https://x.supabase.co/storage/v1/object/public/ar-models/b/p/base/glb-a.glb',
    )
  })
  it('falls back to url when there is none (or it is empty)', () => {
    expect(arLaunchUrl(base)).toBe(base.url)
    expect(arLaunchUrl({ ...base, publicUrl: '' })).toBe(base.url)
  })
  // Audit 2026-10-26: through the /ar/ proxy Vercel compresses the file and drops Content-Length, so the viewer's
  // progress froze at 94% and the stall timer killed live downloads. The direct public URL sends the length.
  afterEach(() => vi.unstubAllEnvs())
  it('uses the direct public URL in a production build, never the /ar/ proxy', () => {
    vi.stubEnv('PROD', true)
    const publicUrl = `${AR_PROXY_SOURCE}b/p/base/glb-a.glb`
    expect(arLaunchUrl({ ...base, publicUrl })).toBe(publicUrl)
  })
})
