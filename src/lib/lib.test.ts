import type { Dimensions } from '@/domain/types'
import { describe, expect, it } from 'vitest'
import { safeBrandAccent, contrastRatio } from './color'
import { validateModelFile, validateImageFile } from './files'
import { convertLength, formatDimensions, formatMoney, localDayBounds, parseMoneyInput, toMeters } from './format'
import { initialPrice } from './product'
import { checkScale } from './scale'
import { isValidSlug, slugInput, slugify, uniqueSlug } from './slug'
import { catalogLocalPath, catalogPublicUrl, productLocalPath, productPublicUrl, shareableCurrentUrl } from './urls'
import { browserName, detectInAppBrowser } from './userAgent'
import { resolveTenant } from '@/tenant/resolveTenant'

describe('slug', () => {
  it('keeps hyphens while typing, so "modern-sofa" can be typed', () => {
    expect(slugInput('Modern-')).toBe('modern-')
    expect(slugInput('modern-sofa')).toBe('modern-sofa')
    expect(slugInput('Sofá Grande')).toBe('sof-grande')
  })
  it("slugInput('a'.repeat(70), 63) has length 63; slugInput without max is unchanged (S2 Task 2)", () => {
    expect(slugInput('a'.repeat(70), 63)).toHaveLength(63)
    expect(slugInput('a'.repeat(70))).toHaveLength(70)
  })
  it('slugifies accents and punctuation', () => {
    expect(slugify('Sofá Glam — Veludo!')).toBe('sofa-glam-veludo')
    expect(isValidSlug('modern-sofa')).toBe(true)
    expect(isValidSlug('Modern Sofa')).toBe(false)
    expect(isValidSlug('a--b')).toBe(false)
  })
  it('creates unique slugs', () => {
    expect(uniqueSlug('chair', [])).toBe('chair')
    expect(uniqueSlug('chair', ['chair', 'chair-2'])).toBe('chair-3')
  })
  it('trims the base before adding the suffix, never leaving a trailing hyphen', () => {
    const base = 'a'.repeat(66) + '-copy' // 71 characters
    expect(uniqueSlug(base, [], 70)).toBe('a'.repeat(66) + '-cop')
    const taken = ['a'.repeat(66) + '-cop']
    expect(uniqueSlug(base, taken, 70)).toBe('a'.repeat(66) + '-c-2')
    expect(uniqueSlug('a'.repeat(67) + '-copy', ['a'.repeat(67) + '-co'], 70)).toBe('a'.repeat(67) + '-2')
  })
})

describe('initialPrice', () => {
  it('matches the price the product page opens on (first variant)', () => {
    expect(initialPrice({ price: 10000, variants: [] })).toBe(10000)
    expect(initialPrice({ price: 10000, variants: [{ id: 'v1', name: { en: 'Oak' }, priceDelta: 2500 }, { id: 'v2', name: { en: 'Ash' } }] })).toBe(12500)
  })
})

describe('format', () => {
  it('handles money in minor units', () => {
    expect(parseMoneyInput('1234.5')).toBe(123450)
    expect(parseMoneyInput('12,99')).toBe(1299)
    expect(parseMoneyInput('abc')).toBeNull()
    expect(formatMoney(189900, 'EUR', 'en')).toContain('1,899.00')
  })
  it('converts lengths', () => {
    expect(convertLength(2.54, 'cm', 'in')).toBeCloseTo(1)
    expect(toMeters(200, 'cm')).toBe(2)
    expect(toMeters(10, 'in')).toBeCloseTo(0.254)
    expect(formatDimensions({ width: 200, height: 80, depth: 90, unit: 'cm' })).toBe('W 200 × H 80 × D 90 cm')
  })
})

describe('urls', () => {
  const b = { slug: 'casa-lisboa' }
  const p = { slug: 'modern-sofa' }
  it('builds demo and local URLs', () => {
    expect(catalogPublicUrl(b)).toBe('https://casa-lisboa.example.com')
    expect(productPublicUrl(b, p)).toBe('https://casa-lisboa.example.com/products/modern-sofa')
    expect(catalogLocalPath(b)).toBe('/catalog/casa-lisboa')
    expect(productLocalPath(b, p, { preview: true })).toBe('/products/casa-lisboa/modern-sofa?preview=1')
  })
  it('drops only the preview flag from shared links', () => {
    history.replaceState(null, '', '/products/casa-lisboa/modern-sofa?preview=1&lang=pt')
    expect(shareableCurrentUrl()).toBe(`${location.origin}/products/casa-lisboa/modern-sofa?lang=pt`)
    history.replaceState(null, '', '/products/casa-lisboa/modern-sofa?lang=pt&preview=1')
    expect(shareableCurrentUrl()).toBe(`${location.origin}/products/casa-lisboa/modern-sofa?lang=pt`)
    history.replaceState(null, '', '/')
  })
})

