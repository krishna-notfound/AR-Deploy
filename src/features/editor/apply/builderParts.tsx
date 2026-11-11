// Small pieces shared by the builder cards: the typing-language context, one editable text in place, the lock note, error text.
import { Lock } from 'lucide-react'
import { type PointerEvent as ReactPointerEvent, type ReactNode, createContext, useContext } from 'react'
import type { MenuHeading, MenuItem } from '@/components/ui/Menu'
import type { ApplyFormConfig, ContentErrors, CustomQuestionType, Lang } from '@/domain/siteContent'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'

/** The text of a validation error for a document path (the validator gives a code; this is its sentence). */
export function useErrorText() {
  const { t } = useI18n()
  return (errors: ContentErrors, path: string): string | undefined => {
    const code = errors[path]
    return code ? t(`editor.err.${code}` as TranslationKey) : undefined
  }
}

/** What every card of the builder shares: the document, how to change it, and which language is being typed. */
export interface BuilderContextValue {
  config: ApplyFormConfig
  onChange: (next: ApplyFormConfig) => void
  errors: ContentErrors
  /** The language being typed (the EN | PT switch at the top). */
  lang: Lang
  setLang: (lang: Lang) => void
  /** The one question card that is open in place (`businessName`, `custom:<id>`), or null. */
  openKey: string | null
  setOpenKey: (key: string | null) => void
  /** Asks for a card to be scrolled to and its first field (or the first with a problem) focused. */
  requestFocus: (card: string, opts?: { select?: boolean }) => void
}
/** A request to focus a card; `nonce` tells a new request from one already carried out. */
export interface FocusRequest {
  card: string
  select: boolean
  nonce: number
}
export const BuilderContext = createContext<BuilderContextValue | null>(null)
export function useBuilder(): BuilderContextValue {
  const ctx = useContext(BuilderContext)
  if (!ctx) throw new Error('useBuilder must be used inside the application form builder')
  return ctx
}

/** The error for a text at `base` in the language being typed; a problem in the other language is named by its language. */
export function useLangError() {
  const errorText = useErrorText()
  const { errors, lang } = useBuilder()
  return (base: string): string | undefined => {
    const other: Lang = lang === 'en' ? 'pt' : 'en'
    const here = errorText(errors, `${base}.${lang}`)
    if (here) return here
    const there = errorText(errors, `${base}.${other}`)
    return there ? `${LANG_NAMES[other]}: ${there}` : undefined
  }
}

/** A `{ en, pt? }` pair with one language changed: an empty Portuguese text is removed (the form then shows English). */
export function withLang<T extends { en: string; pt?: string }>(v: T, lang: Lang, text: string): T {
  const next = { ...v }
  if (lang === 'en') next.en = text
  else if (text) next.pt = text
  else delete next.pt
  return next
}

/** What the cards need from the list they sit in: moving, dragging, focusing and the add bar. */
export interface CardsContextValue {
  /** Moves a card one place inside its section (`up`/`down`). */
  move: (key: string, act: 'up' | 'down') => void
  moveTo: (key: string, stepId: string) => void
  /** Tells screen readers a section moved. */
  announceSection: (position: number, total: number) => void
  startDrag: (e: ReactPointerEvent<HTMLElement>, key: string) => void
  drag: { key: string; stepId: string | null; index: number; dy: number } | null
  /** Scrolls to a card and focuses its first field (or the first one with a problem). */
  focusCard: BuilderContextValue['requestFocus']
  /** The floating add bar, drawn next to the open card on a wide screen. */
  addBar: ReactNode
  addQuestionBelow: (type: CustomQuestionType) => void
  /** Adds a question at the end of one section and opens it (the section menu and an empty section's note). */
  addQuestionIn: (stepId: string, type: CustomQuestionType) => void
  /** The Add question menu for one section: the kinds, then the deleted standard questions to restore there. */
  questionMenu: (stepId: string) => (MenuItem | MenuHeading | 'separator')[]
  questionsFull: boolean
}
export const CardsContext = createContext<CardsContextValue | null>(null)
export function useCards(): CardsContextValue {
  const ctx = useContext(CardsContext)
  if (!ctx) throw new Error('useCards must be used inside the application form builder')
  return ctx
}

/** The lock icon with the reason a field cannot be changed. */
export function LockNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn('flex items-start gap-1.5 text-ui-small text-ink-muted', className)}>
      <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

export const LANG_NAMES: Record<Lang, string> = { en: 'English', pt: 'Português' }

const SIZES = {
  /** The form title and section titles: serif, large. */
  title: 'font-display text-[1.5rem] leading-tight',
  /** A question's wording. */
  question: 'text-[16px] leading-snug font-medium',
  /** A description or any other text (16px on phones so iOS does not zoom into the field). */
  plain: 'text-[16px] leading-normal sm:text-[0.875rem]',
} as const

/**
 * One text edited in place, in the language being typed: no box until it is hovered or focused, like a Google Forms
 * question. An empty field shows `placeholder` greyed (the original wording, or the English text for Portuguese).
 * `name` names the field for screen readers; the language is added to it.
 */
export function LangField({
  name,
  lang,
  value,
  onChange,
  placeholder,
  error,
  multiline = false,
  maxLength,
  size = 'plain',
  className,
  inputRef,
  focusMark = false,
}: {
  name: string
  lang: Lang
  value: string
  onChange: (text: string) => void
  placeholder?: string
  error?: string
  multiline?: boolean
  maxLength?: number
  size?: keyof typeof SIZES
  className?: string
  inputRef?: (el: HTMLInputElement | HTMLTextAreaElement | null) => void
  /** Marks the field the card focuses first. */
  focusMark?: boolean
}) {
  const shared = {
    'data-autofocus': focusMark ? '' : undefined,
    lang,
    'aria-label': `${name} (${LANG_NAMES[lang]})`,
    'aria-invalid': error ? true : undefined,
    value,
    placeholder,
    maxLength,
    'data-field-error': error ? 'true' : undefined,
    className: cn(
      // Quiet by default (a baseline line shows on hover and focus); a problem keeps its line in the danger colour.
      'block w-full rounded-[var(--radius-control)] border-0 border-b bg-transparent px-1 py-1.5 pointer-coarse:min-h-11 text-ink placeholder:text-ink-faint transition-colors focus:outline-none',
      error ? 'border-danger' : 'border-transparent hover:border-line-strong focus:border-ink',
      SIZES[size],
      className,
    ),
  }
  return (
    <div className="min-w-0">
      {multiline ? (
        // field-sizing grows the box with its text where the browser supports it; rows is the fallback.
        <textarea rows={2} ref={inputRef} {...shared} className={cn(shared.className, 'resize-none [field-sizing:content]')} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input type="text" ref={inputRef} {...shared} onChange={(e) => onChange(e.target.value)} />
      )}
      {error && <p className="px-1 pt-1 text-ui-small text-danger">{error}</p>}
    </div>
  )
}
