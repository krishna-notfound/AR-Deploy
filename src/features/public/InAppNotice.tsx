import { Info, X } from 'lucide-react'
import { useState } from 'react'
import { useI18n } from '@/i18n/LanguageProvider'
import { detectInAppBrowser, isAndroid, isIOS } from '@/lib/userAgent'
import { CopyLink } from './ShareActions'

const KEY = 'arfurn:inAppNoticeDismissed'
const APP_NAME = { instagram: 'Instagram', facebook: 'Facebook', whatsapp: 'WhatsApp' } as const

/** Best-effort notice for in-app browsers. Says AR "may" be limited; never guarantees it. */
export function InAppNotice() {
  const { t } = useI18n()
  const [app] = useState(() => detectInAppBrowser())
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(KEY) === '1'
    } catch {
      return false
    }
  })
  if (!app || dismissed) return null
  const browser = isIOS() ? 'Safari' : isAndroid() ? 'Chrome' : 'Safari / Chrome'
  return (
    <div role="status" className="border-b border-info/20 bg-info-soft">
      <div className="mx-auto flex max-w-[1320px] items-start gap-3 px-5 py-3 text-[13px] text-info sm:px-10">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium">{t('inApp.title', { browser })}</p>
          <p className="mt-0.5 opacity-90">{t('inApp.body', { app: APP_NAME[app] })}</p>
          <div className="mt-2">
            <CopyLink size="sm" />
          </div>
        </div>
        <button
          type="button"
          aria-label={t('inApp.dismiss')}
          onClick={() => {
            setDismissed(true)
            try {
              sessionStorage.setItem(KEY, '1')
            } catch {
              // ignore
            }
          }}
          className="-m-2 grid size-11 shrink-0 place-items-center rounded-[2px] hover:bg-info/10"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}
