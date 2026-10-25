import { useCan } from '@/auth/usePermission'
import { scrollBehavior } from '@/lib/motion'
import { ArrowDown, Building2, Check, Eye, FileX, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { PageHeader, PanelHeader } from '@/components/layout/PageHeader'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { BusinessStatusBadge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { FormField, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { EmptyState, ErrorState, InlineNotice } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import type { BusinessApplication, ReviewAction } from '@/domain/types'
import { formatDateTime } from '@/lib/format'
import { usePreferences } from '@/lib/preferences'
import { businessAdminPath } from '@/lib/urls'
import { service } from '@/services'
import { availableActions } from '@/services/applicationRules'
import { useServiceMutation, useServiceQuery } from '@/services/hooks'
import { AuditTimeline } from '../applications/AuditTimeline'
import { EmailActivity } from '../applications/EmailActivity'
import { ApplicationStatusBadge } from '../applications/labels'
import { BusinessOwnersPanel } from '../businesses/BusinessOwnersPanel'

const READINESS: Record<string, string> = {
  '1-10': '1–10 products',
  '11-50': '11–50 products',
  '51-200': '51–200 products',
  '200+': 'More than 200 products',
  all: 'Photos for every product',
  some: 'Some ready',
  none: 'Not yet',
  glb_usdz: 'GLB/USDZ models ready',
  need_help: 'Needs help creating 3D models',
}

export default function ApplicationDetailPage() {
  const { applicationId = '' } = useParams()
  const app = useServiceQuery(() => service.getApplication(applicationId), [applicationId])

  if (app.status === 'loading' && !app.data) return <FullPageSpinner />
  if (!app.data)
    return app.status === 'error' && app.error.code !== 'NOT_FOUND' ? (
      <ErrorState message={app.error.message} onRetry={app.refetch} className="py-24" />
    ) : (
      <EmptyState
        icon={FileX}
        title="Application not found"
        body="It may have been removed, or the link is wrong."
        action={<ButtonLink to="/admin/applications">Back to applications</ButtonLink>}
        className="py-24"
      />
    )
  return <ApplicationView app={app.data} onChanged={app.refetch} />
}

function ApplicationView({ app, onChanged }: { app: BusinessApplication; onChanged: () => void }) {
  const prefs = usePreferences()
  const confirm = useConfirm()
  const toast = useToast()
  const review = useServiceMutation((action: ReviewAction, reason?: string) => service.reviewApplication(app.id, action, reason))
  const business = useServiceQuery(() => (app.businessId ? service.getBusinessById(app.businessId) : Promise.resolve({ ok: true as const, data: null })), [app.businessId])
  // The owner invitation is the step after approval: it lives in the last card, so point to it at the top of the page.
  const members = useServiceQuery(() => (app.businessId ? service.getBusinessMembers(app.businessId) : Promise.resolve({ ok: true as const, data: [] })), [app.businessId])
  const needsOwner = app.status === 'approved' && !!business.data && members.status === 'success' && members.data.length === 0
  const ownerRef = useRef<HTMLDivElement | null>(null)
  // Set on approval; the owner card mounts once the new business has loaded and then scrolls into view.
  const revealOwner = useRef(false)
  const goToOwner = () => {
    const el = ownerRef.current
    if (!el) return
    el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' })
    ;(el.querySelector<HTMLElement>('input, button') ?? el).focus({ preventScroll: true })
  }
  const attachOwner = (el: HTMLDivElement | null) => {
    ownerRef.current = el
    if (el && revealOwner.current) {
      revealOwner.current = false
      requestAnimationFrame(goToOwner)
    }
  }
  const [rejectOpen, setRejectOpen] = useState(false)
  const can = useCan()
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  const actions = availableActions(app.status)

  const run = async (action: ReviewAction, why?: string) => {
    const res = await review.mutate(action, why)
    if (!res.ok) {
      if (action === 'reject' && res.error.fieldErrors?.reason) return setReasonError(res.error.fieldErrors.reason)
      return toast.error('The application was not updated', res.error.message)
    }
    setRejectOpen(false)
    onChanged()
    if (action === 'approve') {
      toast.success('Application approved', 'Next: invite the owner so they can set up the catalogue.')
      revealOwner.current = true
    } else toast.success(action === 'reject' ? 'Application rejected' : 'Marked as under review')
  }

  const approve = async () => {
    const ok = await confirm({
      title: `Approve ${app.businessName}?`,
      body: 'This creates the business as a draft. Its catalogue stays private until you activate it. Then invite the owner.',
      confirmLabel: 'Approve',
    })
    if (ok) await run('approve')
  }

  return (
    <>
      <PageHeader
        title={app.businessName}
        breadcrumbs={[{ label: 'Applications', to: '/admin/applications' }, { label: app.businessName }]}
        meta={
          <>
            <ApplicationStatusBadge status={app.status} />
            <span className="text-[length:var(--text-ui-small)] text-ink-muted tabular-nums">
              #{app.reference} · submitted {formatDateTime(app.createdAt, 'en', prefs)}
            </span>
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            {actions.includes('start_review') && can('applications.approve') && (
              <Button icon={<Eye className="size-4" aria-hidden />} loading={review.pending} onClick={() => void run('start_review')}>
                {app.status === 'rejected' ? 'Reopen review' : 'Start review'}
              </Button>
            )}
            {actions.includes('reject') && can('applications.reject') && (
              <Button variant="secondary" className="border-danger! text-danger! hover:bg-danger-soft!" icon={<X className="size-4" aria-hidden />} onClick={() => setRejectOpen(true)}>
                Reject
              </Button>
            )}
            {actions.includes('approve') && can('applications.approve') && (
              <Button variant="primary" icon={<Check className="size-4" aria-hidden />} loading={review.pending} onClick={() => void approve()}>
                Approve
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {needsOwner && (
            <InlineNotice tone="info">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  <strong className="font-medium">Next step: invite the owner.</strong> The business is created as a draft. The owner gets an email link to set a password and manage the catalogue.
                </span>
                <Button size="sm" icon={<ArrowDown className="size-4" aria-hidden />} onClick={goToOwner}>
                  Go to owner invitation
                </Button>
              </div>
            </InlineNotice>
          )}
          {app.status === 'rejected' && app.decisionReason && (
            <InlineNotice tone="warning">
              <strong className="font-medium">Rejected</strong>
              {app.reviewedAt ? ` on ${formatDateTime(app.reviewedAt, 'en', prefs)}` : ''}: {app.decisionReason}
            </InlineNotice>
          )}
          <Card>
            <PanelHeader title="Business" />
            <CardBody>
              <Answers
                rows={[
                  ['Business name', app.businessName],
                  ['Category', app.category],
                  ['Website', app.website ? <a key="w" className="text-accent-ink hover:underline" href={app.website} target="_blank" rel="noopener noreferrer">{app.website}</a> : undefined],
                  ['Location', `${app.city}, ${app.country}`],
                  ['About the business', app.answers.description],
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <PanelHeader title="Applicant" />
            <CardBody>
              <Answers
                rows={[
                  ['Name', app.applicantName],
                  ['Role', app.answers.applicantRole],
                  ['Email', <a key="e" className="text-accent-ink hover:underline" href={`mailto:${app.applicantEmail}`}>{app.applicantEmail}</a>],
                  ['Phone', app.applicantPhone],
                  ['Preferred language', app.language === 'pt' ? 'Português' : 'English'],
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <PanelHeader title="Catalogue readiness" />
            <CardBody>
              <Answers
                rows={[
                  ['Products to show', READINESS[app.answers.productCount ?? ''] ?? app.answers.productCount],
                  ['Product photos', READINESS[app.answers.photoReadiness ?? ''] ?? app.answers.photoReadiness],
                  ['3D models', READINESS[app.answers.modelReadiness ?? ''] ?? app.answers.modelReadiness],
                  ['Notes', app.answers.notes],
                ]}
              />
            </CardBody>
          </Card>
          {app.businessId && (
            <Card>
              <PanelHeader
                title="Business record"
                actions={
                  <ButtonLink to={businessAdminPath(app.businessId)} size="sm" icon={<Building2 className="size-4" aria-hidden />}>
                    Open business
                  </ButtonLink>
                }
              />
              <CardBody>
                {business.data ? (
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-[var(--radius-control)] bg-subtle px-4 py-3 text-ui-body">
                    <p className="flex flex-wrap items-center gap-2">
                      <Link to={businessAdminPath(business.data.id)} className="font-medium text-ink hover:underline">
                        {business.data.name}
                      </Link>
                      <BusinessStatusBadge status={business.data.status} />
                    </p>
                    <span className="text-ink-muted">
                      Catalogue address: <span className="text-ink">{business.data.slug}</span>
                    </span>
                  </div>
                ) : business.status === 'error' ? (
                  <ErrorState message={business.error.message} onRetry={business.refetch} />
                ) : (
                  <p className="text-ui-body text-ink-muted">Loading…</p>
                )}
              </CardBody>
            </Card>
          )}
          {business.data && (
            <div ref={attachOwner} tabIndex={-1} className="scroll-mt-24 outline-none">
              <BusinessOwnersPanel business={business.data} applicationId={app.id} defaultEmail={app.applicantEmail} defaultLanguage={app.language} />
            </div>
          )}
        </div>
        <div className="space-y-6">
          <AuditTimeline applicationId={app.id} businessId={app.businessId} />
          <EmailActivity applicationId={app.id} businessId={app.businessId} />
        </div>
      </div>

      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title={`Reject ${app.businessName}?`}
        description="The reason is kept with the application and shown in its history. No business is created."
        footer={
          <>
            <Button onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              loading={review.pending}
              onClick={() => {
                if (!reason.trim()) return setReasonError('Give a reason for the rejection.')
                void run('reject', reason.trim())
              }}
            >
              Reject application
            </Button>
          </>
        }
      >
        <FormField label="Reason" required error={reasonError ?? undefined}>
          <Textarea
            value={reason}
            maxLength={1000}
            onChange={(e) => {
              setReason(e.target.value)
              setReasonError(null)
            }}
          />
        </FormField>
      </Modal>
    </>
  )
}

function Answers({ rows }: { rows: [string, React.ReactNode | undefined][] }) {
  return (
    <dl className="divide-y divide-subtle">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-1 py-2.5 sm:grid-cols-[160px_1fr] sm:gap-4">
          <dt className="text-ui-body text-ink-muted">{label}</dt>
          <dd className="text-ui-body break-words whitespace-pre-line text-ink">{value || <span className="text-ink-muted italic">Not given</span>}</dd>
        </div>
      ))}
    </dl>
  )
}
