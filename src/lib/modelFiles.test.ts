import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchRequiredExtensions, isHttpsUrl, readRequiredExtensions, sceneViewerUnsupported, validateModelFile } from './files'

/** A GLB built the way exporters write it: 12-byte header, JSON chunk, optional BIN chunk. */
function glbBytes(json: object, opts: { version?: number; declared?: number; bin?: number; binDeclared?: number } = {}): Uint8Array {
  let text = JSON.stringify(json)
  while (text.length % 4) text += ' '
  const body = new TextEncoder().encode(text)
  const binLength = opts.bin ?? 0
  const total = 20 + body.length + (binLength ? 8 + binLength : 0)
  const buf = new ArrayBuffer(total)
  const v = new DataView(buf)
  v.setUint32(0, 0x46546c67, true)
  v.setUint32(4, opts.version ?? 2, true)
  v.setUint32(8, opts.declared ?? total, true)
  v.setUint32(12, body.length, true)
  v.setUint32(16, 0x4e4f534a, true)
  new Uint8Array(buf, 20).set(body)
  if (binLength) {
    v.setUint32(20 + body.length, opts.binDeclared ?? binLength, true)
    v.setUint32(24 + body.length, 0x004e4942, true)
  }
  return new Uint8Array(buf)
}
const file = (bytes: Uint8Array | string, name: string) => new File([bytes as BlobPart], name)
const GLTF2 = { asset: { version: '2.0' } }

/** A stored (uncompressed) zip with the given entries, as USDZ packagers write it. */
function zipBytes(entries: { name: string; data?: number; method?: number }[], opts: { end?: boolean } = {}): Uint8Array {
  const parts: number[] = []
  const u16 = (n: number) => parts.push(n & 0xff, (n >> 8) & 0xff)
  const u32 = (n: number) => parts.push(n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff)
  for (const e of entries) {
    const name = new TextEncoder().encode(e.name)
    u32(0x04034b50)
    u16(20)
    u16(0)
    u16(e.method ?? 0)
    u16(0)
    u16(0)
    u32(0)
    u32(e.data ?? 16)
    u32(e.data ?? 16)
    u16(name.length)
    u16(0)
    parts.push(...name, ...new Array<number>(e.data ?? 16).fill(1))
  }
  if (opts.end !== false) {
    u32(0x06054b50)
    for (let i = 0; i < 18; i++) parts.push(0)
  }
  return new Uint8Array(parts)
}

describe('validateModelFile: GLB structure (AR-03)', () => {
  it('accepts a well-formed glTF 2.0 binary, with or without a BIN chunk', async () => {
    expect((await validateModelFile(file(glbBytes(GLTF2), 'chair.glb'), 'glb')).ok).toBe(true)
    expect((await validateModelFile(file(glbBytes(GLTF2, { bin: 64 }), 'chair.glb'), 'glb')).ok).toBe(true)
  })

  it.each([
    ['only the 4-byte magic', file(new Uint8Array([0x67, 0x6c, 0x54, 0x46]), 'a.glb')],
    ['magic + junk', file(new Uint8Array([0x67, 0x6c, 0x54, 0x46, 2, 0, 0, 0, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9, 9]), 'a.glb')],
    ['a glTF 1.0 header', file(glbBytes(GLTF2, { version: 1 }), 'a.glb')],
    ['a declared length larger than the file', file(glbBytes(GLTF2, { declared: 999_999 }), 'a.glb')],
    ['a file truncated to half', file(glbBytes(GLTF2, { bin: 400 }).slice(0, 240), 'a.glb')],
    ['asset.version 1.0 in the JSON', file(glbBytes({ asset: { version: '1.0' } }), 'a.glb')],
    ['a BIN chunk that runs past the end', file(glbBytes(GLTF2, { bin: 64, binDeclared: 4096 }), 'a.glb')],
  ])('rejects %s', async (_label, f) => {
    const r = await validateModelFile(f, 'glb')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/does not look like a valid GLB/)
  })
})

