import { AlertCircle, ChevronDown } from 'lucide-react'
import {
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
  createContext,
  useContext,
  useId,
} from 'react'
import { useInDashboard } from '@/components/layout/dashboardContext'
import { cn } from '@/lib/cn'

interface FieldCtx {
  id: string
  describedBy?: string
  invalid: boolean
}
const FieldContext = createContext<FieldCtx | null>(null)

export function useFieldProps() {
  const ctx = useContext(FieldContext)
  if (!ctx) return {}
  return { id: ctx.id, 'aria-describedby': ctx.describedBy, 'aria-invalid': ctx.invalid || undefined }
}

export function FormField({
  label,
  hint,
  error,
  required,
  optional,
  children,
  className,
  id: idProp,
  aside,
}: {
  label: ReactNode
  hint?: ReactNode
  error?: string
  required?: boolean
  /** Marks the field optional; pass the translated word on public pages (dashboards are English-only). */
  optional?: boolean | string
  children: ReactNode
  className?: string
  id?: string
  /** Control shown at the end of the label row (e.g. a language toggle). */
  aside?: ReactNode
}) {
  const auto = useId()
  const dash = useInDashboard()
  const id = idProp ?? `f${auto}`
  // The error replaces the hint, so only a rendered paragraph may be referenced.
  const hintId = hint && !error ? `${id}-hint` : undefined
  const errId = error ? `${id}-err` : undefined
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined
  return (
    <FieldContext.Provider value={{ id, describedBy, invalid: !!error }}>
      <div className={cn('flex flex-col', dash ? 'gap-2' : 'gap-1.5', className)} data-field-error={error ? 'true' : undefined}>
        <div className="flex min-h-5 items-end justify-between gap-3">
          {dash ? (
            <label htmlFor={id} className="text-ui-body font-medium text-ink">
              {label}
              {required && <span className="font-normal text-ink-muted"> Required</span>}
              {optional && <span className="font-normal text-ink-muted"> {typeof optional === 'string' ? optional : 'Optional'}</span>}
            </label>
          ) : (
            <label htmlFor={id} className="text-[13px] font-medium text-ink">
              {label}
              {required && <span className="text-danger"> *</span>}
              {optional && <span className="font-normal text-ink-faint"> ({typeof optional === 'string' ? optional : 'optional'})</span>}
            </label>
          )}
          {aside}
        </div>
        {children}
        {hint && !error && (
          <p id={hintId} className={dash ? '-mt-0.5 text-ui-small text-ink-muted' : 'text-xs text-ink-muted'}>
            {hint}
          </p>
        )}
        {error &&
          (dash ? (
            <p id={errId} className="-mt-0.5 flex items-start gap-1.5 text-ui-small text-danger">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {error}
            </p>
          ) : (
            <p id={errId} className="text-xs font-medium text-danger">
              {error}
            </p>
          ))}
      </div>
    </FieldContext.Provider>
  )
}

const controlBase =
  'w-full rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 text-ink placeholder:text-ink-faint transition-colors hover:border-ink-faint focus-visible:outline-2 focus-visible:outline-offset-0 aria-[invalid=true]:border-danger disabled:bg-subtle disabled:text-ink-muted'
const control = `${controlBase} text-sm focus-visible:border-accent`
// Dashboard: Inter 16px under sm (iOS does not zoom on focus), 14px from sm; the focus ring is ink (BRIEF section 6).
const controlDash = `${controlBase} text-[16px] sm:text-[14px] focus-visible:border-ink focus-visible:outline-ink`
const useControl = () => (useInDashboard() ? controlDash : control)

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  const field = useFieldProps()
  const c = useControl()
  return <input className={cn(c, 'h-10', className)} {...field} {...rest} />
}

export function Textarea({ className, rows = 4, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const field = useFieldProps()
  const c = useControl()
  return <textarea rows={rows} className={cn(c, 'py-2 leading-6', className)} {...field} {...rest} />
}

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  const field = useFieldProps()
  const c = useControl()
  return (
    <div className={cn('relative', className)}>
      <select className={cn(c, 'h-10 appearance-none pr-9')} {...field} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
    </div>
  )
}

export function InputAddon({ children, addon, side = 'left' }: { children: ReactNode; addon: ReactNode; side?: 'left' | 'right' }) {
  const text = useInDashboard() ? 'text-ui-body' : 'text-sm'
  return (
    <div className="flex">
      {side === 'left' && (
        <span className={`inline-flex items-center rounded-l-[var(--radius-control)] border border-r-0 border-line-strong bg-subtle px-3 ${text} text-ink-muted`}>
          {addon}
        </span>
      )}
      <div className={cn('flex-1 [&_input]:rounded-none', side === 'left' ? '[&_input]:rounded-r-[var(--radius-control)]' : '[&_input]:rounded-l-[var(--radius-control)]')}>
        {children}
      </div>
      {side === 'right' && (
        <span className={`inline-flex items-center rounded-r-[var(--radius-control)] border border-l-0 border-line-strong bg-subtle px-3 ${text} text-ink-muted`}>
          {addon}
        </span>
      )}
    </div>
  )
}

export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  label: ReactNode
  description?: ReactNode
  disabled?: boolean
}) {
  const id = useId()
  const dash = useInDashboard()
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className={cn('font-medium text-ink', dash ? 'text-ui-body' : 'text-sm')}>
          {label}
        </label>
        {description && <p className={cn('text-ink-muted', dash ? 'text-ui-small' : 'text-xs')}>{description}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors disabled:opacity-50',
          checked ? 'bg-accent' : 'bg-line-strong',
        )}
      >
        <span className={cn('inline-block size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-[18px]' : 'translate-x-0.5')} />
      </button>
    </div>
  )
}

export function Checkbox({ label, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  const dash = useInDashboard()
  return (
    <label className={cn('inline-flex items-center gap-2 text-ink', dash ? 'text-ui-body' : 'text-sm', className)}>
      <input type="checkbox" className="size-4 rounded border-line-strong accent-[var(--color-accent)]" {...rest} />
      {label}
    </label>
  )
}

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  label,
  size = 'md',
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode }[]
  label: string
  size?: 'sm' | 'md'
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-[var(--radius-control)] bg-subtle p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-[6px] font-medium transition-colors',
            size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
            'pointer-coarse:h-10 pointer-coarse:min-w-10', // 44px with the track's padding on touch screens (DUX-10)
            value === o.value ? 'bg-surface text-ink shadow-[var(--shadow-card)]' : 'text-ink-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
