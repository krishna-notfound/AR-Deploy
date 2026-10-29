import { ArrowLeft, ArrowRight, Pencil, RotateCw, Send } from 'lucide-react'
import { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Checkbox } from '@/components/ui/Form'
import { InlineNotice } from '@/components/ui/States'
import { type ApplyFormConfig, type ResolvedField, type ResolvedStep, resolveApplyForm } from '@/domain/siteContent'
import type { Lang } from '@/domain/types'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { translate } from '@/i18n/translate'
import { cn } from '@/lib/cn'
import { service } from '@/services'
import { validateApplication } from '../../../supabase/functions/_shared/application.ts'
import { rulesFromConfig } from '../../../supabase/functions/_shared/applyForm.ts'
import { AuthHeading, StepIndicator, authFieldsClass } from '../auth/AuthLayout'
import { TermsAgreement } from '../legal/LegalLinks'
import { ApplyDone, type Done } from './ApplyDone'
import { ApplyField, type FieldCtx, choiceLabel, isHalfWidth } from './ApplyFields'
import { type CustomValue, type Draft, emptyDraft, errorKeysOf, fitDraft, reviveDraft, toInput } from './applyDraft'
import { makeApplyTexts } from './applyText'

const DRAFT_KEY = 'sanctus:apply:draft'
/** Limits shown in the "too short" and "too long" messages. */
const LIMITS: Record<string, [number, number]> = { businessName: [2, 80], description: [20, 1000], category: [2, 80], country: [2, 80], city: [1, 80], applicantName: [2, 120], notes: [0, 1000], applicantRole: [0, 80], applicantPhone: [0, 50] }

/** Session-only draft: survives a refresh in this tab, never stored beyond it. */
function loadDraft(lang: Lang): { draft: Draft; step: string } | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as { draft?: Partial<Draft>; step?: unknown }
    return v.draft && typeof v.step === 'string' ? { draft: reviveDraft(v.draft, lang), step: v.step } : null
  } catch {
    return null
  }
}

/**
 * The confirmation lives in the history entry's state: a reload of the success page keeps it, while opening /apply
 * again (a link, a new visit) starts a fresh form.
 */
function doneFrom(state: unknown): Done | null {
  const v = (state as { applyDone?: Partial<Done> } | null)?.applyDone
  return v && typeof v.reference === 'string' ? { reference: v.reference, email: typeof v.email === 'string' ? v.email : '' } : null
}

export interface ApplyFormProps {
  /** The published form; null = nothing published, the built-in form. */
  config: ApplyFormConfig | null
  /** The published version the config comes from (0 = built-in). */
  version?: number
  /** Language of the form text. Default: the language of the app. The Editor's preview sets it. */
  lang?: Lang
  /** The Editor's preview: the step lives in state, nothing is stored, and nothing is sent. */
  preview?: boolean
  /** The server says the form was republished: reload it. The answers stay. */
  onStale?: () => void
}

