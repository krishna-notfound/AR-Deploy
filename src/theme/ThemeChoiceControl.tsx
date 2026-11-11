import { Monitor, Moon, Sun } from 'lucide-react'
import { useId, useMemo } from 'react'
import type { MenuHeading, MenuItem } from '@/components/ui/Menu'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { THEME_CHOICES, type ThemeChoice, useThemeChoice } from './theme'

const LABEL: Record<ThemeChoice, TranslationKey> = { light: 'ui.theme.light', dark: 'ui.theme.dark', system: 'ui.theme.system' }
const HINT: Record<ThemeChoice, TranslationKey> = { light: 'ui.theme.lightHint', dark: 'ui.theme.darkHint', system: 'ui.theme.systemHint' }
const ICON: Record<ThemeChoice, typeof Sun> = { light: Sun, dark: Moon, system: Monitor }

/** The account menu's appearance group: a caption and Light / Dark / System as a radio group of menu items (ADR-0060). */
export function useThemeMenuItems(): (MenuItem | MenuHeading)[] {
  const { t } = useI18n()
  const [choice, setChoice] = useThemeChoice()
  return useMemo(
    () => [
      { heading: t('ui.theme.heading') },
      ...THEME_CHOICES.map((c) => {
        const Icon = ICON[c]
        return { label: t(LABEL[c]), icon: <Icon />, checked: choice === c, onSelect: () => setChoice(c) }
      }),
    ],
    [t, choice, setChoice],
  )
}

/** Light / Dark / System as a radio group (Settings → Appearance). Applies at once. */
export function ThemeChoiceControl({ legend }: { legend: string }) {
  const { t } = useI18n()
  const [choice, setChoice] = useThemeChoice()
  const name = useId()
  return (
    <fieldset>
      <legend className="mb-2 text-ui-body font-medium text-ink">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {THEME_CHOICES.map((c) => {
          const Icon = ICON[c]
          const on = choice === c
          return (
            <label
              key={c}
              className={cn(
                'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[var(--radius-control)] border px-3.5 transition-colors',
                on ? 'border-ink bg-surface outline outline-1 outline-ink' : 'border-line hover:border-line-strong',
              )}
            >
              <input type="radio" name={name} value={c} checked={on} onChange={() => setChoice(c)} className="accent-[var(--color-ink)]" />
              <Icon className="size-4 text-ink-muted" aria-hidden />
              <span className="text-ui-body text-ink">{t(LABEL[c])}</span>
              <span className="text-ui-small text-ink-muted">{t(HINT[c])}</span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
