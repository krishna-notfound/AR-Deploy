import { ArrowLeft, ArrowRight, Check, CircleCheck, Copy, Pencil, RotateCw, Send } from 'lucide-react'
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router'
import { useDocumentTitle } from '@/components/layout/PageHeader'
import { Button, arrowLinkClasses } from '@/components/ui/Button'
import { Checkbox, FormField, Input, Select, Textarea } from '@/components/ui/Form'
import { InlineNotice } from '@/components/ui/States'
import type { ApplicationInput, Lang } from '@/domain/types'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { isDemoMode, service } from '@/services'
import { APPLICATION_STEPS, MODEL_READINESS, PHOTO_READINESS, PRODUCT_COUNT_RANGES, validateApplication } from '../../../supabase/functions/_shared/application.ts'
import { SiteFooter, SiteHeader } from '../marketing/SiteChrome'

type Step = keyof typeof APPLICATION_STEPS
const STEPS = Object.keys(APPLICATION_STEPS) as Step[]
const DRAFT_KEY = 'sanctus:apply:draft'
/** The confirmation of a sent application, kept for this tab only so a reload still shows the reference. */
const CATEGORY_KEYS = ['furniture', 'lighting', 'decor', 'fashion', 'jewellery', 'electronics', 'industrial', 'other'] as const

type Draft = Omit<ApplicationInput, 'category'> & { categoryKey: string; categoryOther: string }

const empty = (lang: Lang): Draft => ({
  businessName: '',
  website: '',
  description: '',
  categoryKey: '',
  categoryOther: '',
  country: '',
  city: '',
  applicantName: '',
  applicantRole: '',
  applicantEmail: '',
  applicantPhone: '',
  language: lang,
  productCount: '',
  photoReadiness: '',
  modelReadiness: '',
  notes: '',
  consent: false,
  submissionKey: crypto.randomUUID(),
})

/** Session-only draft: survives a refresh in this tab, never stored beyond it. */
function loadDraft(): { draft: Draft; step: Step } | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as { draft?: Draft; step?: Step }
    return v.draft && v.step && STEPS.includes(v.step) ? { draft: v.draft, step: v.step } : null
  } catch {
    return null
  }
}

type Done = { reference: string; email: string }

/**
 * The confirmation lives in the history entry's state: a reload of the success page keeps it, while opening /apply
 * again (a link, a new visit) starts a fresh form.
 */
function doneFrom(state: unknown): Done | null {
  const v = (state as { applyDone?: Partial<Done> } | null)?.applyDone
  return v && typeof v.reference === 'string' ? { reference: v.reference, email: typeof v.email === 'string' ? v.email : '' } : null
}

const isStep = (v: string | null): v is Step => !!v && (STEPS as string[]).includes(v)

const toInput = (d: Draft): ApplicationInput => {
  const { categoryKey, categoryOther, ...rest } = d
  return { ...rest, category: categoryKey === 'other' ? categoryOther : categoryKey }
}

