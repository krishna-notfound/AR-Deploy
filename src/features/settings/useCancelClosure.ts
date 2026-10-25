// Withdrawing a business owner's closure request (spec 8), shared by My account and the business Overview banner.
import { useCallback, useRef, useState } from 'react'
import { useToast } from '@/components/ui/ToastProvider'
import { account } from '@/services'

/** `cancel()` withdraws the request and toasts the outcome; `onCancelled` runs only when it worked. */
export function useCancelClosure(onCancelled: () => void): { cancel: () => Promise<void>; cancelling: boolean } {
  const toast = useToast()
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
      toast.error("Couldn't cancel the closure request", r.error.message)
      return
    }
    toast.success('Closure request cancelled', 'Your catalog is back to its previous status.')
    onCancelled()
  }, [toast, onCancelled])
  return { cancel, cancelling }
}
