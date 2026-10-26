// @vitest-environment node
import { Document, WebIO } from '@gltf-transform/core'
import { describe, expect, it } from 'vitest'
import { validateModelFile } from '@/lib/files'
import { buildUsdzFromGlb, usdzNameFor } from './usdzFromGlb'

/** A 2 m x 1 m x 0.5 m box, no textures. */
async function boxGlb(): Promise<ArrayBuffer> {
  const doc = new Document()
  const buffer = doc.createBuffer()
  const position = doc.createAccessor().setType('VEC3').setBuffer(buffer).setArray(new Float32Array([-1, 0, -0.25, 1, 0, -0.25, 1, 1, -0.25, -1, 1, 0.25, 1, 1, 0.25, -1, 0, 0.25]))
  const indices = doc.createAccessor().setType('SCALAR').setBuffer(buffer).setArray(new Uint16Array([0, 1, 2, 3, 4, 5]))
  const prim = doc.createPrimitive().setAttribute('POSITION', position).setIndices(indices).setMaterial(doc.createMaterial('oak').setBaseColorFactor([0.6, 0.4, 0.2, 1]))
  doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh('box').addPrimitive(prim)))
  const bytes = await new WebIO().writeBinary(doc)
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

describe('buildUsdzFromGlb (owner 2026-10-27, ADR-0039)', () => {
  it('builds a USDZ that passes the upload checks (zip, USD first, uncompressed, aligned), in metres', async () => {
    const usdz = await buildUsdzFromGlb(await boxGlb())
    const file = new File([usdz as BlobPart], 'box-from-glb.usdz', { type: 'model/vnd.usdz+zip' })
    expect(await validateModelFile(file, 'usdz')).toEqual({ ok: true })
    const text = new TextDecoder().decode(usdz)
    expect(text).toContain('metersPerUnit = 1') // true size: glTF metres stay metres
    const i = text.indexOf('point3f[] points')
    expect(text.slice(i, i + 60)).toMatch(/\(-1(\.0+)?, 0(\.0+)?, -0\.250*\)/) // the box's own corner, unscaled
  })

  it('makes the iPhone file lighter again: at most 50,000 triangles (USDZ stores the shape as text)', async () => {
    const n = 300 // a 1 m sheet of 180,000 triangles
    const doc = new Document()
    const buffer = doc.createBuffer()
    const pos = new Float32Array((n + 1) * (n + 1) * 3)
    for (let y = 0; y <= n; y++)
      for (let x = 0; x <= n; x++) pos.set([x / n, 0.02 * Math.sin((x / n) * 6) * Math.cos((y / n) * 6), y / n], (y * (n + 1) + x) * 3)
    const idx = new Uint32Array(n * n * 6)
    for (let y = 0, k = 0; y < n; y++)
      for (let x = 0; x < n; x++, k += 6) {
        const a = y * (n + 1) + x
        idx.set([a, a + n + 1, a + 1, a + 1, a + n + 1, a + n + 2], k)
      }
    const prim = doc.createPrimitive().setAttribute('POSITION', doc.createAccessor().setType('VEC3').setBuffer(buffer).setArray(pos)).setIndices(doc.createAccessor().setType('SCALAR').setBuffer(buffer).setArray(idx))
    doc.createScene().addChild(doc.createNode().setMesh(doc.createMesh().addPrimitive(prim)))
    const bytes = await new WebIO().writeBinary(doc)
    const text = new TextDecoder().decode(await buildUsdzFromGlb(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer))
    const counts = /int\[\] faceVertexCounts = \[([^\]]*)\]/.exec(text)![1]!.split(',').length
    expect(counts).toBeLessThanOrEqual(50_000)
    expect(counts).toBeGreaterThan(10_000)
  }, 60_000)

  it('rejects a file that is not a GLB', async () => {
    await expect(buildUsdzFromGlb(new Uint8Array([1, 2, 3]).buffer)).rejects.toThrow()
  })

  it('names the iPhone file after the GLB', () => {
    expect(usdzNameFor('white-woven-chair.glb')).toBe('white-woven-chair-from-glb.usdz')
    expect(usdzNameFor('Chair.GLB')).toBe('Chair-from-glb.usdz')
  })
})
