import { Search } from 'lucide-react'
import { useI18n } from '@/i18n/LanguageProvider'
import { SmartImage } from '@/components/ui/SmartImage'
import type { BusinessInput } from '@/services/catalogService'
import { safeBrandAccent } from '@/lib/color'
import { catalogPublicUrl } from '@/lib/urls'

/** Live miniature of the public catalog header so admins see the identity they are building. */
export function BusinessIdentityPreview({ business }: { business: Pick<BusinessInput, 'name' | 'slug' | 'logoUrl' | 'description' | 'branding'> }) {
  const { t } = useI18n()
  const accent = safeBrandAccent(business.branding.accentColor)
  return (
    <div>
      <p className="mb-2 text-[13px] font-medium text-ink-muted">{t('admin.businesses.preview.title')}</p>
      <div className="overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-[var(--shadow-card)]" aria-label={t('admin.businesses.preview.aria')}>
        <div className="flex items-center gap-1.5 border-b border-line bg-canvas px-3 py-2">
          <span className="size-2 rounded-full bg-line-strong" />
          <span className="size-2 rounded-full bg-line-strong" />
          <span className="ml-2 truncate rounded bg-surface px-2 py-0.5 text-xs text-ink-muted">{catalogPublicUrl(business)}</span>
        </div>
        <div className="p-5">
          <div className="flex items-center gap-3">
            <SmartImage src={business.logoUrl} alt="" className="size-11 rounded-xl border border-line object-contain" />
            <div className="min-w-0">
              <p className="truncate font-semibold">{business.name || t('admin.businesses.preview.namePlaceholder')}</p>
              <p className="text-xs text-ink-muted">{t('admin.businesses.preview.tagline')}</p>
            </div>
          </div>
          <p className="mt-3 line-clamp-3 text-[13px] leading-5 text-ink-muted">{business.description || t('admin.businesses.preview.descPlaceholder')}</p>
          <div className="mt-4 flex h-8 items-center gap-2 rounded-lg border border-line px-2.5 text-xs text-ink-faint">
            <Search className="size-3.5" aria-hidden /> {t('catalog.searchPlaceholder')}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[0, 1].map((i) => (
              <div key={i}>
                <div className="aspect-[4/3] rounded-lg bg-subtle" />
                <div className="mt-1.5 h-2 w-3/4 rounded bg-subtle" />
              </div>
            ))}
          </div>
          <span className="mt-4 inline-flex h-8 items-center rounded-lg px-3 text-xs font-medium text-white" style={{ background: accent }}>
            {t('ar.button')}
          </span>
        </div>
      </div>
    </div>
  )
}
