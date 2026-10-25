import { Suspense } from 'react'
import { Skeleton } from '@/components/ui/Skeleton'
import type { SettingsSectionDef } from './sections'

/** While a section's code loads: its title and one card, at their real sizes, so nothing jumps. */
function SectionLoading() {
  return (
    <div role="status" aria-label="Loading">
      <Skeleton className="h-9 w-1/3" />
      <Skeleton className="mt-3 h-4 w-1/2" />
      <Skeleton className="mt-8 h-48 w-full rounded-[var(--radius-card)]" />
    </div>
  )
}

/** One section of the hub. The layout has already checked that this person may see it. */
export function SettingsSectionPage({ section }: { section: SettingsSectionDef }) {
  const Section = section.element
  return (
    <Suspense fallback={<SectionLoading />}>
      <Section />
    </Suspense>
  )
}

export default SettingsSectionPage
