import { useMemo, useState } from 'react'
import { useDocumentTitle } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { InlineNotice } from '@/components/ui/States'
import { useI18n } from '@/i18n/LanguageProvider'
import { usePublishedApplyForm } from '@/services/contentHooks'
import { AuthLayout } from '../auth/AuthLayout'
import { LegalLinks } from '../legal/LegalLinks'
import { ApplyForm } from './ApplyForm'
import { makeApplyTexts } from './applyText'

/** The shape of the form while its configuration loads (no flash of the old form). */
function FormSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-6">
      <Skeleton className="h-4 w-28" />
      <Skeleton className="h-10 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <div className="flex gap-3 pt-4">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-6 flex-1" />
        ))}
      </div>
      <div className="space-y-5 pt-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-11 w-full" />
        ))}
      </div>
    </div>
  )
}

/**
 * Public application form (design/24, spec section 10). The steps, fields, questions and wording come from the published
 * form (Editor); nothing published, or a failed read, shows the built-in form. The Editor's preview renders this page
 * with the draft (SiteContentSourceContext) and answers the submit call itself (previewGuard).
 */
export default function ApplyPage() {
  const { t, lang } = useI18n()
  const { config, version, loading, error, reload } = usePublishedApplyForm()
  // Only the first read shows the skeleton; a reload after a 409 keeps the form and the answers on screen.
  const [loaded, setLoaded] = useState(false)
  if (!loading && !loaded) setLoaded(true)
  const tx = useMemo(() => makeApplyTexts(config, lang), [config, lang])
  useDocumentTitle(tx.text('apply.title'))

  return (
    <AuthLayout photo="sofa" wide footer={<LegalLinks social linkClassName="transition-colors hover:text-ink" />}>
      {!loaded ? (
        <FormSkeleton label={t('common.loading')} />
      ) : (
        <>
          {error && (
            <InlineNotice tone="warning" className="mb-8">
              <span role="alert">{t('applications.apply.configError')}</span>{' '}
              <Button size="sm" onClick={reload}>
                {t('common.retry')}
              </Button>
            </InlineNotice>
          )}
          <ApplyForm config={config} version={version} onStale={reload} />
        </>
      )}
    </AuthLayout>
  )
}
