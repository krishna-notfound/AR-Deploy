import { useCan } from '@/auth/usePermission'
import { scrollBehavior } from '@/lib/motion'
import { ArrowDown, Building2, Check, Eye, FileX, RotateCcw, X } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { PageHeader, PanelHeader } from '@/components/layout/PageHeader'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { BusinessStatusBadge } from '@/components/ui/Badge'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { Checkbox, FormField, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { EmptyState, ErrorState, InlineNotice } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import type { BusinessApplication, ReviewAction, ReviewedApplication } from '@/domain/types'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { errorText, fieldText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { useFormat } from '@/lib/useFormat'
import { businessAdminPath } from '@/lib/urls'
import { service } from '@/services'
import { REASON_MAX_LENGTH, availableActions } from '@/services/applicationRules'
import { useServiceMutation, useServiceQuery } from '@/services/hooks'
import { AuditTimeline } from '../applications/AuditTimeline'
import { ExtraQuestionsCard } from '../applications/ExtraQuestionsCard'
import { EmailActivity } from '../applications/EmailActivity'
import { PossibleDuplicates } from '../applications/PossibleDuplicates'
import { ApplicationStatusBadge, joinPlace, knownEmailReason } from '../applications/labels'
import { BusinessOwnersPanel } from '../businesses/BusinessOwnersPanel'

const READINESS: Record<string, TranslationKey> = {
  '1-10': 'admin.applications.detail.ready.1-10',
  '11-50': 'admin.applications.detail.ready.11-50',
  '51-200': 'admin.applications.detail.ready.51-200',
  '200+': 'admin.applications.detail.ready.200+',
  all: 'admin.applications.detail.ready.all',
  some: 'admin.applications.detail.ready.some',
  none: 'admin.applications.detail.ready.none',
  glb_usdz: 'admin.applications.detail.ready.glb_usdz',
  need_help: 'admin.applications.detail.ready.need_help',
}

export default function ApplicationDetailPage() {
  const { t } = useI18n()
  const { applicationId = '' } = useParams()
  const app = useServiceQuery(() => service.getApplication(applicationId), [applicationId])

  if (app.status === 'loading' && !app.data) return <FullPageSpinner />
  if (!app.data)
    return app.status === 'error' && app.error.code !== 'NOT_FOUND' ? (
      <ErrorState message={errorText(app.error, t)} onRetry={app.refetch} className="py-24" />
    ) : (
      <EmptyState
        icon={FileX}
        title={t('admin.applications.detail.notFoundTitle')}
        body={t('admin.applications.detail.notFoundBody')}
        action={<ButtonLink to="/admin/applications">{t('admin.applications.detail.back')}</ButtonLink>}
        className="py-24"
      />
    )
  return <ApplicationView app={app.data} onChanged={app.refetch} />
}

function ApplicationView({ app, onChanged }: { app: BusinessApplication; onChanged: () => void }) {
  const { t, lang } = useI18n()
  const f = useFormat()
  const ready = (v?: string) => (v && Object.hasOwn(READINESS, v) ? t(READINESS[v]!) : v)
  const confirm = useConfirm()
  const toast = useToast()
  const review = useServiceMutation((action: ReviewAction, reason?: string, includeReason?: boolean) => service.reviewApplication(app.id, action, reason, { includeReason: includeReason === true }))
  const can = useCan()
  // R-W2-6: the business and its owner are shown only to a role that can open businesses (no "Business not found"),
  // and the owner invitation is pointed to only for a role that can send it.
  const canOpenBusiness = can('businesses.view')
  const canInviteOwner = canOpenBusiness && can('owners.manage')
  const canReadRecords = can('records.view')
  const businessId = canOpenBusiness ? app.businessId : undefined
  const business = useServiceQuery(() => (businessId ? service.getBusinessById(businessId) : Promise.resolve({ ok: true as const, data: null })), [businessId])
  // The owner invitation is the step after approval: it lives in the last card, so point to it at the top of the page.
  const members = useServiceQuery(() => (businessId ? service.getBusinessMembers(businessId) : Promise.resolve({ ok: true as const, data: [] })), [businessId])
  const needsOwner = canInviteOwner && app.status === 'approved' && !!business.data && members.status === 'success' && members.data.length === 0
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
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  // R-W2-1: off by default; the applicant then hears only that the application was not approved.
  const [includeReason, setIncludeReason] = useState(false)
  const includeHintId = useId()
  const actions = availableActions(app.status, { businessId: app.businessId ?? null })
  const canStartReview = actions.includes('start_review') && can('applications.approve')
  const canReject = actions.includes('reject') && can('applications.reject')
  const canReopen = actions.includes('reopen') && can('applications.approve')
  const canApprove = actions.includes('approve') && can('applications.approve')
  const showActions = canStartReview || canReject || canReopen || canApprove
  // R-W2-2: approved, but the business it created was deleted (L1 has no date).
  const businessDeleted = app.status === 'approved' && !app.businessId

  // The toast is worded from the decision email's status (§11.1); "accepted" means Resend took it, not that it arrived.
  // No email at all means nothing changed (the application was already rejected).
  const reportRejection = (r: ReviewedApplication) => {
    if (!r.decisionEmail) return toast.success(t('admin.applications.detail.rejected'))
    if (r.decisionEmail.status === 'accepted') return toast.success(t('admin.applications.detail.rejectedEmailed'))
    const why = (knownEmailReason(r.decisionEmail.error, lang) ?? t('admin.applications.detail.emailRefused')).replace(/\.$/, '')
    toast.error(t('admin.applications.detail.rejectedNoEmail', { why }))
  }

  const run = async (action: ReviewAction, why?: string) => {
    const res = await review.mutate(action, why, action === 'reject' && includeReason)
    if (!res.ok) {
      if (action === 'reject' && res.error.fieldErrors?.reason) return setReasonError(fieldText(res.error.fieldErrors.reason, t) ?? null)
      return toast.error(t('admin.applications.detail.notUpdated'), errorText(res.error, t))
    }
    setRejectOpen(false)
    onChanged()
    if (action === 'approve') {
      if (canInviteOwner) {
        toast.success(t('admin.applications.detail.approved'), t('admin.applications.detail.approvedNext'))
        revealOwner.current = true
      } else toast.success(t('admin.applications.detail.approvedNoInvite'))
    } else if (action === 'reject') reportRejection(res.data)
    else if (action === 'reopen') toast.success(t('admin.applications.detail.reopened'))
    else toast.success(t('admin.applications.detail.markedReview'))
  }

  const approve = async () => {
    const ok = await confirm({
      title: t('admin.applications.detail.approveTitle', { name: app.businessName }),
      body: t('admin.applications.detail.approveBody'),
      confirmLabel: t('admin.applications.detail.approve'),
    })
    if (ok) await run('approve')
  }

  return (
    <>
      <PageHeader
        title={app.businessName}
        breadcrumbs={[{ label: t('nav.applications'), to: '/admin/applications' }, { label: app.businessName }]}
        meta={
          <>
            <ApplicationStatusBadge status={app.status} />
            <span className="text-[length:var(--text-ui-small)] text-ink-muted tabular-nums">
              #{app.reference} · {t('admin.applications.detail.submittedAt', { date: f.dateTime(app.createdAt) })}
            </span>
          </>
        }
      />

      {/* R-W2-9: the possible duplicates come before the review actions, in reading order at every width. */}
      <div className="mb-6 space-y-4 empty:hidden">
        <PossibleDuplicates applicationId={app.id} />
        {showActions && (
          <div className="flex flex-wrap gap-2">
            {canStartReview && (
              <Button icon={<Eye className="size-4" aria-hidden />} loading={review.pending} onClick={() => void run('start_review')}>
                {t(app.status === 'rejected' ? 'admin.applications.detail.reopenReview' : 'admin.applications.detail.startReview')}
              </Button>
            )}
            {canReject && (
              <Button
                variant="secondary"
                className="border-danger! text-danger! hover:bg-danger-soft!"
                icon={<X className="size-4" aria-hidden />}
                onClick={() => {
                  setIncludeReason(false)
                  setRejectOpen(true)
                }}
              >
                {t('admin.applications.detail.reject')}
              </Button>
            )}
            {canReopen && (
              <Button icon={<RotateCcw className="size-4" aria-hidden />} loading={review.pending} onClick={() => void run('reopen')}>
                {t('admin.applications.detail.reopen')}
              </Button>
            )}
            {canApprove && (
              <Button variant="primary" icon={<Check className="size-4" aria-hidden />} loading={review.pending} onClick={() => void approve()}>
                {t('admin.applications.detail.approve')}
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {needsOwner && (
            <InlineNotice tone="info">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  <strong className="font-medium">{t('admin.applications.detail.nextStep')}</strong> {t('admin.applications.detail.nextStepBody')}
                </span>
                <Button size="sm" icon={<ArrowDown className="size-4" aria-hidden />} onClick={goToOwner}>
                  {t('admin.applications.detail.goToOwner')}
                </Button>
              </div>
            </InlineNotice>
          )}
          {app.status === 'rejected' && app.decisionReason && (
            <InlineNotice tone="warning">
              <strong className="font-medium">{t('admin.applications.status.rejected')}</strong>
              {app.reviewedAt ? ` ${t('admin.applications.detail.onDate', { date: f.dateTime(app.reviewedAt) })}` : ''}: {app.decisionReason}
            </InlineNotice>
          )}
          <Card>
            <PanelHeader title={t('admin.catalogs.business')} />
            <CardBody>
              <Answers
                rows={[
                  [t('admin.businesses.form.name'), app.businessName],
                  [t('admin.applications.detail.category'), app.category],
                  [t('admin.businesses.form.website'), app.website ? <a key="w" className="text-accent-ink hover:underline" href={app.website} target="_blank" rel="noopener noreferrer">{app.website}</a> : undefined],
                  [t('admin.applications.detail.location'), joinPlace(app.city, app.country)],
                  [t('admin.applications.detail.about'), app.answers.description],
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <PanelHeader title={t('admin.applications.applicant')} />
            <CardBody>
              <Answers
                rows={[
                  [t('common.name'), app.applicantName],
                  [t('admin.applications.detail.role'), app.answers.applicantRole],
                  [t('common.email'), <a key="e" className="text-accent-ink hover:underline" href={`mailto:${app.applicantEmail}`}>{app.applicantEmail}</a>],
                  [t('admin.businesses.form.phone'), app.applicantPhone],
                  [t('admin.applications.detail.language'), app.language === 'pt' ? 'Português' : 'English'],
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <PanelHeader title={t('admin.applications.detail.readiness')} />
            <CardBody>
              <Answers
                rows={[
                  [t('admin.applications.detail.productsToShow'), ready(app.answers.productCount)],
                  [t('admin.applications.detail.photos'), ready(app.answers.photoReadiness)],
                  [t('admin.applications.detail.models'), ready(app.answers.modelReadiness)],
                  [t('admin.applications.detail.notes'), app.answers.notes],
                ]}
              />
            </CardBody>
          </Card>
          <ExtraQuestionsCard custom={app.answers.custom} />
          {businessDeleted && (
            <Card>
              <PanelHeader title={t('admin.applications.detail.record')} />
              <CardBody>
                <p className="text-ui-body text-ink-muted">
                  {app.businessDeletedAt
                    ? t('admin.applications.detail.deletedOn', { date: f.date(app.businessDeletedAt) })
                    : t('admin.applications.detail.deleted')}
                </p>
              </CardBody>
            </Card>
          )}
          {app.businessId && !canOpenBusiness && (
            <Card>
              <PanelHeader title={t('admin.applications.detail.record')} />
              <CardBody>
                <p className="text-ui-body text-ink-muted">{t('admin.applications.detail.draftNoAccess')}</p>
              </CardBody>
            </Card>
          )}
          {businessId && (
            <Card>
              <PanelHeader
                title={t('admin.applications.detail.record')}
                actions={
                  <ButtonLink to={businessAdminPath(businessId)} size="sm" icon={<Building2 className="size-4" aria-hidden />}>
                    {t('admin.applications.detail.openBusiness')}
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
                      {t('admin.applications.detail.address')} <span className="text-ink">{business.data.slug}</span>
                    </span>
                  </div>
                ) : business.status === 'error' ? (
                  <ErrorState message={errorText(business.error, t)} onRetry={business.refetch} />
                ) : (
                  <p className="text-ui-body text-ink-muted">{t('common.loading')}</p>
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
          {/* R-W7-8: the business's own history and emails need records.view; without it, the application's only. */}
          <AuditTimeline applicationId={app.id} businessId={canReadRecords ? app.businessId : undefined} note={canReadRecords ? undefined : t('admin.applications.detail.eventsOnly')} />
          <EmailActivity applicationId={app.id} businessId={canReadRecords ? app.businessId : undefined} />
        </div>
      </div>

      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        title={t('admin.applications.detail.rejectTitle', { name: app.businessName })}
        description={t('admin.applications.detail.rejectBody')}
        footer={
          <>
            <Button onClick={() => setRejectOpen(false)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              loading={review.pending}
              onClick={() => {
                if (!reason.trim()) return setReasonError(t('common.error.reason.reason_required'))
                void run('reject', reason.trim())
              }}
            >
              {t('admin.applications.detail.rejectApplication')}
            </Button>
          </>
        }
      >
        <FormField label={t('admin.applications.detail.reason')} required error={reasonError ?? undefined}>
          <Textarea
            value={reason}
            maxLength={REASON_MAX_LENGTH}
            onChange={(e) => {
              setReason(e.target.value)
              setReasonError(null)
            }}
          />
        </FormField>
        <div className="mt-4 flex flex-col gap-1">
          <Checkbox label={t('admin.applications.detail.includeReason')} checked={includeReason} onChange={(e) => setIncludeReason(e.target.checked)} aria-describedby={includeHintId} />
          <p id={includeHintId} className="pl-6 text-ui-small text-ink-muted">
            {t('admin.applications.detail.includeHint')}
          </p>
        </div>
      </Modal>
    </>
  )
}

function Answers({ rows }: { rows: [string, React.ReactNode | undefined][] }) {
  const { t } = useI18n()
  return (
    <dl className="divide-y divide-subtle">
      {rows.map(([label, value]) => (
        <div key={label} className="grid gap-1 py-2.5 sm:grid-cols-[160px_1fr] sm:gap-4">
          <dt className="text-ui-body text-ink-muted">{label}</dt>
          <dd className="text-ui-body break-words whitespace-pre-line text-ink">{value || <span className="text-ink-muted italic">{t('admin.applications.detail.notGiven')}</span>}</dd>
        </div>
      ))}
    </dl>
  )
}
