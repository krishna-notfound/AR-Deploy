import { useSyncExternalStore } from 'react'
import { useI18n } from '@/i18n/LanguageProvider'

function subscribe(onChange: () => void) {
  window.addEventListener('online', onChange)
  window.addEventListener('offline', onChange)
  return () => {
    window.removeEventListener('online', onChange)
    window.removeEventListener('offline', onChange)
  }
}
const isOnline = () => navigator.onLine !== false

/**
 * A small note while the browser reports no connection (QA EF-19), so a save that cannot go through is not a mystery.
 * It reads `navigator.onLine`, which is reliable for "offline" and only a hint for "online"; it never blocks the page.
 */
export function OfflineBanner() {
  const { t } = useI18n()
  const online = useSyncExternalStore(subscribe, isOnline, () => true)
  if (online) return null
  return (
    <p role="status" className="pointer-events-none fixed inset-x-3 top-2 z-[70] mx-auto w-fit max-w-[min(32rem,calc(100vw-1.5rem))] rounded-[var(--radius-control)] bg-ink px-3.5 py-2 text-center text-[13px] leading-5 text-canvas shadow-lg">
      {t('common.offline')}
    </p>
  )
}
