import { describe, expect, it } from 'vitest'
import { safeBrandAccent, contrastRatio } from './color'
import { validateModelFile, validateImageFile } from './files'
import { convertLength, formatDimensions, formatMoney, parseMoneyInput, toMeters } from './format'
import { checkScale } from './scale'
import { isValidSlug, slugify, uniqueSlug } from './slug'
import { catalogLocalPath, catalogPublicUrl, productLocalPath, productPublicUrl } from './urls'
import { detectInAppBrowser } from './userAgent'
import { resolveTenant } from '@/tenant/resolveTenant'

describe('slug', () => {
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
})

describe('resolveTenant', () => {
  it('uses path mode without a root domain', () => {
    expect(resolveTenant('casa.example.com', undefined)).toEqual({ mode: 'path' })
  })
  it('resolves subdomains', () => {
    expect(resolveTenant('casa.furnish.app', 'furnish.app')).toEqual({ mode: 'hostname', slug: 'casa' })
    expect(resolveTenant('www.furnish.app', 'furnish.app')).toEqual({ mode: 'path' })
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
  it('checks GLB and USDZ magic bytes', async () => {
    const realGlb = new File([new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0])], 'chair.glb')
    const fakeGlb = new File(['not a model'], 'chair.glb')
    const usdz = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0])], 'chair.usdz')
    expect((await validateModelFile(realGlb, 'glb')).ok).toBe(true)
    expect((await validateModelFile(fakeGlb, 'glb')).ok).toBe(false)
    expect((await validateModelFile(usdz, 'usdz')).ok).toBe(true)
    expect((await validateModelFile(realGlb, 'usdz')).ok).toBe(false)
  })
})
