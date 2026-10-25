import { MailPlus, RefreshCw, Trash2, UserCheck, UserPlus } from 'lucide-react'
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
import type { Business, ID, Lang } from '@/domain/types'
import { formatDate } from '@/lib/format'
import { service } from '@/services'
import type { ProvisionOutcome } from '@/services/catalogService'
import { useServiceMutation, useServiceQuery } from '@/services/hooks'
import { emailReason } from '../applications/labels'

/**
 * The business's single owner (ADR-0024): invite, resend the invitation, or remove.
 * Authorization is enforced by the provision-owner Edge Function and the database, not by this panel.
 */
export function BusinessOwnersPanel({ business, applicationId, defaultEmail, defaultLanguage = 'en' }: { business: Business; applicationId?: ID; defaultEmail?: string; defaultLanguage?: Lang }) {
  const members = useServiceQuery(() => service.getBusinessMembers(business.id), [business.id])
  const provision = useServiceMutation((email: string, language: Lang) => service.provisionOwner({ businessId: business.id, email, language, applicationId }))
  const resend = useServiceMutation((language: Lang) => service.resendOwnerInvitation(business.id, language))
  const removal = useServiceMutation((userId: ID) => service.removeBusinessMember(business.id, userId))
  const confirm = useConfirm()
  const toast = useToast()
  const [email, setEmail] = useState(defaultEmail ?? '')
  const [language, setLanguage] = useState<Lang>(defaultLanguage)
  const [error, setError] = useState<string | null>(null)
  const owner = members.data?.[0]

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
    if (!res.ok) return setError(res.error.message)
    setError(null)
    members.refetch()
    report(res.data, 'Owner provisioned')
  }

  const doResend = async () => {
    if (!owner) return
    const ok = await confirm({ title: `Send a new invitation to ${owner.email}?`, body: 'Earlier invitation links stop working once a new one is used.', confirmLabel: 'Resend invitation' })
    if (!ok) return
    const res = await resend.mutate(language)
    if (!res.ok) return toast.error('Invitation not resent', res.error.message)
    report(res.data, 'New invitation created')
  }

  const remove = async () => {
    if (!owner) return
    const ok = await confirm({
      title: `Remove ${owner.email}?`,
      body: `They will no longer be able to manage ${business.name}. Their account is not deleted. You can then invite another owner.`,
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
                <p className="truncate text-sm font-medium text-ink">{owner.email}</p>
                <p className="mt-0.5 text-xs text-ink-muted">
                  {owner.acceptedAt
                    ? `Active since ${formatDate(owner.acceptedAt)}`
                    : owner.invitedAt
                      ? `Invited ${formatDate(owner.invitedAt)} · has not set a password yet`
                      : `Added ${formatDate(owner.addedAt)}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {owner.acceptedAt ? (
                  <Badge tone="success">
                    <UserCheck className="size-3" aria-hidden /> Active
                  </Badge>
                ) : (
                  <Badge tone="warning">Invitation pending</Badge>
                )}
                <IconButton aria-label={`Remove ${owner.email}`} disabled={removal.pending} onClick={() => void remove()}>
                  <Trash2 className="size-4" aria-hidden />
                </IconButton>
              </div>
            </div>
            {!owner.acceptedAt && (
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
            <p className="flex items-start gap-1.5 text-xs text-ink-muted">
              <MailPlus className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              The invitation link is created by Supabase Auth and sent by email; it is never shown here.
            </p>
          </form>
        )}
      </CardBody>
    </Card>
  )
}
