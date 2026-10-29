import { Upload, X } from 'lucide-react'
import { useId, useState } from 'react'
import { useI18n } from '@/i18n/LanguageProvider'
import { LOGO_RULES, validateImageFile } from '@/lib/files'
import { service } from '@/services'
import { Button } from './Button'
import { SmartImage } from './SmartImage'

export function LogoUpload({
  value,
  onChange,
  name,
  businessId,
}: {
  value?: string
  onChange: (url: string | undefined) => void
  name: string
  businessId?: string
}) {
  const { t } = useI18n()
  const id = useId()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onFile = async (file: File) => {
    const check = validateImageFile(file, LOGO_RULES)
    if (!check.ok) {
      setError(check.message)
      return
    }
    setBusy(true)
    const res = await service.uploadAsset({ kind: 'logo', file, businessId })
    setBusy(false)
    if (!res.ok) setError(res.error.message)
    else {
      setError(null)
      onChange(res.data.url)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-4">
        <SmartImage src={value} alt={value ? t('ui.logo.alt', { name: name || t('ui.logo.business') }) : ''} fallbackLabel={t('ui.logo.none')} className="size-16 rounded-xl border border-line object-contain" />
        <div className="flex flex-wrap gap-2">
          <label htmlFor={id} className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 text-[13px] font-medium hover:bg-subtle focus-within:outline-2 focus-within:outline-accent">
            <Upload className="size-4" aria-hidden />
            {busy ? t('ui.logo.uploading') : value ? t('ui.logo.replace') : t('ui.logo.upload')}
            <input
              id={id}
              type="file"
              accept={LOGO_RULES.accept.join(',')}
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) void onFile(f)
                e.target.value = ''
              }}
            />
          </label>
          {value && (
            <Button size="sm" variant="ghost" icon={<X className="size-4" aria-hidden />} onClick={() => onChange(undefined)}>
              {t('ui.logo.remove')}
            </Button>
          )}
        </div>
      </div>
      <p className="mt-2 text-xs text-ink-muted">{t('ui.logo.help')}</p>
      {error && (
        <p role="alert" className="mt-1 text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  )
}
