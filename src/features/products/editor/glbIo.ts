// One way to read uploaded GLBs (owner 2026-11-04). gltfpack, and so Tripo's "_meshopt" downloads, pack the geometry
// with EXT_meshopt_compression and KHR_mesh_quantization and mark both required: readers without the meshopt decoder
// (three.js without setMeshoptDecoder, Android Scene Viewer) cannot open the file at all. This reader decodes them, and
// unpack() turns such a model back into a plain one, so the stored GLB opens everywhere (ADR-0038: no compression
// extension on stored models).
import { type Document, WebIO } from '@gltf-transform/core'
import { EXTMeshoptCompression, KHRONOS_EXTENSIONS } from '@gltf-transform/extensions'
import { dequantize } from '@gltf-transform/functions'
import { MeshoptDecoder } from 'meshoptimizer'

/** The packing extensions unpack() removes. */
export const PACKING_EXTENSIONS: readonly string[] = ['EXT_meshopt_compression', 'KHR_mesh_quantization']

/** A reader for the Khronos extensions plus meshopt-compressed files. */
export async function glbIo(): Promise<WebIO> {
  await MeshoptDecoder.ready
  return new WebIO().registerExtensions([...KHRONOS_EXTENSIONS, EXTMeshoptCompression]).registerDependencies({ 'meshopt.decoder': MeshoptDecoder })
}

/** Removes meshopt compression and quantization from the model (written plain afterwards). True when it was packed. */
export async function unpack(doc: Document): Promise<boolean> {
  const packed = doc.getRoot().listExtensionsUsed().filter((e) => PACKING_EXTENSIONS.includes(e.extensionName))
  if (!packed.length) return false
  if (packed.some((e) => e.extensionName === 'KHR_mesh_quantization')) await doc.transform(dequantize())
  for (const e of packed) e.dispose()
  return true
}
