import { describe, expect, it } from 'vitest'
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
})