describe('resolveTenant', () => {
  it('uses path mode without a root domain', () => {
    expect(resolveTenant('casa.example.com', undefined)).toEqual({ mode: 'path' })
  })
  it('resolves subdomains', () => {
    expect(resolveTenant('casa.furnish.app', 'furnish.app')).toEqual({ mode: 'hostname', slug: 'casa' })
    expect(resolveTenant('www.furnish.app', 'furnish.app')).toEqual({ mode: 'path' })
    expect(resolveTenant('demo.furnish.app', 'furnish.app')).toEqual({ mode: 'path' })
    expect(resolveTenant('a.b.furnish.app', 'furnish.app')).toEqual({ mode: 'path' })
    expect(resolveTenant('localhost', 'furnish.app')).toEqual({ mode: 'path' })
  })
})

describe('detectInAppBrowser', () => {
  it('detects common in-app browsers', () => {
    expect(
      detectInAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 300.0.0'),
    ).toBe('instagram')
    expect(detectInAppBrowser('Mozilla/5.0 (Linux; Android 14) [FB_IAB/FB4A;FBAV/450.0.0.0;]')).toBe('facebook')
    expect(detectInAppBrowser('Mozilla/5.0 (iPhone) WhatsApp/2.24.1')).toBe('whatsapp')
    expect(detectInAppBrowser('Mozilla/5.0 (iPhone) Version/17.0 Mobile Safari/604.1')).toBeNull()
  })

  it('detects more in-app browsers that cannot hand off to AR (AR-08)', () => {
    expect(detectInAppBrowser('Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/129.0 Mobile Safari/537.36 trill_350 BytedanceWebview/d8a21c6')).toBe('tiktok')
    expect(detectInAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 musical_ly_33.0.0')).toBe('tiktok')
    expect(detectInAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 [LinkedInApp]/9.29')).toBe('linkedin')
    expect(detectInAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Snapchat/12.80.0.38')).toBe('snapchat')
    expect(detectInAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Safari Line/13.17.0')).toBe('line')
    expect(detectInAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 Twitter for iPhone/10.50')).toBe('x')
    expect(detectInAppBrowser('Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/129.0 Mobile Safari/537.36 TwitterAndroid')).toBe('x')
    // The Google app on iPhone cannot open Quick Look (model-viewer excludes it); on Android it is not an in-app browser here.
    expect(detectInAppBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 GSA/330.0.0 Mobile/15E148 Safari/604.1')).toBe('google')
    expect(detectInAppBrowser('Mozilla/5.0 (Linux; Android 14) Chrome/129.0 Mobile Safari/537.36 GSA/15.0')).toBeNull()
  })
})

describe('checkScale', () => {
  const dims = { width: 200, height: 80, depth: 90, unit: 'cm' as const }
  it('verifies within tolerance', () => {
    expect(checkScale({ x: 2.04, y: 0.79, z: 0.9 }, dims).status).toBe('verified')
  })
  it('flags mismatches and unknowns', () => {
    expect(checkScale({ x: 1, y: 0.8, z: 0.9 }, dims).status).toBe('mismatch')
    expect(checkScale(null, dims).status).toBe('unknown')
    expect(checkScale({ x: 2, y: 0.8, z: 0.9 }, { ...dims, width: 0 }).status).toBe('unknown')
  })
})

describe('color', () => {
  it('falls back for low-contrast brand accents', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21)
    expect(safeBrandAccent('#2F5D62')).toBe('#2F5D62')
    expect(safeBrandAccent('#FFE066')).toBe('#7A5C45')
    expect(safeBrandAccent('nope')).toBe('#7A5C45')
  })
})

describe('file validation', () => {
  it('rejects bad image types and sizes', () => {
    expect(validateImageFile(new File(['x'], 'a.gif', { type: 'image/gif' })).ok).toBe(false)
    const big = new File([new Uint8Array(6 * 1024 * 1024)], 'big.jpg', { type: 'image/jpeg' })
    expect(validateImageFile(big).ok).toBe(false)
    expect(validateImageFile(new File(['x'], 'ok.png', { type: 'image/png' })).ok).toBe(true)
  })
  it('rejects files that only carry the magic bytes (structure checks: modelFiles.test.ts)', async () => {
    const stubGlb = new File([new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0])], 'chair.glb')
    const fakeGlb = new File(['not a model'], 'chair.glb')
    const stubUsdz = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0])], 'chair.usdz')
    expect((await validateModelFile(stubGlb, 'glb')).ok).toBe(false)
    expect((await validateModelFile(fakeGlb, 'glb')).ok).toBe(false)
    expect((await validateModelFile(stubUsdz, 'usdz')).ok).toBe(false)
    expect((await validateModelFile(stubGlb, 'usdz')).ok).toBe(false)
  })
})

