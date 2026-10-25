// The "Complete your setup" steps (spec 8, Onboarding), as a pure function of real data: nothing is marked done that
// the data does not show. The checklist (full screen on the first visit) and the Overview card both use it.
import type { Business, Profile, SecurityState } from '@/domain/types'
import { settingsPath } from '@/lib/urls'

export type OnboardingScope = 'admin' | 'business'
export type StepId = 'name' | 'photo' | '2fa' | 'business' | 'product'
/** How the step is shown: required steps block "Finish later"; recommended and optional ones never do. */
export type StepLevel = 'required' | 'recommended' | 'optional'

export interface Step {
  id: StepId
  label: string
  /** One line under the label: why the step matters. */
  hint: string
  done: boolean
  required: boolean
  level: StepLevel
  /** Where the step is done. */
  to?: string
}

export interface OnboardingContext {
  scope: OnboardingScope
  profile: Pick<Profile, 'displayName' | 'avatarUrl'>
  security: Pick<SecurityState, 'requires2fa' | 'hasVerifiedFactor'>
  /** Business owners: their business (null or undefined while unknown, never done). */
  business?: Pick<Business, 'logoUrl' | 'contact'> | null
  /** Business owners: how many products the business has (undefined while unknown, never done). */
  productCount?: number
}

const filled = (s: string | null | undefined) => !!s && s.trim().length > 0

export function onboardingSteps(ctx: OnboardingContext): Step[] {
  const { scope, profile, security } = ctx
  const twoFactorRequired = security.requires2fa
  const steps: Step[] = [
    {
      id: 'name',
      label: 'Add your name',
      hint: 'People you work with see who made a change.',
      done: filled(profile.displayName),
      required: true,
      level: 'required',
      to: settingsPath(scope, 'profile'),
    },
    {
      id: 'photo',
      label: 'Add a profile photo',
      hint: 'Your initials show until you add one.',
      done: filled(profile.avatarUrl),
      required: false,
      level: 'optional',
      to: settingsPath(scope, 'profile'),
    },
    {
      id: '2fa',
      label: 'Turn on two-step verification (2FA)',
      hint: twoFactorRequired ? 'Your account must use an authenticator app.' : 'An authenticator app keeps your account safe if your password leaks.',
      done: security.hasVerifiedFactor,
      required: twoFactorRequired,
      level: twoFactorRequired ? 'required' : 'recommended',
      to: settingsPath(scope, 'security'),
    },
  ]
  if (scope === 'business') {
    const b = ctx.business
    steps.push(
      {
        id: 'business',
        label: 'Add your logo and contact email',
        hint: 'Customers see them on your catalog.',
        done: !!b && filled(b.logoUrl) && filled(b.contact.email),
        required: false,
        level: 'optional',
        to: settingsPath(scope, 'business'),
      },
      {
        id: 'product',
        label: 'Add your first product',
        hint: 'Photos, price and dimensions. A 3D model adds AR.',
        done: (ctx.productCount ?? 0) >= 1,
        required: false,
        level: 'optional',
        to: '/dashboard/products/new',
      },
    )
  }
  return steps
}

export interface OnboardingProgress {
  done: number
  total: number
  /** A required step is still open: "Finish later" is not offered. */
  requiredOpen: boolean
  allDone: boolean
}

export function onboardingProgress(steps: readonly Step[]): OnboardingProgress {
  const done = steps.filter((s) => s.done).length
  return { done, total: steps.length, requiredOpen: steps.some((s) => s.required && !s.done), allDone: done === steps.length }
}

/** The setup is neither completed nor dismissed. Unknown (no state) is not open: nothing is shown. */
export function isOnboardingOpen(o: SecurityState['onboarding'] | undefined): boolean {
  return !!o && !o.completedAt && !o.dismissedAt
}

/** The settings hub routes: the checklist never covers them (its steps are done there). */
export const isSettingsRoute = (path: string) => /^\/(admin|dashboard)\/settings(\/|$)/.test(path)
