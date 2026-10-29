// Turns a path of validateSiteContent (e.g. `customPages.2.slug`) into where it is and what is wrong, for the problem list
// of the top bar and the publish dialog.
import { SOCIAL_NETWORKS, type ContentErrors, type SiteContent } from '@/domain/siteContent'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import type { Vars } from '@/i18n/translate'
import { editorApplyPath, editorPagePath, editorSocialPath } from '@/lib/urls'

type T = (key: TranslationKey, vars?: Vars) => string

export interface Problem {
  path: string
  where: string
  what: string
  /** The Editor screen that holds it. */
  to: string
}

const FIELD_KEYS: Record<string, TranslationKey> = {
  slug: 'editor.field.slug',
  'title.en': 'editor.field.titleEn',
  'title.pt': 'editor.field.titlePt',
  'body.en': 'editor.field.bodyEn',
  'body.pt': 'editor.field.bodyPt',
  id: 'editor.field.id',
  order: 'editor.field.order',
}

export function describeProblem(path: string, key: string, draft: SiteContent, t: T): Problem {
  const what = t(`editor.err.${key}` as TranslationKey)
  const parts = path.split('.')
  if (parts[0] === 'builtinPages' && (parts[1] === 'terms' || parts[1] === 'privacy')) {
    const lang = parts[2] === 'pt' ? t('editor.lang.pt') : t('editor.lang.en')
    return { path, what, where: `${t(parts[1] === 'terms' ? 'editor.page.terms' : 'editor.page.privacy')} (${lang})`, to: editorPagePath(parts[1]) }
  }
  if (parts[0] === 'customPages') {
    const page = parts[1] !== undefined ? draft.customPages[Number(parts[1])] : undefined
    if (!page) return { path, what, where: t('editor.menu.pages'), to: editorPagePath('terms') }
    const name = page.title.en.trim() || t('editor.page.untitled')
    const field = FIELD_KEYS[parts.slice(2).join('.')]
    return { path, what, where: field ? `${name}: ${t(field)}` : name, to: editorPagePath(page.id) }
  }
  if (parts[0] === 'applyForm') return { path, what, where: t('editor.menu.apply'), to: editorApplyPath('form') }
  if (parts[0] === 'social') {
    const net = SOCIAL_NETWORKS.find((n) => n === parts[1])
    return { path, what, where: net ? t(`site.social.${net}`) : t('editor.menu.social'), to: editorSocialPath() }
  }
  return { path, what, where: t('editor.title'), to: editorPagePath('terms') }
}

export function describeProblems(errors: ContentErrors, draft: SiteContent, t: T): Problem[] {
  return Object.entries(errors).map(([path, key]) => describeProblem(path, key, draft, t))
}

const PLACEHOLDER = /\[\[[A-Z0-9_]+\]\]/g

/**
 * How many `[[PLACEHOLDER]]` facts the live text of Terms, Privacy and the custom pages would still contain, counting the
 * built-in text for every page and language without an override. The publish dialog warns and does not block.
 */
export function countPlaceholders(draft: SiteContent, builtin: Record<'terms' | 'privacy', Record<'en' | 'pt', string>>): number {
  let n = 0
  const count = (s: string | undefined) => (s ? (s.match(PLACEHOLDER)?.length ?? 0) : 0)
  for (const k of ['terms', 'privacy'] as const)
    for (const lang of ['en', 'pt'] as const) n += count(draft.builtinPages[k]?.[lang] ?? builtin[k][lang])
  for (const p of draft.customPages) n += count(p.body.en) + count(p.body.pt)
  return n
}