export default function ApplyPage() {
  const { t, lang } = useI18n()
  useDocumentTitle(t('apply.title'))
  const [initial] = useState(loadDraft)
  const [draft, setDraft] = useState<Draft>(() => initial?.draft ?? empty(lang))
  // The step lives in the URL (?step=), one history entry per step, so the browser Back button goes to the previous step.
  const [params, setParams] = useSearchParams()
  const urlStep = params.get('step')
  const step: Step = isStep(urlStep) ? urlStep : 'business'
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const location = useLocation()
  const [done, setDone] = useState<Done | null>(() => doneFrom(location.state))
  const [honeypot, setHoneypot] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const shownStep = useRef(step)

  // A refresh (or coming back to /apply in this tab) resumes the saved step without adding a history entry.
  useEffect(() => {
    if (!isStep(urlStep) && initial && initial.step !== 'business') setParams({ step: initial.step }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Every step change (the wizard's buttons or the browser's Back/Forward) moves focus to the step heading.
  useEffect(() => {
    if (shownStep.current === step) return
    shownStep.current = step
    setSubmitError(null)
    requestAnimationFrame(() => headingRef.current?.focus())
  }, [step])

  useEffect(() => {
    if (done) return
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ draft, step }))
    } catch {
      // storage unavailable: the form still works, it just won't survive a refresh
    }
  }, [draft, step, done])

  const idx = STEPS.indexOf(step)
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }))
    setErrors((e) => {
      const { [k as string]: _, ...rest } = e
      if (k === 'categoryKey' || k === 'categoryOther') delete rest.category
      return rest
    })
  }

  const message = (field: string, code: string): string => {
    const limits: Record<string, [number, number]> = { businessName: [2, 80], description: [20, 1000], category: [2, 80], country: [2, 80], city: [1, 80], applicantName: [2, 120], notes: [0, 1000], applicantRole: [0, 80], applicantPhone: [0, 50] }
    const [min, max] = limits[field] ?? [0, 0]
    return t(`apply.err.${code}` as TranslationKey, { min, max })
  }

  /** Errors of the given steps only, as translated messages. */
  const stepErrors = (steps: Step[]) => {
    const v = validateApplication({ ...toInput(draft), consent: steps.includes('review') ? draft.consent : true })
    if (v.ok) return {}
    const own = new Set<string>(steps.flatMap((s) => APPLICATION_STEPS[s] as readonly string[]))
    return Object.fromEntries(Object.entries(v.errors).filter(([f]) => own.has(f)).map(([f, c]) => [f, message(f, c)]))
  }

  const go = (to: Step) => {
    if (to !== step) setParams(to === 'business' ? {} : { step: to })
  }

  const next = (e: FormEvent) => {
    e.preventDefault()
    const errs = stepErrors([step])
    setErrors(errs)
    if (Object.keys(errs).length) return
    go(STEPS[idx + 1]!)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting) return
    const all = stepErrors(STEPS)
    setErrors(all)
    if (Object.keys(all).length) {
      const first = STEPS.find((s) => (APPLICATION_STEPS[s] as readonly string[]).some((f) => all[f]))
      if (first && first !== 'review') go(first)
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    const res = await service.submitApplication({ ...toInput(draft), ...(honeypot ? { hp: honeypot } : {}) } as ApplicationInput)
    setSubmitting(false)
    if (res.ok) {
      try {
        sessionStorage.removeItem(DRAFT_KEY)
      } catch {
        // ignore
      }
      const confirmation = { reference: res.data.reference, email: draft.applicantEmail.trim() }
      setDone(confirmation)
      setParams({}, { replace: true, state: { applyDone: confirmation } })
      window.scrollTo({ top: 0 })
      return
    }
    if (res.error.code === 'VALIDATION' && res.error.fieldErrors) {
      const errs = Object.fromEntries(Object.entries(res.error.fieldErrors).map(([f, c]) => [f, message(f, c)]))
      setErrors(errs)
      const first = STEPS.find((s) => (APPLICATION_STEPS[s] as readonly string[]).some((f) => errs[f]))
      if (first && first !== 'review') go(first)
      return
    }
    setSubmitError(res.error.code === 'RATE_LIMITED' ? t('apply.rateLimited') : res.error.code === 'CONFLICT' ? t('apply.duplicate') : t('apply.failed'))
  }

  return (
    <div className="min-h-dvh bg-canvas">
      <SiteHeader />
      <main className="mx-auto max-w-[1100px] px-5 py-12 sm:px-10 sm:py-16">
        {done ? (
          <Success
            done={done}
            onRestart={() => {
              setParams({}, { replace: true, state: null })
              setDraft(empty(lang))
              setErrors({})
              setDone(null)
            }}
          />
        ) : (
          <div className="grid gap-10 lg:grid-cols-[260px_minmax(0,1fr)] lg:gap-16">
            <aside>
              <p className="text-eyebrow text-ink-muted">{t('apply.eyebrow')}</p>
              <h1 className="mt-4 text-headline">{t('apply.title')}</h1>
              <p className="mt-4 text-[15px] leading-7 text-ink-muted">{t('apply.intro')}</p>
              <Progress current={idx} onGo={(i) => i < idx && go(STEPS[i]!)} />
            </aside>

            <form onSubmit={step === 'review' ? submit : next} noValidate className="min-w-0 border border-line bg-surface p-6 sm:p-10">
              <p className="text-label text-ink-muted lg:hidden">{t('apply.stepOf', { n: idx + 1, total: STEPS.length })}</p>
              <h2 ref={headingRef} tabIndex={-1} className="mt-2 font-display text-[1.9rem] leading-tight font-normal outline-none lg:mt-0">
                {t(`apply.step.${step}` as TranslationKey)}
              </h2>
              <p className="mt-2 text-sm text-ink-muted">{t(`apply.step.${step}.hint` as TranslationKey)}</p>

              {/* Honeypot: invisible to people, tempting to bots. */}
              <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
                <label>
                  Company fax
                  <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
                </label>
              </div>

              <div className="mt-8 space-y-5">
                {step === 'business' && (
                  <>
                    <FormField label={t('apply.f.businessName')} required error={errors.businessName}>
                      <Input value={draft.businessName} maxLength={80} autoComplete="organization" onChange={(e) => set('businessName', e.target.value)} />
                    </FormField>
                    <FormField label={t('apply.f.website')} optional={t('apply.optional')} hint={t('apply.f.website.hint')} error={errors.website}>
                      <Input value={draft.website} inputMode="url" autoComplete="url" placeholder="www.example.com" onChange={(e) => set('website', e.target.value)} />
                    </FormField>
                    <FormField label={t('apply.f.category')} required error={errors.category && draft.categoryKey !== 'other' ? errors.category : undefined}>
                      <Select value={draft.categoryKey} onChange={(e) => set('categoryKey', e.target.value)}>
                        <option value="">{t('apply.choose')}</option>
                        {CATEGORY_KEYS.map((c) => (
                          <option key={c} value={c}>
                            {t(`apply.cat.${c}` as TranslationKey)}
                          </option>
                        ))}
                      </Select>
                    </FormField>
                    {draft.categoryKey === 'other' && (
                      <FormField label={t('apply.f.categoryOther')} required error={errors.category}>
                        <Input value={draft.categoryOther} maxLength={80} onChange={(e) => set('categoryOther', e.target.value)} />
                      </FormField>
                    )}
                    <FormField label={t('apply.f.description')} required hint={t('apply.f.description.hint', { n: draft.description.trim().length })} error={errors.description}>
                      <Textarea rows={5} maxLength={1000} value={draft.description} onChange={(e) => set('description', e.target.value)} />
                    </FormField>
                  </>
                )}

                {step === 'location' && (
                  <div className="grid gap-5 sm:grid-cols-2">
                    <FormField label={t('apply.f.country')} required error={errors.country}>
                      <Input value={draft.country} maxLength={80} autoComplete="country-name" onChange={(e) => set('country', e.target.value)} />
                    </FormField>
                    <FormField label={t('apply.f.city')} required error={errors.city}>
                      <Input value={draft.city} maxLength={80} autoComplete="address-level2" onChange={(e) => set('city', e.target.value)} />
                    </FormField>
                  </div>
                )}

                {step === 'contact' && (
                  <>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <FormField label={t('apply.f.applicantName')} required error={errors.applicantName}>
                        <Input value={draft.applicantName} maxLength={120} autoComplete="name" onChange={(e) => set('applicantName', e.target.value)} />
                      </FormField>
                      <FormField label={t('apply.f.applicantRole')} optional={t('apply.optional')} error={errors.applicantRole}>
                        <Input value={draft.applicantRole} maxLength={80} autoComplete="organization-title" onChange={(e) => set('applicantRole', e.target.value)} />
                      </FormField>
                    </div>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <FormField label={t('apply.f.applicantEmail')} required hint={t('apply.f.applicantEmail.hint')} error={errors.applicantEmail}>
                        <Input type="email" value={draft.applicantEmail} maxLength={320} autoComplete="email" onChange={(e) => set('applicantEmail', e.target.value)} />
                      </FormField>
                      <FormField label={t('apply.f.applicantPhone')} optional={t('apply.optional')} error={errors.applicantPhone}>
                        <Input type="tel" value={draft.applicantPhone} maxLength={50} autoComplete="tel" onChange={(e) => set('applicantPhone', e.target.value)} />
                      </FormField>
                    </div>
                    <Choice
                      legend={t('apply.f.language')}
                      name="language"
                      value={draft.language}
                      options={[
                        ['en', 'English'],
                        ['pt', 'Português'],
                      ]}
                      onChange={(v) => set('language', v as Lang)}
                      error={errors.language}
                    />
                  </>
                )}

                {step === 'catalogue' && (
                  <>
                    <Choice legend={t('apply.f.productCount')} name="productCount" value={draft.productCount} options={PRODUCT_COUNT_RANGES.map((v) => [v, t(`apply.count.${v}` as TranslationKey)])} onChange={(v) => set('productCount', v)} error={errors.productCount} />
                    <Choice legend={t('apply.f.photoReadiness')} name="photoReadiness" value={draft.photoReadiness} options={PHOTO_READINESS.map((v) => [v, t(`apply.photos.${v}` as TranslationKey)])} onChange={(v) => set('photoReadiness', v)} error={errors.photoReadiness} />
                    <Choice
                      legend={t('apply.f.modelReadiness')}
                      hint={t('apply.f.modelReadiness.hint')}
                      name="modelReadiness"
                      value={draft.modelReadiness}
                      options={MODEL_READINESS.map((v) => [v, t(`apply.models.${v}` as TranslationKey)])}
                      onChange={(v) => set('modelReadiness', v)}
                      error={errors.modelReadiness}
                    />
                    <FormField label={t('apply.f.notes')} optional={t('apply.optional')} error={errors.notes}>
                      <Textarea rows={3} maxLength={1000} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
                    </FormField>
                  </>
                )}

                {step === 'review' && (
                  <>
                    <Review draft={draft} onEdit={go} />
                    <Checkbox label={t('apply.f.consent')} checked={draft.consent} onChange={(e) => set('consent', e.target.checked)} aria-invalid={!!errors.consent} />
                    {errors.consent && <p className="text-[13px] text-danger">{errors.consent}</p>}
                    {submitError && (
                      <InlineNotice tone="warning">
                        <span role="alert">{submitError}</span>
                      </InlineNotice>
                    )}
                  </>
                )}
              </div>

              {step !== 'review' && (APPLICATION_STEPS[step] as readonly string[]).some((f) => errors[f]) && (
                <p role="alert" className="mt-6 text-[13px] text-danger">
                  {t('apply.fixFields')}
                </p>
              )}

              <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
                {idx > 0 ? (
                  <Button onClick={() => go(STEPS[idx - 1]!)} icon={<ArrowLeft className="size-4" aria-hidden />}>
                    {t('apply.back')}
                  </Button>
                ) : (
                  <span />
                )}
                {step === 'review' ? (
                  <Button type="submit" variant="primary" size="lg" loading={submitting} icon={submitError ? <RotateCw className="size-4" aria-hidden /> : <Send className="size-4" aria-hidden />}>
                    {submitError ? t('apply.retry') : t('apply.submit')}
                  </Button>
                ) : (
                  <Button type="submit" variant="primary" size="lg">
                    {t('apply.next')} <ArrowRight className="size-4" aria-hidden />
                  </Button>
                )}
              </div>
            </form>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  )
}

function Progress({ current, onGo }: { current: number; onGo: (i: number) => void }) {
  const { t } = useI18n()
  return (
    <ol className="mt-10 hidden space-y-1 lg:block" aria-label={t('apply.progress')}>
      {STEPS.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'current' : 'todo'
        const content = (
          <>
            <span
              className={cn(
                'grid size-7 shrink-0 place-items-center rounded-full border text-xs',
                state === 'done' ? 'border-ink bg-ink text-chalk' : state === 'current' ? 'border-ink text-ink' : 'border-line-strong text-ink-faint',
              )}
              aria-hidden
            >
              {state === 'done' ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={cn('text-sm', state === 'todo' ? 'text-ink-faint' : 'text-ink')}>{t(`apply.step.${s}` as TranslationKey)}</span>
          </>
        )
        return (
          <li key={s} aria-current={state === 'current' ? 'step' : undefined}>
            {state === 'done' ? (
              <button type="button" onClick={() => onGo(i)} className="flex w-full items-center gap-3 py-2 text-left hover:underline">
                {content}
              </button>
            ) : (
              <span className="flex items-center gap-3 py-2">{content}</span>
            )}
          </li>
        )
      })}
    </ol>
  )
}

