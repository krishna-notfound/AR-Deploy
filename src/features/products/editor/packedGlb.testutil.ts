// Test helper: a GLB packed the way gltfpack packs Tripo's "_meshopt" downloads (owner 2026-11-04).
import { WebIO } from '@gltf-transform/core'
import { EXTMeshoptCompression, KHRONOS_EXTENSIONS } from '@gltf-transform/extensions'
import { quantize, reorder } from '@gltf-transform/functions'
import { MeshoptEncoder } from 'meshoptimizer'

/** The same model packed the way gltfpack does (Tripo's "_meshopt" downloads): quantized and meshopt-compressed, both required. */
export async function packedLikeGltfpack(file: File): Promise<File> {
  await MeshoptEncoder.ready
  const io = new WebIO().registerExtensions([...KHRONOS_EXTENSIONS, EXTMeshoptCompression]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder })
  const doc = await io.readBinary(new Uint8Array(await file.arrayBuffer()))
  await doc.transform(reorder({ encoder: MeshoptEncoder }), quantize())
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.QUANTIZE })
  const bytes = await io.writeBinary(doc)
  return new File([bytes as BlobPart], 'tripo_meshopt.glb', { type: 'model/gltf-binary' })
}
