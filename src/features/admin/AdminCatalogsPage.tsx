import { Building2 } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { FullPageSpinner } from '@/components/layout/FullPageSpinner'
import { PageHeader } from '@/components/layout/PageHeader'
import { ButtonLink } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { FormField, Select } from '@/components/ui/Form'
import { EmptyState, ErrorState } from '@/components/ui/States'
import { service } from '@/services'
import { useServiceQuery } from '@/services/hooks'
import { CatalogQrPanel } from '../catalogs/CatalogQrPanel'

export default function AdminCatalogsPage() {
  const [params, setParams] = useSearchParams()
  const catalogs = useServiceQuery(() => service.getCatalogs(), [])
  const list = catalogs.data ?? []
  const selectedId = params.get('business') ?? list[0]?.business.id ?? ''
  const selected = list.find((c) => c.business.id === selectedId) ?? list[0]

  return (
    <>
      <PageHeader title="Catalogs & QR codes" description="Each business has one catalog URL and one QR code for print, packaging and showrooms." />
      {catalogs.status === 'loading' && !catalogs.data ? (
        <FullPageSpinner />
      ) : catalogs.status === 'error' && !catalogs.data ? (
        <Card>
          <ErrorState message={catalogs.error.message} onRetry={catalogs.refetch} />
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState icon={Building2} title="No catalogs yet" body="Create a business to get its catalog URL and QR code." action={<ButtonLink to="/admin/businesses/new" variant="primary">Create business</ButtonLink>} />
        </Card>
      ) : (
        <div className="space-y-5">
          <FormField label="Business" className="max-w-sm">
            <Select value={selected?.business.id} onChange={(e) => setParams({ business: e.target.value }, { replace: true })}>
              {list.map((c) => (
                <option key={c.business.id} value={c.business.id}>
                  {c.business.name}
                  {c.business.status !== 'active' ? ` (${c.business.status})` : ''}
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
