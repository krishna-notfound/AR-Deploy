import { useCallback, useEffect, useId, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Switch, SwitchButton } from '@/components/ui/Form'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorState, InlineNotice } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import { useCan } from '@/auth/usePermission'
import { useI18n } from '@/i18n/LanguageProvider'
import { type PushState, disablePush, enablePush, readPushState } from '@/lib/pushClient'
import { type NotificationPrefs, notifications } from '@/services'
import { useSettingsScope } from '../sections'
import { SettingsCard } from '../SettingsUi'

/** Settings → Notifications (ADR-0056): this device's phone notifications, then the switches for each kind of event. */
export function NotificationChannels() {
  const prefs = useNotificationPrefs()
  return (
    <>
      <PhoneCard onEnabled={() => void prefs.save({})} />
      <EventsCard prefs={prefs} />
    </>
  )
}

type PrefsState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; prefs: NotificationPrefs }

function useNotificationPrefs() {
  const { lang } = useI18n()
  const [state, setState] = useState<PrefsState>({ status: 'loading' })
  const load = useCallback(async () => {
    setState({ status: 'loading' })
    const r = await notifications.getNotificationPrefs()
    setState(r.ok ? { status: 'ready', prefs: r.data } : { status: 'error' })
  }, [])
  useEffect(() => {
    void load()
  }, [load])
  /** Saves the switches given plus the language in use, so notification text matches what the person reads. */
  const save = useCallback(
    async (patch: Partial<NotificationPrefs>) => {
      const r = await notifications.setNotificationPrefs({ ...patch, language: lang })
      if (r.ok) setState({ status: 'ready', prefs: r.data })
      return r.ok
    },
    [lang],
  )
  return { state, reload: load, save }
}

type Prefs = ReturnType<typeof useNotificationPrefs>

