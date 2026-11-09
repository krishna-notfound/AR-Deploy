// Test helper: plain GLBs of a known size, for the upload scale control (ADR-0058).
import { Document, WebIO } from '@gltf-transform/core'

/**
 * A box of w x h x d units (the unit the file was "authored" in) with 12 triangles. `roots` splits it into that many
 * root nodes, one of them carrying its own scale, to cover scenes with several roots.
 */
export async function boxGlb(w: number, h: number, d: number, opts: { roots?: number; name?: string } = {}): Promise<File> {
  const doc = new Document()
  const buffer = doc.createBuffer()
  const [x, y, z] = [w / 2, h / 2, d / 2]
  const corners = [
    [-x, 0, -z], [x, 0, -z], [x, h, -z], [-x, h, -z],
    [-x, 0, z], [x, 0, z], [x, h, z], [-x, h, z],
  ].flat()
  const position = doc.createAccessor().setType('VEC3').setBuffer(buffer).setArray(new Float32Array(corners))
  const indices = doc
    .createAccessor()
    .setType('SCALAR')
    .setBuffer(buffer)
    .setArray(new Uint16Array([0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 3, 7, 6, 3, 6, 2, 1, 2, 6, 1, 6, 5, 0, 4, 7, 0, 7, 3]))
  const prim = doc.createPrimitive().setAttribute('POSITION', position).setIndices(indices).setMaterial(doc.createMaterial('wood'))
  const mesh = doc.createMesh('box').addPrimitive(prim)
  const scene = doc.createScene()
  const roots = opts.roots ?? 1
  for (let i = 0; i < roots; i++) {
    const node = doc.createNode(`part${i}`).setMesh(mesh)
    if (i === 1) node.setScale([1, 1, 1]) // an existing root scale must survive the wrapping
    scene.addChild(node)
  }
  const bytes = await new WebIO().writeBinary(doc)
  return new File([bytes as BlobPart], opts.name ?? 'dresser.glb', { type: 'model/gltf-binary' })
}
