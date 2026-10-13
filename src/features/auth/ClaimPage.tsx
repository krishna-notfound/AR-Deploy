import { BadgeCheck } from 'lucide-react'
import { useState } from 'react'
import { Navigate } from 'react-router'
import { useAccount } from '@/auth/AccountProvider'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { useDocumentTitle } from '@/components/layout/PageHeader'
import { Button, ButtonLink } from '@/components/ui/Button'
import { InlineNotice } from '@/components/ui/States'
import { auth } from '@/services'
import { SiteHeader } from '../marketing/SiteChrome'

const PENDING_CLAIM_KEY = 'arfurn:pendingClaim'
const TOKEN = /^[0-9a-f]{64}$/
const PENDING_TTL_MS = 7 * 24 * 60 * 60 * 1000 // same as the link's server-side expiry
let pendingFromHash: string | null = null

/**
 * Moves a claim token from the URL fragment into localStorage and strips it from the address bar. localStorage
 * (not sessionStorage) because the email-confirmation link opens in a new tab. The token is single-use and
 * expires server-side, and is removed here once redeemed or after 7 days.
 */
function captureClaimToken(): void {
  const fromHash = window.location.hash.slice(1)
  if (!TOKEN.test(fromHash)) return
  pendingFromHash = fromHash
  try {
    localStorage.setItem(PENDING_CLAIM_KEY, JSON.stringify({ token: fromHash, savedAt: Date.now() }))
  } catch {
    // Storage blocked: the token still works in this page, it just won't survive a detour.
  }
  history.replaceState(null, '', window.location.pathname + window.location.search)
}

export function pendingClaimToken(): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(PENDING_CLAIM_KEY) ?? 'null') as { token?: string; savedAt?: number } | null
    if (saved?.token && TOKEN.test(saved.token) && Date.now() - (saved.savedAt ?? 0) < PENDING_TTL_MS) return saved.token
    if (saved) localStorage.removeItem(PENDING_CLAIM_KEY)
  } catch {
    // unreadable: fall back to this page's token
  }
  return pendingFromHash
}

function clearClaimToken(): void {
  pendingFromHash = null
  try {
    localStorage.removeItem(PENDING_CLAIM_KEY)
  } catch {
    // nothing stored
  }
}

/** Opened from a claim link a platform admin sent. Ownership is granted by the database (redeem_business_claim). */
export default function ClaimPage() {
  useDocumentTitle('Claim your business')
  captureClaimToken()
  const { user, signedInEmail } = useAccount()
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const token = pendingClaimToken()

  if (!auth) return <Navigate to="/demo" replace />
  const authService = auth
  if (user === undefined) return <FullPageSpinner />
  const signedIn = !!user || !!signedInEmail

  const claim = async () => {
    if (!token) return
    setPending(true)
    const res = await authService.redeemBusinessClaim(token)
    setPending(false)
    if (!res.ok) return setError(res.error.message)
    clearClaimToken()
    window.location.assign('/dashboard') // full load: the account is re-read with its new business
  }

  return (
    <div className="min-h-dvh bg-canvas">
      <SiteHeader cta={false} />
      <main className="mx-auto max-w-sm space-y-6 px-5 py-16 sm:py-24">
        <h1 className="text-title font-normal">Claim your business</h1>
        {!token ? (
          <InlineNotice tone="warning">This link is incomplete. Open the full link from the message we sent you, or ask us for a new one.</InlineNotice>
        ) : !signedIn ? (
          <>
            <p className="text-sm text-ink-muted">Sign in, or create an account first. Then come back to this page to finish.</p>
            <div className="flex flex-col gap-3">
              <ButtonLink to="/login" variant="primary">
                Sign in
              </ButtonLink>
              <ButtonLink to="/signup">Create an account</ButtonLink>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-ink-muted">
              Signed in as <strong className="font-medium text-ink">{signedInEmail ?? user?.email}</strong>. This account will be able to manage the
              business this link was issued for.
            </p>
            {error && (
              <InlineNotice tone="warning">
                <span role="alert">{error}</span>
              </InlineNotice>
            )}
            <Button variant="primary" className="w-full" loading={pending} icon={<BadgeCheck className="size-4" aria-hidden />} onClick={() => void claim()}>
              Claim business
            </Button>
          </>
        )}
      </main>
    </div>
  )
}
