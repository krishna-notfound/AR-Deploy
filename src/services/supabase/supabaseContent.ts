// Supabase implementation of the Content Editor service (ADR-0043, spec section 7): one rpc per method on the SQL functions
// of migration `site_content`. The tables are not readable by the API roles, so there is nothing else to call. Errors
// are mapped from the function refusals: aal2_required and forbidden (42501) to PERMISSION, draft_conflict (P0001) to
// CONFLICT, invalid_content (22023, detail '<document path>|<error key>') to VALIDATION, version_not_found to NOT_FOUND.
// A failure is always reported; nothing here falls back to demo data.
import type { SupabaseClient } from '@supabase/supabase-js'
import { SITE_ASSET_BUCKET, type SiteAssetKind, normalizeApplyForm, normalizeSiteContent } from '@/domain/siteContent'
import { checkSiteAssetFile, newSiteAssetPath, siteAssetExtension } from '../siteAsset'
import { type Result, fail, ok } from '../catalogService'
import type { ContentDraftState, ContentService, ContentVersionSummary, PublishedApplyForm, PublishedChrome, PublishedPage } from '../contentService'

type DbError = { code?: string; message?: string; details?: string | null } | null

/** PostgREST and Postgres codes that mean the migration is not applied yet (function or table missing). */
const MISSING = new Set(['PGRST202', 'PGRST205', '42P01', '42883'])
const UNKNOWN_MESSAGE = 'The request could not be completed. Try again in a moment.'

/** `detail` of invalid_content is '<document path>|<error key>'. */
function fieldErrorsOf(details: string | null | undefined): Record<string, string> | undefined {
  const m = /^([^|]+)\|(\w+)$/.exec((details ?? '').trim())
  return m ? { [m[1]!]: m[2]! } : undefined
}

