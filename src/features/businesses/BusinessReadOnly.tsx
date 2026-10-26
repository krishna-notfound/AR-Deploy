import { Info } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'
import { BusinessStatusBadge } from '@/components/ui/Badge'
import { Card, CardHeader } from '@/components/ui/Card'
import { InlineNotice } from '@/components/ui/States'
import type { Business } from '@/domain/types'
import { catalogPublicUrl } from '@/lib/urls'

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-ui-small text-ink-muted">{label}</dt>
      <dd className="min-w-0 break-words text-ui-body">{children}</dd>
    </div>
  )
}

const dash = <span className="text-ink-muted">Not set</span>

/**
 * The business details as text, for a platform member who may view businesses but not edit them (R-W3-5): no
 * input, select or button, so nothing invites a change the database would refuse.
 */
export function BusinessReadOnly({ business }: { business: Business }): ReactElement {
  const { contact } = business
  return (
    <div className="space-y-6">
      <InlineNotice icon={<Info className="mt-0.5 size-4 shrink-0" aria-hidden />}>
        You can view this business. Editing needs 'Create and edit businesses'.
      </InlineNotice>
      <Card>
        <CardHeader title="Business profile" />
        <dl className="space-y-4 px-6 pb-6">
          <Row label="Business name">{business.name}</Row>
          <Row label="Description">{business.description ? <span className="whitespace-pre-line">{business.description}</span> : dash}</Row>
          <Row label="Catalog address">
            <span className="break-all">{catalogPublicUrl(business)}</span>
          </Row>
          <Row label="Catalog status">
            <BusinessStatusBadge status={business.status} />
          </Row>
          <Row label="Default currency">{business.defaultCurrency}</Row>
        </dl>
      </Card>
      <Card>
        <CardHeader title="Contact" />
        <dl className="space-y-4 px-6 pb-6">
          <Row label="Email">{contact.email ? <span className="break-all">{contact.email}</span> : dash}</Row>
          <Row label="Phone">{contact.phone || dash}</Row>
          <Row label="Website">{contact.website ? <span className="break-all">{contact.website}</span> : dash}</Row>
          <Row label="Address">{contact.address || dash}</Row>
        </dl>
      </Card>
    </div>
  )
}
