import { useState } from 'react'
import { Link } from 'react-router'
import { EmptyState } from '@/components/ui/States'
import { Input } from '@/components/ui/Form'
import { Search } from 'lucide-react'
import type { ApplyFormConfig, ContentErrors } from '@/domain/siteContent'
import type { TranslationKey } from '@/i18n/dictionaries/en'
import { useI18n } from '@/i18n/LanguageProvider'
import { translate } from '@/i18n/translate'
import { editorPreviewPath } from '@/lib/urls'
import { TextOverride } from './TextOverride'
import { MESSAGE_GROUPS } from './textGroups'

/** The Messages tab: every other `apply.*` text in groups, each in English and Portuguese with the original as the guide. */
export function MessagesTab({ config, onChange, errors }: { config: ApplyFormConfig; onChange: (next: ApplyFormConfig) => void; errors: ContentErrors }) {
  const { t, lang } = useI18n()
  const [search, setSearch] = useState('')
  const needle = search.trim().toLowerCase()
  const matches = (key: string): boolean => {
    if (!needle) return true
    const own = config.texts[key] ?? {}
    return [translate('en', key as TranslationKey), translate('pt', key as TranslationKey), own.en ?? '', own.pt ?? ''].some((s) => s.toLowerCase().includes(needle))
  }
  const groups = MESSAGE_GROUPS.map((g) => ({ ...g, keys: g.keys.filter(matches) })).filter((g) => g.keys.length)
  return (
    <div className="space-y-8">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
        <Input type="search" aria-label={t('applications.builder.searchMessages')} placeholder={t('applications.builder.searchMessages')} value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>
      {groups.length === 0 && <EmptyState icon={Search} title={t('applications.builder.noMessages')} />}
      {groups.map((g) => (
        <section key={g.id} aria-labelledby={`msg-${g.id}`} className="space-y-5 rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id={`msg-${g.id}`} className="text-ui-body font-semibold text-ink">
              {t(g.title)}
            </h3>
            {g.id === 'thanks' && (
              <Link to={editorPreviewPath('apply/done')} className="text-ui-small text-accent-ink hover:underline">
                {t('applications.builder.previewThanks')}
              </Link>
            )}
          </div>
          {g.keys.map((key) => (
            <TextOverride key={key} textKey={key} config={config} onChange={onChange} errors={errors} multiline={(translate(lang, key as TranslationKey).length ?? 0) > 60} />
          ))}
        </section>
      ))}
    </div>
  )
}
