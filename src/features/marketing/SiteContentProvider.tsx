import { type ReactNode, createContext, useContext, useMemo } from 'react'
import type { ServiceError } from '@/services/catalogService'
import { type ContentSource, SiteContentSourceContext, usePublishedChrome } from '@/services/contentHooks'
import type { PublishedChrome } from '@/services/contentService'

/** The footer chrome the public pages share: footer pages and social links (spec 9). */
export interface SiteContentValue {
  /** null while loading, on an error, and outside a provider: the footer then shows Privacy and Terms only. */
  chrome: PublishedChrome | null
  loading: boolean
  error: ServiceError | null
}

const NONE: SiteContentValue = { chrome: null, loading: false, error: null }
const Ctx = createContext<SiteContentValue>(NONE)

/** Footer pages and social links of the published site (or of the draft, in the Editor's preview). */
export function useSiteContent(): SiteContentValue {
  return useContext(Ctx)
}

function ChromeLoader({ children }: { children: ReactNode }) {
  const { chrome, loading, error } = usePublishedChrome()
  const value = useMemo(() => ({ chrome, loading, error }), [chrome, loading, error])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/**
 * Wraps the public routes. It loads the chrome once and shares it, so a visit makes one request however many pages are
 * opened. `source` is 'published' (default) or 'draft' (the Editor's preview: the real components with the saved draft).
 */
export function SiteContentProvider({ source = 'published', children }: { source?: ContentSource; children: ReactNode }) {
  return (
    <SiteContentSourceContext.Provider value={source}>
      <ChromeLoader>{children}</ChromeLoader>
    </SiteContentSourceContext.Provider>
  )
}
