import { Compass } from 'lucide-react'
import { useDocumentTitle } from '@/components/layout/PageHeader'
import { ButtonLink } from '@/components/ui/Button'
import { useI18n } from '@/i18n/LanguageProvider'
import { PublicMessage } from '../public/PublicMessage'
import { PublicShell } from '../public/PublicShell'
import { SiteFooter, SiteHeader } from './SiteChrome'

/**
 * Unknown public URLs, in the visitor's language (?lang=pt). On the platform domain it keeps the Sanctus header and
 * footer; on a business subdomain ("/" is that business's catalogue) it uses the catalogue chrome. Dashboards keep
 * their own English page (features/demo/NotFoundPage).
 */
export default function PublicNotFoundPage({ tenant }: { tenant?: boolean }) {
  const { t } = useI18n()
  useDocumentTitle(t('notFound.title'))
  const message = (
    <PublicMessage
      icon={Compass}
      title={t('notFound.title')}
      body={t('notFound.body')}
      action={
        <ButtonLink to="/" variant="primary">
          {tenant ? t('product.viewCatalog') : t('notFound.home')}
        </ButtonLink>
      }
    />
  )
  if (tenant) return <PublicShell>{message}</PublicShell>
  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <SiteHeader />
      <main className="flex-1">{message}</main>
      <SiteFooter />
    </div>
  )
}
