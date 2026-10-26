// @vitest-environment node
import { Document, WebIO } from '@gltf-transform/core'
import { describe, expect, it, vi } from 'vitest'
import { compareSummaries, optimizeGlb, summarize } from './modelOptimize'

/** PNG bytes whose header says width x height, padded to `bytes` (the pipeline only reads the header). */
function fakePng(width: number, height: number, bytes: number): Uint8Array {
  const out = new Uint8Array(bytes)
  out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52])
  new DataView(out.buffer).setUint32(16, width)
  new DataView(out.buffer).setUint32(20, height)
  return out
}

/** A 2 m x 1 m x 0.5 m box, with a duplicated material and an optional large texture. */
async function glb(opts: { texturePx?: number; textureBytes?: number; duplicateMaterial?: boolean } = {}): Promise<File> {
  const doc = new Document()
  const buffer = doc.createBuffer()
  const position = doc
    .createAccessor()
    .setType('VEC3')
    .setBuffer(buffer)
    .setArray(new Float32Array([-1, 0, -0.25, 1, 0, -0.25, 1, 1, -0.25, -1, 1, 0.25, 1, 1, 0.25, -1, 0, 0.25]))
  const indices = doc.createAccessor().setType('SCALAR').setBuffer(buffer).setArray(new Uint16Array([0, 1, 2, 3, 4, 5]))
  const material = doc.createMaterial('fabric')
  if (opts.texturePx) material.setBaseColorTexture(doc.createTexture('base').setMimeType('image/png').setImage(fakePng(opts.texturePx, opts.texturePx, opts.textureBytes ?? 50_000)))
  const prim = doc.createPrimitive().setAttribute('POSITION', position).setIndices(indices).setMaterial(material)
  const mesh = doc.createMesh('box').addPrimitive(prim)
  if (opts.duplicateMaterial) mesh.addPrimitive(doc.createPrimitive().setAttribute('POSITION', position).setIndices(indices).setMaterial(material.clone()))
  doc.createScene().addChild(doc.createNode().setMesh(mesh))
  const bytes = await new WebIO().writeBinary(doc)
  return new File([bytes as BlobPart], 'sofa.glb', { type: 'model/gltf-binary' })
}

/** A rippled 1 m x 1 m sheet of `n` x `n` quads (2 n^2 triangles), welded (shared vertices), like a dense scan. */
async function denseGlb(n: number): Promise<File> {
  const doc = new Document()
  const buffer = doc.createBuffer()
  const pos = new Float32Array((n + 1) * (n + 1) * 3)
  for (let y = 0; y <= n; y++)
    for (let x = 0; x <= n; x++) {
      const i = (y * (n + 1) + x) * 3
      pos[i] = x / n
      pos[i + 1] = 0.02 * Math.sin((x / n) * 6) * Math.cos((y / n) * 6) + 0.02
      pos[i + 2] = y / n
    }
  const idx = new Uint32Array(n * n * 6)
  let k = 0
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const a = y * (n + 1) + x
      idx.set([a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2], k)
      k += 6
    }
  const prim = doc
    .createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setBuffer(buffer).setArray(pos))
    .setIndices(doc.createAccessor().setType('SCALAR').setBuffer(buffer).setArray(idx))
    .setMaterial(doc.createMaterial('weave'))
  doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh('sheet').addPrimitive(prim)))
  const bytes = await new WebIO().writeBinary(doc)
  return new File([bytes as BlobPart], 'dense.glb', { type: 'model/gltf-binary' })
}

