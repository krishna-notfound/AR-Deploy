import { Loader2 } from 'lucide-react'
import type { ButtonHTMLAttributes, ComponentProps, ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '@/lib/cn'

export type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'brand'
export type ButtonSize = 'sm' | 'md' | 'lg'

const base =
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-control)] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55 select-none'

const variants: Record<ButtonVariant, string> = {
  // Obsidian is the default action (the references' dark, square button); bronze marks the one action that matters most.
  primary: 'bg-ink text-chalk hover:bg-umber',
  accent: 'bg-accent-bright text-ink hover:bg-limestone',
  // White, not chalk: safeBrandAccent guarantees 4.5:1 against white only.
  brand: 'bg-[var(--brand-accent)] text-white hover:brightness-110',
  secondary: 'bg-surface text-ink border border-line-strong hover:border-ink hover:bg-subtle',
  ghost: 'text-ink hover:bg-subtle',
  danger: 'bg-danger text-white hover:brightness-110',
}

// lg is the editorial call-to-action of the references: spaced uppercase label on a square button.
const sizes: Record<ButtonSize, string> = {
  // Touch screens get 44px-tall small buttons (DUX-10); desktop density is unchanged.
  sm: 'h-8 px-3 text-[13px] pointer-coarse:h-11',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-label uppercase',
}

export function buttonClasses(variant: ButtonVariant = 'secondary', size: ButtonSize = 'md', className?: string) {
  return cn(base, variants[variant], sizes[size], className)
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  icon?: ReactNode
}

export function Button({ variant = 'secondary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={buttonClasses(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : icon}
      {children}
    </button>
  )
}

interface ButtonLinkProps extends ComponentProps<typeof Link> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: ReactNode
}

export function ButtonLink({ variant = 'secondary', size = 'md', icon, className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClasses(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  'aria-label': string
  variant?: 'ghost' | 'secondary'
  size?: 'sm' | 'md'
}

/** The references' text link: spaced uppercase label, hairline underline, trailing arrow ("EXPLORAR COLEÇÕES →"). */
export const arrowLinkClasses =
  'group/arrow inline-flex items-center gap-3 border-b border-current pb-1.5 text-label uppercase transition-colors hover:text-accent-ink'

export function IconButton({ variant = 'ghost', size = 'md', className, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-[var(--radius-control)] text-ink-muted transition-colors hover:text-ink disabled:opacity-50',
        variant === 'ghost' ? 'hover:bg-subtle' : 'border border-line-strong bg-surface hover:bg-subtle',
        size === 'sm' ? 'size-8 pointer-coarse:size-11' : 'size-10',
        className,
      )}
      {...rest}
    />
  )
}
