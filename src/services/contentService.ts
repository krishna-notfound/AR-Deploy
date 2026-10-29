// The Content Editor service (ADR-0043, spec section 7): the published reads every public page uses, and the draft,
// publish, history and restore calls of the Editor (content.manage + 2FA). The UI imports `content` from
// services/index.ts. Supabase: services/supabase/supabaseContent.ts (one rpc per method). Demo: services/mock/mockContent.ts.
//
// Errors (Result<T>): PERMISSION (reason aal2_required | forbidden), CONFLICT (reason draft_conflict), VALIDATION
// (fieldErrors by document path), NOT_FOUND (an unknown custom slug or version). A database without the migration answers
// UNKNOWN with reason not_enabled; the public pages then fall back to the built-in text.
import type { ISODate, LocalizedText } from '@/domain/types'
import type { ApplyFormConfig, Lang, SiteContent } from '@/domain/siteContent'
import type { Result } from './catalogService'

export interface PublishedChrome {
  /** 0 when nothing is published. */
  version: number
  /** Custom pages shown in the footer, in footer order: slug and title only. */
  footerPages: { slug: string; title: LocalizedText }[]
  social: SiteContent['social']
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
}
