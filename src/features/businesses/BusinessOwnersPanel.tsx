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
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import type { Vars } from '@/i18n/translate'
import { useFormat } from '@/lib/useFormat'
import { account, service } from '@/services'
import type { ProvisionOutcome, ServiceError } from '@/services/catalogService'
import { useServiceMutation, useServiceQuery } from '@/services/hooks'
import { knownEmailReason } from '../applications/labels'
import { ActionCodeDialog } from '../settings/ActionCodeDialog'
import { useNoticeToast } from '../team/useMemberActions'
import { closureByBusiness } from './closure'

/**
 * The business's single owner (ADR-0024): invite, resend the invitation, or remove.
 * Authorization is enforced by the provision-owner Edge Function and the database, not by this panel.
 */
export function BusinessOwnersPanel({ business, applicationId, defaultEmail, defaultLanguage = 'en' }: { business: Business; applicationId?: ID; defaultEmail?: string; defaultLanguage?: Lang }) {
  const { t } = useI18n()
  const f = useFormat()
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
    const reason = knownEmailReason(o.email.error)
    if (o.email.status === 'accepted' || o.email.status === 'sent' || o.email.status === 'delivered')
      toast.success(what, t('admin.businesses.owner.emailAccepted'))
    else toast.error(t('admin.businesses.owner.emailNotSent', { what }), reason ?? t('admin.businesses.owner.emailRefused'))
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const value = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return setError(t('common.error.reason.invalid_email'))
    const ok = await confirm({
      title: t('admin.businesses.owner.inviteTitle', { email: value }),
      body: t('admin.businesses.owner.inviteBody', { name: business.name }),
      confirmLabel: t('admin.businesses.owner.invite'),
    })
    if (!ok) return
    const res = await provision.mutate(value, language)
    if (!res.ok) return setError(invitationError(res.error, t, f.dateTime))
    setError(null)
    members.refetch()
    report(res.data, t('admin.businesses.owner.provisioned'))
  }

  const doResend = async () => {
    if (!owner) return
    const ok = await confirm({ title: t('admin.businesses.owner.resendTitle', { email: owner.email }), body: t('admin.businesses.owner.resendBody'), confirmLabel: t('admin.businesses.owner.resend') })
    if (!ok) return
    const res = await resend.mutate(language)
    if (!res.ok) return toast.error(t('admin.businesses.owner.notResent'), invitationError(res.error, t, f.dateTime))
    report(res.data, t('admin.businesses.owner.newInvitation'))
  }

  const remove = async () => {
    if (!owner) return
    const ok = await confirm({
      title: t('admin.businesses.owner.removeTitle', { email: owner.email }),
      body: [
        t('admin.businesses.owner.removeBody', { name: business.name }),
        ownerClosure &&
          t('admin.businesses.owner.removeClosure', { date: f.date(ownerClosure.requestedAt), status: t(`admin.businesses.status.${business.status}`).toLowerCase() }),
      ]
        .filter(Boolean)
        .join(' '),
      confirmLabel: t('admin.businesses.owner.remove'),
      destructive: true,
    })
    if (!ok || removal.pending) return
    const res = await removal.mutate(owner.userId)
    if (res.ok) {
      toast.success(t('admin.businesses.owner.removed'))
      members.refetch()
    } else toast.error(t('admin.businesses.owner.removeFailed'), errorText(res.error, t))
  }

  return (
    <Card>
      <PanelHeader title={t('admin.businesses.owner.title')} description={t('admin.businesses.owner.description')} />
      <CardBody className="space-y-5">
        {members.status === 'loading' && !members.data ? (
          <SkeletonRows rows={2} />
        ) : members.status === 'error' && !members.data ? (
          <ErrorState message={errorText(members.error, t)} onRetry={members.refetch} />
        ) : owner ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3 border-y border-line py-3">
              <div className="min-w-0">
                <p className="truncate text-ui-body font-medium text-ink">{owner.email}</p>
                <p className="mt-0.5 text-ui-small text-ink-muted tabular-nums">
                  {owner.acceptedAt
                    ? t('admin.businesses.owner.activeSince', { date: f.date(owner.acceptedAt) })
                    : lastInvitedAt
                      ? t('admin.businesses.owner.lastInvitation', { date: f.date(lastInvitedAt) })
                      : owner.invitedAt
                        ? t('admin.businesses.owner.noPassword')
                        : t('admin.businesses.owner.added', { date: f.date(owner.addedAt) })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {owner.acceptedAt ? (
                  <Badge tone="success">
                    <UserCheck className="size-3" aria-hidden /> {t('admin.businesses.owner.active')}
                  </Badge>
                ) : (
                  <Badge tone="warning">{t('admin.businesses.owner.pending')}</Badge>
                )}
                {canReset && (
                  <IconButton aria-label={t('admin.businesses.owner.reset2faTitle', { email: owner.email })} title={t('admin.businesses.owner.reset2fa')} onClick={() => setResetting(true)}>
                    <KeyRound className="size-4" aria-hidden />
                  </IconButton>
                )}
                {manage && (
                  <IconButton aria-label={t('admin.businesses.owner.removeAria', { email: owner.email })} disabled={removal.pending} onClick={() => void remove()}>
                    <Trash2 className="size-4" aria-hidden />
                  </IconButton>
                )}
              </div>
            </div>
            {!owner.acceptedAt && manage && (
              <div className="flex flex-wrap items-end gap-3">
                <FormField label={t('admin.businesses.owner.emailLanguage')}>
                  <Select value={language} onChange={(e) => setLanguage(e.target.value as Lang)}>
                    <option value="en">English</option>
                    <option value="pt">Português</option>
                  </Select>
                </FormField>
                <Button loading={resend.pending} icon={<RefreshCw className="size-4" aria-hidden />} onClick={() => void doResend()}>
                  {t('admin.businesses.owner.resend')}
                </Button>
              </div>
            )}
          </div>
        ) : !manage ? (
          <InlineNotice tone="neutral">{t('admin.businesses.owner.none')}</InlineNotice>
        ) : (
          <form onSubmit={submit} className="space-y-4" noValidate>
            <InlineNotice tone="neutral">{t('admin.businesses.owner.noneInvite')}</InlineNotice>
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <FormField label={t('admin.businesses.owner.email')} error={error ?? undefined} required>
                <Input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
              </FormField>
              <FormField label={t('admin.businesses.owner.emailLanguage')}>
                <Select value={language} onChange={(e) => setLanguage(e.target.value as Lang)}>
                  <option value="en">English</option>
                  <option value="pt">Português</option>
                </Select>
              </FormField>
            </div>
            <Button type="submit" variant="primary" loading={provision.pending} icon={<UserPlus className="size-4" aria-hidden />} disabled={!email.trim()}>
              {t('admin.businesses.owner.invite')}
            </Button>
            <p className="flex items-start gap-1.5 border-t border-line pt-4 text-ui-small text-ink-muted">
              <MailPlus className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {t('admin.businesses.owner.linkNote')}
            </p>
          </form>
        )}
      </CardBody>
      {owner && canReset && (
        <ActionCodeDialog
          open={resetting}
          purpose="owner_reset_2fa"
          title={t('admin.businesses.owner.reset2faQuestion', { email: owner.email })}
          description={t('admin.businesses.owner.reset2faBody')}
          confirmLabel={t('admin.businesses.owner.reset2fa')}
          destructive
          onClose={() => setResetting(false)}
          onConfirm={async (code) => {
            const r = await account.ownerReset2fa(owner.userId, code)
            if (r.ok) noticeToast(t('admin.businesses.owner.reset2faDone'), r.data.notice)
            return r
          }}
        />
      )}
    </Card>
  )
}

/** The refusal in words; the 24-hour limit says when the next invitation can go out, in the person's date format. */
function invitationError(e: ServiceError, t: (key: TranslationKey, vars?: Vars) => string, dateTime: (iso: string) => string): string {
  if (e.reason === 'too_many_invitations' && e.retryAt) return t('admin.businesses.owner.tooMany', { date: dateTime(e.retryAt) })
  return errorText(e, t)
}
