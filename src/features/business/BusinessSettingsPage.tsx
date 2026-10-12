import { useCurrentBusiness } from '@/auth/AccountProvider'
import { PageHeader } from '@/components/layout/PageHeader'
import { BusinessForm } from '../businesses/BusinessForm'

export default function BusinessSettingsPage() {
  const business = useCurrentBusiness()
  return (
    <>
      <PageHeader title="Business settings" description="Your public profile and contact details." />
      <BusinessForm business={business} mode="owner" />
    </>
  )
}
