import { useCan } from '@/auth/usePermission'
import { KeyRound, MailPlus, RefreshCw, Trash2, UserCheck, UserPlus } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button, IconButton } from '@/components/ui/Button'
import { PanelHeader } from '@/components/layout/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { FormField, Input, Select } from '@/components/ui/Form'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { ErrorState, InlineNotice } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import type { Business, ClosureRequest, ID, Lang } from '@/domain/types'
import { type DatePrefs, formatDate, formatDateTime } from '@/lib/format'
import { usePreferences } from '@/lib/preferences'
import { account, service } from '@/services'
import type { ProvisionOutcome, ServiceError } from '@/services/catalogService'
import { useServiceMutation, useServiceQuery } from '@/services/hooks'
import { emailReason } from '../applications/labels'
import { ActionCodeDialog } from '../settings/ActionCodeDialog'
import { useNoticeToast } from '../team/useMemberActions'
import { closureByBusiness } from './closure'

/**
 * The business's single owner (ADR-0024): invite, resend the invitation, or remove.
 * Authorization is enforced by the provision-owner Edge Function and the database, not by this panel.
 */
export function BusinessOwnersPanel({ business, applicationId, defaultEmail, defaultLanguage = 'en' }: { business: Business; applicationId?: ID; defaultEmail?: string; defaultLanguage?: Lang }) {
  const prefs = usePreferences()
  const members = useServiceQuery(() => service.getBusinessMembers(business.id), [business.id])
  const provision = useServiceMutation((email: string, language: Lang) => service.provisionOwner({ businessId: business.id, email, language, applicationId }))
  const resend = useServiceMutation((language: Lang) => service.resendOwnerInvitation(business.id, language))
  const removal = useServiceMutation((userId: ID) => service.removeBusinessMember(business.id, userId))
  // The newest invitation (R-W2-3, R-W2-4): from the reserved attempts, not the first invitation (invitedAt).
  const states = useServiceQuery(() => service.getOwnerStates(), [business.id])
  const lastInvitedAt = states.data?.find((s) => s.businessId === business.id)?.lastInvitedAt ?? null
  const can = useCan()
  const manage = can('owners.manage')
  const isPlatformOwner = can('owner')
  const [resetting, setResetting] = useState(false)
  const confirm = useConfirm()
  const toast = useToast()
  const noticeToast = useNoticeToast()
  const [email, setEmail] = useState(defaultEmail ?? '')
  const [language, setLanguage] = useState<Lang>(defaultLanguage)
  const [error, setError] = useState<string | null>(null)
  const owner = members.data?.[0]
  // R-W1-2: removing the owner cancels their open closure request; the dialog says so (businesses.view reads requests).
  const canViewClosures = can('businesses.view')
  const closures = useServiceQuery<ClosureRequest[] | null>(() => (canViewClosures ? account.listClosureRequests() : Promise.resolve({ ok: true as const, data: null })), [canViewClosures])
  const closure = closures.data ? closureByBusiness(closures.data).get(business.id) : undefined
  const ownerClosure = owner && closure?.userId === owner.userId ? closure : undefined
  // Owner support action (spec 8): only once the owner has an account of their own (invitation accepted).
  const canReset = isPlatformOwner && !!owner?.acceptedAt

  // The owner record exists either way; the toast says exactly what happened to the email.
  const report = (o: ProvisionOutcome, what: string) => {
    const reason = emailReason(o.email.error)
    if (o.email.status === 'accepted' || o.email.status === 'sent' || o.email.status === 'delivered')
      toast.success(what, 'Resend accepted the invitation email. Delivery is confirmed only when its status shows “Delivered”.')
    else toast.error(`${what}, but the invitation email was not sent`, reason ?? 'Use “Resend invitation” to try again.')
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const value = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return setError('Enter a valid email address.')
    const ok = await confirm({
      title: `Invite ${value} as the owner?`,
      body: `They become the only owner of ${business.name} and receive a link to set their password.`,
      confirmLabel: 'Invite owner',
    })
    if (!ok) return
    const res = await provision.mutate(value, language)
    if (!res.ok) return setError(invitationError(res.error, prefs))
    setError(null)
    members.refetch()
    report(res.data, 'Owner provisioned')
  }

  const doResend = async () => {
    if (!owner) return
    const ok = await confirm({ title: `Send a new invitation to ${owner.email}?`, body: 'Earlier invitation links stop working once a new one is used.', confirmLabel: 'Resend invitation' })
    if (!ok) return
    const res = await resend.mutate(language)
    if (!res.ok) return toast.error('Invitation not resent', invitationError(res.error, prefs))
    report(res.data, 'New invitation created')
  }

  const remove = async () => {
    if (!owner) return
    const ok = await confirm({
      title: `Remove ${owner.email}?`,
      body: [
        `They will no longer be able to manage ${business.name}. Their account is not deleted. You can then invite another owner.`,
        ownerClosure &&
          `This owner asked to close their account on ${formatDate(ownerClosure.requestedAt, 'en', prefs)}. Removing them cancels that request. The catalog stays ${business.status}.`,
      ]
        .filter(Boolean)
        .join(' '),
      confirmLabel: 'Remove owner',
      destructive: true,
    })
    if (!ok || removal.pending) return
    const res = await removal.mutate(owner.userId)
    if (res.ok) {
      toast.success('Owner removed')
      members.refetch()
    } else toast.error('Could not remove owner', res.error.message)
  }

  return (
    <Card>
      <PanelHeader title="Owner" description="Each business has exactly one owner, invited by a platform admin." />
      <CardBody className="space-y-5">
        {members.status === 'loading' && !members.data ? (
          <SkeletonRows rows={2} />
        ) : members.status === 'error' && !members.data ? (
          <ErrorState message={members.error.message} onRetry={members.refetch} />
        ) : owner ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 border-y border-line py-3">
              <div className="min-w-0">
                <p className="truncate text-ui-body font-medium text-ink">{owner.email}</p>
                <p className="mt-0.5 text-ui-small text-ink-muted tabular-nums">
                  {owner.acceptedAt
                    ? `Active since ${formatDate(owner.acceptedAt, 'en', prefs)}`
                    : lastInvitedAt
                      ? `Last invitation sent ${formatDate(lastInvitedAt, 'en', prefs)} · has not set a password yet`
                      : owner.invitedAt
                        ? 'Has not set a password yet'
                        : `Added ${formatDate(owner.addedAt, 'en', prefs)}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {owner.acceptedAt ? (
                  <Badge tone="success">
                    <UserCheck className="size-3" aria-hidden /> Owner active
                  </Badge>
                ) : (
                  <Badge tone="warning">Invitation pending</Badge>
                )}
                {canReset && (
                  <IconButton aria-label={`Reset 2FA for ${owner.email}`} title="Reset 2FA" onClick={() => setResetting(true)}>
                    <KeyRound className="size-4" aria-hidden />
                  </IconButton>
                )}
                {manage && (
                  <IconButton aria-label={`Remove ${owner.email}`} disabled={removal.pending} onClick={() => void remove()}>
                    <Trash2 className="size-4" aria-hidden />
                  </IconButton>
                )}
              </div>
            </div>
            {!owner.acceptedAt && manage && (
              <div className="flex flex-wrap items-end gap-3">
                <FormField label="Email language">
                  <Select value={language} onChange={(e) => setLanguage(e.target.value as Lang)}>
                    <option value="en">English</option>
                    <option value="pt">Português</option>
                  </Select>
                </FormField>
                <Button loading={resend.pending} icon={<RefreshCw className="size-4" aria-hidden />} onClick={() => void doResend()}>
                  Resend invitation
                </Button>
              </div>
            )}
          </div>
        ) : !manage ? (
          <InlineNotice tone="neutral">No owner yet.</InlineNotice>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <InlineNotice tone="neutral">No owner yet. Invite the person who will manage this catalogue.</InlineNotice>
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <FormField label="Owner email" error={error ?? undefined} required>
                <Input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
              </FormField>
              <FormField label="Email language">
                <Select value={language} onChange={(e) => setLanguage(e.target.value as Lang)}>
                  <option value="en">English</option>
                  <option value="pt">Português</option>
                </Select>
              </FormField>
            </div>
            <Button type="submit" variant="primary" loading={provision.pending} icon={<UserPlus className="size-4" aria-hidden />} disabled={!email.trim()}>
              Invite owner
            </Button>
            <p className="flex items-start gap-1.5 border-t border-line pt-4 text-ui-small text-ink-muted">
              <MailPlus className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              The invitation link is created by Supabase Auth and sent by email; it is never shown here.
            </p>
          </form>
        )}
      </CardBody>
      {owner && canReset && (
        <ActionCodeDialog
          open={resetting}
          purpose="owner_reset_2fa"
          title={`Reset 2FA for ${owner.email}?`}
          description="This removes their authenticator and recovery codes. They sign in with their password and set up 2FA again. We email them to say it was reset."
          confirmLabel="Reset 2FA"
          destructive
          onClose={() => setResetting(false)}
          onConfirm={async (code) => {
            const r = await account.ownerReset2fa(owner.userId, code)
            if (r.ok) noticeToast('Their 2FA was reset', r.data.notice)
            return r
          }}
        />
      )}
    </Card>
  )
}

/** The refusal in words; the 24-hour limit says when the next invitation can go out, in the person's date format. */
function invitationError(e: ServiceError, prefs: DatePrefs | undefined): string {
  if (e.reason === 'too_many_invitations' && e.retryAt)
    return `Ten invitations were sent to this owner in the last 24 hours. You can send the next one after ${formatDateTime(e.retryAt, 'en', prefs)}.`
  return e.message
}
