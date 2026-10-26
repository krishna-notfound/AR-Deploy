// The "3D models" card on the business detail page: the per-business own-upload switch and the business's open
// 3D model requests (S4 R-S4-2, R-S4-10). The switch and the count need models.manage; without it, one read-only line.
import { useState } from 'react'
import { Link } from 'react-router'
import { useCan } from '@/auth/usePermission'
import { PanelHeader } from '@/components/layout/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { useConfirm } from '@/components/ui/ConfirmProvider'
import { Switch } from '@/components/ui/Form'
import { Skeleton } from '@/components/ui/Skeleton'
import { ErrorState } from '@/components/ui/States'
import { useToast } from '@/components/ui/ToastProvider'
import type { Business } from '@/domain/types'
import { modelRequestsAdminPath } from '@/lib/urls'
import { service } from '@/services'
import { ok } from '@/services/catalogService'
import { useServiceQuery } from '@/services/hooks'
import { LOAD_ERROR } from '../modelRequests/copy'

const HINT_ON = 'The business can upload its own GLB and USDZ files, and can still request models.'
const HINT_OFF = "The business requests 3D models from the Sanctus team and can't add, replace or remove 3D files itself."

export function BusinessModelsCard({ business, onChanged }: { business: Business; onChanged?: () => void }) {
  const can = useCan()
  const manage = can('models.manage')
  const confirm = useConfirm()
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const allowed = business.allowOwnModels === true

  // Without models.manage the database returns no rows, which would read as "no open requests": don't ask.
  const open = useServiceQuery(
    async () => {
      if (!manage) return ok(null)
      const r = await service.getModelRequests({ businessId: business.id, status: ['requested', 'in_progress'], pageSize: 1 })
      return r.ok ? ok(r.data.total) : r
    },
    [business.id, manage],
  )

  const change = async (next: boolean) => {
    if (saving) return
    if (!next) {
      const yes = await confirm({
        title: `Stop ${business.name} uploading its own 3D files?`,
        body: 'Its current 3D files stay on its products and public pages. From now on only the Sanctus team can change them, and the business requests new models.',
        confirmLabel: 'Turn off',
        cancelLabel: 'Cancel',
        destructive: true,
      })
      if (!yes) return
    }
    setSaving(true)
    const r = await service.setBusinessOwnModels(business.id, next)
    setSaving(false)
    if (r.ok) {
      toast.success('Saved')
      onChanged?.()
    } else toast.error("Couldn't save the change", r.error.message)
  }

  return (
    <Card>
      <PanelHeader title="3D models" />
      <CardBody className="space-y-4 pt-0">
        {manage ? (
          <>
            <Switch label="Can upload its own 3D files" description={allowed ? HINT_ON : HINT_OFF} checked={allowed} disabled={saving} onChange={(v) => void change(v)} />
            <div className="border-t border-line pt-4 text-ui-body">
              {open.status === 'loading' && open.data === undefined ? (
                <Skeleton className="h-5 w-40" />
              ) : open.status === 'error' && open.data === undefined ? (
                <ErrorState message={LOAD_ERROR} onRetry={open.refetch} retryLabel="Retry" className="py-2" />
              ) : open.data ? (
                <Link to={modelRequestsAdminPath({ status: 'open', businessId: business.id })} className="font-medium text-accent-ink hover:underline">
                  {open.data === 1 ? '1 open request' : `${open.data} open requests`}
                </Link>
              ) : (
                <p className="text-ink-muted">No open requests</p>
              )}
            </div>
          </>
        ) : (
          <p className="text-ui-body text-ink-muted">Own 3D uploads: {allowed ? 'allowed' : 'not allowed'}. Changing this needs 'Handle 3D model requests'.</p>
        )}
      </CardBody>
    </Card>
  )
}