function Choice({ legend, hint, name, value, options, onChange, error }: { legend: string; hint?: string; name: string; value: string; options: [string, string][]; onChange: (v: string) => void; error?: string }) {
  return (
    <fieldset aria-invalid={!!error} aria-describedby={error ? `${name}-err` : undefined}>
      <legend className="text-sm font-medium text-ink">
        {legend} <span className="text-danger">*</span>
      </legend>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {options.map(([v, label]) => (
          <label
            key={v}
            className={cn(
              'flex cursor-pointer items-center gap-3 border px-4 py-3 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
              value === v ? 'border-ink bg-subtle text-ink' : 'border-line-strong text-ink-body hover:border-ink',
            )}
          >
            <input type="radio" name={name} value={v} checked={value === v} onChange={() => onChange(v)} className="accent-[var(--color-ink)]" />
            {label}
          </label>
        ))}
      </div>
      {error && (
        <p id={`${name}-err`} className="mt-2 text-[13px] text-danger">
          {error}
        </p>
      )}
    </fieldset>
  )
}

function Review({ draft, onEdit }: { draft: Draft; onEdit: (s: Step) => void }) {
  const { t } = useI18n()
  const cat = draft.categoryKey === 'other' ? draft.categoryOther : draft.categoryKey ? t(`apply.cat.${draft.categoryKey}` as TranslationKey) : ''
  const sections: [Step, [TranslationKey, ReactNode][]][] = [
    ['business', [['apply.f.businessName', draft.businessName], ['apply.f.website', draft.website], ['apply.f.category', cat], ['apply.f.description', draft.description]]],
    ['location', [['apply.f.country', draft.country], ['apply.f.city', draft.city]]],
    [
      'contact',
      [
        ['apply.f.applicantName', draft.applicantName],
        ['apply.f.applicantRole', draft.applicantRole],
        ['apply.f.applicantEmail', draft.applicantEmail],
        ['apply.f.applicantPhone', draft.applicantPhone],
        ['apply.f.language', draft.language === 'pt' ? 'Português' : 'English'],
      ],
    ],
    [
      'catalogue',
      [
        ['apply.f.productCount', draft.productCount && t(`apply.count.${draft.productCount}` as TranslationKey)],
        ['apply.f.photoReadiness', draft.photoReadiness && t(`apply.photos.${draft.photoReadiness}` as TranslationKey)],
        ['apply.f.modelReadiness', draft.modelReadiness && t(`apply.models.${draft.modelReadiness}` as TranslationKey)],
        ['apply.f.notes', draft.notes],
      ],
    ],
  ]
  return (
    <div className="space-y-6">
      {sections.map(([s, rows]) => (
        <section key={s} className="border-t border-line pt-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-eyebrow text-ink">{t(`apply.step.${s}` as TranslationKey)}</h3>
            <button type="button" onClick={() => onEdit(s)} className="inline-flex items-center gap-1.5 text-[13px] text-accent-ink hover:underline">
              <Pencil className="size-3.5" aria-hidden /> {t('apply.edit')}
            </button>
          </div>
          <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-[180px_1fr]">
            {rows.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-xs text-ink-muted">{t(k)}</dt>
                <dd className="text-sm break-words whitespace-pre-line text-ink-body">{v || <span className="text-ink-faint">{t('apply.notGiven')}</span>}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  )
}

function Success({ done, onRestart }: { done: Done; onRestart: () => void }) {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(done.reference)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="mx-auto max-w-xl py-10 text-center">
      <div role="status">
        <CircleCheck className="mx-auto size-10 text-success" strokeWidth={1.4} aria-hidden />
        <h1 className="mt-6 text-headline">{t('apply.done.title')}</h1>
        <p className="mt-5 text-[15px] leading-7 text-ink-muted">{t('apply.done.body')}</p>
      </div>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <p className="text-label text-ink">{t('apply.done.reference', { ref: done.reference })}</p>
        <Button size="sm" onClick={() => void copy()} icon={copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}>
          {copied ? t('apply.done.copied') : t('apply.done.copy')}
        </Button>
      </div>
      <p className="mt-2 text-[13px] text-ink-muted">{t('apply.done.keepReference')}</p>
      <div className="mt-8 border border-line bg-surface p-6 text-left">
        <h2 className="font-display text-[1.4rem] leading-tight font-normal">{t('apply.done.nextTitle')}</h2>
        <ol className="mt-4 list-decimal space-y-2 pl-5 text-[15px] leading-7 text-ink-body">
          <li>{t('apply.done.next1')}</li>
          <li>{done.email ? t('apply.done.next2', { email: done.email }) : t('apply.done.next2NoEmail')}</li>
          <li>{t('apply.done.next3')}</li>
        </ol>
        {isDemoMode && (
          <InlineNotice tone="neutral" className="mt-5">
            {t('apply.done.demo')}
          </InlineNotice>
        )}
      </div>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-6">
        <Link to="/" className={cn(arrowLinkClasses, 'text-ink')}>
          {t('apply.done.home')} <ArrowRight className="size-3.5" aria-hidden />
        </Link>
        <button type="button" onClick={onRestart} className="text-sm text-ink-muted underline-offset-4 hover:underline">
          {t('apply.done.another')}
        </button>
      </div>
    </div>
  )
}
