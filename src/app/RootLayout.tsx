import { useEffect } from 'react'
import { Outlet, ScrollRestoration } from 'react-router'
import { useToast } from '@/components/ui/ToastProvider'
import { LanguageProvider, useI18n } from '@/i18n/LanguageProvider'
import { demoStore as store, isDemoMode } from '@/services'

/** Browser-storage notices (demo mode only), in the person's language. */
function DemoStorageNotices() {
  const toast = useToast()
  const { t } = useI18n()
  useEffect(
    () =>
      store.onNotice((n) => {
        if (!isDemoMode) return
        if (n.kind === 'reset-corrupt') toast.info(t('auth.demoReset.title'), t('auth.demoReset.body'))
        if (n.kind === 'quota') toast.error(t('auth.demoQuota.title'), t('auth.demoQuota.body'))
      }),
    [toast, t],
  )
  return null
}

/** Root route: the app-wide language (a no-op when App.tsx already provides it), scroll restoration and demo storage notices. */
export function RootLayout() {
  return (
    <LanguageProvider>
      <DemoStorageNotices />
      <ScrollRestoration />
      <Outlet />
    </LanguageProvider>
  )
}
