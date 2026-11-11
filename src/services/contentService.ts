// The Content Editor service (ADR-0043, spec section 7): the published reads every public page uses, and the draft,
// publish, history and restore calls of the Editor (content.manage + 2FA). The UI imports `content` from
// services/index.ts. Supabase: services/supabase/supabaseContent.ts (one rpc per method). Demo: services/mock/mockContent.ts.
//
// Errors (Result<T>): PERMISSION (reason aal2_required | forbidden), CONFLICT (reason draft_conflict), VALIDATION
// (fieldErrors by document path), NOT_FOUND (an unknown custom slug or version). A database without the migration answers
// UNKNOWN with reason not_enabled; the public pages then fall back to the built-in text.
import type { ISODate, LocalizedText } from '@/domain/types'
import type {
  ApplyFormConfig,
  Lang,
  LandingAbout,
  LandingCollection,
  LandingHero,
  LandingQr,
  LandingSection,
  LandingShowcase,
  LandingTexts,
  ProductRef,
  SiteAsset,
  SiteAssetKind,
  SiteContent,
} from '@/domain/siteContent'
import type { Result } from './catalogService'

export interface PublishedChrome {
  /** 0 when nothing is published. */
  version: number
  /** Custom pages shown in the footer, in footer order: slug and title only. */
  footerPages: { slug: string; title: LocalizedText }[]
  social: SiteContent['social']
  /** The landing page's Collections cards, hidden ones included (the page skips them). Empty: show the built-in four. */
  landingCollections: LandingCollection[]
  /** The product the landing page's "Open a live piece in 3D" opens; absent when the admin has not chosen one. */
  landingFeatured?: ProductRef
  /** The admin's piece the hero's "See a live example" opens (ADR-0047); absent when none was chosen. */
  landingExample?: ProductRef
  /** The landing hero's own picture and optional 3D model; absent when none is published. */
  landingHero?: LandingHero
  /** The landing page's 3D showcase card (the Owner/Admin's own files and texts); absent when none is published. */
  landingShowcase?: LandingShowcase
  /** The landing page's text overrides (ADR-0053); absent when none are published. */
  landingTexts?: LandingTexts
  /** The order and visibility of the landing sections and the Owner/Admin's own sections (ADR-0061); absent: the default list. */
  landingSections?: LandingSection[]
  /** The QR section's picture and layout; absent: centred text. */
  landingQr?: LandingQr
  /** The About section's two photographs; absent: the built-in photos. */
  landingAbout?: LandingAbout
  /** The site icon (a PNG) that replaces the built-in favicon (ADR-0053); absent when none is published. */
  favicon?: SiteAsset
}
export type PublishedPage =
  | { kind: 'builtin'; body: Partial<Record<Lang, string>> } // terms | privacy overrides
  | { kind: 'custom'; title: LocalizedText; body: LocalizedText }
export interface PublishedApplyForm {
  version: number
  config: ApplyFormConfig
}
export interface ContentDraftState {
  draft: SiteContent
  /**
   * The base for the next save/publish/restore. Treat it as an opaque string: the database keeps microseconds, so never
   * parse and re-format it.
   */
  draftUpdatedAt: ISODate
  published: SiteContent | null
  /** 0 = never published. */
  version: number
  publishedAt: ISODate | null
  publishedByName: string | null
}
export interface ContentVersionSummary {
  version: number
  publishedAt: ISODate
  publishedByName: string
}

export interface ContentService {
  // Public (no sign-in)
  getPublishedChrome(): Promise<Result<PublishedChrome>>
  /** null: nothing published for it (use the built-in text). A custom slug that does not exist is NOT_FOUND. */
  getPublishedPage(slug: string): Promise<Result<PublishedPage | null>>
  /** null: nothing published (the page uses today's form). */
  getPublishedApplyForm(): Promise<Result<PublishedApplyForm | null>>
  // Editor (content.manage + 2FA)
  getContentDraft(): Promise<Result<ContentDraftState>>
  saveContentDraft(content: SiteContent, baseUpdatedAt: ISODate): Promise<Result<{ draftUpdatedAt: ISODate }>>
  publishContent(baseUpdatedAt: ISODate): Promise<Result<{ version: number; publishedAt: ISODate }>>
  /** Newest first, at most 100. */
  listContentVersions(): Promise<Result<ContentVersionSummary[]>>
  /** Copies that version into the draft; does not publish. */
  restoreContentVersion(version: number, baseUpdatedAt: ISODate): Promise<Result<{ draftUpdatedAt: ISODate }>>
  /**
   * Uploads a picture (jpg, png, webp, 5 MB) or a 3D model (.glb 30 MB, .usdz 40 MB) for the landing page. Checks type and size
   * first (VALIDATION). Supabase: bucket `site-content`, path `landing/<uuid>.<ext>`. Demo: the file only lives in this browser
   * session (an object URL), so it is gone after a reload.
   */
  uploadSiteAsset(file: File, kind: SiteAssetKind): Promise<Result<SiteAsset>>
}
