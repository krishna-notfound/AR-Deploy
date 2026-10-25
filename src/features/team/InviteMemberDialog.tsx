// Invite a platform member (ADR-0030): email and role, then a review, then an honest result. The role's
// permissions are shown read-only (they are set per role on Role permissions). A failed email is never shown as sent.
import { ArrowLeft, ArrowRight, Check, Clock, Send } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/Button'
import { FormField, Input, Textarea } from '@/components/ui/Form'
import { Modal } from '@/components/ui/Modal'
import { InlineNotice } from '@/components/ui/States'
import type { InviteOutcome, MemberRole } from '@/domain/types'
import { cn } from '@/lib/cn'
import { formatDate, formatDateTime } from '@/lib/format'
import { usePreferences } from '@/lib/preferences'
import { isDemoMode, service } from '@/services'
import { useServiceMutation, useServiceQuery } from '@/services/hooks'
import { PERMISSION_GROUPS, ROLE_DESCRIPTION, ROLE_LABEL } from './permissions'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const NOTE_MAX = 500
const ORDER = PERMISSION_GROUPS.flatMap((g) => g.items)

type Step = { kind: 'form' } | { kind: 'review' } | { kind: 'done'; outcome: InviteOutcome }

export function InviteMemberDialog({ open, onClose, onInvited }: { open: boolean; onClose: () => void; onInvited?: (memberId: string) => void }) {
  const prefs = usePreferences()
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
    if (!EMAIL.test(clean)) return setError('Enter a valid email address.')
    setError(null)
    setStep({ kind: 'review' })
  }

  const send = async () => {
    const r = await invite.mutate()
    if (!r.ok) {
      setError(r.error.message)
      setStep({ kind: 'form' })
      return
    }
    setStep({ kind: 'done', outcome: r.data })
    onInvited?.(r.data.memberId)
  }

  const retry = async (memberId: string) => {
    const r = await resend.mutate(memberId)
    if (r.ok) setStep({ kind: 'done', outcome: r.data })
    else setError(r.error.message)
  }

  return (
    <Modal open={open} onClose={close} title="Invite member" description="They get an email with a link to create their account." size="lg">
      {step.kind === 'form' && (
        <form onSubmit={review} className="space-y-5" noValidate>
          <FormField label="Email address" required error={error ?? undefined}>
            <Input type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} />
          </FormField>

          <fieldset>
            <legend className="mb-2 text-ui-body font-medium text-ink">Role</legend>
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
                    <span className="block text-ui-body font-medium text-ink">{ROLE_LABEL[r]}</span>
                    <span className="mt-0.5 block text-ui-small text-ink-muted">{ROLE_DESCRIPTION[r]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <section aria-live="polite" className="rounded-[var(--radius-card)] border border-line bg-canvas p-4">
            <h3 className="text-ui-body font-semibold text-ink">What {ROLE_LABEL[role]} can do</h3>
            {perms.data ? (
              granted.length ? (
                <ul aria-label={`${ROLE_LABEL[role]} permissions`} className="mt-3 grid gap-x-6 gap-y-1.5 text-ui-body text-ink-body sm:grid-cols-2">
                  {granted.map((i) => (
                    <li key={i.key} className="flex items-start gap-2">
                      <Check className="mt-0.5 size-4 shrink-0 text-ink-muted" aria-hidden />
                      {i.label}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-ui-body text-ink-muted">Nothing yet. They could sign in but see no data.</p>
              )
            ) : (
              <p className="mt-2 text-ui-body text-ink-muted">Loading…</p>
            )}
            <p className="mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-line pt-3 text-ui-small text-ink-muted">
              <span>Permissions belong to the role.</span>
              <Link to="/admin/team/permissions" className="font-medium text-ink hover:underline" onClick={close}>
                Edit role permissions →
              </Link>
            </p>
          </section>

          <FormField label="Note" optional hint={`Added to the email. ${note.length}/${NOTE_MAX}`}>
            <Textarea rows={3} maxLength={NOTE_MAX} value={note} onChange={(e) => setNote(e.target.value)} />
          </FormField>

          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button onClick={close}>Cancel</Button>
            <Button type="submit" variant="primary">
              Review invitation <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
        </form>
      )}

      {step.kind === 'review' && (
        <div className="space-y-5">
          <h3 className="text-ui-card font-semibold text-ink">Check the invitation</h3>
          <dl className="grid gap-x-4 gap-y-3 border-t border-line pt-3 text-ui-body sm:grid-cols-[8rem_1fr]">
            <dt className="text-ink-muted">To</dt>
            <dd className="font-medium text-ink">{clean}</dd>
            <dt className="text-ink-muted">Role</dt>
            <dd className="text-ink">{ROLE_LABEL[role]}</dd>
            <dt className="text-ink-muted">Can</dt>
            <dd className="text-ink-body">{granted.map((i) => i.label).join(' · ') || 'Nothing yet'}</dd>
            {note.trim() && (
              <>
                <dt className="text-ink-muted">Note</dt>
                <dd className="whitespace-pre-line text-ink-body">{note.trim()}</dd>
              </>
            )}
          </dl>
          <p className="flex items-center gap-2 rounded-[var(--radius-card)] border border-line bg-canvas px-4 py-3 text-ui-body text-ink-muted">
            <Clock className="size-4 shrink-0" aria-hidden />
            The link works once and expires after 7 days.
          </p>
          <div className="flex justify-between gap-2 border-t border-line pt-4">
            <Button icon={<ArrowLeft className="size-4" aria-hidden />} onClick={() => setStep({ kind: 'form' })} disabled={invite.pending}>
              Back
            </Button>
            <Button variant="primary" icon={<Send className="size-4" aria-hidden />} loading={invite.pending} onClick={() => void send()}>
              Send invitation
            </Button>
          </div>
        </div>
      )}

      {step.kind === 'done' && (
        <div className="space-y-5">
          {step.outcome.status === 'sent' ? (
            <InlineNotice tone="info">
              <strong className="font-medium">Invitation sent to {clean}</strong> at {formatDateTime(step.outcome.sentAt, 'en', prefs)}. The link expires on{' '}
              {formatDate(step.outcome.expiresAt, 'en', prefs)}.{isDemoMode && ' Demo: no email is actually sent.'}
            </InlineNotice>
          ) : (
            <InlineNotice tone="warning">
              <strong className="font-medium">Invitation saved, but the email wasn't delivered.</strong> {step.outcome.error ?? ''} You can try again
              now or later from the Invitations tab.
            </InlineNotice>
          )}
          {error && <p className="text-ui-body text-danger">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2 border-t border-line pt-4">
            {step.outcome.status === 'email_failed' && (
              <Button loading={resend.pending} onClick={() => void retry(step.outcome.memberId)}>
                Try sending again
              </Button>
            )}
            <Button variant="primary" onClick={close}>
              Done
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
