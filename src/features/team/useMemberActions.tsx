// Member actions shared by the team list, the invitation panel and the member page (ADR-0029): each one confirms
// what will happen, calls the service, and says what actually happened (an email failure is never shown as sent).
import { useCallback } from 'react'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { useToast } from '@/components/ui/ToastProvider'
import type { InviteOutcome, MemberRole, PlatformMember } from '@/domain/types'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { useFormat } from '@/lib/useFormat'
import { type NoticeOutcome, service } from '@/services'
import type { Result } from '@/services/catalogService'
import { emailReasonKey, useTeamText } from './teamLabels'

/**
 * R-W7-6: the toast after an Owner action that emails the account holder (reset 2FA, restore or complete a closure).
 * "{done}. They were emailed." only when the email was accepted; otherwise
 * "{done}, but the notice email was not sent: {reason}." The action itself already happened either way.
 */

export function useNoticeToast() {
  const toast = useToast()
  const { t } = useI18n()
  return useCallback(
    (done: string, notice: NoticeOutcome, body?: string) => {
      if (notice.status === 'accepted') {
        toast.success(t('team.notice.emailed', { done }), body)
        return
      }
      // Only a fixed reason is shown; any other text (a provider's own words) falls back to the generic sentence.
      const known = emailReasonKey(notice.error)
      const why = (known ? t(known) : t('team.notice.fallbackReason')).replace(/\.$/, '')
      toast.error(t('team.notice.notEmailed', { done, why }), body)
    },
    [toast, t],
  )
}

export function useMemberActions() {
  const confirm = useConfirm()
  const toast = useToast()
  const { t } = useI18n()
  const fmt = useFormat()
  const words = useTeamText()

  const report = useCallback(
    <T,>(r: Result<T>, success: string, body?: string): boolean => {
      if (r.ok) toast.success(success, body)
      else toast.error(t('team.action.notChanged'), errorText(r.error, t))
      return r.ok
    },
    [toast, t],
  )

  const reportInvite = useCallback(
    (r: Result<InviteOutcome>, email: string): boolean => {
      if (!r.ok) {
        toast.error(t('team.action.inviteNotSent'), errorText(r.error, t))
        return false
      }
      if (r.data.status === 'email_failed') {
        const known = emailReasonKey(r.data.error)
        toast.error(t('team.action.emailFailed'), known ? t(known) : t('team.action.emailFailedFallback'))
        return true
      }
      toast.success(t('team.action.sent', { email }), t('team.action.sentBody', { date: fmt.date(r.data.expiresAt) }))
      return true
    },
    [toast, t, fmt],
  )

  const resend = useCallback(
    async (m: PlatformMember) => {
      const yes = await confirm({
        title: t('team.action.resend.title', { email: m.email }),
        body: t('team.action.resend.body'),
        confirmLabel: t('team.menu.resend'),
      })
      if (!yes) return false
      return reportInvite(await service.resendMemberInvite(m.id), m.email)
    },
    [confirm, reportInvite, t],
  )

  const revoke = useCallback(
    async (m: PlatformMember) => {
      const yes = await confirm({
        title: t('team.action.revoke.title', { email: m.email }),
        body: t('team.action.revoke.body'),
        confirmLabel: t('team.menu.revoke'),
        destructive: true,
      })
      if (!yes) return false
      return report(await service.revokeMemberInvite(m.id), t('team.action.revoke.done'))
    },
    [confirm, report, t],
  )

  const deactivate = useCallback(
    async (m: PlatformMember) => {
      const who = m.fullName ?? m.email
      const yes = await confirm({
        title: t('team.action.deactivate.title', { who }),
        body: t('team.action.deactivate.body', { who }),
        confirmLabel: t('team.menu.deactivate'),
        destructive: true,
      })
      if (!yes) return false
      const r = await service.deactivateMember(m.id)
      if (r.ok && r.data.signOut === 'failed') {
        // Honest: access is already refused by the database, but their open sessions could not be ended.
        toast.error(t('team.action.deactivate.notSignedOut', { who }), t('team.action.deactivate.notSignedOutBody'))
        return true
      }
      return report(r, t('team.action.deactivate.done', { who }), t('team.action.deactivate.doneBody'))
    },
    [confirm, report, toast, t],
  )

  const reactivate = useCallback(
    async (m: PlatformMember) => {
      const who = m.fullName ?? m.email
      const yes = await confirm({
        title: t('team.action.reactivate.title', { who }),
        body: m.userId ? t('team.action.reactivate.bodyAccount', { who, role: words.role(m.role) }) : t('team.action.reactivate.bodyNever', { who }),
        confirmLabel: t('team.menu.reactivate'),
      })
      if (!yes) return false
      return report(await service.reactivateMember(m.id), t('team.action.reactivate.done', { who }))
    },
    [confirm, report, t, words],
  )

  // S1.5 R-W6-1: deactivated members only; the copy is spec §11.1.
  const remove = useCallback(
    async (m: PlatformMember) => {
      const yes = await confirm({
        title: t('team.action.remove.title', { email: m.email }),
        body: t('team.action.remove.body', { role: words.role(m.role) }),
        confirmLabel: t('team.action.remove.label'),
        destructive: true,
      })
      if (!yes) return false
      // The toast says what happened to the login (manage-member keeps one that still owns a business, or that it could not delete).
      const r = await service.removeMember(m.id)
      const login = !m.userId
        ? t('team.action.remove.noLogin')
        : r.ok && r.data.loginDeleted
          ? t('team.action.remove.loginDeleted')
          : t('team.action.remove.loginKept')
      return report(r, t('team.action.remove.done', { email: m.email }), login)
    },
    [confirm, report, t, words],
  )

  const changeRole = useCallback(
    async (m: PlatformMember, role: MemberRole, lost: string[], gained: string[]) => {
      const who = m.fullName ?? m.email
      const yes = await confirm({
        title: t('team.action.changeRole.title', { who, role: words.role(role) }),
        body: (
          <div className="space-y-2">
            {lost.length > 0 && <p>{t('team.action.changeRole.loses', { list: lost.map((p) => words.perm(p)).join(', ') })}</p>}
            {gained.length > 0 && <p>{t('team.action.changeRole.gains', { list: gained.map((p) => words.perm(p)).join(', ') })}</p>}
            <p>{t('team.action.changeRole.next')}</p>
          </div>
        ),
        confirmLabel: t('team.action.changeRole.label', { role: words.role(role) }),
      })
      if (!yes) return false
      return report(await service.setMemberRole(m.id, role), t('team.action.changeRole.done', { who, role: words.role(role) }))
    },
    [confirm, report, t, words],
  )

  return { resend, revoke, deactivate, reactivate, remove, changeRole, reportInvite }
}
