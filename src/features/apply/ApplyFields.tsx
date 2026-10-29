// One field of the application form: the built-in fields and the client's questions, by placement. Used by the wizard.
import type { ReactNode } from 'react'
import { FormField, Input, Select, Textarea } from '@/components/ui/Form'
import type { ApplyFormConfig, CustomQuestion, ResolvedField } from '@/domain/siteContent'
import type { Lang } from '@/domain/types'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { translate } from '@/i18n/translate'
import { cn } from '@/lib/cn'
import { BUILTIN_FIELDS } from '../../../supabase/functions/_shared/applyForm.ts'
import type { ApplyTexts } from './applyText'
import type { CustomValue, Draft } from './applyDraft'

/** Short inputs sit two to a row from `sm`; the rest take the full width. */
const HALF = new Set(['country', 'city', 'applicantName', 'applicantRole', 'applicantEmail', 'applicantPhone'])
export const isHalfWidth = (f: ResolvedField): boolean => HALF.has(f.key)

const visibleOptions = (field: 'category' | 'productCount' | 'photoReadiness' | 'modelReadiness', config: ApplyFormConfig | null): string[] =>
  [...(BUILTIN_FIELDS[field].options ?? [])].filter((v) => !config?.hiddenOptions?.[field]?.includes(v))

const OPTION_KEY = { category: 'apply.cat', productCount: 'apply.count', photoReadiness: 'apply.photos', modelReadiness: 'apply.models' } as const

export interface FieldCtx {
  draft: Draft
  config: ApplyFormConfig | null
  tx: ApplyTexts
  errors: Record<string, string>
  set: <K extends keyof Draft>(k: K, v: Draft[K]) => void
  setCustom: (id: string, v: CustomValue | undefined) => void
}

/** The label of a stored choice value in the visitor's language (the original text, or the Editor's override). */
export function choiceLabel(field: keyof typeof OPTION_KEY, value: string, tx: ApplyTexts): string {
  return tx.text(`${OPTION_KEY[field]}.${value}` as TranslationKey)
}

export function ApplyField({ field, ctx }: { field: ResolvedField; ctx: FieldCtx }) {
  const { draft, tx, errors, set } = ctx
  const optional = field.required ? undefined : tx.text('apply.optional')
  const req = field.required
  if (field.question) return <QuestionField q={field.question} required={req} ctx={ctx} />
  const label = (k: string) => tx.text(`apply.f.${k}` as TranslationKey)
  const key = field.key as Exclude<ResolvedField['key'], `custom:${string}`>

  switch (key) {
    case 'businessName':
      return (
        <FormField label={label(key)} required={req} error={errors.businessName}>
          <Input value={draft.businessName} maxLength={80} autoComplete="organization" onChange={(e) => set('businessName', e.target.value)} />
        </FormField>
      )
    case 'website':
      return (
        <FormField label={label(key)} required={req} optional={optional} hint={tx.text('apply.f.website.hint')} error={errors.website}>
          <Input value={draft.website} inputMode="url" autoComplete="url" placeholder="www.example.com" onChange={(e) => set('website', e.target.value)} />
        </FormField>
      )
    case 'category': {
      const options = visibleOptions('category', ctx.config)
      return (
        <>
          <FormField label={label(key)} required={req} optional={optional} error={errors.category && draft.categoryKey !== 'other' ? errors.category : undefined}>
            <Select value={draft.categoryKey} onChange={(e) => set('categoryKey', e.target.value)}>
              <option value="">{tx.text('apply.choose')}</option>
              {options.map((c) => (
                <option key={c} value={c}>
                  {choiceLabel('category', c, tx)}
                </option>
              ))}
            </Select>
          </FormField>
          {draft.categoryKey === 'other' && (
            <FormField label={tx.text('apply.f.categoryOther')} required error={errors.category} className="mt-5">
              <Input value={draft.categoryOther} maxLength={80} onChange={(e) => set('categoryOther', e.target.value)} />
            </FormField>
          )}
        </>
      )
    }
    case 'description':
      return (
        <FormField label={label(key)} required={req} optional={optional} hint={tx.text('apply.f.description.hint', { n: draft.description.trim().length })} error={errors.description}>
          <Textarea rows={5} maxLength={1000} value={draft.description} onChange={(e) => set('description', e.target.value)} />
        </FormField>
      )
    case 'country':
      return (
        <FormField label={label(key)} required={req} optional={optional} error={errors.country}>
          <Input value={draft.country} maxLength={80} autoComplete="country-name" onChange={(e) => set('country', e.target.value)} />
        </FormField>
      )
    case 'city':
      return (
        <FormField label={label(key)} required={req} optional={optional} error={errors.city}>
          <Input value={draft.city} maxLength={80} autoComplete="address-level2" onChange={(e) => set('city', e.target.value)} />
        </FormField>
      )
    case 'applicantName':
      return (
        <FormField label={label(key)} required={req} error={errors.applicantName}>
          <Input value={draft.applicantName} maxLength={120} autoComplete="name" onChange={(e) => set('applicantName', e.target.value)} />
        </FormField>
      )
    case 'applicantRole':
      return (
        <FormField label={label(key)} required={req} optional={optional} error={errors.applicantRole}>
          <Input value={draft.applicantRole} maxLength={80} autoComplete="organization-title" onChange={(e) => set('applicantRole', e.target.value)} />
        </FormField>
      )
    case 'applicantEmail':
      return (
        <FormField label={label(key)} required={req} hint={tx.text('apply.f.applicantEmail.hint')} error={errors.applicantEmail}>
          <Input type="email" value={draft.applicantEmail} maxLength={320} autoComplete="email" onChange={(e) => set('applicantEmail', e.target.value)} />
        </FormField>
      )
    case 'applicantPhone':
      return (
        <FormField label={label(key)} required={req} optional={optional} error={errors.applicantPhone}>
          <Input type="tel" value={draft.applicantPhone} maxLength={50} autoComplete="tel" onChange={(e) => set('applicantPhone', e.target.value)} />
        </FormField>
      )
    case 'language':
      return (
        <ChoiceGroup
          legend={label(key)}
          name="language"
          required
          value={draft.language}
          options={[
            ['en', 'English'],
            ['pt', 'Português'],
          ]}
          onChange={(v) => set('language', v as Lang)}
          error={errors.language}
        />
      )
    case 'productCount':
    case 'photoReadiness':
    case 'modelReadiness':
      return (
        <ChoiceGroup
          legend={label(key)}
          hint={key === 'modelReadiness' ? tx.text('apply.f.modelReadiness.hint') : undefined}
          name={key}
          required={req}
          optionalLabel={optional}
          value={draft[key]}
          options={visibleOptions(key, ctx.config).map((v) => [v, choiceLabel(key, v, tx)])}
          onChange={(v) => set(key, v)}
          error={errors[key]}
        />
      )
    case 'notes':
      return (
        <FormField label={label(key)} required={req} optional={optional} error={errors.notes}>
          <Textarea rows={3} maxLength={1000} value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
        </FormField>
      )
  }
}