describe('checkScale diagnosis', () => {
  const dims: Dimensions = { width: 200, height: 80, depth: 90, unit: 'cm' }
  const reason = (m: { x: number; y: number; z: number }, d = dims) => {
    const r = checkScale(m, d)
    return r.status === 'mismatch' ? r.reason : r.status
  }
  it('spots width and depth swapped (model turned 90°)', () => {
    expect(reason({ x: 0.9, y: 0.8, z: 2.0 })).toBe('axis-swap')
  })
  it('spots numbers entered in the other unit', () => {
    expect(reason({ x: 2.0, y: 0.8, z: 0.9 }, { ...dims, unit: 'in' })).toBe('wrong-unit')
  })
  it('spots a model authored in centimetres or millimetres', () => {
    expect(reason({ x: 200, y: 80, z: 90 })).toBe('model-units')
    expect(reason({ x: 2000, y: 800, z: 900 })).toBe('model-units')
  })
  it('reports a uniform scale error with its factor, and leaves odd shapes undiagnosed', () => {
    const r = checkScale({ x: 3, y: 1.2, z: 1.35 }, dims)
    expect(r.status === 'mismatch' && r.reason === 'uniform' && Math.round(r.factor! * 10) / 10).toBe(1.5)
    expect(reason({ x: 2.0, y: 1.6, z: 0.9 })).toBeUndefined()
  })
  it('allows at least 1 cm on small items', () => {
    expect(checkScale({ x: 0.108, y: 0.1, z: 0.1 }, { width: 10, height: 10, depth: 10, unit: 'cm' }).status).toBe('verified')
  })
})

describe('GLB required extensions (Scene Viewer compatibility)', () => {
  /** Minimal GLB: 12-byte header + one JSON chunk. */
  function glb(json: object): File {
    let text = JSON.stringify(json)
    while (text.length % 4) text += ' '
    const body = new TextEncoder().encode(text)
    const buf = new ArrayBuffer(20 + body.length)
    const v = new DataView(buf)
    v.setUint32(0, 0x46546c67, true) // "glTF"
    v.setUint32(4, 2, true)
    v.setUint32(8, buf.byteLength, true)
    v.setUint32(12, body.length, true)
    v.setUint32(16, 0x4e4f534a, true) // "JSON"
    new Uint8Array(buf, 20).set(body)
    return new File([buf], 'm.glb')
  }

  it('lists required extensions Scene Viewer does not support', async () => {
    const { unsupportedForSceneViewer } = await import('./files')
    const f = glb({ asset: { version: '2.0' }, extensionsRequired: ['KHR_draco_mesh_compression', 'KHR_texture_transform'] })
    expect(await unsupportedForSceneViewer(f)).toEqual(['KHR_draco_mesh_compression'])
  })

  it('is empty for plain files and never throws on malformed input', async () => {
    const { unsupportedForSceneViewer } = await import('./files')
    expect(await unsupportedForSceneViewer(glb({ asset: { version: '2.0' } }))).toEqual([])
    expect(await unsupportedForSceneViewer(new File([new Uint8Array([1, 2, 3])], 'x.glb'))).toEqual([])
  })
})

describe('localDayBounds', () => {
  it('spans the calendar day in the local time zone, not UTC', () => {
    const { start, end } = localDayBounds('2026-10-20')
    expect(new Date(start).getHours()).toBe(0)
    expect(new Date(start).getDate()).toBe(20)
    expect(new Date(end).getDate()).toBe(21)
    expect(new Date(end).getHours()).toBe(0)
  })
})

describe('browserName (AR-07 review)', () => {
  it('names the current browser from the user agent', () => {
    expect(browserName('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBe('Safari')
    expect(browserName('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/129.0 Mobile/15E148 Safari/604.1')).toBe('Chrome')
    expect(browserName('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36')).toBe('Chrome')
    expect(browserName('Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0')).toBe('Firefox')
    expect(browserName('')).toBeNull()
  })
})
