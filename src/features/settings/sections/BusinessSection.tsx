import { useCurrentBusiness } from '@/auth/AccountProvider'
import { BusinessForm } from '@/features/businesses/BusinessForm'
import { useI18n } from '@/i18n/LanguageProvider'
import { SectionHeader } from '../SettingsUi'

export default function BusinessSection() {
  const business = useCurrentBusiness()
  const { t } = useI18n()
  return (
    <>
      <SectionHeader title={t('settings.section.business')} description={t('settings.business.description')} />
      {/* The settings column is 720px at most: one column (the catalog preview under the form), not the page's side-by-side. */}
      <div className="[&>form]:grid-cols-1! [&>form>aside]:static!">
        <BusinessForm business={business} mode="owner" />
      </div>
    </>
  )
}
