// "Build from GLB" in the editor's USDZ section (owner 2026-10-27, ADR-0039): a real iPhone (Quick Look) file made
// in the browser from the GLB the business uploaded (already made lighter on upload, ADR-0038). three.js reads the
// GLB and writes the USDZ in metres (metersPerUnit 1), so the true size is kept. Loaded only when the button is used.
// USDZ stores the shape as text and textures as PNG, so the iPhone file is lighter again than the GLB: about 50,000
// triangles and 1024 px textures (measured on a real chair: 16 MB at 100,000 triangles and 2048 px).
import { WebIO } from '@gltf-transform/core'
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions'
import { prune, simplify, weld } from '@gltf-transform/functions'
import { MeshoptSimplifier } from 'meshoptimizer'
import { USDZExporter } from 'three/examples/jsm/exporters/USDZExporter.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { summarize } from './modelOptimize'

export const USDZ_MAX_TRIANGLES = 50_000
export const USDZ_MAX_TEXTURE_PX = 1024

/** The GLB with at most USDZ_MAX_TRIANGLES triangles (same simplifier and error bound as the upload optimizer). */
async function lighter(glb: ArrayBuffer): Promise<ArrayBuffer> {
  const io = new WebIO().registerExtensions(KHRONOS_EXTENSIONS)
  const doc = await io.readBinary(new Uint8Array(glb))
  const { triangles } = summarize(doc)
  if (triangles <= USDZ_MAX_TRIANGLES) return glb
  await MeshoptSimplifier.ready
  await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: USDZ_MAX_TRIANGLES / triangles, error: 0.001 }), prune())
  const out = await io.writeBinary(doc)
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer
}

export async function buildUsdzFromGlb(glb: ArrayBuffer): Promise<Uint8Array> {
  const gltf = await new GLTFLoader().parseAsync(await lighter(glb), '')
  return new USDZExporter().parseAsync(gltf.scene, {
    quickLookCompatible: true,
    maxTextureSize: USDZ_MAX_TEXTURE_PX,
    ar: { anchoring: { type: 'plane' }, planeAnchoring: { alignment: 'horizontal' } },
  })
}

/** "white-woven-chair.glb" → "white-woven-chair-from-glb.usdz": the file name says where it came from. */
export const usdzNameFor = (glbName: string): string => `${glbName.replace(/\.glb$/i, '')}-from-glb.usdz`
