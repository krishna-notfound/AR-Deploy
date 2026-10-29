// R-W2-9: possible duplicates of an application, shown to the reviewer before they decide. Only a warning: it never
// blocks a review action, and while it loads or after an error the review actions stay available.
import { Link } from 'react-router'
import { useCan } from '@/auth/usePermission'
import { PanelHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { InlineNotice } from '@/components/ui/States'
import type { ID } from '@/domain/types'
import { useI18n } from '@/i18n/LanguageProvider'
import { applicationAdminPath, businessAdminPath } from '@/lib/urls'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { applicationStatusLabel, statusWord } from './labels'

const ROW = 'block rounded-[var(--radius-control)] px-3 py-2 text-ui-body break-words'

export function PossibleDuplicates({ applicationId }: { applicationId: ID }) {
  const can = useCan()
  const { t, lang } = useI18n()
  const dups = useServiceQuery(() => service.getApplicationDuplicates(applicationId), [applicationId])

  if (dups.status === 'loading' && !dups.data) return <p className="text-ui-small text-ink-muted">{t('applications.dup.checking')}</p>
  if (!dups.data)
    return (
      <InlineNotice tone="neutral">
        <p>{t('applications.dup.failed')}</p>
        <Button size="sm" className="mt-2" onClick={dups.refetch}>
          {t('common.retry')}
        </Button>
      </InlineNotice>
    )
  const { applications, businesses } = dups.data
  if (applications.length === 0 && businesses.length === 0) return null

  const openBusinesses = can('businesses.view')
  return (
    <Card>
      <PanelHeader title={t('applications.dup.title')} description={t('applications.dup.description')} />
      <CardBody>
        <ul className="-mx-3 space-y-1">
          {applications.map((a) => (
            <li key={`a-${a.id}`}>
              <Link to={applicationAdminPath(a.id)} className={`${ROW} text-accent-ink hover:bg-subtle hover:underline`}>
                {t('applications.dup.application', { reference: a.reference, name: a.businessName, status: applicationStatusLabel(a.status, lang), match: t(`applications.dup.match.${a.match}`) })}
              </Link>
            </li>
          ))}
          {businesses.map((b) => {
            const text = t('applications.dup.business', { name: b.name, status: statusWord(b.status, lang), match: t(`applications.dup.bmatch.${b.match}`) })
            return (
              <li key={`b-${b.id}`}>
                {openBusinesses ? (
                  <Link to={businessAdminPath(b.id)} className={`${ROW} text-accent-ink hover:bg-subtle hover:underline`}>
                    {text}
                  </Link>
                ) : (
                  <span className={`${ROW} text-ink`}>{text}</span>
                )}
              </li>
            )
          })}
        </ul>
      </CardBody>
    </Card>
  )
}
