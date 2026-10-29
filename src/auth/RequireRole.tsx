// UX-only routing guard for the demo. NOT a security boundary.
// Production access control must be enforced by the backend.
import { ShieldAlert } from 'lucide-react'
import { type ReactNode, useCallback } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router'
import type { Role } from '@/domain/types'
import { Button, ButtonLink } from '@/components/ui/Button'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { isDemoMode } from '@/services'
import { useAccount } from './AccountProvider'

/** Where to go to choose an account: the demo picker, or the real sign-in page in Supabase mode. */
export const SIGN_IN_PATH = isDemoMode ? '/demo' : '/login'

/**
 * Opens the sign-in page, after ending the session when `signOut` is set (awaited: the sign-in page sends a
 * signed-in user straight back). A failed sign-out shows a toast; the user stays put while still signed in.
 */
export function useLeaveAccount() {
  const { logout } = useAccount()
  const navigate = useNavigate()
  const toast = useToast()
  const { t } = useI18n()
  return useCallback(
    async ({ signOut, next }: { signOut: boolean; next?: string }) => {
      if (signOut) {
        const r = await logout()
        if (r.error) {
          if (r.signedOut) toast.error(t('auth.signOut.deviceOnlyTitle'), t('auth.signOut.deviceOnlyBody'))
          else toast.error(t('auth.signOut.failedTitle'), t('auth.signOut.failedBody'))
        }
        if (!r.signedOut) return
      }
      navigate(next ? `${SIGN_IN_PATH}?next=${encodeURIComponent(next)}` : SIGN_IN_PATH)
    },
    [logout, navigate, toast, t],
  )
}

export function RequireRole({ allow: role, children }: { allow: Role; children: ReactNode }) {
  const { user, accountError, accountFailure, retry } = useAccount()
  const { t } = useI18n()
  const location = useLocation()
  const leave = useLeaveAccount()
  if (user === undefined) {
    if (!accountError) return <FullPageSpinner />
    return (
      <main className="grid min-h-dvh place-items-center bg-canvas p-6">
        <ErrorState message={`${t('auth.accountLoadFailed')} ${accountFailure ? errorText(accountFailure, t) : ''}`.trim()} onRetry={retry} />
      </main>
    )
  }
  if (user === null) return <Navigate to={`${SIGN_IN_PATH}?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  if (user.role !== role) {
    return (
      <main className="grid min-h-dvh place-items-center bg-canvas p-6">
        <div className="max-w-sm text-center">
          <span className="mx-auto mb-4 grid size-11 place-items-center rounded-full bg-warning-soft text-warning">
            <ShieldAlert className="size-5" aria-hidden />
          </span>
          <h1 className="text-lg font-semibold">{t('auth.wrongArea.title', { role: t(`auth.role.${role}`) })}</h1>
          <p className="mt-1 text-sm text-ink-muted">
            {t(isDemoMode ? 'auth.wrongArea.bodyDemo' : 'auth.wrongArea.body', { role: t(`auth.role.${user.role}`) })}
          </p>
          {isDemoMode ? (
            <ButtonLink to={`${SIGN_IN_PATH}?next=${encodeURIComponent(location.pathname)}`} variant="primary" className="mt-5">
              {t('auth.switchAccount')}
            </ButtonLink>
          ) : (
            // The sign-in page sends a signed-in user straight back, so the session ends first.
            <Button variant="primary" className="mt-5" onClick={() => void leave({ signOut: true, next: location.pathname })}>
              {t('auth.switchAccount')}
            </Button>
          )}
        </div>
      </main>
    )
  }
  return <>{children}</>
}