function PhoneCard({ onEnabled }: { onEnabled: () => void }) {
  const { t } = useI18n()
  const toast = useToast()
  const [push, setPush] = useState<{ state: PushState } | null>(null)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    let live = true
    void readPushState().then((r) => live && setPush({ state: r.state }))
    return () => {
      live = false
    }
  }, [])

  const turnOn = async () => {
    setWorking(true)
    // The browser's permission prompt opens from this tap and nowhere else.
    const r = await enablePush(async (sub) => (await notifications.subscribePush(sub)).ok)
    setWorking(false)
    if (r.ok) {
      setPush({ state: 'on' })
      onEnabled()
      toast.success(t('settings.notifications.phoneEnabled'))
    } else if (r.reason === 'denied') setPush({ state: 'denied' })
    else if (r.reason === 'dismissed') toast.info(t('settings.notifications.phoneDismissed'), t('settings.notifications.phoneDismissedBody'))
    else if (r.reason === 'unsupported') setPush({ state: 'unsupported' })
    else toast.error(t('settings.notifications.phoneFailed'), t('settings.notifications.phoneFailedBody'))
  }
  const turnOff = async () => {
    setWorking(true)
    const ok = await disablePush(async (endpoint) => (await notifications.unsubscribePush(endpoint)).ok)
    setWorking(false)
    if (ok) {
      setPush({ state: 'off' })
      toast.success(t('settings.notifications.phoneDisabled'))
    } else toast.error(t('settings.notifications.phoneFailed'), t('settings.notifications.phoneFailedBody'))
  }

  const state = push?.state
  const message: Partial<Record<PushState, string>> = {
    unsupported: t('settings.notifications.phoneUnsupported'),
    'needs-install': t('settings.notifications.phoneNeedsInstall'),
    unconfigured: t('settings.notifications.phoneUnconfigured'),
    denied: t('settings.notifications.phoneDenied'),
  }

  return (
    <SettingsCard title={t('settings.notifications.phoneTitle')} description={t('settings.notifications.phoneDescription')}>
      {!state ? (
        <div className="space-y-2" aria-busy="true" aria-label={t('settings.notifications.phoneChecking')}>
          <Skeleton className="h-4 w-56" />
          <Skeleton className="h-10 w-48" />
        </div>
      ) : state === 'on' || state === 'off' ? (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
          <div className="min-w-0 max-w-xl">
            <p className="text-ui-body font-medium text-ink">{state === 'on' ? t('settings.notifications.phoneOn') : t('settings.notifications.phoneOff')}</p>
            {state === 'on' && <p className="text-ui-small text-ink-muted">{t('settings.notifications.phoneIsOn')}</p>}
          </div>
          {state === 'on' ? (
            <Button variant="secondary" disabled={working} onClick={() => void turnOff()} className="pointer-coarse:min-h-11">
              {working ? t('settings.notifications.phoneWorking') : t('settings.notifications.phoneTurnOff')}
            </Button>
          ) : (
            <Button disabled={working} onClick={() => void turnOn()} className="pointer-coarse:min-h-11">
              {working ? t('settings.notifications.phoneWorking') : t('settings.notifications.phoneTurnOn')}
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          <Badge tone="neutral">{t('settings.notifications.phoneOff')}</Badge>
          <InlineNotice tone={state === 'needs-install' ? 'info' : 'neutral'}>{message[state]}</InlineNotice>
        </div>
      )}
    </SettingsCard>
  )
}

type SwitchKey = 'newApplication' | 'newModelRequest' | 'companyUpdates' | 'emailNewApplication' | 'emailNewModelRequest' | 'emailModelRequestUpdates' | 'emailBusinessNotices' | 'pushEnabled'

/** One kind of update: the bell (In-app) and, where the platform sends an email for it, an Email switch (ADR-0078). */
interface EventRow {
  id: string
  label: string
  body: string
  inApp?: 'newApplication' | 'newModelRequest' | 'companyUpdates'
  email?: 'emailNewApplication' | 'emailNewModelRequest' | 'emailModelRequestUpdates' | 'emailBusinessNotices'
}

/** A labelled switch inside a row; its name reads "<row title> <In-app | Email>". */
function ChannelSwitch({ rowId, label, checked, disabled, onChange }: { rowId: string; label: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  const id = useId()
  return (
    <div className="flex items-center gap-2">
      <span id={id} className="text-ui-small text-ink-muted">
        {label}
      </span>
      <SwitchButton checked={checked} disabled={disabled} onChange={onChange} aria-labelledby={`${rowId} ${id}`} />
    </div>
  )
}

function EventsCard({ prefs }: { prefs: Prefs }) {
  const { t } = useI18n()
  const toast = useToast()
  const scope = useSettingsScope()
  const can = useCan()
  const [pending, setPending] = useState<keyof NotificationPrefs | null>(null)
  const idBase = useId()

  // Staff see the types their permissions give them; business owners see theirs (ADR-0078). An Email switch exists only
  // where an email is sent: each type below has one.
  const rows: EventRow[] = [
    ...(scope === 'admin' && can('applications.view')
      ? [{ id: 'applications', label: t('settings.notifications.eventApplications'), body: t('settings.notifications.eventApplicationsBody'), inApp: 'newApplication', email: 'emailNewApplication' } as const]
      : []),
    ...(scope === 'admin' && can('models.manage')
      ? [{ id: 'models', label: t('settings.notifications.eventModelRequests'), body: t('settings.notifications.eventModelRequestsBody'), inApp: 'newModelRequest', email: 'emailNewModelRequest' } as const]
      : []),
    ...(scope === 'business'
      ? [
          { id: 'modelUpdates', label: t('settings.notifications.eventModelUpdates'), body: t('settings.notifications.eventModelUpdatesBody'), inApp: 'companyUpdates', email: 'emailModelRequestUpdates' } as const,
          { id: 'notices', label: t('settings.notifications.eventBusinessNotices'), body: t('settings.notifications.eventBusinessNoticesBody'), inApp: 'companyUpdates', email: 'emailBusinessNotices' } as const,
        ]
      : []),
  ]

  const change = async (key: SwitchKey, next: boolean) => {
    setPending(key)
    const ok = await prefs.save({ [key]: next })
    setPending(null)
    if (ok) toast.success(t('settings.notifications.eventsSaved'))
    else toast.error(t('settings.notifications.saveFailed'))
  }

  const ready = prefs.state.status === 'ready' ? prefs.state.prefs : null
  const shown = (key: SwitchKey) => (ready ? (pending === key ? !ready[key] : ready[key]) : false)
  return (
    <SettingsCard title={t('settings.notifications.eventsTitle')} description={t('settings.notifications.eventsDescription')}>
      {!ready && prefs.state.status === 'loading' ? (
        <div className="space-y-2" aria-busy="true" aria-label={t('settings.notifications.loading')}>
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
      ) : !ready ? (
        <ErrorState message={t('settings.notifications.loadFailed')} onRetry={prefs.reload} className="py-4" />
      ) : (
        <div className="divide-y divide-line">
          {rows.map((row) => {
            const titleId = `${idBase}-${row.id}`
            return (
              <div key={row.id} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 py-4 first:pt-0">
                <div className="min-w-0 max-w-xl">
                  <p id={titleId} className="text-ui-body font-medium text-ink">
                    {row.label}
                  </p>
                  <p className="text-ui-small text-ink-muted">{row.body}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-x-6 gap-y-2">
                  {row.inApp && <ChannelSwitch rowId={titleId} label={t('settings.notifications.channelInApp')} checked={shown(row.inApp)} disabled={pending !== null} onChange={(v) => void change(row.inApp!, v)} />}
                  {row.email && <ChannelSwitch rowId={titleId} label={t('settings.notifications.channelEmail')} checked={shown(row.email)} disabled={pending !== null} onChange={(v) => void change(row.email!, v)} />}
                </div>
              </div>
            )
          })}
          <div className={rows.length ? 'pt-4' : undefined}>
            <Switch
              checked={shown('pushEnabled')}
              disabled={pending !== null}
              onChange={(v) => void change('pushEnabled', v)}
              label={t('settings.notifications.eventPush')}
              description={t('settings.notifications.eventPushBody')}
            />
          </div>
        </div>
      )}
    </SettingsCard>
  )
}