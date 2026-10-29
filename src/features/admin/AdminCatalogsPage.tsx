import { Building2 } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { PageHeader } from '@/components/layout/PageHeader'
import { ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FormField, Select } from '@/components/ui/Form'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { errorText } from '@/i18n/errorText'
import { useI18n } from '@/i18n/LanguageProvider'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { CatalogQrPanel } from '../catalogs/CatalogQrPanel'

export default function AdminCatalogsPage() {
  const { t } = useI18n()
  const [params, setParams] = useSearchParams()
  const catalogs = useServiceQuery(() => service.getCatalogs(), [])
  const list = catalogs.data ?? []
  const selectedId = params.get('business') ?? list[0]?.business.id ?? ''
  const selected = list.find((c) => c.business.id === selectedId) ?? list[0]

  return (
    <>
      <PageHeader title={t('admin.catalogs.pageTitle')} description={t('admin.catalogs.pageDescription')} />
      {catalogs.status === 'loading' && !catalogs.data ? (
        <FullPageSpinner />
      ) : catalogs.status === 'error' && !catalogs.data ? (
        <Card>
          <ErrorState message={errorText(catalogs.error, t)} onRetry={catalogs.refetch} />
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState icon={Building2} title={t('admin.catalogs.emptyTitle')} body={t('admin.catalogs.emptyBody')} action={<ButtonLink to="/admin/businesses/new" variant="primary">{t('admin.catalogs.createBusiness')}</ButtonLink>} />
        </Card>
      ) : (
        <div className="space-y-6">
          <FormField label={t('admin.catalogs.business')} className="max-w-xs">
            <Select value={selected?.business.id} onChange={(e) => setParams({ business: e.target.value }, { replace: true })}>
              {list.map((c) => (
                <option key={c.business.id} value={c.business.id}>
                  {c.business.name}
                  {c.business.status !== 'active' ? ` (${t(`admin.businesses.status.${c.business.status}`).toLowerCase()})` : ''}
                </option>
              ))}
            </Select>
          </FormField>
          {selected && <CatalogQrPanel key={selected.business.id} catalog={selected} productsLink={`/admin/products?business=${selected.business.id}`} />}
        </div>
      )}
    </>
  )
}
