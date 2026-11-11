import { AlignLeft, CircleDot, SquareCheck, ToggleLeft, Type } from 'lucide-react'
import type { ComponentType } from 'react'
import type { CustomQuestionType } from '@/domain/siteContent'
import type { TranslationKey } from '@/i18n/dictionaries/en'

/** The kinds of own question, with the icon the kind menus show. */
export const QUESTION_KINDS: { type: CustomQuestionType; icon: ComponentType<{ className?: string; 'aria-hidden'?: boolean }> }[] = [
  { type: 'short_text', icon: Type },
  { type: 'long_text', icon: AlignLeft },
  { type: 'yes_no', icon: ToggleLeft },
  { type: 'single_choice', icon: CircleDot },
  { type: 'multi_choice', icon: SquareCheck },
]
export const kindLabelKey = (type: CustomQuestionType): TranslationKey => `applications.builder.type.${type}` as TranslationKey
/** The icon of a kind of question. */
export function KindIcon({ type, className }: { type: CustomQuestionType; className?: string }) {
  const Icon = QUESTION_KINDS.find((k) => k.type === type)!.icon
  return <Icon className={className} aria-hidden />
}

/** What a built-in question looks like on the form, so the closed card can draw it. */
export type BuiltinShape = 'short' | 'long' | 'choice' | 'file' | 'language'
export const BUILTIN_SHAPE: Record<string, BuiltinShape> = {
  businessName: 'short',
  website: 'short',
  category: 'choice',
  description: 'long',
  country: 'short',
  city: 'short',
  applicantName: 'short',
  applicantRole: 'short',
  applicantEmail: 'short',
  applicantPhone: 'short',
  language: 'language',
  productCount: 'choice',
  photoReadiness: 'choice',
  modelReadiness: 'choice',
  notes: 'long',
  catalogue: 'file',
}
