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
const LABEL: Record<SiteAssetKind, string> = {
  image: 'a JPG, PNG or WebP picture up to 5 MB',
  glb: 'a .glb 3D model up to 30 MB',
  usdz: 'a .usdz file up to 40 MB',
  favicon: 'a square PNG picture up to 1 MB',
}

/** The lowercase extension to store the file under ('jpeg' becomes 'jpg'), or null when the name does not fit the kind. */
export function siteAssetExtension(file: Pick<File, 'name'>, kind: SiteAssetKind): string | null {
  const ext = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase()
  if (!SITE_ASSET_EXTENSIONS[kind].includes(ext)) return null
  return ext === 'jpeg' ? 'jpg' : ext
}

/** A failure when the file is not acceptable for `kind` (type by name and MIME, size), or null when it is. */
export function checkSiteAssetFile(file: Pick<File, 'name' | 'size' | 'type'>, kind: SiteAssetKind): Result<never> | null {
  if (!siteAssetExtension(file, kind) || (file.type && !MIME[kind].includes(file.type))) return fail('VALIDATION', `Choose ${LABEL[kind]}.`)
  if (file.size <= 0) return fail('VALIDATION', 'That file is empty.')
  if (file.size > SITE_ASSET_MAX_BYTES[kind]) return fail('VALIDATION', `That file is too large. Choose ${LABEL[kind]}.`)
  return null
}

/** `landing/<uuid>.<ext>`; the uuid is lowercase hex and dashes, which the path rule allows. */
export const newSiteAssetPath = (ext: string): SiteAsset => ({ path: `landing/${crypto.randomUUID()}.${ext}` })
