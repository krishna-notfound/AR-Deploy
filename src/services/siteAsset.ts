// Files the Owner/Admin uploads in the Website Editor (owner decision 2026-11-03): client-side checks and the path rules shared by the
// Supabase and the demo implementations. The bucket (`site-content`) repeats the type and size limits (migration site_content_assets).
import { SITE_ASSET_EXTENSIONS, SITE_ASSET_MAX_BYTES, type SiteAsset, type SiteAssetKind } from '@/domain/siteContent'
import { type Result, fail } from './catalogService'

const MIME: Record<SiteAssetKind, readonly string[]> = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  glb: ['model/gltf-binary', 'application/octet-stream'],
  usdz: ['model/vnd.usdz+zip', 'application/octet-stream'],
  favicon: ['image/png'],
}
const mb = (kind: SiteAssetKind) => `${SITE_ASSET_MAX_BYTES[kind] / (1024 * 1024)} MB`
const LABEL: Record<SiteAssetKind, string> = {
  image: `a JPG, PNG or WebP picture up to ${mb('image')}`,
  glb: `a .glb 3D model up to ${mb('glb')}`,
  usdz: `a .usdz file up to ${mb('usdz')}`,
  favicon: `a square PNG picture up to ${mb('favicon')}`,
}

/** Why a file is not acceptable for `kind`: its type (by name and MIME), empty, or over the kind's size; null when it is fine. */
export function siteAssetProblem(file: Pick<File, 'name' | 'size' | 'type'>, kind: SiteAssetKind): 'type' | 'empty' | 'size' | null {
  if (!siteAssetExtension(file, kind) || (file.type && !MIME[kind].includes(file.type))) return 'type'
  if (file.size <= 0) return 'empty'
  if (file.size > SITE_ASSET_MAX_BYTES[kind]) return 'size'
  return null
}

/** The lowercase extension to store the file under ('jpeg' becomes 'jpg'), or null when the name does not fit the kind. */
export function siteAssetExtension(file: Pick<File, 'name'>, kind: SiteAssetKind): string | null {
  const ext = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase()
  if (!SITE_ASSET_EXTENSIONS[kind].includes(ext)) return null
  return ext === 'jpeg' ? 'jpg' : ext
}

/** A failure when the file is not acceptable for `kind` (type by name and MIME, size), or null when it is. */
export function checkSiteAssetFile(file: Pick<File, 'name' | 'size' | 'type'>, kind: SiteAssetKind): Result<never> | null {
  const problem = siteAssetProblem(file, kind)
  if (problem === 'type') return fail('VALIDATION', `Choose ${LABEL[kind]}.`)
  if (problem === 'empty') return fail('VALIDATION', 'That file is empty.')
  if (problem === 'size') return fail('VALIDATION', `That file is too large. Choose ${LABEL[kind]}.`)
  return null
}

/** `landing/<uuid>.<ext>`; the uuid is lowercase hex and dashes, which the path rule allows. */
export const newSiteAssetPath = (ext: string): SiteAsset => ({ path: `landing/${crypto.randomUUID()}.${ext}` })