describe('optimizeGlb: triangle reduction (ADR-0038)', () => {
  // Owner 2026-10-26: heavy uploads (a Tripo chair had 440,384 triangles) are made lighter automatically, without
  // any compression extension, so Android AR still opens them.
  it('reduces a model above 100,000 triangles to at most 100,000, with its size and extensions unchanged', async () => {
    const input = await denseGlb(300) // 180,000 triangles
    const r = await optimizeGlb(input, async () => null)
    expect(r.optimized).toBe(true)
    expect(r.trianglesBefore).toBe(180_000)
    expect(r.trianglesAfter).toBeLessThanOrEqual(100_000)
    expect(r.outputBytes).toBeLessThan(r.originalBytes * 0.7)
    const io = new WebIO()
    const [a, b] = await Promise.all([io.readBinary(new Uint8Array(await input.arrayBuffer())), io.readBinary(new Uint8Array(await r.file.arrayBuffer()))])
    const [sa, sb] = [summarize(a), summarize(b)]
    for (let i = 0; i < 3; i++) {
      expect(sb.min[i]).toBeCloseTo(sa.min[i]!, 2)
      expect(sb.max[i]).toBeCloseTo(sa.max[i]!, 2)
    }
    expect(sb.extensions).toEqual([])
  }, 60_000)

  it('leaves a model of 100,000 triangles or fewer untouched', async () => {
    const r = await optimizeGlb(await denseGlb(100), async () => null) // 20,000 triangles
    expect(r.optimized).toBe(false)
    expect(r.trianglesAfter).toBe(r.trianglesBefore)
  })
})

describe('optimizeGlb', () => {
  it('downscales oversized textures and keeps size, geometry and extensions identical', async () => {
    const input = await glb({ texturePx: 4096, textureBytes: 400_000 })
    const resize = vi.fn(async () => fakePng(2048, 2048, 100_000))
    const r = await optimizeGlb(input, resize)
    expect(resize).toHaveBeenCalledWith(expect.any(Uint8Array), 'image/png', 2048)
    expect(r.optimized).toBe(true)
    expect(r.outputBytes).toBeLessThan(r.originalBytes * 0.95)
    const io = new WebIO()
    const [a, b] = await Promise.all([io.readBinary(new Uint8Array(await input.arrayBuffer())), io.readBinary(new Uint8Array(await r.file.arrayBuffer()))])
    expect(compareSummaries(summarize(a), summarize(b))).toBeNull()
    expect(summarize(b).extensions).toEqual([])
  })

  it('leaves textures within 2048 px alone and keeps an already compact file', async () => {
    const resize = vi.fn(async () => null)
    const r = await optimizeGlb(await glb({ texturePx: 1024 }), resize)
    expect(resize).not.toHaveBeenCalled()
    expect(r.optimized).toBe(false)
    expect(r.reason).toMatch(/already compact/)
  })

  it('keeps the original when the file cannot be read', async () => {
    const r = await optimizeGlb(new File([new Uint8Array([1, 2, 3])], 'bad.glb'))
    expect(r.optimized).toBe(false)
    expect(r.file.name).toBe('bad.glb')
  })
})

describe('compareSummaries', () => {
  const base = { min: [-1, 0, -0.25], max: [1, 1, 0.25], triangles: 2, materials: 1, extensions: [] as string[] }
  it('rejects any change of size, geometry, materials or required extensions', () => {
    expect(compareSummaries(base, base)).toBeNull()
    expect(compareSummaries(base, { ...base, max: [1.01, 1, 0.25] })).toMatch(/size/)
    expect(compareSummaries(base, { ...base, triangles: 1 })).toMatch(/geometry/)
  })
  it('accepts fewer triangles only when the model was simplified, never more, and a size change within 0.5%', () => {
    expect(compareSummaries(base, { ...base, triangles: 1 }, { simplified: true })).toBeNull()
    expect(compareSummaries(base, { ...base, triangles: 3 }, { simplified: true })).toMatch(/geometry/)
    expect(compareSummaries(base, { ...base, max: [1.004, 1, 0.25] }, { simplified: true })).toBeNull()
    expect(compareSummaries(base, { ...base, max: [1.05, 1, 0.25] }, { simplified: true })).toMatch(/size/)
    expect(compareSummaries(base, { ...base, materials: 2 })).toMatch(/materials/)
    expect(compareSummaries(base, { ...base, extensions: ['EXT_meshopt_compression'] })).toMatch(/extension/)
  })
})
