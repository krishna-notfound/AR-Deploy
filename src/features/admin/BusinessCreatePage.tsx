import { useNavigate } from 'react-router'
import { PageHeader } from '@/components/layout/PageHeader'
import { businessAdminPath } from '@/lib/urls'
import { BusinessForm } from '../businesses/BusinessForm'

export default function BusinessCreatePage() {
  const navigate = useNavigate()
  return (
    <>
      <PageHeader
        title="Create business"
        description="Set up a business profile and its catalog address. You can add products right after."
        breadcrumbs={[{ label: 'Businesses', to: '/admin/businesses' }, { label: 'Create business' }]}
      />
      <BusinessForm business={null} mode="create" onSaved={(b) => navigate(businessAdminPath(b.id), { replace: true })} />
    </>
  )
}
