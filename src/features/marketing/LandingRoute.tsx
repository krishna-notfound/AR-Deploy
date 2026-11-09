// The landing page with its editable wording (ADR-0053). The router and the Editor's preview render this instead of LandingPage:
// it puts the published (or, in the preview, draft) text overrides on top of `t`, so LandingPage and its sections keep calling
// t('landing.…') unchanged. Only keys of LANDING_EDITABLE_KEYS are ever overridden, and only for a language that has a text.
import { type ReactNode, useMemo } from 'react'
import { LANDING_TEXT_LIMITS, type LandingTexts } from '@/domain/siteContent'
import { TextOverrideProvider } from '@/i18n/LanguageProvider'
import type { Lang } from '@/domain/types'
import LandingPage from './LandingPage'
import { useSiteContent } from './SiteContentProvider'

/** The override for a key in a language, or undefined (not editable, no text for that language: the dictionary then answers). */
export function landingText(texts: LandingTexts | undefined, lang: Lang, key: string): string | undefined {
  if (!texts || !Object.hasOwn(LANDING_TEXT_LIMITS, key)) return undefined
  const own = texts[key]?.[lang]
  return typeof own === 'string' && own.trim() ? own : undefined
}

export function LandingTextsProvider({ children }: { children: ReactNode }) {
  const texts = useSiteContent().chrome?.landingTexts
  const override = useMemo(() => (lang: Lang, key: string) => landingText(texts, lang, key), [texts])
  return <TextOverrideProvider override={override}>{children}</TextOverrideProvider>
}

export default function LandingRoute() {
  return (
    <LandingTextsProvider>
      <LandingPage />
    </LandingTextsProvider>
  )
}
