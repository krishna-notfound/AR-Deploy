import { Info } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'
import { BusinessStatusBadge } from '@/components/ui/Badge'
import { Card, CardHeader } from '@/components/ui/Card'
import { InlineNotice } from '@/components/ui/States'
import type { Business } from '@/domain/types'
import { useI18n } from '@/i18n/LanguageProvider'
import { catalogPublicUrl } from '@/lib/urls'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-ui-small text-ink-muted">{label}</dt>
      <dd className="min-w-0 break-words text-ui-body">{children}</dd>
    </div>
  )
}

/**
 * The business details as text, for a platform member who may view businesses but not edit them (R-W3-5): no
 * input, select or button, so nothing invites a change the database would refuse.
 */
export function BusinessReadOnly({ business }: { business: Business }): ReactElement {
  const { t } = useI18n()
  const { contact } = business
  const dash = <span className="text-ink-muted">{t('admin.businesses.readOnly.notSet')}</span>
  return (
    <div className="space-y-6">
      <InlineNotice icon={<Info className="mt-0.5 size-4 shrink-0" aria-hidden />}>
        {t('admin.businesses.readOnly.notice')}
      </InlineNotice>
      <Card>
        <CardHeader title={t('admin.businesses.form.profile')} />
        <dl className="space-y-4 px-6 pb-6">
          <Row label={t('admin.businesses.form.name')}>{business.name}</Row>
          <Row label={t('admin.businesses.form.description')}>{business.description ? <span className="whitespace-pre-line">{business.description}</span> : dash}</Row>
          <Row label={t('admin.businesses.form.catalogAddress')}>
            <span className="break-all">{catalogPublicUrl(business)}</span>
          </Row>
          <Row label={t('admin.businesses.form.status')}>
            <BusinessStatusBadge status={business.status} />
          </Row>
          <Row label={t('admin.businesses.form.currency')}>{business.defaultCurrency}</Row>
        </dl>
      </Card>
      <Card>
        <CardHeader title={t('admin.businesses.form.contact')} />
        <dl className="space-y-4 px-6 pb-6">
          <Row label={t('common.email')}>{contact.email ? <span className="break-all">{contact.email}</span> : dash}</Row>
          <Row label={t('admin.businesses.form.phone')}>{contact.phone || dash}</Row>
          <Row label={t('admin.businesses.form.website')}>{contact.website ? <span className="break-all">{contact.website}</span> : dash}</Row>
          <Row label={t('admin.businesses.form.address')}>{contact.address || dash}</Row>
        </dl>
      </Card>
    </div>
  )
}