/** The application wizard (heading, progress, steps, review, thank-you) for any form config. */
export function ApplyForm({ config, version = 0, lang, preview = false, onStale }: ApplyFormProps) {
  const { lang: appLang } = useI18n()
  const language = lang ?? appLang
  const tx = useMemo(() => makeApplyTexts(config, language), [config, language])
  const steps = useMemo(() => resolveApplyForm(config), [config])
  const rules = useMemo(() => rulesFromConfig(config, version), [config, version])

  const [initial] = useState(() => (preview ? null : loadDraft(language)))
  const [draft, setDraft] = useState<Draft>(() => initial?.draft ?? emptyDraft(language))
  // The answers that still fit the form (a removed option or question is dropped without touching what was typed).
  const eff = useMemo(() => fitDraft(draft, config), [draft, config])
  // The step lives in the URL (?step=<id>), one history entry per step, so the browser Back button goes to the previous step.
  const [params, setParams] = useSearchParams()
  const [previewStep, setPreviewStep] = useState<string | null>(null)
  const urlStep = preview ? previewStep : params.get('step')
  const step: ResolvedStep = steps.find((s) => s.id === urlStep) ?? steps[0]!
  const idx = steps.indexOf(step)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const location = useLocation()
  const [done, setDone] = useState<Done | null>(() => (preview ? null : doneFrom(location.state)))
  const [honeypot, setHoneypot] = useState('')
  const headingRef = useRef<HTMLHeadingElement>(null)
  const shownStep = useRef(step.id)

  // A refresh (or coming back to /apply in this tab) resumes the saved step without adding a history entry.
  useEffect(() => {
    if (preview || params.get('step') || !initial || initial.step === steps[0]!.id || !steps.some((s) => s.id === initial.step)) return
    setParams({ step: initial.step }, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Every step change (the wizard's buttons or the browser's Back/Forward) moves focus to the step heading.
  useEffect(() => {
    if (shownStep.current === step.id) return
    shownStep.current = step.id
    setSubmitError(null)
    requestAnimationFrame(() => headingRef.current?.focus())
  }, [step.id])

  useEffect(() => {
    if (preview || done) return
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ draft, step: step.id }))
    } catch {
      // storage unavailable: the form still works, it just won't survive a refresh
    }
  }, [draft, step.id, done, preview])

  const set: FieldCtx['set'] = (k, v) => {
    setDraft((d) => ({ ...d, [k]: v }))
    setErrors((e) => {
      const { [k as string]: _, ...rest } = e
      if (k === 'categoryKey' || k === 'categoryOther') delete rest.category
      return rest
    })
  }
  const setCustom: FieldCtx['setCustom'] = (id, v) => {
    setDraft((d) => {
      const custom: Record<string, CustomValue> = { ...d.custom }
      if (v === undefined) delete custom[id]
      else custom[id] = v
      return { ...d, custom }
    })
    setErrors((e) => {
      const { [`custom.${id}`]: _, ...rest } = e
      return rest
    })
  }

  const message = (field: string, code: string): string => {
    if (field === 'custom') return tx.text('apply.failed')
    const q = field.startsWith('custom.') ? config?.customQuestions.find((x) => `custom.${x.id}` === field) : undefined
    const [min, max] = q ? [0, q.type === 'short_text' ? 200 : 1000] : (LIMITS[field] ?? [0, 0])
    return tx.text(`apply.err.${code}` as TranslationKey, { min, max })
  }

  /** Errors of the given steps only, as translated messages. */
  const stepErrors = (targets: ResolvedStep[]): Record<string, string> => {
    const review = targets.some((s) => s.builtin === 'review')
    const v = validateApplication({ ...toInput(eff), consent: review ? eff.consent : true, acceptedTerms: review ? eff.acceptedTerms : true }, rules)
    if (v.ok) return {}
    const own = new Set(targets.flatMap(errorKeysOf))
    return Object.fromEntries(Object.entries(v.errors).filter(([f]) => own.has(f)).map(([f, c]) => [f, message(f, c)]))
  }
  const firstWithErrors = (errs: Record<string, string>): ResolvedStep | undefined => steps.find((s) => s.builtin !== 'review' && errorKeysOf(s).some((k) => errs[k]))

  const go = (to: ResolvedStep) => {
    if (to.id === step.id) return
    if (preview) setPreviewStep(to.id)
    else setParams(to.id === steps[0]!.id ? {} : { step: to.id })
  }

  const next = (e: FormEvent) => {
    e.preventDefault()
    const errs = stepErrors([step])
    setErrors(errs)
    if (Object.keys(errs).length) return
    go(steps[idx + 1]!)
  }

  // The form was republished since the page loaded: after the reload, show what no longer fits (the answers are kept).
  useEffect(() => {
    if (!stale) return
    const errs = stepErrors(steps)
    setErrors(errs)
    const first = firstWithErrors(errs)
    if (first) go(first)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (submitting || preview) return
    const all = stepErrors(steps)
    setErrors(all)
    if (Object.keys(all).length) {
      const first = firstWithErrors(all)
      if (first) go(first)
      return
    }
    setSubmitting(true)
    setSubmitError(null)
    const res = await service.submitApplication({ ...toInput(eff), ...(honeypot ? { hp: honeypot } : {}) } as Parameters<typeof service.submitApplication>[0])
    setSubmitting(false)
    if (res.ok) {
      try {
        sessionStorage.removeItem(DRAFT_KEY)
      } catch {
        // ignore
      }
      const confirmation = { reference: res.data.reference, email: eff.applicantEmail.trim() }
      setDone(confirmation)
      setParams({}, { replace: true, state: { applyDone: confirmation } })
      window.scrollTo({ top: 0 })
      return
    }
    if (res.error.code === 'CONFLICT' && res.error.reason === 'form_changed') {
      setStale(true)
      const errs = stepErrors(steps)
      setErrors(errs)
      onStale?.()
      return
    }
    if (res.error.code === 'VALIDATION' && res.error.fieldErrors) {
      const errs = Object.fromEntries(Object.entries(res.error.fieldErrors).map(([f, c]) => [f, typeof c === 'string' ? message(f, c) : translate(language, c.key, c.vars)]))
      setErrors(errs)
      const first = firstWithErrors(errs)
      if (first) go(first)
      return
    }
    setSubmitError(res.error.code === 'RATE_LIMITED' ? tx.text('apply.rateLimited') : res.error.code === 'CONFLICT' ? tx.text('apply.duplicate') : tx.text('apply.failed'))
  }

  const ctx: FieldCtx = { draft: eff, config, tx, errors, set, setCustom }
  const isReview = step.builtin === 'review'
  const stepHasErrors = !isReview && errorKeysOf(step).some((k) => errors[k])
  const sendLabel = preview ? translate(language, 'applications.apply.preview') : submitError ? tx.text('apply.retry') : tx.text('apply.submit')

  if (done) {
    return (
      <ApplyDone
        done={done}
        tx={tx}
        onRestart={() => {
          setParams({}, { replace: true, state: null })
          setDraft(emptyDraft(language))
          setErrors({})
          setStale(false)
          setDone(null)
        }}
      />
    )
  }

  return (
    <div lang={language}>
      <AuthHeading eyebrow={tx.text('apply.eyebrow')} title={tx.text('apply.title')}>
        <p>{tx.text('apply.intro')}</p>
      </AuthHeading>
      <StepIndicator className="mt-10" label={tx.text('apply.progress')} current={idx} steps={steps.map((s) => tx.stepTitle(s))} onGo={(i) => i < idx && go(steps[i]!)} compactLabels />

      <form onSubmit={isReview ? submit : next} noValidate className={cn('mt-10 min-w-0', authFieldsClass)}>
        {stale && (
          <InlineNotice tone="warning" className="mb-6">
            <span role="alert">{translate(language, 'applications.apply.formChanged')}</span>
          </InlineNotice>
        )}
        <p className="text-label text-ink-muted">{tx.text('apply.stepOf', { n: idx + 1, total: steps.length })}</p>
        <h2 ref={headingRef} tabIndex={-1} className="mt-3 font-display text-[1.9rem] leading-tight font-normal outline-none">
          {tx.stepTitle(step)}
        </h2>
        {tx.stepHint(step) && <p className="mt-2 text-sm text-ink-muted">{tx.stepHint(step)}</p>}

        {/* Honeypot: invisible to people, tempting to bots. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-px w-px overflow-hidden">
          <label>
            Company fax
            <input tabIndex={-1} autoComplete="off" value={honeypot} onChange={(e) => setHoneypot(e.target.value)} />
          </label>
        </div>

        <div className="mt-8">
          {isReview ? (
            <div className="space-y-5">
              <Review steps={steps} ctx={ctx} onEdit={go} />
              <Checkbox label={tx.text('apply.f.consent')} checked={draft.consent} onChange={(e) => set('consent', e.target.checked)} aria-invalid={!!errors.consent} />
              {errors.consent && <p className="text-[13px] text-danger">{errors.consent}</p>}
              <TermsAgreement checked={!!draft.acceptedTerms} onChange={(v) => set('acceptedTerms', v)} error={errors.acceptedTerms} />
              {submitError && (
                <InlineNotice tone="warning">
                  <span role="alert">{submitError}</span>
                </InlineNotice>
              )}
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2">
              {step.fields.map((f) => (
                <div key={f.key} className={cn('min-w-0', !isHalfWidth(f) && 'sm:col-span-2')}>
                  <ApplyField field={f} ctx={ctx} />
                </div>
              ))}
            </div>
          )}
        </div>

        {stepHasErrors && (
          <p role="alert" className="mt-6 text-[13px] text-danger">
            {tx.text('apply.fixFields')}
          </p>
        )}

        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
          {idx > 0 ? (
            <Button size="lg" onClick={() => go(steps[idx - 1]!)} icon={<ArrowLeft className="size-4" aria-hidden />}>
              {tx.text('apply.back')}
            </Button>
          ) : (
            <span />
          )}
          {isReview ? (
            <Button type="submit" variant="primary" size="lg" loading={submitting} icon={submitError ? <RotateCw className="size-4" aria-hidden /> : <Send className="size-4" aria-hidden />}>
              {sendLabel}
            </Button>
          ) : (
            <Button type="submit" variant="primary" size="lg">
              {tx.text('apply.next')} <ArrowRight className="size-4" aria-hidden />
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}

/** What the visitor entered, by step, with an Edit link for each. Hidden fields do not appear; an empty one says "not given". */
function Review({ steps, ctx, onEdit }: { steps: ResolvedStep[]; ctx: FieldCtx; onEdit: (s: ResolvedStep) => void }) {
  const { tx } = ctx
  return (
    <div className="space-y-6">
      {steps
        .filter((s) => s.builtin !== 'review')
        .map((s) => (
          <section key={s.id} className="border-t border-line pt-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-eyebrow text-ink">{tx.stepTitle(s)}</h3>
              <button type="button" onClick={() => onEdit(s)} className="inline-flex items-center gap-1.5 text-[13px] text-accent-ink hover:underline">
                <Pencil className="size-3.5" aria-hidden /> {tx.text('apply.edit')}
              </button>
            </div>
            <dl className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-[180px_1fr]">
              {s.fields.map((f) => (
                <div key={f.key} className="contents">
                  <dt className="text-xs text-ink-muted">{f.question ? tx.question(f.question) : tx.text(`apply.f.${f.key}` as TranslationKey)}</dt>
                  <dd className="text-sm break-words whitespace-pre-line text-ink-body">{answerOf(f, ctx) || <span className="text-ink-faint">{tx.text('apply.notGiven')}</span>}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
    </div>
  )
}

/** The entered value of a field as text for the review ('' = not given). */
function answerOf(f: ResolvedField, { draft: d, tx }: FieldCtx): ReactNode {
  if (f.question) {
    const q = f.question
    const v = d.custom[q.id]
    if (v === undefined) return ''
    if (typeof v === 'boolean') return translate(tx.lang, v ? 'common.yes' : 'common.no')
    const labelOf = (id: string) => tx.local(q.options?.find((o) => o.id === id)?.label)
    return Array.isArray(v) ? v.map(labelOf).join(', ') : q.type === 'single_choice' ? labelOf(v) : v
  }
  switch (f.key) {
    case 'businessName': return d.businessName
    case 'website': return d.website
    case 'category': return d.categoryKey === 'other' ? d.categoryOther : d.categoryKey ? choiceLabel('category', d.categoryKey, tx) : ''
    case 'description': return d.description
    case 'country': return d.country
    case 'city': return d.city
    case 'applicantName': return d.applicantName
    case 'applicantRole': return d.applicantRole
    case 'applicantEmail': return d.applicantEmail
    case 'applicantPhone': return d.applicantPhone
    case 'language': return d.language === 'pt' ? 'Português' : 'English'
    case 'productCount': return d.productCount && choiceLabel('productCount', d.productCount, tx)
    case 'photoReadiness': return d.photoReadiness && choiceLabel('photoReadiness', d.photoReadiness, tx)
    case 'modelReadiness': return d.modelReadiness && choiceLabel('modelReadiness', d.modelReadiness, tx)
    case 'notes': return d.notes
    default: return ''
  }
}
