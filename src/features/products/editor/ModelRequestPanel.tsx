// The "Request a 3D model" panel of the shared product editor (S4 R-S4-7).
// S4 placeholder: S4 Task 4 replaces the body, never the export.
import type { JSX } from 'react'
import { EmptyState } from '@/components/ui/States'
import type { Product } from '@/domain/types'

export interface ModelRequestPanelProps {
  product: Product | undefined
  onSaveDraft: () => void
  onReload: () => void
}

export function ModelRequestPanel(_props: ModelRequestPanelProps): JSX.Element | null {
  return <EmptyState title="Not built yet" />
}
