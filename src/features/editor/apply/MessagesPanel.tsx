import { ChevronDown, Search } from 'lucide-react'
import { useId, useState } from 'react'
import { Input } from '@/components/ui/Form'
import { EmptyState } from '@/components/ui/States'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { translate } from '@/i18n/translate'
import { cn } from '@/lib/cn'
import { useBuilder } from './builderParts'
import { TextOverride } from './TextOverride'
import { MESSAGE_GROUPS, PANEL_GROUP_IDS } from './textGroups'

/**
 * "Button & message texts": one collapsible, searchable panel with every text that is not on a card (buttons, progress
 * labels, warnings, validation errors), each with the original as the guide. It replaces the old Messages tab.
 */
export function MessagesPanel({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { t, lang: appLang } = useI18n()
  const { config } = useBuilder()
  const bodyId = useId()
  const [search, setSearch] = useState('')
  const needle = search.trim().toLowerCase()
  const matches = (key: string): boolean => {
    if (!needle) return true
    const own = config.texts[key] ?? {}
    return [translate('en', key as TranslationKey), translate('pt', key as TranslationKey), own.en ?? '', own.pt ?? ''].some((s) => s.toLowerCase().includes(needle))
  }
  const groups = MESSAGE_GROUPS.filter((g) => PANEL_GROUP_IDS.includes(g.id))
    .map((g) => ({ ...g, keys: g.keys.filter(matches) }))
    .filter((g) => g.keys.length)
  return (
    <section aria-label={t('applications.builder.panelTitle')} data-card="panel" className="scroll-mt-24 rounded-[var(--radius-card)] border border-line bg-surface">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 rounded-[var(--radius-card)] p-4 text-left hover:bg-subtle/50 sm:p-5 pointer-coarse:min-h-11"
      >
        <span className="min-w-0">
          <span className="block font-display text-[1.5rem] leading-tight text-ink">{t('applications.builder.panelTitle')}</span>
          <span className="mt-1 block text-ui-body text-ink-muted">{t('applications.builder.panelHint')}</span>
        </span>
        <ChevronDown className={cn('size-5 shrink-0 text-ink-muted transition-transform', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div id={bodyId} className="space-y-8 border-t border-line p-4 sm:p-5">
          <div className="relative max-w-md">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
            <Input type="search" aria-label={t('applications.builder.searchMessages')} placeholder={t('applications.builder.searchMessages')} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          {groups.length === 0 && <EmptyState icon={Search} title={t('applications.builder.noMessages')} />}
          {groups.map((g) => (
            <section key={g.id} aria-labelledby={`msg-${g.id}`} className="space-y-5">
              <h3 id={`msg-${g.id}`} className="text-ui-card font-semibold text-ink">
                {t(g.title)}
              </h3>
              {g.keys.map((key) => (
                <TextOverride key={key} textKey={key} multiline={translate(appLang, key as TranslationKey).length > 60} />
              ))}
            </section>
          ))}
        </div>
      )}
    </section>
  )
}
