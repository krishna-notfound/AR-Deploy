import { useParams } from 'react-router'
import { useDocumentTitle } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { LocalizedSpan, useI18n } from '@/i18n/LanguageProvider'
import { errorText } from '@/i18n/errorText'
import { usePublishedPage } from '@/services/contentHooks'
import PublicNotFoundPage from '../marketing/PublicNotFoundPage'
import { MarkdownBody, firstParagraph } from './MarkdownBody'
import { PageFrame } from './PageFrame'
import { useMetaDescription } from './useMetaDescription'

/**
 * A page the client made in the Editor, at /pages/:slug (platform domain and business subdomains). Title and body show in the
 * visitor's language; a language left empty falls back to English and says so (lang="en" on the text). An unknown address is
 * the public not-found page. There is no built-in text to fall back to, so a failed read is an error with Retry.
 * `slug` overrides the route parameter (the Editor's preview renders the page it is editing).
 */
export default function CustomPage({ tenant, slug: slugProp }: { tenant?: boolean; slug?: string }) {
  const params = useParams()
  const slug = slugProp ?? params.slug ?? ''
  const { t, localizedMeta } = useI18n()
  const { page, loading, error, notFound, reload } = usePublishedPage(slug)
  const custom = page?.kind === 'custom' ? page : null
  const body = localizedMeta(custom?.body)
  useDocumentTitle(custom ? localizedMeta(custom.title).text : undefined)
  useMetaDescription(custom ? firstParagraph(body.text) : '')

  // A built-in slug (terms, privacy) has no custom page behind it.
  if (notFound || (!loading && !error && !custom)) return <PublicNotFoundPage tenant={tenant} />
  return (
    <PageFrame tenant={tenant}>
      <main className="mx-auto w-full max-w-[760px] flex-1 px-5 py-12 sm:px-10 lg:py-20">
        {loading && (
          <div aria-busy="true" aria-label={t('common.loading')}>
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="mt-6 h-4 w-full" />
            <Skeleton className="mt-3 h-4 w-5/6" />
            <Skeleton className="mt-3 h-4 w-3/4" />
          </div>
        )}
        {error && (
          <div role="alert" className="text-center">
            <p className="text-[15px] text-ink-muted">{t('site.page.loadError')}</p>
            <p className="mt-1 text-[13px] text-ink-muted">{errorText(error, t)}</p>
            <Button className="mt-4" onClick={reload}>
              {t('common.retry')}
            </Button>
          </div>
        )}
        {custom && (
          <>
            <LocalizedSpan as="h1" text={custom.title} className="block text-headline font-display text-ink" />
            <div className="mt-8" lang={body.isFallback ? 'en' : undefined}>
              <MarkdownBody markdown={body.text} />
            </div>
          </>
        )}
      </main>
    </PageFrame>
  )
}
