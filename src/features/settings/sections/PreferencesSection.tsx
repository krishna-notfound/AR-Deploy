import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { FormField, Select } from '@/components/ui/Form'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import type { DateFormatPref, Profile } from '@/domain/types'
import { accountErrorText } from '../accountError'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { type DatePrefs, formatDate, formatDateTime, formatTime } from '@/lib/format'
import { browserTimeZone, timeZoneList, useProfileSettings } from '@/lib/preferences'
import { SectionHeader, SettingsCard } from '../SettingsUi'

const DATE_FORMATS: DateFormatPref[] = ['d MMM yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd']
// Fixed sample for the option labels (shown in UTC so the label is the same everywhere): 25 Oct 2026, 14:05.
const SAMPLE = '2026-10-25T14:05:00Z'
const sample = (p: Partial<DatePrefs>) => ({ timezone: 'UTC', dateFormat: 'd MMM yyyy' as const, clock: '24h' as const, ...p })

type Draft = Pick<Profile, 'timezone' | 'dateFormat' | 'clock'>

export default function PreferencesSection() {
  const { t } = useI18n()
  const { state, reload } = useProfileSettings()
  return (
    <>
      <SectionHeader title={t('settings.section.preferences')} description={t('settings.prefs.description')} />
      {state.status === 'loading' ? (
        <SettingsCard title={t('settings.prefs.zoneAndFormat')}>
          <div className="space-y-3" aria-busy="true" aria-label={t('settings.prefs.loading')}>
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full max-w-md" />
            <Skeleton className="h-4 w-56" />
          </div>
        </SettingsCard>
      ) : state.status === 'error' ? (
        <SettingsCard title={t('settings.prefs.zoneAndFormat')}>
          <ErrorState message={t('settings.prefs.loadFailed')} onRetry={reload} className="py-4" />
        </SettingsCard>
      ) : (
        <PreferencesForm key={state.profile.userId} profile={state.profile} />
      )}
    </>
  )
}

function PreferencesForm({ profile }: { profile: Profile }) {
  const { t, lang } = useI18n()
  const { save } = useProfileSettings()
  const toast = useToast()
  const [draft, setDraft] = useState<Draft>({ timezone: profile.timezone, dateFormat: profile.dateFormat, clock: profile.clock })
  const [saving, setSaving] = useState(false)
  // The preview clock, refreshed every 30 seconds.
  const [nowIso, setNowIso] = useState(() => new Date().toISOString())
  useEffect(() => {
    const timer = setInterval(() => setNowIso(new Date().toISOString()), 30_000)
    return () => clearInterval(timer)
  }, [])
  const device = useMemo(() => browserTimeZone(), [])
  const zones = useMemo(() => timeZoneList([profile.timezone, device]), [profile.timezone, device])
  const dirty = draft.timezone !== profile.timezone || draft.dateFormat !== profile.dateFormat || draft.clock !== profile.clock

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!dirty || saving) return
    setSaving(true)
    const r = await save(draft)
    setSaving(false)
    if (r.ok) toast.success(t('settings.prefs.saved'), t('settings.prefs.savedBody'))
    // The database checks the zone against its own list, which can lag behind this browser's (spec 6).
    else if (r.error.reason === 'invalid_request' && draft.timezone !== profile.timezone) toast.error(t('settings.prefs.zoneUnsupported'))
    else toast.error(t('settings.prefs.saveFailed'), accountErrorText(r.error, t))
  }

  const now = formatDateTime(nowIso, lang, draft)

  return (
    <form onSubmit={submit} className="space-y-6">
      <SettingsCard title={t('settings.prefs.zone')} description={t('settings.prefs.zoneDescription')}>
        <FormField label={t('settings.prefs.zone')} hint={device && device !== draft.timezone ? t('settings.prefs.deviceZone', { zone: device }) : undefined}>
          <Select className="max-w-md" value={draft.timezone} onChange={(e) => setDraft((d) => ({ ...d, timezone: e.target.value }))}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z === device ? `${z} (${t('settings.prefs.thisDevice')})` : z}
              </option>
            ))}
          </Select>
        </FormField>
        {device && device !== draft.timezone && (
          <Button type="button" size="sm" className="mt-3" onClick={() => setDraft((d) => ({ ...d, timezone: device }))}>
            {t('settings.prefs.useZone', { zone: device })}
          </Button>
        )}
      </SettingsCard>

      <SettingsCard title={t('settings.prefs.formatTitle')}>
        <div className="space-y-6">
          <RadioGroup
            legend={t('settings.prefs.dateFormat')}
            name="date-format"
            value={draft.dateFormat}
            onChange={(v) => setDraft((d) => ({ ...d, dateFormat: v }))}
            options={DATE_FORMATS.map((f) => ({ value: f, label: formatDate(SAMPLE, lang, sample({ dateFormat: f })) }))}
          />
          <RadioGroup
            legend={t('settings.prefs.clock')}
            name="clock"
            value={draft.clock}
            onChange={(v) => setDraft((d) => ({ ...d, clock: v }))}
            options={[
              { value: '24h' as const, label: formatTime(SAMPLE, sample({ clock: '24h' })), hint: t('settings.prefs.hour24') },
              { value: '12h' as const, label: formatTime(SAMPLE, sample({ clock: '12h' })), hint: t('settings.prefs.hour12') },
            ]}
          />
          <p className="text-ui-small text-ink-muted">
            {t('settings.prefs.now')} <span className="font-medium text-ink tabular-nums">{now}</span>
          </p>
        </div>
      </SettingsCard>

      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={!dirty} loading={saving}>
          {t('settings.prefs.save')}
        </Button>
      </div>
    </form>
  )
}

function RadioGroup<T extends string>({
  legend,
  name,
  value,
  onChange,
  options,
}: {
  legend: string
  name: string
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string; hint?: string }[]
}) {
  return (
    <fieldset>
      <legend className="mb-2 text-ui-body font-medium text-ink">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'flex min-h-11 cursor-pointer items-center gap-2.5 rounded-[var(--radius-control)] border px-3.5 transition-colors',
              value === o.value ? 'border-ink bg-surface outline outline-1 outline-ink' : 'border-line hover:border-line-strong',
            )}
          >
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="accent-[var(--color-ink)]" />
            <span className="text-ui-body text-ink tabular-nums">{o.label}</span>
            {o.hint && <span className="text-ui-small text-ink-muted">{o.hint}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
