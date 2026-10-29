import { useNavigate } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { useI18n } from '@/i18n/LanguageProvider'
import { businessAdminPath } from '@/lib/urls'
import { BusinessForm } from '../businesses/BusinessForm'

export default function BusinessCreatePage() {
  const { t } = useI18n()
  const navigate = useNavigate()
  return (
    <>
      <PageHeader
        title={t('admin.businesses.create.title')}
        description={t('admin.businesses.create.description')}
        breadcrumbs={[{ label: t('nav.businesses'), to: '/admin/businesses' }, { label: t('admin.businesses.create.title') }]}
      />
      <BusinessForm business={null} mode="create" onSaved={(b) => navigate(businessAdminPath(b.id), { replace: true })} />
    </>
  )
}
