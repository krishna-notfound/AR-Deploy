// The "Public pages" card on the business detail page: the per-business Share button switch (ADR-0054). Only platform
// staff with businesses.edit change it (the database refuses everyone else); without it, one read-only line.
import { useState } from 'react'
import { useCan } from '@/auth/usePermission'
import { PanelHeader } from '@/components/layout/PageHeader'
import { Card, CardBody } from '@/components/ui/Card'
import { Switch } from '@/components/ui/Form'
import { useToast } from '@/components/ui/ToastProvider'
import type { Business } from '@/domain/types'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { service } from '@/services'

export function BusinessShareCard({ business, onChanged }: { business: Business; onChanged?: () => void }) {
  const { t } = useI18n()
  const can = useCan()
  const toast = useToast()
  const [saving, setSaving] = useState(false)
  const shown = business.shareEnabled !== false

  const change = async (next: boolean) => {
    if (saving) return
    setSaving(true)
    const r = await service.setBusinessShareEnabled(business.id, next)
    setSaving(false)
    if (r.ok) {
      toast.success(t('common.saved'))
      onChanged?.()
    } else toast.error(t('admin.businesses.share.saveFailed'), errorText(r.error, t))
  }

  return (
    <Card>
      <PanelHeader title={t('admin.businesses.share.title')} />
      <CardBody className="pt-0">
        {can('businesses.edit') ? (
          <Switch label={t('admin.businesses.share.switch')} description={t(shown ? 'admin.businesses.share.hintOn' : 'admin.businesses.share.hintOff')} checked={shown} disabled={saving} onChange={(v) => void change(v)} />
        ) : (
          <p className="text-ui-body text-ink-muted">{t(shown ? 'admin.businesses.share.readOnlyOn' : 'admin.businesses.share.readOnlyOff')}</p>
        )}
      </CardBody>
    </Card>
  )
}
