import { useState } from 'react'
import { RouterProvider } from 'react-router'
import { AccountProvider } from '@/auth/AccountProvider'
import { ConfirmProvider } from '@/components/ui/ConfirmProvider'
import { ToastProvider } from '@/components/ui/ToastProvider'
import { backend } from '@/services'
import { BackendConfigError } from './BackendConfigError'
import { createAppRouter } from './router'

export function App() {
  const [router] = useState(() => createAppRouter())
  if (backend.mode === 'misconfigured') return <BackendConfigError problem={backend.problem} />
  return (
    <ToastProvider>
      <ConfirmProvider>
        <AccountProvider>
          <RouterProvider router={router} />
        </AccountProvider>
      </ConfirmProvider>
    </ToastProvider>
  )
}
