// "Complete your setup" (spec 8, Onboarding): a full-screen checklist on the first visit to the dashboard, shown by the
// SecurityGate after its 2FA checks, and the "Finish your setup · n of m" card on Overview. Every step's done-ness
// comes from real data (onboardingSteps). UX only: nothing here is a security boundary.
import { CheckCircle2, ChevronRight, Circle, ListChecks } from 'lucide-react'
import { type MouseEvent, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { useAccount } from '@/auth/AccountProvider'
import { useLeaveAccount } from '@/auth/RequireRole'
import type { GateCheck, GateScreenProps } from '@/auth/SecurityGate'
import { PanelHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardBody } from '@/components/ui/Card'
import { SkeletonRows } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/States'
import type { SecurityState } from '@/domain/types'
import { accountErrorText } from './accountError'
import { useI18n } from '@/i18n/LanguageProvider'
import { settingsReturnState } from '@/lib/settingsReturn'
import { account, service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { type OnboardingProgress, type OnboardingScope, type Step, isOnboardingOpen, isSettingsRoute, onboardingProgress, onboardingSteps } from './onboardingSteps'
import { useMyProfile } from './useMyProfile'

// ---- This visit -------------------------------------------------------------------------------------------------
// A step done outside settings (the first product) lets the user through until the next page load; so does a checklist
// that can't load. In memory only: it is not a dismissal, so the next visit shows the checklist again.

const passed = new Set<string>()
const listeners = new Set<() => void>()
let version = 0
function passThisVisit(userId: string): void {
  passed.add(userId)
  version++
  for (const l of listeners) l()
}
/** For the gate: re-render when the user is let through. */
export const subscribeOnboardingVisits = (l: () => void) => {
  listeners.add(l)
  return () => void listeners.delete(l)
}
export const onboardingVisitsVersion = () => version
/** Back to a fresh page load (tests). */
export function resetOnboardingVisits(): void {
  passed.clear()
  version++
}

// ---- Data -------------------------------------------------------------------------------------------------------

export type OnboardingData =
  | { status: 'unknown' }
  | { status: 'loading' }
  | { status: 'error'; message: string; retry: () => void }
  | { status: 'ready'; steps: Step[]; progress: OnboardingProgress }

/** The steps for the signed-in user, from their profile, 2FA state, business and products. */
export function useOnboarding(scope: OnboardingScope): OnboardingData {
  const { t } = useI18n()
  const { business, security } = useAccount()
  const { profile, error: profileError, reload } = useMyProfile()
  const businessId = scope === 'business' ? business?.id : undefined
  const products = useServiceQuery(() => (businessId ? service.getProducts({ businessId }) : Promise.resolve({ ok: true as const, data: [] })), [businessId])
  const state = security.state
  // The security check could not answer: the gate's own notice says so.
  if (!state) return { status: 'unknown' }
  if (!profile) return profileError ? { status: 'error', message: accountErrorText(profileError, t), retry: reload } : { status: 'loading' }
  if (scope === 'business' && !business) return { status: 'loading' }
  if (!products.data) return products.status === 'error' ? { status: 'error', message: t('settings.onboarding.productsFailed'), retry: products.refetch } : { status: 'loading' }
  const steps = onboardingSteps({ scope, profile, security: state, business, productCount: scope === 'business' ? products.data.length : undefined })
  return { status: 'ready', steps, progress: onboardingProgress(steps) }
}

/** Records "completed" or "dismissed", then updates the known security state so the gate and the card follow at once. */
function useSetOnboarding() {
  const { security, patchSecurity, refreshSecurity } = useAccount()
  const prev = security.state?.onboarding
  return async (kind: 'completed' | 'dismissed'): Promise<boolean> => {
    const r = await account.setOnboarding(kind)
    if (!r.ok) return false
    const at = new Date().toISOString()
    const base: SecurityState['onboarding'] = prev ?? { completedAt: null, dismissedAt: null }
    patchSecurity({ state: { onboarding: kind === 'completed' ? { ...base, completedAt: at } : { ...base, dismissedAt: at } } })
    void refreshSecurity()
    return true
  }
}

// ---- Shared rows ------------------------------------------------------------------------------------------------

function stepName(s: Step, t: ReturnType<typeof useI18n>['t']): string {
  const label = t(s.labelKey)
  if (s.done) return t('settings.onboarding.stepDone', { label })
  if (s.level === 'optional') return t('settings.onboarding.stepNotDone', { label })
  return t(s.level === 'required' ? 'settings.onboarding.stepNotDoneRequired' : 'settings.onboarding.stepNotDoneRecommended', { label })
}

/** A click that opens the step in this tab: not a ctrl/cmd/shift/alt or middle click (a new tab or window). */
const isPlainClick = (e: MouseEvent) => e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey

function StepRow({ step, onOpen, linkState }: { step: Step; onOpen?: () => void; linkState?: unknown }) {
  const { t } = useI18n()
  const marker = step.done ? (
    <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />
  ) : (
    <Circle className="size-5 shrink-0 text-line-strong" aria-hidden />
  )
  const body = (
    <>
      {marker}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className={step.done ? 'text-ink-muted line-through decoration-line-strong' : 'font-medium text-ink'}>{t(step.labelKey)}</span>
          {!step.done && step.level !== 'optional' && <Badge tone={step.level === 'required' ? 'warning' : 'neutral'}>{step.level === 'required' ? t('common.required') : t('settings.onboarding.recommended')}</Badge>}
        </span>
        {!step.done && <span className="mt-0.5 block text-ui-sub text-ink-muted">{t(step.hintKey)}</span>}
      </span>
    </>
  )
  const row = 'flex min-h-[56px] items-center gap-3 py-3 text-[length:var(--text-ui-body)] leading-[1.5]'
  return (
    <li aria-label={stepName(step, t)}>
      {!step.done && step.to ? (
        <Link to={step.to} state={linkState} onClick={(e) => isPlainClick(e) && onOpen?.()} className={`${row} -mx-2 rounded-[var(--radius-control)] px-2 hover:bg-canvas/70`}>
          {body}
          <ChevronRight className="size-4 shrink-0 text-ink-muted" aria-hidden />
        </Link>
      ) : (
        <div className={row}>{body}</div>
      )}
    </li>
  )
}

/** `count`: the "n of m done" text beside the bar (the Overview card has it in its title instead). */
function ProgressBar({ progress, count = true }: { progress: OnboardingProgress; count?: boolean }) {
  const { t } = useI18n()
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-subtle" aria-hidden>
        <div className="h-full rounded-full bg-success transition-[width] duration-300" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
      </div>
      {count && (
        <span className="shrink-0 text-ui-sub text-ink-muted tabular-nums">
          {t('settings.onboarding.progress', { done: progress.done, total: progress.total })}
        </span>
      )}
    </div>
  )
}

// ---- Full-screen checklist (a SecurityGate screen) -------------------------------------------------------------

export function OnboardingChecklist({ ctx }: GateScreenProps) {
  const { t } = useI18n()
  const leave = useLeaveAccount()
  const location = useLocation()
  const here = location.pathname + location.search
  const data = useOnboarding(ctx.scope)
  const save = useSetOnboarding()
  const [saving, setSaving] = useState<'completed' | 'dismissed' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const finish = async (kind: 'completed' | 'dismissed') => {
    setSaving(kind)
    setError(null)
    const saved = await save(kind)
    setSaving(null)
    if (!saved) setError(t('settings.onboarding.saveFailed'))
  }
  const passOn = () => passThisVisit(ctx.user.id)

  const firstRequired = data.status === 'ready' ? data.steps.find((s) => s.required && !s.done) : undefined

  return (
    <>
      <div className="mb-6">
        <span className="mb-4 grid size-11 place-items-center rounded-full bg-subtle text-ink">
          <ListChecks className="size-5" aria-hidden />
        </span>
        <h1 className="font-display text-[length:var(--text-ui-h1)] leading-[1.15] font-medium tracking-[-0.01em] text-ink">{t('settings.onboarding.title')}</h1>
        <p className="mt-1.5 text-ui-sub text-ink-muted">{t('settings.onboarding.intro')}</p>
      </div>
      <Card>
        {data.status === 'ready' ? (
          <>
            <div className="px-5 pt-5 sm:px-6">
              <ProgressBar progress={data.progress} />
            </div>
            <ol aria-label={t('settings.onboarding.stepsLabel')} className="divide-y divide-line px-5 pt-2 pb-2 sm:px-6">
              {data.steps.map((s) => (
                <StepRow
                  key={s.id}
                  step={s}
                  // Settings is never covered by the checklist (closing it comes back here); any other page is this visit only.
                  linkState={s.to && isSettingsRoute(s.to) ? settingsReturnState(here) : undefined}
                  onOpen={s.to && !isSettingsRoute(s.to) ? passOn : undefined}
                />
              ))}
            </ol>
          </>
        ) : data.status === 'error' ? (
          <ErrorState message={data.message} onRetry={data.retry} />
        ) : (
          <CardBody className="pt-5" aria-busy="true" aria-label={t('settings.onboarding.loading')}>
            <SkeletonRows rows={4} />
          </CardBody>
        )}
      </Card>
      {error && (
        <p role="alert" className="mt-4 text-ui-sub text-danger">
          {error}
        </p>
      )}
      <div className="mt-5 flex flex-wrap-reverse items-center justify-between gap-3">
        <Button variant="ghost" onClick={() => void leave({ signOut: true })}>
          {t('settings.layout.signOut')}
        </Button>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {data.status === 'error' && <Button onClick={passOn}>{t('settings.onboarding.continueToDashboard')}</Button>}
          {data.status === 'ready' &&
            (data.progress.allDone ? (
              <Button variant="primary" loading={saving === 'completed'} onClick={() => void finish('completed')}>
                {t('settings.onboarding.goToDashboard')}
              </Button>
            ) : firstRequired ? (
              <p className="text-ui-sub text-ink-muted">{t('settings.onboarding.toContinue', { label: t(firstRequired.labelKey) })}</p>
            ) : (
              <Button loading={saving === 'dismissed'} onClick={() => void finish('dismissed')}>
                {t('settings.onboarding.finishLater')}
              </Button>
            ))}
        </div>
      </div>
    </>
  )
}

/** The gate check: after the 2FA checks, while the setup is neither completed nor dismissed, outside settings. */
export const ONBOARDING_CHECK: GateCheck = {
  id: 'onboarding',
  applies: ({ security, user, business, path }) => {
    if (!isOnboardingOpen(security.state?.onboarding)) return false
    if (isSettingsRoute(path) || passed.has(user.id)) return false
    // A business owner without their business: the gate's own handling decides.
    return user.role !== 'business_admin' || !!business
  },
  Screen: OnboardingChecklist,
}

// ---- Overview card ----------------------------------------------------------------------------------------------

/**
 * "Finish your setup · n of m" on Overview until the setup is completed; completes it once every step is done.
 * A completed setup (or a state not known yet) renders nothing and fetches nothing.
 */
export function SetupProgressCard({ scope, className }: { scope: OnboardingScope; className?: string }) {
  const onboarding = useAccount().security.state?.onboarding
  if (!onboarding || onboarding.completedAt) return null
  return <OpenSetupProgressCard scope={scope} className={className} />
}

function OpenSetupProgressCard({ scope, className }: { scope: OnboardingScope; className?: string }) {
  const { t } = useI18n()
  const data = useOnboarding(scope)
  const save = useSetOnboarding()
  const allDone = data.status === 'ready' && data.progress.allDone
  const sent = useRef(false)
  useEffect(() => {
    if (!allDone || sent.current) return
    sent.current = true
    void save('completed').then((saved) => {
      if (!saved) sent.current = false
    })
  }, [allDone, save])

  if (allDone || data.status === 'unknown') return null
  const title =
    data.status === 'ready' ? `${t('settings.onboarding.finish')} · ${t('settings.onboarding.progressShort', { done: data.progress.done, total: data.progress.total })}` : t('settings.onboarding.finish')
  return (
    <section aria-label={t('settings.onboarding.finish')} className={className}>
      <Card>
        <PanelHeader title={title} description={data.status === 'ready' ? t('settings.onboarding.cardHint') : undefined} />
        {data.status === 'ready' ? (
          <>
            <div className="px-5 sm:px-6">
              <ProgressBar progress={data.progress} count={false} />
            </div>
            <ul className="divide-y divide-line px-5 pt-1 pb-2 sm:px-6">
              {data.steps
                .filter((s) => !s.done)
                .map((s) => (
                  <StepRow key={s.id} step={s} />
                ))}
            </ul>
          </>
        ) : data.status === 'error' ? (
          <ErrorState message={data.message} onRetry={data.retry} />
        ) : (
          <CardBody>
            <SkeletonRows rows={2} />
          </CardBody>
        )}
      </Card>
    </section>
  )
}