describe('validateModelFile: USDZ structure (AR-03)', () => {
  it('accepts a stored zip whose first entry is the USD scene', async () => {
    expect((await validateModelFile(file(zipBytes([{ name: 'chair.usdc' }, { name: 'textures/wood.png' }]), 'chair.usdz'), 'usdz')).ok).toBe(true)
    expect((await validateModelFile(file(zipBytes([{ name: 'Chair.USDA' }]), 'chair.usdz'), 'usdz')).ok).toBe(true)
  })

  it.each([
    ['an empty zip', file(zipBytes([]), 'a.usdz')],
    ['a docx-like zip (first entry is not a USD scene)', file(zipBytes([{ name: '[Content_Types].xml' }, { name: 'word/document.xml' }]), 'a.usdz')],
    ['a compressed entry', file(zipBytes([{ name: 'chair.usdc', method: 8 }]), 'a.usdz')],
    ['a zip cut off before its end record', file(zipBytes([{ name: 'chair.usdc', data: 64 }], { end: false }), 'a.usdz')],
    ['a GLB renamed .usdz', file(glbBytes(GLTF2), 'a.usdz')],
  ])('rejects %s', async (_label, f) => {
    expect((await validateModelFile(f, 'usdz')).ok).toBe(false)
  })
})

describe('Scene Viewer extension check (AR-01/02)', () => {
  it('reads extensionsRequired from a GLB and lists the ones Scene Viewer cannot open', async () => {
    const f = file(glbBytes({ ...GLTF2, extensionsRequired: ['KHR_texture_transform', 'EXT_texture_webp'] }), 'sofa.glb')
    expect(await readRequiredExtensions(f)).toEqual(['KHR_texture_transform', 'EXT_texture_webp'])
    expect(sceneViewerUnsupported(await readRequiredExtensions(f))).toEqual(['EXT_texture_webp'])
    expect(await readRequiredExtensions(file('nope', 'x.glb'))).toBeUndefined()
    expect(sceneViewerUnsupported(undefined)).toEqual([])
  })

  describe('linked models', () => {
    afterEach(() => vi.unstubAllGlobals())

    it('reads only the header and JSON chunk of a linked GLB', async () => {
      const bytes = glbBytes({ ...GLTF2, extensionsRequired: ['EXT_texture_webp'] }, { bin: 4096 })
      vi.stubGlobal('fetch', vi.fn(async () => new Response(bytes.buffer as ArrayBuffer)))
      expect(await fetchRequiredExtensions('https://cdn.test/sofa.glb')).toEqual(['EXT_texture_webp'])
    })

    it('gives up quietly when the link cannot be read (the 3D preview checks it on load)', async () => {
      vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })))
      expect(await fetchRequiredExtensions('https://cdn.test/missing.glb')).toBeUndefined()
      vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('CORS'))))
      expect(await fetchRequiredExtensions('https://cdn.test/sofa.glb')).toBeUndefined()
    })
  })
})

describe('model links (AR-09)', () => {
  it('require https: Scene Viewer opens them over https and http is mixed content', () => {
    expect(isHttpsUrl('https://cdn.test/a.glb')).toBe(true)
    expect(isHttpsUrl('http://cdn.test/a.glb')).toBe(false)
    expect(isHttpsUrl('not a url')).toBe(false)
  })
})

/** A GLB whose BIN chunk holds one embedded PNG texture of the given size (only its header; enough for the check). */
function glbWithPng(width: number, height: number): Uint8Array {
  const png = new Uint8Array(33)
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  const pv = new DataView(png.buffer)
  pv.setUint32(16, width)
  pv.setUint32(20, height)
  const json = { ...GLTF2, images: [{ bufferView: 0, mimeType: 'image/png' }], bufferViews: [{ buffer: 0, byteOffset: 4, byteLength: 33 }], buffers: [{ byteLength: 40 }] }
  const bytes = glbBytes(json, { bin: 40 })
  const binData = bytes.length - 40
  bytes.set(png, binData + 4)
  return bytes
}

describe('validateModelFile: sizes that Android AR handles (AR-10)', () => {
  it('refuses a GLB above 15 MB with a clear reason', async () => {
    const big = new File([new Uint8Array(16 * 1024 * 1024)], 'sofa.glb')
    const r = await validateModelFile(big, 'glb')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/sofa\.glb is 16 MB\. Maximum is 15 MB\..*Android AR/)
  })

  it('refuses a USDZ above 25 MB', async () => {
    const r = await validateModelFile(new File([new Uint8Array(26 * 1024 * 1024)], 'sofa.usdz'), 'usdz')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.message).toMatch(/Maximum is 25 MB/)
  })

  it('accepts textures up to 2048 px and warns (without refusing) above it', async () => {
    const small = await validateModelFile(file(glbWithPng(2048, 1024), 'chair.glb'), 'glb')
    expect(small).toEqual({ ok: true })
    const large = await validateModelFile(file(glbWithPng(4096, 4096), 'chair.glb'), 'glb')
    expect(large.ok).toBe(true)
    if (large.ok) expect(large.warning).toMatch(/4096 × 4096 px.*2048 px/)
  })
})
