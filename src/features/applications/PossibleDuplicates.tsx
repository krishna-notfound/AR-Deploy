// R-W2-9: possible duplicates of an application, shown to the reviewer before they decide. Only a warning: it never
// blocks a review action, and while it loads or after an error the review actions stay available.
import { Link } from 'react-router'
import { useCan } from '@/auth/usePermission'
import { PanelHeader } from '@/components/layout/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { InlineNotice } from '@/components/ui/States'
import type { ApplicationDuplicates, BusinessStatus, ID } from '@/domain/types'
import { applicationAdminPath, businessAdminPath } from '@/lib/urls'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { applicationStatusLabel } from './labels'

const APPLICATION_MATCH: Record<ApplicationDuplicates['applications'][number]['match'], string> = {
  email: 'same email',
  name: 'same business name',
  both: 'same email and business name',
}
const BUSINESS_MATCH: Record<ApplicationDuplicates['businesses'][number]['match'], string> = {
  owner_email: 'its owner uses this email',
  name: 'same business name',
  both: 'same business name, and its owner uses this email',
}
const BUSINESS_STATUS: Record<BusinessStatus, string> = { active: 'Active', inactive: 'Inactive', draft: 'Draft' }

const ROW = 'block rounded-[var(--radius-control)] px-3 py-2 text-ui-body break-words'

export function PossibleDuplicates({ applicationId }: { applicationId: ID }) {
  const can = useCan()
  const dups = useServiceQuery(() => service.getApplicationDuplicates(applicationId), [applicationId])

  if (dups.status === 'loading' && !dups.data) return <p className="text-ui-small text-ink-muted">Checking for possible duplicates…</p>
  if (!dups.data)
    return <InlineNotice tone="neutral">Couldn't check for possible duplicates. You can still review this application.</InlineNotice>
  const { applications, businesses } = dups.data
  if (applications.length === 0 && businesses.length === 0) return null

  const openBusinesses = can('businesses.view')
  return (
    <Card>
      <PanelHeader title="Possible duplicates" description="Check these before you decide. This is only a warning; every action stays available." />
      <CardBody>
        <ul className="-mx-3 space-y-1">
          {applications.map((a) => (
            <li key={`a-${a.id}`}>
              <Link to={applicationAdminPath(a.id)} className={`${ROW} text-accent-ink hover:bg-subtle hover:underline`}>
                {`Application ${a.reference} · ${a.businessName} · ${applicationStatusLabel(a.status)} · ${APPLICATION_MATCH[a.match]}`}
              </Link>
            </li>
          ))}
          {businesses.map((b) => {
            const text = `Business ${b.name} · ${BUSINESS_STATUS[b.status]} · ${BUSINESS_MATCH[b.match]}`
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
