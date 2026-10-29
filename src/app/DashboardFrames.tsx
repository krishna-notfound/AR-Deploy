// The signed-in frames of the three dashboard surfaces: role guard, 2FA gate and shell (or the full-screen settings hub and Editor
// preview). Loaded lazily with the first dashboard route, so public pages do not download the shell, the 2FA setup or the
// onboarding checklist.
import { RequirePermission } from '@/auth/usePermission'
import { RequireRole } from '@/auth/RequireRole'
import { SecurityGate } from '@/auth/SecurityGate'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { adminNav, businessNav } from '@/components/layout/nav'
import { lazy, Suspense } from 'react'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'

// The settings hub and the Editor preview stay lazy modules of their own (they are large and only some staff open them).
const SettingsLayout = lazy(() => import('@/features/settings/SettingsLayout'))
const EditorPreview = lazy(() => import('@/features/editor/EditorPreview'))

export function AdminFrame() {
  return (
    <RequireRole allow="super_admin">
      <SecurityGate>
        <DashboardShell nav={adminNav} variant="admin" />
      </SecurityGate>
    </RequireRole>
  )
}

export function BusinessFrame() {
  return (
    <RequireRole allow="business_admin">
      <SecurityGate>
        <DashboardShell nav={businessNav} variant="business" />
      </SecurityGate>
    </RequireRole>
  )
}

// The settings hub is full-screen, outside DashboardShell but behind the same role guard and 2FA gate.
export function SettingsFrame({ scope }: { scope: 'admin' | 'business' }) {
  return (
    <RequireRole allow={scope === 'admin' ? 'super_admin' : 'business_admin'}>
      <SecurityGate>
        <Suspense fallback={<FullPageSpinner />}>
          <SettingsLayout scope={scope} />
        </Suspense>
      </SecurityGate>
    </RequireRole>
  )
}

// The Editor's preview is full-screen, outside DashboardShell (the public components keep their own styles), behind the same
// role guard, 2FA gate and permission as the Editor.
export function EditorPreviewFrame() {
  return (
    <RequireRole allow="super_admin">
      <SecurityGate>
        <RequirePermission need="content.manage">
          <Suspense fallback={<FullPageSpinner />}>
            <EditorPreview />
          </Suspense>
        </RequirePermission>
      </SecurityGate>
    </RequireRole>
  )
}
