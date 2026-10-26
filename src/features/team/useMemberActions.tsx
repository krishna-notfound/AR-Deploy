// Member actions shared by the team list, the invitation panel and the member page (ADR-0029): each one confirms
// what will happen, calls the service, and says what actually happened (an email failure is never shown as sent).
import { useCallback } from 'react'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { useToast } from '@/components/ui/ToastProvider'
import type { InviteOutcome, MemberRole, PlatformMember } from '@/domain/types'
import { knownEmailReason } from '@/features/applications/labels'
import { formatDate } from '@/lib/format'
import { usePreferences } from '@/lib/preferences'
import { type NoticeOutcome, service } from '@/services'
import type { Result } from '@/services/catalogService'
import { PERMISSION_LABEL, ROLE_LABEL } from './permissions'

/**
 * R-W7-6: the toast after an Owner action that emails the account holder (reset 2FA, restore or complete a closure).
 * "{done}. They were emailed." only when the email was accepted; otherwise
 * "{done}, but the notice email was not sent: {reason}." The action itself already happened either way.
 */

export function useNoticeToast() {
  const toast = useToast()
  return useCallback(
    (done: string, notice: NoticeOutcome, body?: string) => {
      if (notice.status === 'accepted') {
        toast.success(`${done}. They were emailed.`, body)
        return
      }
      // Only a fixed reason is shown; any other text (a provider's own words) falls back to the generic sentence.
      const known = knownEmailReason(notice.error)
      const why = (known ?? 'the email service did not take it').replace(/\.$/, '')
      toast.error(`${done}, but the notice email was not sent: ${why}.`, body)
    },
    [toast],
  )
}

export function useMemberActions() {
  const confirm = useConfirm()
  const toast = useToast()
  const prefs = usePreferences()

  const report = useCallback(
    <T,>(r: Result<T>, success: string, body?: string): boolean => {
      if (r.ok) toast.success(success, body)
      else toast.error('Not changed', r.error.message)
      return r.ok
    },
    [toast],
  )

  const reportInvite = useCallback(
    (r: Result<InviteOutcome>, email: string): boolean => {
      if (!r.ok) {
        toast.error('Invitation not sent', r.error.message)
        return false
      }
      if (r.data.status === 'email_failed') {
        toast.error('Invitation saved, but the email was not delivered', knownEmailReason(r.data.error) ?? 'The email service did not take it. Try resending it.')
        return true
      }
      toast.success(`Invitation sent to ${email}`, `The link works once and expires on ${formatDate(r.data.expiresAt, 'en', prefs)}.`)
      return true
    },
    [toast, prefs],
  )

  const resend = useCallback(
    async (m: PlatformMember) => {
      const yes = await confirm({
        title: `Send a new invitation to ${m.email}?`,
        body: 'The earlier link stops working. The new one works once and expires in 7 days.',
        confirmLabel: 'Resend invitation',
      })
      if (!yes) return false
      return reportInvite(await service.resendMemberInvite(m.id), m.email)
    },
    [confirm, reportInvite],
  )

  const revoke = useCallback(
    async (m: PlatformMember) => {
      const yes = await confirm({
        title: `Revoke the invitation for ${m.email}?`,
        body: 'The link stops working straight away. You can invite them again later.',
        confirmLabel: 'Revoke invitation',
        destructive: true,
      })
      if (!yes) return false
      return report(await service.revokeMemberInvite(m.id), 'Invitation revoked. Use Resend to send them a new link.')
    },
    [confirm, report],
  )

  const deactivate = useCallback(
    async (m: PlatformMember) => {
      const who = m.fullName ?? m.email
      const yes = await confirm({
        title: `Deactivate ${who}?`,
        body: `${who} loses access immediately and is signed out on every device. You can reactivate them later.`,
        confirmLabel: 'Deactivate',
        destructive: true,
      })
      if (!yes) return false
      const r = await service.deactivateMember(m.id)
      if (r.ok && r.data.signOut === 'failed') {
        // Honest: access is already refused by the database, but their open sessions could not be ended.
        toast.error(`${who} deactivated, but not signed out`, 'They can no longer see or change anything; their open sessions end when they expire.')
        return true
      }
      return report(r, `${who} deactivated`, 'Access was removed and they were signed out on every device.')
    },
    [confirm, report],
  )

  const reactivate = useCallback(
    async (m: PlatformMember) => {
      const who = m.fullName ?? m.email
      const yes = await confirm({
        title: `Reactivate ${who}?`,
        body: m.userId
          ? `${who} gets the ${ROLE_LABEL[m.role]} permissions back and can sign in again.`
          : `${who} never accepted. They go back to "invited" and need a new invitation.`,
        confirmLabel: 'Reactivate',
      })
      if (!yes) return false
      return report(await service.reactivateMember(m.id), `${who} reactivated`)
    },
    [confirm, report],
  )

  // S1.5 R-W6-1: deactivated members only; the copy is spec §11.1.
  const remove = useCallback(
    async (m: PlatformMember) => {
      const yes = await confirm({
        title: `Remove ${m.email} from the team?`,
        body: `Their access record is deleted. Their login is deleted too unless it still owns a business. Past actions stay in the audit log as 'Deleted user (${ROLE_LABEL[m.role]})'. They can be invited again later.`,
        confirmLabel: 'Remove member',
        destructive: true,
      })
      if (!yes) return false
      // The toast says what happened to the login (manage-member keeps one that still owns a business, or that it could not delete).
      const r = await service.removeMember(m.id)
      const login = !m.userId
        ? 'They never signed in, so there was no login to delete.'
        : r.ok && r.data.loginDeleted
          ? 'Their login was deleted too.'
          : 'Their login was kept: it still owns a business, or it could not be deleted.'
      return report(r, `${m.email} was removed.`, login)
    },
    [confirm, report],
  )

  const changeRole = useCallback(
    async (m: PlatformMember, role: MemberRole, lost: string[], gained: string[]) => {
      const who = m.fullName ?? m.email
      const yes = await confirm({
        title: `Make ${who} ${ROLE_LABEL[role]}?`,
        body: (
          <div className="space-y-2">
            {lost.length > 0 && <p>Loses: {lost.map((p) => PERMISSION_LABEL[p as keyof typeof PERMISSION_LABEL] ?? p).join(', ')}.</p>}
            {gained.length > 0 && <p>Gains: {gained.map((p) => PERMISSION_LABEL[p as keyof typeof PERMISSION_LABEL] ?? p).join(', ')}.</p>}
            <p>This applies to their next action.</p>
          </div>
        ),
        confirmLabel: `Make ${ROLE_LABEL[role]}`,
      })
      if (!yes) return false
      return report(await service.setMemberRole(m.id, role), `${who} is now ${ROLE_LABEL[role]}`)
    },
    [confirm, report],
  )

  return { resend, revoke, deactivate, reactivate, remove, changeRole, reportInvite }
}
