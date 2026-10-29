// What the public sees of a SiteContent document: the footer chrome, one page, the application form. Pure functions shared
// by the demo service (over its published copy) and by the draft preview (over the draft), so both agree with the SQL
// function get_published_site_content that does the same for the real database.
import type { SiteContent } from '@/domain/siteContent'
import { type Result, fail, ok } from './catalogService'
import type { PublishedApplyForm, PublishedChrome, PublishedPage } from './contentService'

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T
const hasText = (v: Partial<Record<string, string>> | undefined): v is Partial<Record<string, string>> => !!v && Object.values(v).some((t) => typeof t === 'string' && t !== '')

/** Footer pages (shown ones, by `order` then English title: slug and title only) and social links. `null` = nothing published. */
export function chromeOf(content: SiteContent | null, version: number): PublishedChrome {
  if (!content) return { version: 0, footerPages: [], social: {} }
  const footerPages = content.customPages
    .filter((p) => p.showInFooter)
    .sort((a, b) => a.order - b.order || a.title.en.localeCompare(b.title.en))
    .map((p) => ({ slug: p.slug, title: clone(p.title) }))
  return { version, footerPages, social: clone(content.social) }
}

/**
 * One page by slug. Terms and Privacy: the overrides, or null when there are none (use the built-in text). A custom slug:
 * the page, or NOT_FOUND. `null` content (nothing published) behaves the same way.
 */
export function pageOf(content: SiteContent | null, slug: string): Result<PublishedPage | null> {
  const builtin = slug === 'terms' || slug === 'privacy'
  if (!content) return builtin ? ok(null) : fail('NOT_FOUND', 'This page does not exist.')
  if (builtin) {
    const body = content.builtinPages[slug]
    return ok(hasText(body) ? { kind: 'builtin', body: clone(body) } : null)
  }
  const page = content.customPages.find((p) => p.slug === slug)
  return page ? ok({ kind: 'custom', title: clone(page.title), body: clone(page.body) }) : fail('NOT_FOUND', 'This page does not exist.')
}

/** The application form config, or null when nothing is published (the page then uses today's form). */
export function applyFormOf(content: SiteContent | null, version: number): PublishedApplyForm | null {
  return content ? { version, config: clone(content.applyForm) } : null
}
