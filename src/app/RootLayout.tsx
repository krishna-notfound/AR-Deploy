import { useEffect } from 'react'
import { Outlet, ScrollRestoration } from 'react-router'
import { useToast } from '@/components/ui/ToastProvider'
import { isDemoMode } from '@/services'
import { store } from '@/services/mock/store'

/** Root route: scroll restoration + demo storage notices. */
export function RootLayout() {
  const toast = useToast()
  useEffect(
    () =>
      // Browser-storage notices only exist in demo mode.
      store.onNotice((n) => {
        if (!isDemoMode) return
        if (n.kind === 'reset-corrupt') toast.info('Demo data was reset', 'Stored demo data was invalid, so the sample data has been restored.')
        if (n.kind === 'quota') toast.error('Changes not saved to this browser', 'Browser storage is full. Your changes stay until you close this tab. Try removing large images.')
      }),
    [toast],
  )
  return (
    <>
      <ScrollRestoration />
      <Outlet />
    </>
  )
}