function QuestionField({ q, required, ctx }: { q: CustomQuestion; required: boolean; ctx: FieldCtx }) {
  const { tx, errors, draft, setCustom } = ctx
  const label = tx.question(q)
  const hint = q.help ? tx.local(q.help) : undefined
  const error = errors[`custom.${q.id}`]
  const optional = required ? undefined : tx.text('apply.optional')
  const value = draft.custom[q.id]
  const yes = translate(tx.lang, 'common.yes')
  const no = translate(tx.lang, 'common.no')

  if (q.type === 'short_text')
    return (
      <FormField label={label} required={required} optional={optional} hint={hint} error={error}>
        <Input value={typeof value === 'string' ? value : ''} maxLength={200} onChange={(e) => setCustom(q.id, e.target.value)} />
      </FormField>
    )
  if (q.type === 'long_text')
    return (
      <FormField label={label} required={required} optional={optional} hint={hint} error={error}>
        <Textarea rows={4} maxLength={1000} value={typeof value === 'string' ? value : ''} onChange={(e) => setCustom(q.id, e.target.value)} />
      </FormField>
    )
  if (q.type === 'yes_no')
    return (
      <ChoiceGroup
        legend={label}
        hint={hint}
        name={`q-${q.id}`}
        required={required}
        optionalLabel={optional}
        value={value === true ? 'yes' : value === false ? 'no' : ''}
        options={[
          ['yes', yes],
          ['no', no],
        ]}
        onChange={(v) => setCustom(q.id, v === 'yes')}
        error={error}
      />
    )
  const options: [string, string][] = (q.options ?? []).map((o) => [o.id, tx.local(o.label)])
  if (q.type === 'single_choice')
    return (
      <ChoiceGroup legend={label} hint={hint} name={`q-${q.id}`} required={required} optionalLabel={optional} value={typeof value === 'string' ? value : ''} options={options} onChange={(v) => setCustom(q.id, v)} error={error} />
    )
  const chosen = Array.isArray(value) ? value : []
  return (
    <ChoiceGroup
      legend={label}
      hint={hint}
      name={`q-${q.id}`}
      required={required}
      optionalLabel={optional}
      multiple
      values={chosen}
      options={options}
      onToggle={(id, on) => {
        const next = on ? [...chosen, id] : chosen.filter((x) => x !== id)
        setCustom(q.id, next.length ? next : undefined)
      }}
      error={error}
    />
  )
}

/** A group of radio buttons (or checkboxes with `multiple`) in the form's boxed style. */
export function ChoiceGroup(
  props: {
    legend: ReactNode
    hint?: string
    name: string
    required?: boolean
    /** Shown instead of the required star when the field is optional. */
    optionalLabel?: string
    options: [string, string][]
    error?: string
  } & ({ multiple?: false; value: string; onChange: (v: string) => void } | { multiple: true; values: string[]; onToggle: (id: string, on: boolean) => void }),
) {
  const { legend, hint, name, required, optionalLabel, options, error } = props
  const errId = `${name}-err`
  return (
    <fieldset aria-invalid={!!error} aria-describedby={error ? errId : undefined}>
      <legend className="text-sm font-medium text-ink">
        {legend}
        {required && <span className="text-danger"> *</span>}
        {!required && optionalLabel && <span className="font-normal text-ink-faint"> ({optionalLabel})</span>}
      </legend>
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {options.map(([v, label]) => {
          const on = props.multiple ? props.values.includes(v) : props.value === v
          return (
            <label
              key={v}
              className={cn(
                'flex cursor-pointer items-center gap-3 border px-4 py-3 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent',
                on ? 'border-ink bg-subtle text-ink' : 'border-line-strong text-ink-body hover:border-ink',
              )}
            >
              {props.multiple ? (
                <input type="checkbox" name={name} value={v} checked={on} onChange={(e) => props.onToggle(v, e.target.checked)} className="accent-[var(--color-ink)]" />
              ) : (
                <input type="radio" name={name} value={v} checked={on} onChange={() => props.onChange(v)} className="accent-[var(--color-ink)]" />
              )}
              {label}
            </label>
          )
        })}
      </div>
      {error && (
        <p id={errId} className="mt-2 text-[13px] text-danger">
          {error}
        </p>
      )}
    </fieldset>
  )
}

