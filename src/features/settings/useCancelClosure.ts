// Withdrawing a business owner's closure request (spec 8), shared by My account and the business Overview banner.
import { useCallback, useRef, useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'
import { accountErrorText } from './accountError'
import { useI18n } from '@/i18n/LanguageProvider'
import { account } from '@/services'

/** `cancel()` withdraws the request and toasts the outcome; `onCancelled` runs only when it worked. */
export function useCancelClosure(onCancelled: () => void): { cancel: () => Promise<void>; cancelling: boolean } {
  const toast = useToast()
  const { t } = useI18n()
  const [cancelling, setCancelling] = useState(false)
  const busy = useRef(false)
  const cancel = useCallback(async () => {
    if (busy.current) return
    busy.current = true
    setCancelling(true)
    const r = await account.cancelClosure()
    busy.current = false
    setCancelling(false)
    if (!r.ok) {
      toast.error(t('settings.closure.cancelFailed'), accountErrorText(r.error, t))
      return
    }
    toast.success(t('settings.closure.cancelled'), t('settings.closure.cancelledBody'))
    onCancelled()
  }, [toast, t, onCancelled])
  return { cancel, cancelling }
}