export function mapContentError<T = never>(error: DbError): Result<T> {
  const code = error?.code ?? ''
  const message = error?.message ?? ''
  if (MISSING.has(code)) {
    return { ok: false, error: { code: 'UNKNOWN', message: "Website content isn't enabled on this database yet.", reason: 'not_enabled' } }
  }
  if (code === '42501') {
    const reason = message === 'aal2_required' ? 'aal2_required' : 'forbidden'
    return {
      ok: false,
      error: {
        code: 'PERMISSION',
        message: reason === 'aal2_required' ? 'Confirm your sign-in with two-factor authentication to edit website content.' : 'You do not have permission to edit website content.',
        reason,
      },
    }
  }
  if (message === 'draft_conflict') {
    return { ok: false, error: { code: 'CONFLICT', message: 'The draft changed since you opened it. Reload to see the latest.', reason: 'draft_conflict' } }
  }
  if (message === 'version_not_found') return fail('NOT_FOUND', 'That version no longer exists.')
  if (message === 'invalid_content') {
    return fail('VALIDATION', 'The content has problems that must be fixed before publishing.', fieldErrorsOf(error?.details))
  }
  return fail('UNKNOWN', UNKNOWN_MESSAGE)
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export function createSupabaseContent(sb: SupabaseClient): ContentService {
  /** One rpc; a thrown network error is an UNKNOWN failure, never a crash. */
  async function call<T>(fn: string, args: Record<string, unknown> | undefined, map: (data: unknown) => Result<T>): Promise<Result<T>> {
    try {
      const { data, error } = await sb.rpc(fn, args as never)
      if (error) return mapContentError<T>(error as DbError)
      return map(data)
    } catch {
      return fail('UNKNOWN', UNKNOWN_MESSAGE)
    }
  }
  const published = (data: unknown): { version: number; content: unknown } => {
    const o = isObj(data) ? data : {}
    return { version: typeof o.version === 'number' ? o.version : 0, content: o.content ?? null }
  }

  return {
    getPublishedChrome: () =>
      call<PublishedChrome>('get_published_site_content', { p_part: 'chrome' }, (data) => {
        const { version, content } = published(data)
        const c = isObj(content) ? content : {}
        const footerPages = (Array.isArray(c.footerPages) ? c.footerPages : []).flatMap((p) => {
          if (!isObj(p) || typeof p.slug !== 'string' || !isObj(p.title) || typeof p.title.en !== 'string') return []
          return [{ slug: p.slug, title: typeof p.title.pt === 'string' ? { en: p.title.en, pt: p.title.pt } : { en: p.title.en } }]
        })
        const normalized = normalizeSiteContent({ landing: { collections: c.landingCollections, featured: c.landingFeatured, example: c.landingExample, showcase: c.landingShowcase, hero: c.landingHero, texts: c.landingTexts }, chrome: { favicon: c.favicon } })
        const landing = normalized.landing
        return ok({
          version,
          footerPages,
          social: normalizeSiteContent({ social: c.social }).social,
          landingCollections: landing.collections,
          ...(landing.featured ? { landingFeatured: landing.featured } : {}),
          ...(landing.example ? { landingExample: landing.example } : {}),
          ...(landing.hero ? { landingHero: landing.hero } : {}),
          ...(landing.showcase ? { landingShowcase: landing.showcase } : {}),
          ...(landing.texts ? { landingTexts: landing.texts } : {}),
          ...(normalized.chrome?.favicon ? { favicon: normalized.chrome.favicon } : {}),
        })
      }),

    getPublishedPage: (slug) =>
      call<PublishedPage | null>('get_published_site_content', { p_part: 'page', p_slug: slug }, (data) => {
        const { content } = published(data)
        const builtin = slug === 'terms' || slug === 'privacy'
        if (!isObj(content)) return builtin ? ok(null) : fail('NOT_FOUND', 'This page does not exist.')
        if (content.kind === 'builtin') {
          const body = normalizeSiteContent({ builtinPages: { [slug]: content.body } }).builtinPages[slug as 'terms' | 'privacy']
          return ok(body && Object.values(body).some((t) => t) ? { kind: 'builtin', body } : null)
        }
        if (content.kind === 'custom') {
          const page = normalizeSiteContent({ customPages: [{ id: 'x', slug, title: content.title, body: content.body }] }).customPages[0]!
          return ok({ kind: 'custom', title: page.title, body: page.body })
        }
        return fail('NOT_FOUND', 'This page does not exist.')
      }),

    getPublishedApplyForm: () =>
      call<PublishedApplyForm | null>('get_published_site_content', { p_part: 'apply' }, (data) => {
        const { version, content } = published(data)
        return ok(isObj(content) ? { version, config: normalizeApplyForm(content) } : null)
      }),

    getContentDraft: () =>
      call<ContentDraftState>('admin_get_site_content', undefined, (data) => {
        if (!isObj(data) || typeof data.draftUpdatedAt !== 'string') return fail('UNKNOWN', UNKNOWN_MESSAGE)
        return ok({
          draft: normalizeSiteContent(data.draft),
          draftUpdatedAt: data.draftUpdatedAt,
          published: isObj(data.published) ? normalizeSiteContent(data.published) : null,
          version: typeof data.version === 'number' ? data.version : 0,
          publishedAt: typeof data.publishedAt === 'string' ? data.publishedAt : null,
          publishedByName: typeof data.publishedByName === 'string' ? data.publishedByName : null,
        })
      }),

    saveContentDraft: (content, baseUpdatedAt) =>
      call('admin_save_site_content_draft', { p_content: content, p_base: baseUpdatedAt }, (data) =>
        typeof data === 'string' ? ok({ draftUpdatedAt: data }) : fail('UNKNOWN', UNKNOWN_MESSAGE),
      ),

    publishContent: (baseUpdatedAt) =>
      call('admin_publish_site_content', { p_base: baseUpdatedAt }, (data) =>
        isObj(data) && typeof data.version === 'number' && typeof data.publishedAt === 'string'
          ? ok({ version: data.version, publishedAt: data.publishedAt })
          : fail('UNKNOWN', UNKNOWN_MESSAGE),
      ),

    listContentVersions: () =>
      call<ContentVersionSummary[]>('admin_list_site_content_versions', undefined, (data) =>
        ok(
          (Array.isArray(data) ? data : []).flatMap((r) =>
            isObj(r) && typeof r.version === 'number' && typeof r.published_at === 'string'
              ? [{ version: r.version, publishedAt: r.published_at, publishedByName: typeof r.published_by_name === 'string' ? r.published_by_name : '' }]
              : [],
          ),
        ),
      ),

    restoreContentVersion: (version, baseUpdatedAt) =>
      call('admin_restore_site_content_version', { p_version: version, p_base: baseUpdatedAt }, (data) =>
        typeof data === 'string' ? ok({ draftUpdatedAt: data }) : fail('UNKNOWN', UNKNOWN_MESSAGE),
      ),

    uploadSiteAsset: async (file, kind) => {
      const bad = checkSiteAssetFile(file, kind)
      if (bad) return bad
      const asset = newSiteAssetPath(siteAssetExtension(file, kind)!)
      try {
        const { error } = await sb.storage.from(SITE_ASSET_BUCKET).upload(asset.path, file, { contentType: assetContentType(kind, asset.path, file.type), upsert: false })
        if (error) {
          const status = String((error as { statusCode?: string | number }).statusCode ?? '')
          if (status === '401' || status === '403') return { ok: false, error: { code: 'PERMISSION', message: 'You do not have permission to upload website files. Confirm your sign-in with two-factor authentication.', reason: 'forbidden' } }
          return fail('UNKNOWN', 'The file could not be uploaded. Try again.')
        }
        return ok(asset)
      } catch {
        return fail('UNKNOWN', 'The file could not be uploaded. Try again.')
      }
    },
  }
}

const assetContentType = (kind: SiteAssetKind, path: string, type: string): string =>
  kind === 'glb' ? 'model/gltf-binary' : kind === 'usdz' ? 'model/vnd.usdz+zip' : kind === 'favicon' ? 'image/png' : type || (path.endsWith('.png') ? 'image/png' : path.endsWith('.webp') ? 'image/webp' : 'image/jpeg')
