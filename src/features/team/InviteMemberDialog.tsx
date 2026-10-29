// Invite a platform member (ADR-0030): email and role, then a review, then an honest result. The role's
// permissions are shown read-only (they are set per role on Role permissions). A failed email is never shown as sent.
import { ArrowLeft, ArrowRight, Check, Clock, Send } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import { FormField, Input, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { InlineNotice } from '@/components/ui/States'
import type { InviteOutcome, MemberRole, PlatformMember } from '@/domain/types'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { useFormat } from '@/lib/useFormat'
import { isDemoMode, service } from '@/services'
import { useServiceMutation, useServiceQuery } from '@/services/hooks'
import { PERMISSION_GROUPS } from './permissions'
import { ROLE_DESC_KEY, emailReasonKey, useTeamText } from './teamLabels'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const NOTE_MAX = 500
const ORDER = PERMISSION_GROUPS.flatMap((g) => g.items)

type Step = { kind: 'form' } | { kind: 'review' } | { kind: 'done'; outcome: InviteOutcome }

/** R-W6-9: what to do when the email is already on the team, by that member's status in the loaded list. */
const ALREADY_MEMBER: Partial<Record<PlatformMember['status'], 'team.invite.already.invited' | 'team.invite.already.deactivated'>> = {
  invited: 'team.invite.already.invited',
  deactivated: 'team.invite.already.deactivated',
}

export function InviteMemberDialog({
  open,
  onClose,
  onInvited,
  members = [],
}: {
  open: boolean
  onClose: () => void
  onInvited?: (memberId: string) => void
  /** The team list already loaded on the page, to explain an already_member refusal. */
  members?: PlatformMember[]
}) {
  const { t } = useI18n()
  const fmt = useFormat()
  const words = useTeamText()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<MemberRole>('team')
  const [note, setNote] = useState('')
  const [step, setStep] = useState<Step>({ kind: 'form' })
  const [error, setError] = useState<string | null>(null)
  const perms = useServiceQuery(() => service.getRolePermissions(), [open])
  const invite = useServiceMutation(() => service.inviteMember({ email: email.trim().toLowerCase(), role, ...(note.trim() ? { note: note.trim() } : {}) }))
  const resend = useServiceMutation((id: string) => service.resendMemberInvite(id))

  const granted = ORDER.filter((i) => perms.data?.[role].includes(i.key))
  const clean = email.trim().toLowerCase()

  const close = () => {
    onClose()
    setEmail('')
    setNote('')
    setRole('team')
    setError(null)
    setStep({ kind: 'form' })
  }

  const review = (e: FormEvent) => {
    e.preventDefault()
    if (!EMAIL.test(clean)) return setError(t('common.validation.emailInvalid'))
    setError(null)
    setStep({ kind: 'review' })
  }

  const send = async () => {
    const r = await invite.mutate()
    if (!r.ok) {
      const existing = r.error.reason === 'already_member' ? members.find((m) => m.email.toLowerCase() === clean) : undefined
      const known = existing && ALREADY_MEMBER[existing.status]
      setError(known ? t(known) : errorText(r.error, t))
      setStep({ kind: 'form' })
      return
    }
    setStep({ kind: 'done', outcome: r.data })
    onInvited?.(r.data.memberId)
  }

  const retry = async (memberId: string) => {
    const r = await resend.mutate(memberId)
    if (r.ok) setStep({ kind: 'done', outcome: r.data })
    else setError(errorText(r.error, t))
  }

  const reasonKey = step.kind === 'done' && step.outcome.status === 'email_failed' ? emailReasonKey(step.outcome.error) : undefined

  return (
    <Modal open={open} onClose={close} title={t('team.page.invite')} description={t('team.invite.description')} size="lg">
      {step.kind === 'form' && (
        <form onSubmit={review} className="space-y-5" noValidate>
          <FormField label={t('team.invite.email')} required error={error ?? undefined}>
            <Input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormField>

          <fieldset>
            <legend className="mb-2 text-ui-body font-medium text-ink">{t('team.col.role')}</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {(['admin', 'team'] as const).map((r) => (
                <label
                  key={r}
                  className={cn(
                    'flex cursor-pointer gap-3 rounded-[var(--radius-card)] border p-4 transition-colors',
                    role === r ? 'border-ink bg-surface outline outline-1 outline-ink' : 'border-line hover:border-line-strong',
                  )}
                >
                  <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="mt-1 self-start accent-[var(--color-ink)]" />
                  <span>
                    <span className="block text-ui-body font-medium text-ink">{words.role(r)}</span>
                    <span className="mt-0.5 block text-ui-small text-ink-muted">{t(ROLE_DESC_KEY[r])}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <section aria-live="polite" className="rounded-[var(--radius-card)] border border-line bg-canvas p-4">
            <h3 className="text-ui-body font-semibold text-ink">{t('team.whatCanDo', { role: words.role(role) })}</h3>
            {perms.data ? (
              granted.length ? (
                <ul aria-label={t('team.permissionsOf', { role: words.role(role) })} className="mt-3 grid gap-x-6 gap-y-1.5 text-ui-body text-ink-body sm:grid-cols-2">
                  {granted.map((i) => (
                    <li key={i.key} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden />
                      {words.perm(i.key, i.label)}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-ui-body text-ink-muted">{t('team.invite.nothingYet')}</p>
              )
            ) : (
              <p className="mt-2 text-ui-body text-ink-muted">{t('common.loading')}</p>
            )}
            <p className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line pt-3 text-ui-small text-ink-muted">
              <span>{t('team.invite.belongToRole')}</span>
              <Link to="/admin/team/permissions" className="font-medium text-ink hover:underline" onClick={close}>
                {t('team.invite.editPerms')}
              </Link>
            </p>
          </section>

          <FormField label={t('team.invite.note')} optional hint={t('team.invite.noteHint', { n: note.length, max: NOTE_MAX })}>
            <Textarea rows={3} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
          </FormField>

          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button onClick={close}>{t('common.cancel')}</Button>
            <Button type="submit" variant="primary">
              {t('team.invite.review')} <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
        </form>
      )}

      {step.kind === 'review' && (
        <div className="space-y-5">
          <h3 className="text-ui-card font-semibold text-ink">{t('team.invite.check')}</h3>
          <dl className="grid gap-x-4 gap-y-3 border-t border-line pt-3 text-ui-body sm:grid-cols-[8rem_1fr]">
            <dt className="text-ink-muted">{t('team.invite.to')}</dt>
            <dd className="font-medium text-ink">{clean}</dd>
            <dt className="text-ink-muted">{t('team.col.role')}</dt>
            <dd className="text-ink">{words.role(role)}</dd>
            <dt className="text-ink-muted">{t('team.invite.can')}</dt>
            <dd className="text-ink-body">{granted.map((i) => words.perm(i.key, i.label)).join(' · ') || t('team.nothingYet')}</dd>
            {note.trim() && (
              <>
                <dt className="text-ink-muted">{t('team.invite.note')}</dt>
                <dd className="whitespace-pre-line text-ink-body">{note.trim()}</dd>
              </>
            )}
          </dl>
          <p className="flex items-center gap-2 rounded-[var(--radius-card)] border border-line bg-canvas px-4 py-3 text-ui-body text-ink-muted">
            <Clock className="size-4 shrink-0" aria-hidden />
            {t('team.invite.linkOnce')}
          </p>
          <div className="flex justify-between gap-2 border-t border-line pt-4">
            <Button icon={<ArrowLeft className="size-4" aria-hidden />} onClick={() => setStep({ kind: 'form' })} disabled={invite.pending}>
              {t('common.back')}
            </Button>
            <Button variant="primary" icon={<Send className="size-4" aria-hidden />} loading={invite.pending} onClick={() => void send()}>
              {t('team.invite.send')}
            </Button>
          </div>
        </div>
      )}

      {step.kind === 'done' && (
        <div className="space-y-5">
          {step.outcome.status === 'sent' ? (
            <InlineNotice tone="info">
              <strong className="font-medium">{t('team.invite.sentTo', { email: clean })}</strong> {t('team.invite.sentAt', { time: fmt.dateTime(step.outcome.sentAt), date: fmt.date(step.outcome.expiresAt) })}
              {isDemoMode && ` ${t('team.invite.demoNoEmail')}`}
            </InlineNotice>
          ) : (
            <InlineNotice tone="warning">
              <strong className="font-medium">{t('team.invite.savedNotDelivered')}</strong> {reasonKey ? t(reasonKey) : ''} {t('team.invite.tryAgain')}
            </InlineNotice>
          )}
          {error && <p className="text-ui-body text-danger">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
            {step.outcome.status === 'email_failed' && (
              <Button loading={resend.pending} onClick={() => void retry(step.outcome.memberId)}>
                {t('team.invite.retry')}
              </Button>
            )}
            <Button variant="primary" onClick={close}>
              {t('team.invite.done')}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
