import { describe, expect, it } from 'vitest'
import { type OnboardingContext, type Step, type StepId, isOnboardingOpen, isSettingsRoute, onboardingProgress, onboardingSteps } from './onboardingSteps'

const NEW_PROFILE = { displayName: null, avatarUrl: null }
const NO_2FA = { requires2fa: false, hasVerifiedFactor: false }
const BUSINESS = { logoUrl: 'https://x.example/logo.png', contact: { email: 'hello@casa.example' } }

const ctx = (over: Partial<OnboardingContext> = {}): OnboardingContext => ({
  scope: 'business',
  profile: NEW_PROFILE,
  security: NO_2FA,
  business: { logoUrl: undefined, contact: {} },
  productCount: 0,
  ...over,
})
const byId = (c: OnboardingContext) => Object.fromEntries(onboardingSteps(c).map((s) => [s.id, s])) as Record<StepId, Step>

describe('onboardingSteps', () => {
  it('business owner steps: name (required), photo, 2FA (required when the policy requires it, otherwise recommended), logo and contact email, first product', () => {
    const steps = onboardingSteps(ctx())
    expect(steps.map((s) => s.id)).toEqual(['name', 'photo', '2fa', 'business', 'product'])
    expect(steps.map((s) => s.required)).toEqual([true, false, false, false, false])
    expect(steps.every((s) => !s.done)).toBe(true)
    expect(byId(ctx())['2fa'].level).toBe('recommended')
    const policy = byId(ctx({ security: { requires2fa: true, hasVerifiedFactor: false } }))['2fa']
    expect(policy).toMatchObject({ required: true, level: 'required' })
    expect(byId(ctx()).name.level).toBe('required')
    expect(byId(ctx()).photo.level).toBe('optional')
  })

  it('staff steps: name, photo, 2FA (no business steps)', () => {
    const steps = onboardingSteps(ctx({ scope: 'admin', business: undefined, productCount: undefined }))
    expect(steps.map((s) => s.id)).toEqual(['name', 'photo', '2fa'])
    expect(steps.find((s) => s.id === 'name')?.required).toBe(true)
    expect(onboardingSteps(ctx({ scope: 'admin', security: { requires2fa: true, hasVerifiedFactor: false } })).find((s) => s.id === '2fa')?.required).toBe(true)
  })

  it('each step is done from real data only', () => {
    const done = byId(
      ctx({
        profile: { displayName: 'Rui', avatarUrl: 'https://x.example/a.webp' },
        security: { requires2fa: false, hasVerifiedFactor: true },
        business: BUSINESS,
        productCount: 1,
      }),
    )
    expect(Object.values(done).every((s) => s.done)).toBe(true)
    // A blank name is not a name; a logo without a contact email (or the reverse) is not done.
    expect(byId(ctx({ profile: { displayName: '   ', avatarUrl: null } })).name.done).toBe(false)
    expect(byId(ctx({ business: { logoUrl: BUSINESS.logoUrl, contact: {} } })).business.done).toBe(false)
    expect(byId(ctx({ business: { logoUrl: undefined, contact: { email: 'a@b.example' } } })).business.done).toBe(false)
    expect(byId(ctx({ business: { logoUrl: BUSINESS.logoUrl, contact: { email: '  ' } } })).business.done).toBe(false)
    // Unknown data never reads as done.
    expect(byId(ctx({ business: null, productCount: undefined })).business.done).toBe(false)
    expect(byId(ctx({ productCount: undefined })).product.done).toBe(false)
  })

  it('each step links to where it is done', () => {
    const b = byId(ctx())
    expect(b.name.to).toBe('/dashboard/settings/profile')
    expect(b.photo.to).toBe('/dashboard/settings/profile')
    expect(b['2fa'].to).toBe('/dashboard/settings/security')
    expect(b.business.to).toBe('/dashboard/settings/business')
    expect(b.product.to).toBe('/dashboard/products/new')
    const a = byId(ctx({ scope: 'admin' }))
    expect(a.name.to).toBe('/admin/settings/profile')
    expect(a['2fa'].to).toBe('/admin/settings/security')
  })
})

describe('onboardingProgress', () => {
  it('counts done steps; a required open step blocks Finish later; all done completes', () => {
    const open = onboardingProgress(onboardingSteps(ctx()))
    expect(open).toEqual({ done: 0, total: 5, requiredOpen: true, allDone: false })
    const named = onboardingProgress(onboardingSteps(ctx({ profile: { displayName: 'Rui', avatarUrl: null } })))
    expect(named).toEqual({ done: 1, total: 5, requiredOpen: false, allDone: false })
    const policy = onboardingProgress(onboardingSteps(ctx({ profile: { displayName: 'Rui', avatarUrl: null }, security: { requires2fa: true, hasVerifiedFactor: false } })))
    expect(policy.requiredOpen).toBe(true)
    const all = onboardingProgress(
      onboardingSteps(ctx({ profile: { displayName: 'Rui', avatarUrl: 'x' }, security: { requires2fa: false, hasVerifiedFactor: true }, business: BUSINESS, productCount: 3 })),
    )
    expect(all).toEqual({ done: 5, total: 5, requiredOpen: false, allDone: true })
  })
})

describe('isOnboardingOpen', () => {
  it('is open only while neither completed nor dismissed', () => {
    expect(isOnboardingOpen({ completedAt: null, dismissedAt: null })).toBe(true)
    expect(isOnboardingOpen({ completedAt: '2026-10-01T00:00:00Z', dismissedAt: null })).toBe(false)
    expect(isOnboardingOpen({ completedAt: null, dismissedAt: '2026-10-01T00:00:00Z' })).toBe(false)
    expect(isOnboardingOpen(undefined)).toBe(false)
  })
})

describe('isSettingsRoute', () => {
  it('matches the settings hub routes only', () => {
    expect(isSettingsRoute('/dashboard/settings')).toBe(true)
    expect(isSettingsRoute('/dashboard/settings/profile')).toBe(true)
    expect(isSettingsRoute('/admin/settings/security')).toBe(true)
    expect(isSettingsRoute('/dashboard')).toBe(false)
    expect(isSettingsRoute('/dashboard/settingsx')).toBe(false)
    expect(isSettingsRoute('/dashboard/products/new')).toBe(false)
  })
})
