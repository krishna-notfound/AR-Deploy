import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { FormField, Select } from '@/components/ui/Form'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import type { DateFormatPref, Profile } from '@/domain/types'
import { cn } from '@/lib/cn'
import { type DatePrefs, formatDate, formatDateTime } from '@/lib/format'
import { browserTimeZone, timeZoneList, useProfileSettings } from '@/lib/preferences'
import { SectionHeader, SettingsCard } from '../SettingsUi'

const DATE_FORMATS: DateFormatPref[] = ['d MMM yyyy', 'dd/MM/yyyy', 'yyyy-MM-dd']
// Fixed sample for the option labels (shown in UTC so the label is the same everywhere): 25 Oct 2026, 14:05.
const SAMPLE = '2026-10-25T14:05:00Z'
const sample = (p: Partial<DatePrefs>) => ({ timezone: 'UTC', dateFormat: 'd MMM yyyy' as const, clock: '24h' as const, ...p })

type Draft = Pick<Profile, 'timezone' | 'dateFormat' | 'clock'>

export default function PreferencesSection() {
  const { state, reload } = useProfileSettings()
  return (
    <>
      <SectionHeader title="Preferences" description="Your time zone and how dates and times are shown in the dashboard." />
      {state.status === 'loading' ? (
        <SettingsCard title="Time zone and format">
          <div className="space-y-3" aria-busy="true" aria-label="Loading preferences">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full max-w-md" />
            <Skeleton className="h-4 w-56" />
          </div>
        </SettingsCard>
      ) : state.status === 'error' ? (
        <SettingsCard title="Time zone and format">
          <ErrorState message={`Could not load your preferences. ${state.message}`} onRetry={reload} className="py-4" />
        </SettingsCard>
      ) : (
        <PreferencesForm key={state.profile.userId} profile={state.profile} />
      )}
    </>
  )
}

function PreferencesForm({ profile }: { profile: Profile }) {
  const { save } = useProfileSettings()
  const toast = useToast()
  const [draft, setDraft] = useState<Draft>({ timezone: profile.timezone, dateFormat: profile.dateFormat, clock: profile.clock })
  const [saving, setSaving] = useState(false)
  // The preview clock, refreshed every 30 seconds.
  const [nowIso, setNowIso] = useState(() => new Date().toISOString())
  useEffect(() => {
    const t = setInterval(() => setNowIso(new Date().toISOString()), 30_000)
    return () => clearInterval(t)
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
    if (r.ok) toast.success('Preferences saved', 'Dates across the dashboard now use these settings.')
    else toast.error('Could not save your preferences', r.error.message)
  }

  const now = formatDateTime(nowIso, 'en', draft)

  return (
    <form onSubmit={submit} className="space-y-6">
      <SettingsCard title="Time zone" description="Dates and times in the dashboard are shown in this zone.">
        <FormField label="Time zone" hint={device && device !== draft.timezone ? `This device is set to ${device}.` : undefined}>
          <Select className="max-w-md" value={draft.timezone} onChange={(e) => setDraft((d) => ({ ...d, timezone: e.target.value }))}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z === device ? `${z} (this device)` : z}
              </option>
            ))}
          </Select>
        </FormField>
        {device && device !== draft.timezone && (
          <Button type="button" size="sm" className="mt-3" onClick={() => setDraft((d) => ({ ...d, timezone: device }))}>
            Use {device}
          </Button>
        )}
      </SettingsCard>

      <SettingsCard title="Date and time format">
        <div className="space-y-6">
          <RadioGroup
            legend="Date format"
            name="date-format"
            value={draft.dateFormat}
            onChange={(v) => setDraft((d) => ({ ...d, dateFormat: v }))}
            options={DATE_FORMATS.map((f) => ({ value: f, label: formatDate(SAMPLE, 'en', sample({ dateFormat: f })) }))}
          />
          <RadioGroup
            legend="Clock"
            name="clock"
            value={draft.clock}
            onChange={(v) => setDraft((d) => ({ ...d, clock: v }))}
            options={[
              { value: '24h' as const, label: formatDateTime(SAMPLE, 'en', sample({ clock: '24h' })).split(', ')[1] ?? '14:05', hint: '24-hour' },
              { value: '12h' as const, label: formatDateTime(SAMPLE, 'en', sample({ clock: '12h' })).split(', ')[1] ?? '2:05 pm', hint: '12-hour' },
            ]}
          />
          <p className="text-ui-small text-ink-muted">
            Now in your time zone: <span className="font-medium text-ink tabular-nums">{now}</span>
          </p>
        </div>
      </SettingsCard>

      <div className="flex justify-end">
        <Button type="submit" variant="primary" disabled={!dirty} loading={saving}>
          Save preferences
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
