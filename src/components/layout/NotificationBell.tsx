import { Bell, Settings } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'
import type { AppNotification, NotificationList } from '@/domain/notifications'
import { useI18n } from '@/i18n/LanguageProvider'
import { cn } from '@/lib/cn'
import { syncPushSubscription } from '@/lib/pushClient'
import { settingsReturnState } from '@/lib/settingsReturn'
import { settingsPath } from '@/lib/urls'
import { useFormat } from '@/lib/useFormat'
import { notifications } from '@/services'
import { type QueryResult, useServiceQuery } from '@/services/hooks'
import { Button } from '../ui/Button'
import { Popover } from '../ui/Menu'
import { Skeleton } from '../ui/Skeleton'
import { EmptyState, ErrorState } from '../ui/States'
import { useToast } from '../ui/ToastProvider'

/** The bell refreshes this often while the tab is visible, and when the tab comes back to the front. */
export const BELL_REFRESH_MS = 60_000
/** Focus and visibility events fire together; one refresh per this long is enough. */
const MIN_GAP_MS = 5_000

/** An in-app path only: a stored link is never followed to another site. */
const safePath = (link: string | null): string | null => (link && /^\/[^/\\]/.test(link) ? link : null)

/**
 * The bell in the dashboard header (ADR-0056): unread count, the latest notifications with how long ago, mark one or all as
 * read. Refreshes on focus and every minute. A device that is already subscribed to phone push re-saves its subscription here.
 */
export function NotificationBell({ variant }: { variant: 'admin' | 'business' }) {
  const { t } = useI18n()
  const query = useServiceQuery(() => notifications.getNotifications(), [])
  const { refetch } = query
  const last = useRef(0)

  const refresh = useCallback(() => {
    last.current = Date.now()
    refetch()
  }, [refetch])

  useEffect(() => {
    const soon = () => Date.now() - last.current < MIN_GAP_MS
    const onFocus = () => {
      if (document.visibilityState !== 'hidden' && !soon()) refresh()
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, BELL_REFRESH_MS)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onFocus)
    }
  }, [refresh])

  useEffect(() => {
    void syncPushSubscription(async (sub) => (await notifications.subscribePush(sub)).ok)
  }, [])

  const unread = query.data?.unread ?? 0
  const label = unread > 0 ? t('notifications.bell.labelUnread', { n: unread }) : t('notifications.bell.label')

  return (
    <Popover
      label={label}
      align="end"
      triggerClassName="relative grid size-10 place-items-center rounded-[var(--radius-control)] text-ink-muted hover:bg-subtle hover:text-ink focus-visible:outline-accent pointer-coarse:size-11"
      panelClassName="w-[min(24rem,calc(100vw-2rem))] max-sm:fixed max-sm:inset-x-4 max-sm:top-14 max-sm:mt-0 max-sm:w-auto"
      trigger={
        <>
          <Bell className="size-5" strokeWidth={1.6} aria-hidden />
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute top-0.5 right-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-[var(--radius-control)] bg-accent-bright px-1 text-[12px] leading-none font-semibold text-obsidian tabular-nums"
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </>
      }
    >
      {(close) => <Panel variant={variant} query={query} onRefresh={refresh} close={close} />}
    </Popover>
  )
}

function Panel({
  variant,
  query,
  onRefresh,
  close,
}: {
  variant: 'admin' | 'business'
  query: QueryResult<NotificationList>
  onRefresh: () => void
  close: () => void
}) {
  const { t } = useI18n()
  const toast = useToast()
  const { pathname, search } = useLocation()
  const [busy, setBusy] = useState(false)
  // Opening the panel shows the newest list.
  useEffect(onRefresh, [onRefresh])

  const items = query.data?.items ?? []
  const unread = query.data?.unread ?? 0

  const markAll = async () => {
    setBusy(true)
    const r = await notifications.markAllRead()
    setBusy(false)
    if (r.ok) {
      toast.success(t('notifications.bell.markAllDone'))
      onRefresh()
    } else toast.error(t('notifications.bell.markFailed'))
  }
  const open = (n: AppNotification) => {
    close()
    if (!n.readAt) void notifications.markNotificationRead(n.id).then((r) => r.ok && onRefresh())
  }

  return (
    <div className="flex max-h-[min(32rem,calc(100dvh-5rem))] flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
        <h2 className="text-ui-body font-medium text-ink">{t('notifications.bell.title')}</h2>
        <Button variant="ghost" size="sm" disabled={busy || unread === 0} onClick={() => void markAll()} className="pointer-coarse:min-h-11">
          {t('notifications.bell.markAll')}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {query.status === 'loading' && !query.data ? (
          <div className="space-y-3 p-4" aria-busy="true" aria-label={t('notifications.bell.loading')}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
              </div>
            ))}
          </div>
        ) : query.status === 'error' && !query.data ? (
          <ErrorState message={t('notifications.bell.loadFailed')} onRetry={query.refetch} className="py-6" />
        ) : items.length === 0 ? (
          <EmptyState title={t('notifications.bell.empty')} body={t('notifications.bell.emptyBody')} />
        ) : (
          <ul className="divide-y divide-line">
            {items.map((n) => (
              <li key={n.id}>
                <Item n={n} onOpen={() => open(n)} />
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t border-line px-2 py-1">
        <Link
          to={settingsPath(variant, 'notifications')}
          state={settingsReturnState(pathname + search)}
          onClick={close}
          className="flex min-h-10 items-center gap-2 rounded-[var(--radius-control)] px-2 text-ui-small text-ink-muted hover:bg-subtle hover:text-ink pointer-coarse:min-h-11"
        >
          <Settings className="size-4" aria-hidden />
          {t('notifications.bell.settings')}
        </Link>
      </div>
    </div>
  )
}

function Item({ n, onOpen }: { n: AppNotification; onOpen: () => void }) {
  const { t } = useI18n()
  const { relative } = useFormat()
  const unread = !n.readAt
  const body = (
    <>
      <span aria-hidden className={cn('mt-1.5 size-2 shrink-0 rounded-full', unread ? 'bg-accent' : 'bg-transparent')} />
      <span className="min-w-0 flex-1">
        {unread && <span className="sr-only">{t('notifications.bell.unread')}: </span>}
        <span className={cn('block text-ui-body text-ink', unread && 'font-medium')}>{n.title}</span>
        {n.body && <span className="mt-0.5 block text-ui-small break-words text-ink-muted">{n.body}</span>}
        <span className="mt-1 block text-[12px] text-ink-muted">{relative(n.createdAt)}</span>
      </span>
    </>
  )
  const cls = 'flex w-full gap-3 px-4 py-3 text-left hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none pointer-coarse:min-h-11'
  const path = safePath(n.link)
  return path ? (
    <Link to={path} onClick={onOpen} className={cls}>
      {body}
    </Link>
  ) : (
    <button type="button" onClick={onOpen} className={cls}>
      {body}
    </button>
  )
}
