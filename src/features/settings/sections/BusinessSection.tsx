import { useCurrentBusiness } from '@/auth/AccountProvider'
import { BusinessForm } from '@/features/businesses/BusinessForm'
import { SectionHeader } from '../SettingsUi'

export default function BusinessSection() {
  const business = useCurrentBusiness()
  return (
    <>
      <SectionHeader title="Business profile" description="Your public profile and contact details." />
      {/* The settings column is 720px at most: one column (the catalog preview under the form), not the page's side-by-side. */}
      <div className="[&>form]:grid-cols-1! [&>form>aside]:static!">
        <BusinessForm business={business} mode="owner" />
      </div>
    </>
  )
}
