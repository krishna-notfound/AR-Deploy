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
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { useFormat } from '@/lib/useFormat'
import { modelRequestsAdminPath } from '@/lib/urls'
import { service } from '@/services'
import { ok } from '@/services/catalogService'
import { useServiceQuery } from '@/services/hooks'

export function BusinessModelsCard({ business, onChanged }: { business: Business; onChanged?: () => void }) {
  const { t, tn } = useI18n()
  const f = useFormat()
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
        title: t('admin.businesses.models.stopTitle', { name: business.name }),
        body: t('admin.businesses.models.stopBody'),
        confirmLabel: t('admin.businesses.models.turnOff'),
        cancelLabel: t('common.cancel'),
        destructive: true,
      })
      if (!yes) return
    }
    setSaving(true)
    const r = await service.setBusinessOwnModels(business.id, next)
    setSaving(false)
    if (r.ok) {
      toast.success(t('common.saved'))
      onChanged?.()
    } else toast.error(t('admin.businesses.models.saveFailed'), errorText(r.error, t))
  }

  return (
    <Card>
      <PanelHeader title={t('admin.businesses.models.title')} />
      <CardBody className="space-y-4 pt-0">
        {manage ? (
          <>
            <Switch label={t('admin.businesses.models.switch')} description={t(allowed ? 'admin.businesses.models.hintOn' : 'admin.businesses.models.hintOff')} checked={allowed} disabled={saving} onChange={(v) => void change(v)} />
            <div className="border-t border-line pt-4 text-ui-body">
              {open.status === 'loading' && open.data === undefined ? (
                <Skeleton className="h-5 w-40" />
              ) : open.status === 'error' && open.data === undefined ? (
                <ErrorState message={t('admin.businesses.models.loadError')} onRetry={open.refetch} retryLabel={t('common.retry')} className="py-2" />
              ) : open.data ? (
                <Link to={modelRequestsAdminPath({ status: 'open', businessId: business.id })} className="font-medium text-accent-ink hover:underline">
                  {tn('admin.businesses.models.openRequests', open.data, { n: f.number(open.data) })}
                </Link>
              ) : (
                <p className="text-ink-muted">{t('admin.businesses.models.noOpen')}</p>
              )}
            </div>
          </>
        ) : (
          <p className="text-ui-body text-ink-muted">{t(allowed ? 'admin.businesses.models.readOnlyAllowed' : 'admin.businesses.models.readOnlyNotAllowed')}</p>
        )}
      </CardBody>
    </Card>
  )
}
